import type { FastifyInstance } from "fastify";
import type { PatternRepository } from "../repositories/PatternRepository.js";
import type { GroqService } from "../services/GroqService.js";
import type { AICacheService } from "../services/AICacheService.js";
import type { IssueIntelligenceService } from "../services/IssueIntelligenceService.js";
import { validateGroqResult, validateGroqIssueResult } from "../services/AIValidationService.js";
import { buildObservedFacts } from "../services/InvestigationService.js";
import { buildIssueEvidencePayload } from "../services/IssueIntelligenceService.js";
import { PROMPT_VERSION } from "../prompts/pattern-analysis.prompt.js";
import { buildIssueSystemPrompt, ISSUE_PROMPT_VERSION, ISSUE_RESPONSE_JSON_SCHEMA } from "../prompts/issue-analysis.prompt.js";
import type { AiPatternResponse } from "../types/Investigation.js";
import type { AiIssueResponse } from "../types/Issue.js";
import type { IssueProfile } from "../types/Issue.js";
import type { Pattern } from "../types/Pattern.js";
import type { Env } from "../config/env.js";

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
const FOLLOW_UP_RESPONSE_SCHEMA = {
  name: "grounded_follow_up",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: { answer: { type: "string", minLength: 80 } },
    required: ["answer"],
  },
} as const;

function followUpPrompt(scope: "pattern" | "issue", question: string): string {
  return [
    "You are a senior risk analyst answering a follow-up question about a fully synthetic risk dataset.",
    `The scope is one ${scope}. Use only the verified JSON evidence package supplied with this request.`,
    "Give a detailed, practical answer in 2 to 4 short paragraphs or clearly labelled points.",
    "You may repeat only numbers, dates, names, severities, monetary values, and Event IDs that appear in the evidence package.",
    "Do not invent facts, do not make causal claims, and describe repeated people or organisations only as workflow concentration, never as blame.",
    "If the evidence is insufficient, say so plainly. Mention limitations when they matter.",
    "The dataset is synthetic and correlation does not establish causation.",
    "Return JSON with exactly one field: answer.",
    `FOLLOW-UP QUESTION: ${question}`,
  ].join("\n");
}

function readFollowUpQuestion(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const value = (body as Record<string, unknown>).question;
  if (typeof value !== "string") return null;
  const question = value.trim();
  return question.length >= 3 && question.length <= 1000 ? question : null;
}

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
        status: "ok",
        observed,
        matchingEventIds,
        ai: buildPatternFallback(pattern),
        cached: false,
        provider: deps.env.llm.provider,
        model: "verified-deterministic-fallback",
      };
      return fallback;
    },
  );

  app.post<{ Params: { patternId: string }; Body: unknown }>(
    "/api/ai/pattern/:patternId/follow-up",
    { bodyLimit: AI_BODY_LIMIT_BYTES, config: { rateLimit: { max: AI_RATE_LIMIT_MAX, timeWindow: AI_RATE_LIMIT_WINDOW } } },
    async (request, reply) => {
      const question = readFollowUpQuestion(request.body);
      const pattern = deps.patternRepository.getById(request.params.patternId);
      if (!pattern) return reply.code(404).send({ error: { code: "PATTERN_NOT_FOUND", message: `Pattern "${request.params.patternId}" was not found.`, requestId: request.id } });
      if (!question) return reply.code(400).send({ error: { code: "INVALID_REQUEST", message: "Provide a question between 3 and 1000 characters.", requestId: request.id } });
      const raw = await deps.groqService.completeStructured<{ answer: string }>(followUpPrompt("pattern", question), pattern.groq_fact_payload, FOLLOW_UP_RESPONSE_SCHEMA);
      if (!raw || typeof raw.answer !== "string" || raw.answer.trim().length < 20) return reply.code(502).send({ error: { code: "AI_RESPONSE_INVALID", message: "The AI returned an unusable follow-up answer.", requestId: request.id } });
      return { status: "ok", answer: raw.answer, provider: deps.env.llm.provider, model: deps.env.llm.model };
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
          // Routed through the generic `completeStructured` rather than
          // `GroqService.analyzeIssue` — that method is pinned to the old
          // 5-field schema on a class this feature does not own. The
          // provider-neutral prompt/schema for the 9-field synthesis result
          // live next to each other in issue-analysis.prompt.ts.
          const raw = await deps.groqService.completeStructured<unknown>(buildIssueSystemPrompt(), evidence, ISSUE_RESPONSE_JSON_SCHEMA);
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
        status: "ok",
        matchingEventIds,
        ai: buildIssueFallback(profile),
        cached: false,
        provider: deps.env.llm.provider,
        model: "verified-deterministic-fallback",
      };
      return fallback;
    },
  );

  app.post<{ Params: { issueId: string }; Body: unknown }>(
    "/api/ai/issue/:issueId/follow-up",
    { bodyLimit: AI_BODY_LIMIT_BYTES, config: { rateLimit: { max: AI_RATE_LIMIT_MAX, timeWindow: AI_RATE_LIMIT_WINDOW } } },
    async (request, reply) => {
      const question = readFollowUpQuestion(request.body);
      const profile = deps.issueIntelligenceService.getProfile(request.params.issueId);
      if (!profile) return reply.code(404).send({ error: { code: "ISSUE_NOT_FOUND", message: `Issue "${request.params.issueId}" was not found.`, requestId: request.id } });
      if (!question) return reply.code(400).send({ error: { code: "INVALID_REQUEST", message: "Provide a question between 3 and 1000 characters.", requestId: request.id } });
      const raw = await deps.groqService.completeStructured<{ answer: string }>(followUpPrompt("issue", question), buildIssueEvidencePayload(profile), FOLLOW_UP_RESPONSE_SCHEMA);
      if (!raw || typeof raw.answer !== "string" || raw.answer.trim().length < 20) return reply.code(502).send({ error: { code: "AI_RESPONSE_INVALID", message: "The AI returned an unusable follow-up answer.", requestId: request.id } });
      return { status: "ok", answer: raw.answer, provider: deps.env.llm.provider, model: deps.env.llm.model };
    },
  );
}

/** The AI POST route accepts no body fields — only an absent body, `null`, or `{}` are tolerated. */
function isAcceptableEmptyBody(body: unknown): boolean {
  if (body === undefined || body === null) return true;
  if (typeof body !== "object" || Array.isArray(body)) return false;
  return Object.keys(body as Record<string, unknown>).length === 0;
}

function buildPatternFallback(pattern: Pattern): {
  strongestFinding: string;
  whyItMayMatter: string;
  supportingEvidence: string;
  investigationHypothesis: string;
  whatWouldDisproveThis: string;
  interpretation: string;
  investigationQuestions: string[];
  suggestedControl: string;
  limitations: string;
} {
  const observed = pattern.observed;
  const strongestReason = pattern.priority_reasons[0] ?? "the pattern's verified metrics";
  return {
    strongestFinding: `${pattern.title} is surfaced by ${strongestReason.toLowerCase()}. The verified comparison warrants review, but it does not establish a cause.`,
    whyItMayMatter: `This pattern combines ${Object.values(pattern.dimensions).join(" and ")} across ${observed.event_count} matching events. Its ${observed.high_rate_pct.toFixed(1)}% High rate is ${observed.high_rate_lift.toFixed(2)}× the enterprise baseline, making it a prioritisation signal for investigation.`,
    supportingEvidence: `${observed.severity.High ?? 0} of ${observed.event_count} matching events are High-classified; ${observed.open_events} are open; mean occurrence-to-record delay is ${observed.occurrence_to_record_mean_days.toFixed(1)} days.`,
    investigationHypothesis: "A recurring control, workflow handoff, or data-handling condition may be contributing to this combination; compare the matching events across process step, organisation, and time window to test it.",
    whatWouldDisproveThis: "The hypothesis would be weakened if the combination did not recur, if the matching events had no shared workflow condition, or if additional data brought the High rate and delays back toward the enterprise baseline.",
    interpretation: `${pattern.title} is surfaced because ${strongestReason.toLowerCase()} The verified profile contains ${observed.event_count} matching event${observed.event_count === 1 ? "" : "s"}, including ${observed.severity.High ?? 0} High-severity event${(observed.severity.High ?? 0) === 1 ? "" : "s"}; this is evidence for investigation, not proof of a causal relationship.`,
    investigationQuestions: [
      "Which control step, workflow owner, or system handoff is common across the matching events?",
      "Do the matching events repeat in the latest reporting period, or is the pattern concentrated in one time window?",
      "What source records would confirm or challenge the observed severity, timeliness, and exposure measures?",
    ],
    suggestedControl: pattern.narrative_context.opportunities[0] ?? "Review the relevant workflow control, assign an accountable owner, and monitor the verified metrics for recurrence.",
    limitations: "This is a verified deterministic fallback because the configured model was unavailable. The data is synthetic, the supporting sample may be small, and correlation does not establish causation; narrative impact figures are not treated as verified metrics.",
  };
}

function buildIssueFallback(profile: IssueProfile): {
  strongestFinding: string;
  whyItMayMatter: string;
  supportingEvidence: string;
  weakeningEvidence: string;
  investigationHypothesis: string;
  whatWouldDisproveThis: string;
  investigationQuestions: string[];
  suggestedControl: string;
  limitations: string;
} {
  const signal = profile.triggeredSignals[0];
  const counter = profile.counterSignals[0];
  const trend = profile.trend.note;
  return {
    strongestFinding: signal ? `${profile.issue} is most notably associated with ${signal.label.toLowerCase()}: ${signal.detail}` : `${profile.issue} has verified evidence worth reviewing, but no single triggered signal dominates the profile.`,
    whyItMayMatter: signal ? `This issue was surfaced because ${signal.label.toLowerCase()} (${signal.detail}). The result should be treated as a prioritisation signal, not a causal conclusion.` : "The issue is available for analyst review because its deterministic profile contains evidence requiring context.",
    supportingEvidence: profile.triggeredSignals.slice(0, 3).map((item) => `${item.label}: ${item.detail}`).join(" "),
    weakeningEvidence: counter ? `${counter.label}: ${counter.detail}` : "No checked dimension was flagged as near baseline; the main caution is that the evidence is observational and may be based on a small sample.",
    investigationHypothesis: `A repeated workflow or control-handling condition may be contributing to ${profile.issue}. The most useful test is to compare the ${profile.matchingEventIds.length} matching events by process step, system handoff, owner organisation, and occurrence window, while checking whether the leading signal remains present after stratification.`,
    whatWouldDisproveThis: `The hypothesis would be weakened if the leading breakdown became consistent with the enterprise baseline, if the matching events did not share a workflow or handoff, or if a follow-up period showed no recurrence. Current trend context: ${trend}`,
    investigationQuestions: [
      `Which control step, system handoff, or process owner is common across the ${profile.matchingEventIds.length} matching events?`,
      `Does the leading signal persist after stratifying by organisation, severity, and time window, or is it driven by a small subgroup?`,
      `How does the issue's ${profile.severity.high_rate_pct.toFixed(1)}% High rate compare with the ${profile.severity.enterprise_high_rate_pct.toFixed(1)}% enterprise rate after reviewing the underlying Event IDs?`,
      "What independent source record would confirm or challenge the strongest finding?",
      "What control evidence would show that the suggested improvement is operating consistently?",
    ],
    suggestedControl: `Map the affected workflow end-to-end, assign control ownership at each handoff, and monitor the leading verified signal (${signal?.label ?? "issue concentration"}) with a defined review threshold. Validate the control against the matching evidence before treating it as effective.`,
    limitations: "This is a verified deterministic fallback because the configured model was unavailable. The data is synthetic, some breakdowns may have small samples, correlation does not establish causation, and narrative impact figures are not treated as verified metrics.",
  };
}
