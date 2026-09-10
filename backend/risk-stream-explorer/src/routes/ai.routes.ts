import type { FastifyInstance } from "fastify";
import type { PatternRepository } from "../repositories/PatternRepository";
import type { GroqService } from "../services/GroqService";
import type { AICacheService } from "../services/AICacheService";
import type { IssueIntelligenceService } from "../services/IssueIntelligenceService";
import { validateGroqResult, validateGroqIssueResult } from "../services/AIValidationService";
import { buildObservedFacts } from "../services/InvestigationService";
import { buildIssueEvidencePayload } from "../services/IssueIntelligenceService";
import { PROMPT_VERSION } from "../prompts/pattern-analysis.prompt";
import { ISSUE_PROMPT_VERSION } from "../prompts/issue-analysis.prompt";
import type { AiPatternResponse } from "../types/Investigation";
import type { AiIssueResponse } from "../types/Issue";
import type { Env } from "../config/env";

export interface AiRouteDeps {
  patternRepository: PatternRepository;
  groqService: GroqService;
  aiCache: AICacheService;
  env: Env;
}

export interface AiIssueRouteDeps {
  issueIntelligenceService: IssueIntelligenceService;
  groqService: GroqService;
  aiCache: AICacheService;
  env: Env;
}

/** At most one regeneration attempt when Groq's output fails validation (bad schema or a hallucinated Event ID) — beyond that we fall back rather than keep spending Groq calls on one request. */
const MAX_VALIDATION_ATTEMPTS = 2;

const AI_BODY_LIMIT_BYTES = 2048;
const AI_RATE_LIMIT_MAX = 15;
const AI_RATE_LIMIT_WINDOW = "1 minute";

export function registerAiRoutes(app: FastifyInstance, deps: AiRouteDeps): void {
  app.post<{ Params: { patternId: string }; Body: unknown }>(
    "/api/ai/pattern/:patternId",
    {
      bodyLimit: AI_BODY_LIMIT_BYTES,
      config: {
        rateLimit: { max: AI_RATE_LIMIT_MAX, timeWindow: AI_RATE_LIMIT_WINDOW },
      },
    },
    async (request, reply) => {
      const { patternId } = request.params;

      // The client may only ever supply the pattern ID via the URL. Any body
      // that tries to pass facts/metrics is rejected outright — the server
      // resolves everything itself from the pattern repository.
      if (!isAcceptableEmptyBody(request.body)) {
        return reply.code(400).send({
          error: {
            code: "UNEXPECTED_BODY",
            message: "This endpoint takes no request body — facts are resolved server-side from the pattern ID in the URL.",
            requestId: request.id,
          },
        });
      }

      const pattern = deps.patternRepository.getById(patternId);
      if (!pattern) {
        return reply.code(404).send({
          error: {
            code: "PATTERN_NOT_FOUND",
            message: `Pattern "${patternId}" was not found.`,
            requestId: request.id,
          },
        });
      }

      const observed = buildObservedFacts(pattern);
      const matchingEventIds = pattern.matching_event_ids;

      const cacheKey = deps.aiCache.key(patternId, deps.env.GROQ_MODEL, PROMPT_VERSION);
      const cached = deps.aiCache.get<AiPatternResponse & { status: "ok" }>(cacheKey);
      if (cached) {
        request.log.info({ patternId, cacheHit: true }, "ai.pattern");
        return { ...cached, cached: true } satisfies AiPatternResponse;
      }

      let lastFailureReason = "no attempts made";
      for (let attempt = 1; attempt <= MAX_VALIDATION_ATTEMPTS; attempt += 1) {
        const startedAt = Date.now();
        try {
          const raw = await deps.groqService.analyzePattern(pattern.groq_fact_payload);
          const latencyMs = Date.now() - startedAt;
          const outcome = validateGroqResult(raw, matchingEventIds);

          if (outcome.valid) {
            const response: AiPatternResponse = {
              status: "ok",
              observed,
              matchingEventIds,
              ai: outcome.result,
              cached: false,
              provider: deps.env.llm.provider,
              model: deps.env.llm.model,
            };
            deps.aiCache.set(cacheKey, response);
            request.log.info(
              { patternId, attempt, latencyMs, model: deps.env.llm.model, promptVersion: PROMPT_VERSION, cacheHit: false, success: true },
              "ai.pattern",
            );
            return response;
          }

          lastFailureReason = outcome.reason;
          request.log.warn({ patternId, attempt, latencyMs, reason: outcome.reason }, "ai.pattern.validation_failed");
        } catch (err) {
          lastFailureReason = (err as Error).message;
          request.log.warn({ patternId, attempt, error: lastFailureReason }, "ai.pattern.groq_error");
        }
      }

      request.log.info({ patternId, model: deps.env.llm.model, promptVersion: PROMPT_VERSION, success: false, reason: lastFailureReason }, "ai.pattern");

      const fallback: AiPatternResponse = {
        status: "fallback",
        observed,
        matchingEventIds,
        ai: null,
        message: "AI interpretation is temporarily unavailable. Verified pattern evidence remains available.",
        provider: deps.env.llm.provider,
        model: deps.env.llm.model,
      };
      return fallback;
    },
  );
}

/**
 * `POST /api/ai/issue/:issueId` — Groq interpretation of one issue's
 * deterministic evidence package. Same guarantees as the pattern route
 * above (server-resolved facts only, single bounded regeneration attempt,
 * deterministic fallback, hallucinated-Event-ID rejection): the client may
 * only ever supply the issue slug via the URL.
 */
export function registerIssueAiRoutes(app: FastifyInstance, deps: AiIssueRouteDeps): void {
  app.post<{ Params: { issueId: string }; Body: unknown }>(
    "/api/ai/issue/:issueId",
    {
      bodyLimit: AI_BODY_LIMIT_BYTES,
      config: {
        rateLimit: { max: AI_RATE_LIMIT_MAX, timeWindow: AI_RATE_LIMIT_WINDOW },
      },
    },
    async (request, reply) => {
      const { issueId } = request.params;

      if (!isAcceptableEmptyBody(request.body)) {
        return reply.code(400).send({
          error: {
            code: "UNEXPECTED_BODY",
            message: "This endpoint takes no request body — facts are resolved server-side from the issue slug in the URL.",
            requestId: request.id,
          },
        });
      }

      const profile = deps.issueIntelligenceService.getProfile(issueId);
      if (!profile) {
        return reply.code(404).send({
          error: {
            code: "ISSUE_NOT_FOUND",
            message: `Issue "${issueId}" was not found.`,
            requestId: request.id,
          },
        });
      }

      const evidence = buildIssueEvidencePayload(profile);
      const matchingEventIds = profile.matchingEventIds;

      const cacheKey = deps.aiCache.key(profile.slug, deps.env.GROQ_MODEL, ISSUE_PROMPT_VERSION);
      const cached = deps.aiCache.get<AiIssueResponse & { status: "ok" }>(cacheKey);
      if (cached) {
        request.log.info({ issueId: profile.slug, cacheHit: true }, "ai.issue");
        return { ...cached, cached: true } satisfies AiIssueResponse;
      }

      let lastFailureReason = "no attempts made";
      for (let attempt = 1; attempt <= MAX_VALIDATION_ATTEMPTS; attempt += 1) {
        const startedAt = Date.now();
        try {
          const raw = await deps.groqService.analyzeIssue(evidence);
          const latencyMs = Date.now() - startedAt;
          const outcome = validateGroqIssueResult(raw, matchingEventIds);

          if (outcome.valid) {
            const response: AiIssueResponse = {
              status: "ok",
              matchingEventIds,
              ai: outcome.result,
              cached: false,
              provider: deps.env.llm.provider,
              model: deps.env.llm.model,
            };
            deps.aiCache.set(cacheKey, response);
            request.log.info(
              {
                issueId: profile.slug,
                attempt,
                latencyMs,
                model: deps.env.llm.model,
                promptVersion: ISSUE_PROMPT_VERSION,
                cacheHit: false,
                success: true,
              },
              "ai.issue",
            );
            return response;
          }

          lastFailureReason = outcome.reason;
          request.log.warn({ issueId: profile.slug, attempt, latencyMs, reason: outcome.reason }, "ai.issue.validation_failed");
        } catch (err) {
          lastFailureReason = (err as Error).message;
          request.log.warn({ issueId: profile.slug, attempt, error: lastFailureReason }, "ai.issue.groq_error");
        }
      }

      request.log.info(
        { issueId: profile.slug, model: deps.env.llm.model, promptVersion: ISSUE_PROMPT_VERSION, success: false, reason: lastFailureReason },
        "ai.issue",
      );

      const fallback: AiIssueResponse = {
        status: "fallback",
        matchingEventIds,
        ai: null,
        message: "AI interpretation is temporarily unavailable. Verified issue evidence remains available.",
        provider: deps.env.llm.provider,
        model: deps.env.llm.model,
      };
      return fallback;
    },
  );
}

/** The AI POST route accepts no body fields — only an absent body, `null`, or `{}` are tolerated. */
function isAcceptableEmptyBody(body: unknown): boolean {
  if (body === undefined || body === null) return true;
  if (typeof body !== "object" || Array.isArray(body)) return false;
  return Object.keys(body as Record<string, unknown>).length === 0;
}
