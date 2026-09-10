import { describe, expect, it, beforeAll, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { RiskRepository } from "../src/repositories/RiskRepository";

/**
 * Everything here happens (or fails) before the stream would open, so these
 * paths don't need a configured provider — mirrors the equivalent
 * not-configured / validation tests for the per-issue routes.
 */
vi.mock("../src/config/env", () => ({
  env: {
    GROQ_API_KEY: undefined,
    GROQ_MODEL: "openai/gpt-oss-120b",
    GROQ_TIMEOUT_MS: 20000,
    GROQ_REASONING_EFFORT: "low",
    aiConfigured: false,
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
    default: vi.fn(),
    APIConnectionTimeoutError: actual.APIConnectionTimeoutError,
    APIError: actual.APIError,
    RateLimitError: actual.RateLimitError,
  };
});

describe("POST /api/ai/portfolio/stream — validation and not-configured paths", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const { buildApp } = await import("../src/app");
    app = buildApp({ repository: new RiskRepository() });
  });

  it("rejects an unknown lens with a plain 400 before opening a stream", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/ai/portfolio/stream",
      payload: { lens: "bogus" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers["content-type"]).not.toContain("text/event-stream");
    const body = JSON.parse(response.body);
    expect(body.error.code).toBe("INVALID_FILTER");
  });

  it("rejects a request with no lens at all", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/ai/portfolio/stream",
      payload: {},
    });
    expect(response.statusCode).toBe(400);
  });

  it("returns 404 NO_EVENTS_MATCH when the filters match nothing, before opening a stream", async () => {
    // A date window entirely before the dataset's own start (2024-09-01) is
    // guaranteed empty — normalizeFilters doesn't clamp to the dataset's
    // range, it just lets filterEvents naturally find nothing.
    const response = await app.inject({
      method: "POST",
      url: "/api/ai/portfolio/stream",
      payload: {
        lens: "analyse",
        filters: { organisation: "Enterprise-wide", eventType: "All", severity: "All", dateFrom: "2020-01-01", dateTo: "2020-01-02" },
      },
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.error.code).toBe("NO_EVENTS_MATCH");
  });

  it("returns 503 AI_UNAVAILABLE with an actionable message when no provider key is configured", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/ai/portfolio/stream",
      payload: { lens: "analyse", filters: { organisation: "Enterprise-wide" } },
    });

    expect(response.statusCode).toBe(503);
    expect(response.headers["content-type"]).not.toContain("text/event-stream");
    const body = JSON.parse(response.body);
    expect(body.error.code).toBe("AI_UNAVAILABLE");
    expect(body.error.message).toContain("GROQ_API_KEY");
  });
});
