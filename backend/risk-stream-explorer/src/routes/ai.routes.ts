import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PatternRepository } from "../repositories/PatternRepository.js";
import type { RiskEventRepository } from "../repositories/RiskEventRepository.js";
import type { GroqService } from "../services/GroqService.js";
import type { AICacheService } from "../services/AICacheService.js";
import type { IssueIntelligenceService } from "../services/IssueIntelligenceService.js";
import {
  generateValidated,
  validateFollowUpAnswer,
  validateGroqIssueResult,
  validateGroqResult,
  type GenerationOutcome,
  type ValidationGrounding,
  type Verdict,
} from "../services/AIValidationService.js";
import { checkGrounding, collectResultTexts } from "../services/aiGrounding.js";
import { buildObservedFacts } from "../services/InvestigationService.js";
import { buildIssueEvidencePayload } from "../services/IssueIntelligenceService.js";
import { buildFollowUpSystemPrompt, PROMPT_VERSION } from "../prompts/pattern-analysis.prompt.js";
import { buildIssueSystemPrompt, ISSUE_PROMPT_VERSION, ISSUE_RESPONSE_JSON_SCHEMA } from "../prompts/issue-analysis.prompt.js";
import type { AiPatternResponse } from "../types/Investigation.js";
import type { AiIssueResponse } from "../types/Issue.js";
import type { IssueProfile } from "../types/Issue.js";
import type { Pattern } from "../types/Pattern.js";
import { aiGeneratedProvenance, fallbackProvenance, type AnalysisProvenance, type FallbackReason } from "../types/provenance.js";
import { DEFAULT_AI_TOTAL_BUDGET_MS, type Env } from "../config/env.js";

export interface AiRouteDeps {
  patternRepository: PatternRepository;
  /** Full event index for the ID guard. Optional so older call sites keep compiling; without it only this request's evidence IDs are treated as real. */
  eventRepository?: RiskEventRepository;
  groqService: GroqService;
  aiCache: AICacheService;
  env: Env;
}

export interface AiIssueRouteDeps {
  issueIntelligenceService: IssueIntelligenceService;
  eventRepository?: RiskEventRepository;
  /** Used to recognise real PAT- IDs; without it the pattern-ID guard is skipped for issue answers. */
  patternRepository?: PatternRepository;
  groqService: GroqService;
  aiCache: AICacheService;
  env: Env;
}

/** Success body of `POST /api/ai/pattern/:patternId` — the existing fields plus `provenance`. */
export type AiPatternRouteResponse = Extract<AiPatternResponse, { status: "ok" }> & { provenance: AnalysisProvenance };
/** Success body of `POST /api/ai/issue/:issueId` — the existing fields plus `provenance`. */
export type AiIssueRouteResponse = Extract<AiIssueResponse, { status: "ok" }> & { provenance: AnalysisProvenance };
/** Success body of both follow-up routes. */
export interface AiFollowUpRouteResponse {
  status: "ok";
  answer: string;
  provider: string;
  model: string;
  provenance: AnalysisProvenance;
}

/**
 * Upper bound on model attempts per request. Only a *validation* failure (bad
 * schema, unknown/out-of-scope ID, ungrounded figure) earns another attempt;
 * a missing key, a timeout or a provider error goes straight to the fallback.
 * Attempts are additionally bounded by AI_TOTAL_BUDGET_MS.
 */
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

function readFollowUpQuestion(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const value = (body as Record<string, unknown>).question;
  if (typeof value !== "string") return null;
  const question = value.trim();
  return question.length >= 3 && question.length <= 1000 ? question : null;
}

function totalBudgetMs(env: Env): number {
  return env.AI_TOTAL_BUDGET_MS ?? DEFAULT_AI_TOTAL_BUDGET_MS;
}

function eventIdIndex(repository: RiskEventRepository | undefined): string[] {
  return repository ? repository.getAll().map((event) => event.event_id) : [];
}

/** Why the model result was not served: a provider failure carries its own reason, otherwise validation failed. */
function fallbackReasonOf(outcome: Exclude<GenerationOutcome<unknown>, { kind: "valid" }>): FallbackReason {
  return outcome.kind === "provider-failure" ? outcome.reason : "validation-failed";
}

/**
 * Runs the grounding checks over the deterministic fallback text too. The
 * fallback is built only from verified evidence, so this should always pass;
 * running it makes that claim checked rather than assumed. `evidence` is the
 * same payload the model would have been given.
 */
function fallbackChecks(texts: string[], evidence: unknown, grounding: ValidationGrounding, allowedEventIds: readonly string[], log: FastifyRequest["log"]): string[] {
  const result = checkGrounding(texts, {
    evidence,
    knownEventIds: grounding.knownEventIds ?? allowedEventIds,
    allowedEventIds,
    ...(grounding.knownPatternIds ? { knownPatternIds: grounding.knownPatternIds } : {}),
    ...(grounding.allowedPatternIds ? { allowedPatternIds: grounding.allowedPatternIds } : {}),
  });
  if (!result.ok) log.error({ failures: result.failures }, "ai.fallback.ungrounded");
  return result.ok ? result.checks : [];
}

function unavailable(reply: FastifyReply, request: FastifyRequest, reason: FallbackReason): FastifyReply {
  const message =
    reason === "provider-not-configured"
      ? "No AI provider is configured on this server, so follow-up questions are unavailable."
      : reason === "provider-timeout"
        ? "The AI provider did not respond in time. Please try again."
        : "The AI provider returned an error. Please try again.";
  return reply.code(503).send({ error: { code: "AI_UNAVAILABLE", reason, message, requestId: request.id } });
}

function invalidResponse(reply: FastifyReply, request: FastifyRequest, failures: string[]): FastifyReply {
  return reply.code(502).send({
    error: {
      code: "AI_RESPONSE_INVALID",
      message: "The AI follow-up answer could not be verified against the evidence, so it was not returned.",
      failures,
      requestId: request.id,
    },
  });
}

/**
 * Shared follow-up flow for pattern and issue scopes. The user's question is
 * untrusted: it travels in the user message next to the facts (never in the
 * system prompt), and the answer is validated exactly like a structured
 * analysis. There is deliberately no deterministic substitute answer — a
 * template cannot answer an arbitrary question — so provider outages surface
 * as 503 and rejected answers as 502, and the rejected text is never returned.
 */
async function answerFollowUp(
  request: FastifyRequest,
  reply: FastifyReply,
  input: {
    scope: "pattern" | "issue";
    deps: { groqService: GroqService; env: Env };
    question: string;
    evidence: unknown;
    allowedEventIds: readonly string[];
    grounding: ValidationGrounding;
    evidenceKind: AnalysisProvenance["evidence"];
  },
): Promise<FastifyReply | AiFollowUpRouteResponse> {
  const { deps, scope } = input;
  const systemPrompt = buildFollowUpSystemPrompt(scope);
  const outcome = await generateValidated({
    call: ({ timeoutMs }) =>
      deps.groqService.completeStructured<unknown>(
        systemPrompt,
        { facts: input.evidence, followUpQuestion: input.question },
        FOLLOW_UP_RESPONSE_SCHEMA,
        { timeoutMs },
      ),
    validate: (raw) => {
      const checked = validateFollowUpAnswer(raw, input.allowedEventIds, input.grounding, scope);
      return checked.valid ? { valid: true, value: checked.answer, checks: checked.checks } : checked;
    },
    maxAttempts: MAX_VALIDATION_ATTEMPTS,
    providerTimeoutMs: deps.env.AI_TIMEOUT_MS,
    totalBudgetMs: totalBudgetMs(deps.env),
    onRejected: (info) => request.log.warn({ scope, attempt: info.attempt, failures: info.failures }, "ai.followup.validation_failed"),
    onProviderFailure: (info) => request.log.warn({ scope, attempt: info.attempt, reason: info.reason, error: info.message }, "ai.followup.provider_error"),
    onRetrySkipped: (info) => request.log.warn({ scope, ...info }, "ai.followup.retry_skipped"),
  });

  if (outcome.kind === "valid") {
    return {
      status: "ok",
      answer: outcome.value,
      provider: deps.env.llm.provider,
      model: deps.env.llm.model,
      provenance: aiGeneratedProvenance({
        evidence: input.evidenceKind,
        checks: outcome.checks,
        rejectedAttempts: outcome.rejectedAttempts,
        ...(outcome.lastRejection ? { lastRejection: outcome.lastRejection } : {}),
      }),
    };
  }
  if (outcome.kind === "provider-failure") return unavailable(reply, request, outcome.reason);
  return invalidResponse(reply, request, outcome.failures);
}

export function registerAiRoutes(app: FastifyInstance, deps: AiRouteDeps): void {
  const knownEventIds = eventIdIndex(deps.eventRepository);
  const knownPatternIds = deps.patternRepository.getAll().map((p) => p.pattern_id);

  const groundingFor = (pattern: Pattern, evidence: unknown): ValidationGrounding => ({
    evidence,
    knownEventIds,
    knownPatternIds,
    allowedPatternIds: [pattern.pattern_id],
  });

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
      const evidence = pattern.groq_fact_payload;
      const grounding = groundingFor(pattern, evidence);

      const cacheKey = deps.aiCache.key(patternId, deps.env.GROQ_MODEL, PROMPT_VERSION);
      const cached = deps.aiCache.get<AiPatternRouteResponse>(cacheKey);
      if (cached) {
        request.log.info({ patternId, cacheHit: true }, "ai.pattern");
        return { ...cached, cached: true, provenance: { ...cached.provenance, cached: true } } satisfies AiPatternRouteResponse;
      }

      const outcome = await generateValidated({
        call: ({ timeoutMs }) => deps.groqService.analyzePattern(evidence, { timeoutMs }),
        validate: (raw) => {
          const checked = validateGroqResult(raw, matchingEventIds, grounding);
          return checked.valid ? { valid: true, value: checked.result, checks: checked.checks } : checked;
        },
        maxAttempts: MAX_VALIDATION_ATTEMPTS,
        providerTimeoutMs: deps.env.AI_TIMEOUT_MS,
        totalBudgetMs: totalBudgetMs(deps.env),
        onRejected: (info) => request.log.warn({ patternId, attempt: info.attempt, latencyMs: info.latencyMs, reason: info.reason }, "ai.pattern.validation_failed"),
        onProviderFailure: (info) => request.log.warn({ patternId, attempt: info.attempt, reason: info.reason, error: info.message }, "ai.pattern.groq_error"),
        onRetrySkipped: (info) => request.log.warn({ patternId, ...info }, "ai.pattern.retry_skipped"),
      });

      if (outcome.kind === "valid") {
        const response: AiPatternRouteResponse = {
          status: "ok",
          observed,
          matchingEventIds,
          ai: outcome.value,
          cached: false,
          provider: deps.env.llm.provider,
          model: deps.env.llm.model,
          provenance: aiGeneratedProvenance({
            evidence: "stored-pattern",
            checks: outcome.checks,
            rejectedAttempts: outcome.rejectedAttempts,
            ...(outcome.lastRejection ? { lastRejection: outcome.lastRejection } : {}),
          }),
        };
        deps.aiCache.set(cacheKey, response);
        request.log.info(
          { patternId, attempts: outcome.attempts, model: deps.env.llm.model, promptVersion: PROMPT_VERSION, cacheHit: false, success: true },
          "ai.pattern",
        );
        return response;
      }

      const reason = fallbackReasonOf(outcome);
      request.log.info({ patternId, model: deps.env.llm.model, promptVersion: PROMPT_VERSION, success: false, reason }, "ai.pattern");

      // Fallbacks are deliberately never cached: the next request should try the model again.
      const ai = buildPatternFallback(pattern, reason);
      const fallback: AiPatternRouteResponse = {
        status: "ok",
        observed,
        matchingEventIds,
        ai,
        cached: false,
        provider: deps.env.llm.provider,
        model: "verified-deterministic-fallback",
        provenance: fallbackProvenance({
          evidence: "stored-pattern",
          reason,
          checks: fallbackChecks(collectResultTexts(ai), evidence, grounding, matchingEventIds, request.log),
          rejectedAttempts: outcome.rejectedAttempts,
          ...(outcome.kind === "validation-failed" ? { lastRejection: outcome.failures } : outcome.lastRejection ? { lastRejection: outcome.lastRejection } : {}),
        }),
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
      return answerFollowUp(request, reply, {
        scope: "pattern",
        deps,
        question,
        evidence: pattern.groq_fact_payload,
        allowedEventIds: pattern.matching_event_ids,
        grounding: groundingFor(pattern, pattern.groq_fact_payload),
        evidenceKind: "stored-pattern",
      });
    },
  );
}

/**
 * `POST /api/ai/issue/:issueId` — Groq interpretation of one issue's
 * deterministic evidence package. Same guarantees as the pattern route
 * above (server-resolved facts only, bounded regeneration, deterministic
 * fallback, ID and figure grounding): the client may only ever supply the
 * issue slug via the URL.
 *
 * Evidence label: an issue profile is *computed* — `IssueIntelligenceService`
 * derives every number at startup directly from the event records
 * (`risk_events_final.json`), it is not read from a precomputed file — so
 * provenance reports `evidence: "computed"` (unlike patterns, which are
 * `stored-pattern`). The profile's `related_patterns` refs are only pointers
 * to stored patterns.
 */
export function registerIssueAiRoutes(app: FastifyInstance, deps: AiIssueRouteDeps): void {
  const knownEventIds = eventIdIndex(deps.eventRepository);
  const knownPatternIds = deps.patternRepository?.getAll().map((p) => p.pattern_id);

  const groundingFor = (profile: IssueProfile, evidence: unknown): ValidationGrounding => ({
    evidence,
    knownEventIds,
    ...(knownPatternIds ? { knownPatternIds, allowedPatternIds: profile.relatedPatterns.map((p) => p.pattern_id) } : {}),
  });

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
      const grounding = groundingFor(profile, evidence);

      const cacheKey = deps.aiCache.key(profile.slug, deps.env.GROQ_MODEL, ISSUE_PROMPT_VERSION);
      const cached = deps.aiCache.get<AiIssueRouteResponse>(cacheKey);
      if (cached) {
        request.log.info({ issueId: profile.slug, cacheHit: true }, "ai.issue");
        return { ...cached, cached: true, provenance: { ...cached.provenance, cached: true } } satisfies AiIssueRouteResponse;
      }

      // Routed through the generic `completeStructured` rather than
      // `GroqService.analyzeIssue` — that method is pinned to the old
      // 5-field schema on a class this feature does not own. The
      // provider-neutral prompt/schema for the 9-field synthesis result
      // live next to each other in issue-analysis.prompt.ts.
      const outcome = await generateValidated({
        call: ({ timeoutMs }) => deps.groqService.completeStructured<unknown>(buildIssueSystemPrompt(), evidence, ISSUE_RESPONSE_JSON_SCHEMA, { timeoutMs }),
        validate: (raw) => {
          const checked = validateGroqIssueResult(raw, matchingEventIds, grounding);
          return checked.valid ? { valid: true, value: checked.result, checks: checked.checks } : checked;
        },
        maxAttempts: MAX_VALIDATION_ATTEMPTS,
        providerTimeoutMs: deps.env.AI_TIMEOUT_MS,
        totalBudgetMs: totalBudgetMs(deps.env),
        onRejected: (info) => request.log.warn({ issueId: profile.slug, attempt: info.attempt, latencyMs: info.latencyMs, reason: info.reason }, "ai.issue.validation_failed"),
        onProviderFailure: (info) => request.log.warn({ issueId: profile.slug, attempt: info.attempt, reason: info.reason, error: info.message }, "ai.issue.groq_error"),
        onRetrySkipped: (info) => request.log.warn({ issueId: profile.slug, ...info }, "ai.issue.retry_skipped"),
      });

      if (outcome.kind === "valid") {
        const response: AiIssueRouteResponse = {
          status: "ok",
          matchingEventIds,
          ai: outcome.value,
          cached: false,
          provider: deps.env.llm.provider,
          model: deps.env.llm.model,
          provenance: aiGeneratedProvenance({
            evidence: "computed",
            checks: outcome.checks,
            rejectedAttempts: outcome.rejectedAttempts,
            ...(outcome.lastRejection ? { lastRejection: outcome.lastRejection } : {}),
          }),
        };
        deps.aiCache.set(cacheKey, response);
        request.log.info(
          { issueId: profile.slug, attempts: outcome.attempts, model: deps.env.llm.model, promptVersion: ISSUE_PROMPT_VERSION, cacheHit: false, success: true },
          "ai.issue",
        );
        return response;
      }

      const reason = fallbackReasonOf(outcome);
      request.log.info({ issueId: profile.slug, model: deps.env.llm.model, promptVersion: ISSUE_PROMPT_VERSION, success: false, reason }, "ai.issue");

      // Fallbacks are deliberately never cached: the next request should try the model again.
      const ai = buildIssueFallback(profile, reason);
      const fallback: AiIssueRouteResponse = {
        status: "ok",
        matchingEventIds,
        ai,
        cached: false,
        provider: deps.env.llm.provider,
        model: "verified-deterministic-fallback",
        provenance: fallbackProvenance({
          evidence: "computed",
          reason,
          checks: fallbackChecks(collectResultTexts(ai), evidence, grounding, matchingEventIds, request.log),
          rejectedAttempts: outcome.rejectedAttempts,
          ...(outcome.kind === "validation-failed" ? { lastRejection: outcome.failures } : outcome.lastRejection ? { lastRejection: outcome.lastRejection } : {}),
        }),
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
      const evidence = buildIssueEvidencePayload(profile);
      return answerFollowUp(request, reply, {
        scope: "issue",
        deps,
        question,
        evidence,
        allowedEventIds: profile.matchingEventIds,
        grounding: groundingFor(profile, evidence),
        evidenceKind: "computed",
      });
    },
  );
}

/** The AI POST route accepts no body fields — only an absent body, `null`, or `{}` are tolerated. */
function isAcceptableEmptyBody(body: unknown): boolean {
  if (body === undefined || body === null) return true;
  if (typeof body !== "object" || Array.isArray(body)) return false;
  return Object.keys(body as Record<string, unknown>).length === 0;
}

/** Why the template is shown, phrased for the `limitations` field. Always contains "verified deterministic fallback". */
function fallbackLimitationLead(reason: FallbackReason | undefined): string {
  return reason === "validation-failed"
    ? "This is a verified deterministic fallback because the model output could not be verified against the evidence."
    : "This is a verified deterministic fallback because the configured model was unavailable.";
}

export function buildPatternFallback(pattern: Pattern, reason?: FallbackReason): {
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
    limitations: `${fallbackLimitationLead(reason)} The data is synthetic, the supporting sample may be small, and correlation does not establish causation; narrative impact figures are not treated as verified metrics.`,
  };
}

export function buildIssueFallback(profile: IssueProfile, reason?: FallbackReason): {
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
    limitations: `${fallbackLimitationLead(reason)} The data is synthetic, some breakdowns may have small samples, correlation does not establish causation, and narrative impact figures are not treated as verified metrics.`,
  };
}
