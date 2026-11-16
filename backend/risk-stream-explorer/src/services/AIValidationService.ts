import { z } from "zod";
import type { GroqStructuredResult } from "../types/Investigation.js";
import type { GroqIssueStructuredResult } from "../types/Issue.js";
import { AiProviderError, classifyProviderError, isUnusableOutputError, type ProviderFailureReason } from "./GroqService.js";
import { checkModelGrounding, collectResultTexts } from "./aiGrounding.js";

const MIN_QUESTIONS = 2;
const MAX_QUESTIONS = 8;
const MIN_FOLLOW_UP_ANSWER_CHARS = 20;

const GroqStructuredResultSchema = z.object({
  strongestFinding: z.string().trim().min(1),
  whyItMayMatter: z.string().trim().min(1),
  supportingEvidence: z.string().trim().min(1),
  investigationHypothesis: z.string().trim().min(1),
  whatWouldDisproveThis: z.string().trim().min(1),
  interpretation: z.string().trim().min(1),
  investigationQuestions: z.array(z.string().trim().min(1)).min(MIN_QUESTIONS).max(MAX_QUESTIONS),
  suggestedControl: z.string().trim().min(1),
  limitations: z.string().trim().min(1),
});

const GroqIssueStructuredResultSchema = z.object({
  strongestFinding: z.string().trim().min(1),
  whyItMayMatter: z.string().trim().min(1),
  supportingEvidence: z.string().trim().min(1),
  weakeningEvidence: z.string().trim().min(1),
  investigationHypothesis: z.string().trim().min(1),
  whatWouldDisproveThis: z.string().trim().min(1),
  investigationQuestions: z.array(z.string().trim().min(1)).min(MIN_QUESTIONS).max(MAX_QUESTIONS),
  suggestedControl: z.string().trim().min(1),
  limitations: z.string().trim().min(1),
});

const FollowUpAnswerSchema = z.object({
  answer: z.string().trim().min(MIN_FOLLOW_UP_ANSWER_CHARS),
});

/**
 * Evidence context for the grounding checks that run after the schema check.
 * Omitted fields degrade gracefully: without `evidence` numeric grounding is
 * skipped; without `knownEventIds` the allowed IDs are the only known ones.
 */
export interface ValidationGrounding {
  /** The payload that was actually sent to the model. */
  evidence?: unknown;
  /** Every event ID in the dataset. */
  knownEventIds?: Iterable<string>;
  knownPatternIds?: Iterable<string>;
  allowedPatternIds?: Iterable<string>;
}

export type AIValidationOutcome =
  | { valid: true; result: GroqStructuredResult; checks: string[] }
  | { valid: false; reason: string; failures: string[] };

export type AIIssueValidationOutcome =
  | { valid: true; result: GroqIssueStructuredResult; checks: string[] }
  | { valid: false; reason: string; failures: string[] };

export type AIFollowUpValidationOutcome =
  | { valid: true; answer: string; checks: string[] }
  | { valid: false; reason: string; failures: string[] };

function schemaFailure(error: z.ZodError): { reason: string; failures: string[] } {
  const failures = [...new Set(error.issues.map((i) => `schema-invalid:${i.path.join(".") || "root"}`))];
  return { reason: `Schema validation failed: ${error.issues.map((i) => i.message).join("; ")}`, failures };
}

/**
 * Runs the grounding checks (event IDs, pattern IDs, numbers) over every
 * string of an already schema-valid result. The returned `reason` always
 * contains the offending token (e.g. the unknown Event ID).
 */
function groundingOutcome(
  texts: string[],
  allowedEventIds: readonly string[],
  grounding: ValidationGrounding | undefined,
  scope: string,
): { ok: true; checks: string[] } | { ok: false; reason: string; failures: string[] } {
  const result = checkModelGrounding(texts, {
    knownEventIds: grounding?.knownEventIds ?? allowedEventIds,
    allowedEventIds,
    ...(grounding?.evidence !== undefined ? { evidence: grounding.evidence } : {}),
    ...(grounding?.knownPatternIds ? { knownPatternIds: grounding.knownPatternIds } : {}),
    ...(grounding?.allowedPatternIds ? { allowedPatternIds: grounding.allowedPatternIds } : {}),
  });
  if (result.ok) return { ok: true, checks: result.checks };
  return {
    ok: false,
    failures: result.failures,
    reason: `Response is not grounded in this ${scope}'s evidence: ${result.failures.join(", ")}`,
  };
}

/**
 * Validates a raw model response before it is ever trusted: schema-shape
 * first (via zod), then grounding over *every* string it contains — Event IDs
 * (tolerant matching, must exist in the dataset and in this pattern's
 * `matching_event_ids`), pattern IDs, and figures (must trace to the evidence
 * payload sent to the model; see `aiGrounding.ts`). Any failure rejects the
 * whole response, which is what keeps the model from fabricating supporting
 * evidence that looks real.
 *
 * `grounding` is optional for backward compatibility: without it only the ID
 * guard runs, against `allowedEventIds`.
 */
export function validateGroqResult(
  raw: unknown,
  allowedEventIds: readonly string[],
  grounding?: ValidationGrounding,
): AIValidationOutcome {
  const parsed = GroqStructuredResultSchema.safeParse(raw);
  if (!parsed.success) return { valid: false, ...schemaFailure(parsed.error) };

  const grounded = groundingOutcome(collectResultTexts(parsed.data), allowedEventIds, grounding, "pattern");
  if (!grounded.ok) return { valid: false, reason: grounded.reason, failures: grounded.failures };
  return { valid: true, result: parsed.data, checks: ["schema", ...grounded.checks] };
}

/**
 * Same guardrails as `validateGroqResult`, for the 9-field issue-analysis
 * schema (`LlmIssueStructuredResult` — synthesis, not summary: the model
 * must argue both for the evidence, via `strongestFinding` /
 * `supportingEvidence` / `investigationHypothesis`, and against it, via
 * `weakeningEvidence` / `whatWouldDisproveThis`) and an issue's own
 * `matching_event_ids`.
 */
export function validateGroqIssueResult(
  raw: unknown,
  allowedEventIds: readonly string[],
  grounding?: ValidationGrounding,
): AIIssueValidationOutcome {
  const parsed = GroqIssueStructuredResultSchema.safeParse(raw);
  if (!parsed.success) return { valid: false, ...schemaFailure(parsed.error) };

  const grounded = groundingOutcome(collectResultTexts(parsed.data), allowedEventIds, grounding, "issue");
  if (!grounded.ok) return { valid: false, reason: grounded.reason, failures: grounded.failures };
  return { valid: true, result: parsed.data, checks: ["schema", ...grounded.checks] };
}

/**
 * Validates a free-text follow-up answer. The question is untrusted user
 * input, so the answer is held to exactly the same grounding rules as the
 * structured analysis: it may not cite IDs or figures the evidence does not
 * contain — even if the question (or an injected instruction) asked for them.
 */
export function validateFollowUpAnswer(
  raw: unknown,
  allowedEventIds: readonly string[],
  grounding?: ValidationGrounding,
  scope = "request",
): AIFollowUpValidationOutcome {
  const parsed = FollowUpAnswerSchema.safeParse(raw);
  if (!parsed.success) return { valid: false, ...schemaFailure(parsed.error) };

  const grounded = groundingOutcome([parsed.data.answer], allowedEventIds, grounding, scope);
  if (!grounded.ok) return { valid: false, reason: grounded.reason, failures: grounded.failures };
  return { valid: true, answer: parsed.data.answer, checks: ["schema", ...grounded.checks] };
}

// ---------------------------------------------------------------------------
// Bounded generate -> validate -> (maybe) regenerate loop
// ---------------------------------------------------------------------------

export type Verdict<T> = { valid: true; value: T; checks: string[] } | { valid: false; reason: string; failures: string[] };

export type GenerationOutcome<T> =
  | { kind: "valid"; value: T; checks: string[]; attempts: number; rejectedAttempts: number; lastRejection?: string[] }
  | { kind: "provider-failure"; reason: ProviderFailureReason; message: string; attempts: number; rejectedAttempts: number; lastRejection?: string[] }
  | { kind: "validation-failed"; attempts: number; rejectedAttempts: number; failures: string[] };

export interface GenerationOptions<T> {
  /** One provider call. `timeoutMs` is already capped to what is left of the overall budget. */
  call: (attempt: { attempt: number; timeoutMs: number }) => Promise<unknown>;
  validate: (raw: unknown) => Verdict<T>;
  /** Upper bound on attempts (the existing MAX_VALIDATION_ATTEMPTS). */
  maxAttempts: number;
  /** Per-attempt provider timeout (AI_TIMEOUT_MS). */
  providerTimeoutMs: number;
  /** Overall wall-clock budget across attempts (AI_TOTAL_BUDGET_MS). */
  totalBudgetMs: number;
  now?: () => number;
  onRejected?: (info: { attempt: number; latencyMs: number; failures: string[]; reason: string }) => void;
  onProviderFailure?: (info: { attempt: number; latencyMs: number; reason: ProviderFailureReason; message: string }) => void;
  onRetrySkipped?: (info: { nextAttempt: number; remainingMs: number; lastAttemptMs: number }) => void;
}

/** A retry needs at least this much time left, however fast the previous attempt was. */
const MIN_RETRY_WINDOW_MS = 1_000;

/**
 * Drives the model call under the project's retry policy:
 *
 *  - A missing key (`provider-not-configured`), a timeout (`provider-timeout`)
 *    or any other provider failure (`provider-error`) stops immediately — no
 *    further attempts; the caller falls back with that reason.
 *  - Only a *validation* failure (bad schema, ungrounded ID/number, or an
 *    unusable empty/non-JSON completion) triggers another attempt, at most
 *    `maxAttempts` in total.
 *  - A further attempt is skipped when the time left in `totalBudgetMs` is
 *    less than the previous attempt took (it could not be expected to
 *    finish), and each attempt's provider timeout is capped to the time left.
 */
export async function generateValidated<T>(options: GenerationOptions<T>): Promise<GenerationOutcome<T>> {
  const now = options.now ?? Date.now;
  const startedAt = now();
  let rejectedAttempts = 0;
  let attempts = 0;
  let lastFailures: string[] = [];
  let lastAttemptMs = 0;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    const remainingMs = options.totalBudgetMs - (now() - startedAt);
    if (attempt > 1 && remainingMs < Math.max(lastAttemptMs, MIN_RETRY_WINDOW_MS)) {
      options.onRetrySkipped?.({ nextAttempt: attempt, remainingMs, lastAttemptMs });
      break;
    }
    const timeoutMs = Math.max(1, Math.min(options.providerTimeoutMs, remainingMs));
    const attemptStartedAt = now();
    attempts = attempt;

    let raw: unknown;
    try {
      raw = await options.call({ attempt, timeoutMs });
    } catch (err) {
      lastAttemptMs = now() - attemptStartedAt;
      if (isUnusableOutputError(err)) {
        // The provider answered but not with usable JSON: a rejected attempt, not an outage.
        rejectedAttempts += 1;
        lastFailures = [err instanceof Error && err.name === "GroqEmptyResponseError" ? "unusable-output:empty" : "unusable-output:invalid-json"];
        options.onRejected?.({ attempt, latencyMs: lastAttemptMs, failures: lastFailures, reason: (err as Error).message });
        continue;
      }
      const typed = classifyProviderError(err);
      const reason: ProviderFailureReason = typed instanceof AiProviderError ? typed.reason : "provider-error";
      options.onProviderFailure?.({ attempt, latencyMs: lastAttemptMs, reason, message: typed.message });
      return {
        kind: "provider-failure",
        reason,
        message: typed.message,
        attempts,
        rejectedAttempts,
        ...(lastFailures.length > 0 ? { lastRejection: lastFailures } : {}),
      };
    }
    lastAttemptMs = now() - attemptStartedAt;

    const verdict = options.validate(raw);
    if (verdict.valid) {
      return {
        kind: "valid",
        value: verdict.value,
        checks: verdict.checks,
        attempts,
        rejectedAttempts,
        ...(lastFailures.length > 0 ? { lastRejection: lastFailures } : {}),
      };
    }
    rejectedAttempts += 1;
    lastFailures = verdict.failures;
    options.onRejected?.({ attempt, latencyMs: lastAttemptMs, failures: verdict.failures, reason: verdict.reason });
  }

  return { kind: "validation-failed", attempts, rejectedAttempts, failures: lastFailures };
}
