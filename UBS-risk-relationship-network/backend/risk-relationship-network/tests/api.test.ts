import path from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Point the server at the canonical dataset and disable AI by default so
// the unconfigured path is exercised honestly.
process.env.BRAIN_DATA_DIR = path.resolve(__dirname, "../../../frontend/risk-relationship-network/data");
process.env.NODE_ENV = "test";
process.env.AI_API_KEY = "";

const { createApp } = await import("../src/app");
const { config } = await import("../src/config");

const app = createApp();

const VALID_EVENT_IDS = ["SIM-0000026", "SIM-0000386", "SIM-0000866"];
const MERIDIAN_ORG = "organisation::31ec043ac068";

afterEach(() => {
  vi.restoreAllMocks();
  (config.ai as { apiKey: string }).apiKey = "";
});

describe("GET /api/health", () => {
  it("reports the canonical dataset as loaded", async () => {
    const response = await request(app).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: "ok", brainDataLoaded: true, eventCount: 1000 });
  });

  it("never leaks credentials — only whether AI is configured", async () => {
    const response = await request(app).get("/api/health");
    expect(response.body).toHaveProperty("aiConfigured");
    expect(JSON.stringify(response.body)).not.toContain("apiKey");
    expect(response.body.aiConfigured).toBe(false);
  });

  it("stamps every response with a request ID", async () => {
    const response = await request(app).get("/api/health");
    expect(response.headers["x-request-id"]).toMatch(/[0-9a-f-]{36}/);
  });
});

describe("POST /api/ai/analyse — request validation", () => {
  beforeAll(() => {
    (config.ai as { apiKey: string }).apiKey = "test-key";
  });

  it("rejects a payload with no event IDs", async () => {
    (config.ai as { apiKey: string }).apiKey = "test-key";
    const response = await request(app).post("/api/ai/analyse").send({ eventIds: [] });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_REQUEST");
    expect(response.body.error.requestId).toBeTruthy();
  });

  it("rejects malformed event IDs", async () => {
    (config.ai as { apiKey: string }).apiKey = "test-key";
    const response = await request(app).post("/api/ai/analyse").send({ eventIds: ["not-an-event-id"] });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_REQUEST");
  });

  it("rejects event IDs that do not exist in the dataset", async () => {
    (config.ai as { apiKey: string }).apiKey = "test-key";
    const response = await request(app).post("/api/ai/analyse").send({ eventIds: ["SIM-9999999"] });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("UNKNOWN_EVENT_IDS");
  });

  it("rejects an unknown selected node", async () => {
    (config.ai as { apiKey: string }).apiKey = "test-key";
    const response = await request(app)
      .post("/api/ai/analyse")
      .send({ eventIds: VALID_EVENT_IDS, selectedNodeId: "person::doesnotexist" });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("UNKNOWN_NODE_ID");
  });

  it("rejects a scope whose events are not connected to the selected node", async () => {
    (config.ai as { apiKey: string }).apiKey = "test-key";
    const response = await request(app)
      .post("/api/ai/analyse")
      .send({ eventIds: ["SIM-0000001"], selectedNodeId: MERIDIAN_ORG });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("NODE_SCOPE_MISMATCH");
  });

  it("rejects unknown fields rather than silently ignoring them", async () => {
    (config.ai as { apiKey: string }).apiKey = "test-key";
    const response = await request(app)
      .post("/api/ai/analyse")
      .send({ eventIds: VALID_EVENT_IDS, injectedMetrics: { grossExposure: 999_999 } });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_REQUEST");
  });

  it("rejects an over-long analyst question", async () => {
    (config.ai as { apiKey: string }).apiKey = "test-key";
    const response = await request(app)
      .post("/api/ai/analyse")
      .send({ eventIds: VALID_EVENT_IDS, question: "x".repeat(config.limits.maxQuestionLength + 1) });
    expect(response.status).toBe(400);
  });
});

describe("POST /api/ai/analyse — provider behaviour", () => {
  it("returns a controlled 503 when AI is not configured", async () => {
    (config.ai as { apiKey: string }).apiKey = "";
    const response = await request(app).post("/api/ai/analyse").send({ eventIds: VALID_EVENT_IDS });
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("AI_NOT_CONFIGURED");
  });

  it("returns a validated, structured analysis for a well-formed provider reply", async () => {
    (config.ai as { apiKey: string }).apiKey = "test-key";

    const modelReply = {
      summary: "Three High severity events share one issue scenario.",
      observations: [
        // One real evidence ID and one invented ID the server must strip.
        { statement: "All three events are High severity.", evidenceEventIds: ["SIM-0000026", "SIM-0000001"] },
      ],
      interpretations: [{ statement: "This may indicate workflow concentration.", confidence: "low" }],
      investigationQuestions: ["Were these reviewed by the same control?"],
      recommendedActions: [{ action: "Review the control step.", reason: "Recurrence warrants a check." }],
      limitations: ["Synthetic dataset; counts are small."],
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(modelReply) } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const response = await request(app)
      .post("/api/ai/analyse")
      .send({ eventIds: VALID_EVENT_IDS, selectedNodeId: MERIDIAN_ORG });

    expect(response.status).toBe(200);
    expect(response.body.analysis.summary).toBe(modelReply.summary);
    expect(response.body.model).toBe(config.ai.model);

    // Invented evidence must be pruned; only in-scope IDs survive.
    expect(response.body.analysis.observations[0].evidenceEventIds).toEqual(["SIM-0000026"]);

    // Facts are server-computed and returned separately from model prose.
    expect(response.body.verifiedFacts.scope.eventCount).toBe(3);
    expect(response.body.verifiedFacts.severityCounts).toEqual({ High: 3, Moderate: 0, Low: 0 });
  });

  it("never sends the API key to the client", async () => {
    (config.ai as { apiKey: string }).apiKey = "super-secret-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ summary: "ok" }) } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const response = await request(app).post("/api/ai/analyse").send({ eventIds: VALID_EVENT_IDS });
    expect(JSON.stringify(response.body)).not.toContain("super-secret-key");
  });

  it("returns a controlled 503 when the provider times out", async () => {
    (config.ai as { apiKey: string }).apiKey = "test-key";
    vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      const abortError = new Error("aborted");
      abortError.name = "AbortError";
      return Promise.reject(abortError);
    });

    const response = await request(app).post("/api/ai/analyse").send({ eventIds: VALID_EVENT_IDS });
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("AI_TIMEOUT");
  });

  it("returns a controlled 503 when the provider errors, without leaking its response", async () => {
    (config.ai as { apiKey: string }).apiKey = "test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "internal provider trace" } }), { status: 500 }),
    );

    const response = await request(app).post("/api/ai/analyse").send({ eventIds: VALID_EVENT_IDS });
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("AI_PROVIDER_ERROR");
    expect(JSON.stringify(response.body)).not.toContain("internal provider trace");
  });

  it("fails cleanly when the model never returns schema-valid JSON", async () => {
    (config.ai as { apiKey: string }).apiKey = "test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "I cannot help with that." } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const response = await request(app).post("/api/ai/analyse").send({ eventIds: VALID_EVENT_IDS });
    expect(response.status).toBe(503);
    expect(["AI_INVALID_JSON", "AI_INVALID_RESPONSE"]).toContain(response.body.error.code);
  });
});

describe("unknown routes", () => {
  it("returns a structured 404 without a stack trace", async () => {
    const response = await request(app).get("/api/does-not-exist");
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
    expect(JSON.stringify(response.body)).not.toContain("at ");
  });
});
