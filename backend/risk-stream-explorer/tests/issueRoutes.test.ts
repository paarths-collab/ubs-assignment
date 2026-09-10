import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";

import { buildApp } from "../src/app";
import type { Env } from "../src/config/env";
import { PatternRepository } from "../src/repositories/PatternRepository";
import { RiskEventRepository } from "../src/repositories/RiskEventRepository";
import type { LoadedRiskDataset } from "../src/repositories/RiskDataLoader";
import { AICacheService } from "../src/services/AICacheService";
import { GroqService, type GroqClientLike } from "../src/services/GroqService";
import { slugify } from "../src/utils/slug";
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

const VALID_ISSUE_AI_JSON = JSON.stringify({
  strongestFinding: "The strongest finding is a possible workflow gap, although the sample is limited.",
  whyItMayMatter: "The high-severity concentration signal is elevated for this issue.",
  supportingEvidence: "The verified issue profile contains the elevated severity and workflow signals shown in the evidence package.",
  weakeningEvidence: "The sample is small and the observed relationships do not establish causation.",
  investigationHypothesis: "A control or ownership step may be inconsistently executed.",
  whatWouldDisproveThis: "A review could disprove this if the underlying records show the apparent concentration is a data or classification artifact.",
  investigationQuestions: ["What changed?", "Is this one team?", "When did it start?"],
  suggestedControl: "Add independent verification.",
  limitations: "Synthetic data; small sample; correlation is not causation.",
});

describe("Issue routes (HTTP integration)", () => {
  let events: ReturnType<typeof makeRiskEvent>[];
  let dataset: LoadedRiskDataset;
  const ISSUE_NAME = "Test issue";
  const ISSUE_SLUG = slugify(ISSUE_NAME);

  beforeEach(() => {
    resetRiskFixtureCounters();
    // All fixture events default to issue "Test issue" — enough events (with a mix of
    // classifications) to exercise severity/financial/root-cause aggregation.
    events = [
      makeRiskEvent({ classification: "High" }),
      makeRiskEvent({ classification: "High" }),
      makeRiskEvent({ classification: "Moderate" }),
      makeRiskEvent({ classification: "Low" }),
      makeRiskEvent({ classification: "Low" }),
      makeRiskEvent({ classification: "Low" }),
    ];
    const pattern = makePattern({ dimensions: { issue: ISSUE_NAME, root_cause: "Test root cause" } });
    dataset = {
      eventRepository: new RiskEventRepository(events),
      patternRepository: new PatternRepository(makePatternsDataset([pattern], [pattern.pattern_id])),
      validation: { valid: true, issues: [] },
    };
  });

  async function buildTestApp(create: GroqClientLike["chat"]["completions"]["create"] = vi.fn()): Promise<FastifyInstance> {
    const env = testEnv();
    const groqService = new GroqService(env.GROQ_API_KEY, env.GROQ_MODEL, env.AI_TIMEOUT_MS, fakeClient(create));
    const aiCache = new AICacheService(env.AI_CACHE_TTL_MS);
    return buildApp({ env, dataset, groqService, aiCache, serveBuiltFrontend: false });
  }

  it("GET /api/issues returns a ranked list with triggered signals and headline metrics", async () => {
    const app = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/api/issues" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.count).toBe(1);
    expect(body.issues[0].issue).toBe(ISSUE_NAME);
    expect(body.issues[0].slug).toBe(ISSUE_SLUG);
    expect(body.issues[0].rank).toBe(1);
    expect(Array.isArray(body.issues[0].triggeredSignals)).toBe(true);
    expect(body.issues[0].headline.event_count).toBe(6);
  });

  it("GET /api/issues/:issueId returns the full deterministic analysis for a known slug", async () => {
    const app = await buildTestApp();
    const res = await app.inject({ method: "GET", url: `/api/issues/${ISSUE_SLUG}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.profile.issue).toBe(ISSUE_NAME);
    expect(body.profile.matchingEventIds.sort()).toEqual(events.map((e) => e.event_id).sort());
    expect(body.graphFilter).toEqual({ issue: [ISSUE_NAME] });
    expect(body.deterministicSummary).toContain(ISSUE_NAME);
  });

  it("GET /api/issues/:issueId 404s for an unknown slug with the standard error shape", async () => {
    const app = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/api/issues/not-a-real-issue" });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe("ISSUE_NOT_FOUND");
    expect(body.error.requestId).toBeTruthy();
  });

  it("POST /api/ai/issue/:issueId returns a validated AI interpretation on success", async () => {
    const create = vi.fn().mockResolvedValue(completionWith(VALID_ISSUE_AI_JSON));
    const app = await buildTestApp(create);

    const res = await app.inject({ method: "POST", url: `/api/ai/issue/${ISSUE_SLUG}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ok");
    expect(body.ai.strongestFinding).toBeTruthy();
    expect(body.ai.supportingEvidence).toBeTruthy();
    expect(body.ai.weakeningEvidence).toBeTruthy();
    expect(body.ai.investigationHypothesis).toBeTruthy();
    expect(body.ai.whatWouldDisproveThis).toBeTruthy();
    expect(body.ai.whyItMayMatter).toBeTruthy();
    expect(body.matchingEventIds.sort()).toEqual(events.map((e) => e.event_id).sort());
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("POST /api/ai/issue/:issueId serves a cache hit without calling Groq again", async () => {
    const create = vi.fn().mockResolvedValue(completionWith(VALID_ISSUE_AI_JSON));
    const app = await buildTestApp(create);

    const first = await app.inject({ method: "POST", url: `/api/ai/issue/${ISSUE_SLUG}` });
    expect(first.json().cached).toBe(false);

    const second = await app.inject({ method: "POST", url: `/api/ai/issue/${ISSUE_SLUG}` });
    expect(second.statusCode).toBe(200);
    expect(second.json().cached).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("POST /api/ai/issue/:issueId falls back gracefully (HTTP 200) when Groq keeps failing", async () => {
    const create = vi.fn().mockRejectedValue(Object.assign(new Error("down"), { status: 503 }));
    const app = await buildTestApp(create);

    const res = await app.inject({ method: "POST", url: `/api/ai/issue/${ISSUE_SLUG}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ok");
    expect(body.ai.limitations).toContain("verified deterministic fallback");
    expect(body.model).toBe("verified-deterministic-fallback");
  });

  it("POST /api/ai/issue/:issueId rejects a hallucinated Event ID and falls back after regeneration", async () => {
    const hallucinated = JSON.stringify({
      strongestFinding: "See SIM-9999999 for detail.",
      whyItMayMatter: "x",
      supportingEvidence: "x",
      weakeningEvidence: "x",
      investigationHypothesis: "x",
      whatWouldDisproveThis: "x",
      investigationQuestions: ["a", "b", "c"],
      suggestedControl: "x",
      limitations: "y",
    });
    const create = vi.fn().mockResolvedValue(completionWith(hallucinated));
    const app = await buildTestApp(create);

    const res = await app.inject({ method: "POST", url: `/api/ai/issue/${ISSUE_SLUG}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ok");
    expect(body.ai.strongestFinding).not.toContain("SIM-9999999");
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("POST /api/ai/issue/:issueId returns 400 when the client tries to pass a facts body", async () => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: `/api/ai/issue/${ISSUE_SLUG}`,
      payload: { severity: { high_rate_pct: 99 } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("UNEXPECTED_BODY");
  });

  it("POST /api/ai/issue/:issueId 404s for an unknown issue slug", async () => {
    const app = await buildTestApp();
    const res = await app.inject({ method: "POST", url: "/api/ai/issue/not-a-real-issue" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("ISSUE_NOT_FOUND");
  });
});
