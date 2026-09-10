import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

import { buildApp } from "../src/app";
import type { Env } from "../src/config/env";
import { PatternRepository } from "../src/repositories/PatternRepository";
import { RiskEventRepository } from "../src/repositories/RiskEventRepository";
import type { LoadedRiskDataset } from "../src/repositories/RiskDataLoader";
import { AICacheService } from "../src/services/AICacheService";
import { GroqService, type GroqClientLike } from "../src/services/GroqService";
import { makePattern, makePatternsDataset, makeRiskEvent, resetRiskFixtureCounters } from "./riskFixtures";

function testEnv(overrides: Partial<Env> = {}): Env {
  // `llm` is derived from the legacy GROQ_* values so overriding either one
  // keeps the two in sync; an explicit `llm` override still wins.
  const GROQ_API_KEY = overrides.GROQ_API_KEY ?? "test-key";
  const GROQ_MODEL = overrides.GROQ_MODEL ?? "test-model";
  return {
    GROQ_API_KEY,
    GROQ_MODEL,
    llm: {
      provider: "groq",
      apiKey: GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1",
      model: GROQ_MODEL,
      referer: "http://localhost:3001",
      title: "test",
    },
    PORT: 0,
    CORS_ORIGIN: ["http://localhost:5173"],
    AI_TIMEOUT_MS: 5000,
    AI_CACHE_TTL_MS: 60_000,
    NODE_ENV: "test",
    ...overrides,
  };
}

function fakeClient(create: GroqClientLike["chat"]["completions"]["create"]): GroqClientLike {
  return { chat: { completions: { create } } };
}

function completionWith(content: string) {
  return { choices: [{ message: { content } }] };
}

const VALID_AI_JSON = JSON.stringify({
  strongestFinding: "The pattern contains a concentrated combination that warrants review.",
  whyItMayMatter: "The verified comparison is unusual enough to prioritize investigation.",
  supportingEvidence: "The matching events and deterministic metrics support a focused review.",
  investigationHypothesis: "A recurring workflow condition may contribute to the observed pattern.",
  whatWouldDisproveThis: "Additional data showing no recurrence would weaken the hypothesis.",
  interpretation: "This may indicate a workflow gap.",
  investigationQuestions: ["What changed?", "Is this one team?", "When did it start?"],
  suggestedControl: "Add independent verification.",
  limitations: "Synthetic data; small sample; correlation is not causation.",
});

describe("HTTP integration (Fastify inject)", () => {
  let event1: ReturnType<typeof makeRiskEvent>;
  let event2: ReturnType<typeof makeRiskEvent>;
  let pattern: ReturnType<typeof makePattern>;
  let dataset: LoadedRiskDataset;

  beforeEach(() => {
    resetRiskFixtureCounters();
    event1 = makeRiskEvent();
    event2 = makeRiskEvent();
    pattern = makePattern({ matching_event_ids: [event1.event_id, event2.event_id] });
    dataset = {
      eventRepository: new RiskEventRepository([event1, event2]),
      patternRepository: new PatternRepository(makePatternsDataset([pattern], [pattern.pattern_id])),
      validation: { valid: true, issues: [] },
    };
  });

  async function buildTestApp(create: GroqClientLike["chat"]["completions"]["create"]): Promise<FastifyInstance> {
    const env = testEnv();
    const groqService = new GroqService(env.GROQ_API_KEY, env.GROQ_MODEL, env.AI_TIMEOUT_MS, fakeClient(create));
    const aiCache = new AICacheService(env.AI_CACHE_TTL_MS);
    return buildApp({ env, dataset, groqService, aiCache, serveBuiltFrontend: false });
  }

  it("GET /api/health returns ok", async () => {
    const app = await buildTestApp(vi.fn());
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "ok" });
  });

  it("GET /api/patterns/priority returns the resolved priority queue", async () => {
    const app = await buildTestApp(vi.fn());
    const res = await app.inject({ method: "GET", url: "/api/patterns/priority" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.count).toBe(1);
    expect(body.patterns[0].pattern_id).toBe(pattern.pattern_id);
  });

  it("GET /api/investigations/:patternId returns a full investigation for a valid pattern", async () => {
    const app = await buildTestApp(vi.fn());
    const res = await app.inject({ method: "GET", url: `/api/investigations/${pattern.pattern_id}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.matchingEvents.map((e: { event_id: string }) => e.event_id).sort()).toEqual(
      [event1.event_id, event2.event_id].sort(),
    );
    expect(body.deterministicSummary).toContain("events match this pattern");
  });

  it("GET /api/investigations/:patternId returns 404 with the standard error shape for an unknown pattern", async () => {
    const app = await buildTestApp(vi.fn());
    const res = await app.inject({ method: "GET", url: "/api/investigations/PAT-DOES-NOT-EXIST" });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe("PATTERN_NOT_FOUND");
    expect(body.error.requestId).toBeTruthy();
  });

  it("GET /api/events/:eventId resolves a known event and 404s an unknown one", async () => {
    const app = await buildTestApp(vi.fn());
    const ok = await app.inject({ method: "GET", url: `/api/events/${event1.event_id}` });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().event_id).toBe(event1.event_id);

    const missing = await app.inject({ method: "GET", url: "/api/events/SIM-GHOST" });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe("EVENT_NOT_FOUND");
  });

  it("POST /api/ai/pattern/:patternId returns a validated AI interpretation on success", async () => {
    const create = vi.fn().mockResolvedValue(completionWith(VALID_AI_JSON));
    const app = await buildTestApp(create);

    const res = await app.inject({ method: "POST", url: `/api/ai/pattern/${pattern.pattern_id}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ok");
    expect(body.ai.interpretation).toBe("This may indicate a workflow gap.");
    expect(body.matchingEventIds.sort()).toEqual([event1.event_id, event2.event_id].sort());
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("POST /api/ai/pattern/:patternId serves a cache hit without calling Groq again", async () => {
    const create = vi.fn().mockResolvedValue(completionWith(VALID_AI_JSON));
    const app = await buildTestApp(create);

    const first = await app.inject({ method: "POST", url: `/api/ai/pattern/${pattern.pattern_id}` });
    expect(first.json().cached).toBe(false);

    const second = await app.inject({ method: "POST", url: `/api/ai/pattern/${pattern.pattern_id}` });
    expect(second.statusCode).toBe(200);
    expect(second.json().cached).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("POST /api/ai/pattern/:patternId falls back gracefully (HTTP 200) when Groq keeps failing", async () => {
    const create = vi.fn().mockRejectedValue(Object.assign(new Error("down"), { status: 503 }));
    const app = await buildTestApp(create);

    const res = await app.inject({ method: "POST", url: `/api/ai/pattern/${pattern.pattern_id}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ok");
    expect(body.ai.limitations).toContain("verified deterministic fallback");
    expect(body.model).toBe("verified-deterministic-fallback");
  });

  it("POST /api/ai/pattern/:patternId rejects (and regenerates away from) a hallucinated Event ID, then falls back if it keeps happening", async () => {
    const hallucinated = JSON.stringify({
      interpretation: "See SIM-9999999 for detail.",
      investigationQuestions: ["a", "b", "c"],
      suggestedControl: "x",
      limitations: "y",
    });
    const create = vi.fn().mockResolvedValue(completionWith(hallucinated));
    const app = await buildTestApp(create);

    const res = await app.inject({ method: "POST", url: `/api/ai/pattern/${pattern.pattern_id}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ok");
    expect(body.ai.interpretation).not.toContain("SIM-9999999");
    // One regeneration attempt was made on top of the initial call.
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("POST /api/ai/pattern/:patternId returns 400 when the client tries to pass a facts body", async () => {
    const app = await buildTestApp(vi.fn());
    const res = await app.inject({
      method: "POST",
      url: `/api/ai/pattern/${pattern.pattern_id}`,
      payload: { observed: { high_rate: 0.99 } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("UNEXPECTED_BODY");
  });

  it("POST /api/ai/pattern/:patternId 404s for an unknown pattern", async () => {
    const app = await buildTestApp(vi.fn());
    const res = await app.inject({ method: "POST", url: "/api/ai/pattern/PAT-DOES-NOT-EXIST" });
    expect(res.statusCode).toBe(404);
  });

  it("rate-limits the AI route after its configured max, while leaving GET routes unaffected", async () => {
    const create = vi.fn().mockResolvedValue(completionWith(VALID_AI_JSON));
    const app = await buildTestApp(create);

    // First request succeeds and gets cached; subsequent identical requests
    // are served from cache but still count against the rate limit since
    // they hit the same route handler.
    let lastStatus = 0;
    for (let i = 0; i < 16; i += 1) {
      const res = await app.inject({ method: "POST", url: `/api/ai/pattern/${pattern.pattern_id}` });
      lastStatus = res.statusCode;
    }
    expect(lastStatus).toBe(429);

    const health = await app.inject({ method: "GET", url: "/api/health" });
    expect(health.statusCode).toBe(200);
  });
});
