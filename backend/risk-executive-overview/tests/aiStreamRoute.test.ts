import { describe, expect, it, beforeEach, vi } from "vitest";
import { RiskRepository } from "../src/repositories/RiskRepository";

/**
 * Streaming-success tests live in their own file because they need
 * `aiConfigured: true`, whereas the rest of the AI suite mocks the env with
 * AI disabled to exercise the not-configured path. Module-level env mocks
 * cannot hold both states in one file.
 */
const mockCreateFn = vi.fn();

vi.mock("../src/config/env", () => ({
  env: {
    GROQ_API_KEY: "test-key",
    GROQ_MODEL: "openai/gpt-oss-120b",
    GROQ_TIMEOUT_MS: 20000,
    GROQ_REASONING_EFFORT: "low",
    aiConfigured: true,
    NODE_ENV: "test",
    PORT: 4000,
    HOST: "0.0.0.0",
    LOG_LEVEL: "silent",
    CORS_ORIGINS: [],
  },
}));

vi.mock("groq-sdk", async () => {
  const actual = await vi.importActual<typeof import("groq-sdk")>("groq-sdk");
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: { completions: { create: mockCreateFn } },
    })),
    APIConnectionTimeoutError: actual.APIConnectionTimeoutError,
    APIError: actual.APIError,
    RateLimitError: actual.RateLimitError,
  };
});

/** Groq's streaming response is an async iterable of delta chunks. */
function mockStream(chunks: string[]): AsyncIterable<unknown> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const content of chunks) {
        yield { choices: [{ delta: { content } }] };
      }
    },
  };
}

interface SseEvent {
  type: string;
  sectionId?: string;
  delta?: string;
  [key: string]: unknown;
}

function parseSse(body: string): SseEvent[] {
  return body
    .split("\n\n")
    .map((block) => block.split("\n").find((line) => line.startsWith("data: ")))
    .filter((line): line is string => Boolean(line))
    .map((line) => JSON.parse(line.slice(6)) as SseEvent);
}

const realIssueDetail = new RiskRepository().getEvents()[0]!.issueDetail;

const filters = {
  organisation: "Enterprise-wide",
  dateFrom: "2024-09-01",
  dateTo: "2026-08-31",
  eventType: "All" as const,
  severity: "All" as const,
};

describe("AI stream route — success path", () => {
  beforeEach(() => {
    vi.resetModules();
    mockCreateFn.mockReset();
  });

  it("emits the full SSE event sequence in order for a 3-section deep analysis", async () => {
    mockCreateFn.mockImplementation(() => Promise.resolve(mockStream(["Alpha ", "beta."])));

    const { buildApp } = await import("../src/app");
    const app = buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/ai/deep-analysis/stream",
      payload: { filters, selection: { type: "issue", issueDetail: realIssueDetail } },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");

    const events = parseSse(response.body);
    const types = events.map((event) => event.type);

    // Exactly one start and one complete, wrapping three full sections.
    expect(types.filter((type) => type === "analysis_start")).toHaveLength(1);
    expect(types.filter((type) => type === "analysis_complete")).toHaveLength(1);
    expect(types.filter((type) => type === "section_start")).toHaveLength(3);
    expect(types.filter((type) => type === "section_complete")).toHaveLength(3);
    expect(types[0]).toBe("analysis_start");
    expect(types[types.length - 1]).toBe("analysis_complete");

    // Sections are declared up front so the UI can draw the progress list.
    const start = events[0]!;
    expect((start.sections as Array<{ id: string }>).map((s) => s.id)).toEqual([
      "situation",
      "pattern",
      "response",
    ]);

    // Per section: start -> at least one delta -> complete, and never interleaved.
    for (const sectionId of ["situation", "pattern", "response"]) {
      const scoped = events.filter((event) => event.sectionId === sectionId).map((event) => event.type);
      expect(scoped[0]).toBe("section_start");
      expect(scoped[scoped.length - 1]).toBe("section_complete");
      expect(scoped.filter((type) => type === "section_delta").length).toBeGreaterThan(0);
    }

    const situationStart = types.indexOf("section_start");
    const situationComplete = types.indexOf("section_complete");
    expect(situationComplete).toBeGreaterThan(situationStart);

    // The streamed text is the concatenation of the mocked chunks.
    const situationText = events
      .filter((event) => event.sectionId === "situation" && event.type === "section_delta")
      .map((event) => event.delta)
      .join("");
    expect(situationText).toBe("Alpha beta.");
  });

  it("streams a single section for the investigation plan", async () => {
    mockCreateFn.mockImplementation(() => Promise.resolve(mockStream(["Plan."])));

    const { buildApp } = await import("../src/app");
    const app = buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/ai/investigation-plan/stream",
      payload: { filters, selection: { type: "issue", issueDetail: realIssueDetail } },
    });

    const types = parseSse(response.body).map((event) => event.type);
    expect(types.filter((type) => type === "section_start")).toHaveLength(1);
    expect(types[types.length - 1]).toBe("analysis_complete");
  });

  it("reports a mid-stream provider failure as analysis_error inside the stream, not an HTTP error", async () => {
    mockCreateFn.mockImplementation(() => Promise.reject(new Error("connection reset")));

    const { buildApp } = await import("../src/app");
    const app = buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/ai/deep-analysis/stream",
      payload: { filters, selection: { type: "issue", issueDetail: realIssueDetail } },
    });

    // The stream had already opened, so the failure must arrive inside it.
    expect(response.statusCode).toBe(200);

    const events = parseSse(response.body);
    const error = events.find((event) => event.type === "analysis_error");
    expect(error).toBeDefined();
    expect(events.some((event) => event.type === "analysis_complete")).toBe(false);

    // The provider's raw error text must never reach the client.
    expect(String(error!.message)).not.toContain("connection reset");
    expect(String(error!.message)).toMatch(/temporarily unavailable/i);
  });

  it("throws AI_INVALID_RESPONSE when the stream yields no usable content", async () => {
    // Malformed chunks must not surface as a transport failure: they mean the
    // model returned nothing usable, which is a different, non-retryable state.
    mockCreateFn.mockImplementation(() =>
      Promise.resolve({
        async *[Symbol.asyncIterator]() {
          yield {};
          yield { choices: [] };
          yield { choices: [{ delta: {} }] };
        },
      }),
    );

    const { streamCompletion } = await import("../src/services/LlmService");
    await expect(streamCompletion("system", "user", () => {})).rejects.toMatchObject({
      code: "AI_INVALID_RESPONSE",
    });
  });

  it("concatenates streamed chunks and invokes onDelta once per chunk", async () => {
    mockCreateFn.mockImplementation(() => Promise.resolve(mockStream(["one ", "two ", "three"])));

    const { streamCompletion } = await import("../src/services/LlmService");
    const deltas: string[] = [];
    const full = await streamCompletion("system", "user", (delta) => deltas.push(delta));

    expect(deltas).toEqual(["one ", "two ", "three"]);
    expect(full).toBe("one two three");
  });
});
