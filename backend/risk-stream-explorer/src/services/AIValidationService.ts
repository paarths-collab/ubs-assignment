import { z } from "zod";
import type { GroqStructuredResult } from "../types/Investigation.js";
import type { GroqIssueStructuredResult } from "../types/Issue.js";

const MIN_QUESTIONS = 2;
const MAX_QUESTIONS = 8;

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

/** Matches the dataset's synthetic Event ID format, e.g. "SIM-0000025". */
const EVENT_ID_PATTERN = /SIM-\d{4,}/g;

export type AIValidationOutcome =
  | { valid: true; result: GroqStructuredResult }
  | { valid: false; reason: string };

export type AIIssueValidationOutcome =
  | { valid: true; result: GroqIssueStructuredResult }
  | { valid: false; reason: string };

/**
 * Validates a raw Groq response before it is ever trusted: schema-shape
 * first (via zod), then a guard against hallucinated evidence — any
 * "SIM-xxxxx"-shaped token appearing anywhere in the response text must be a
 * member of `allowedEventIds` (the pattern's own `matching_event_ids`), or
 * the whole response is rejected. This is what keeps Groq from being able to
 * fabricate supporting evidence that looks real.
 */
export function validateGroqResult(raw: unknown, allowedEventIds: readonly string[]): AIValidationOutcome {
  const parsed = GroqStructuredResultSchema.safeParse(raw);
  if (!parsed.success) {
    return { valid: false, reason: `Schema validation failed: ${parsed.error.issues.map((i) => i.message).join("; ")}` };
  }

  const allowed = new Set(allowedEventIds);
  const combinedText = [
    parsed.data.interpretation,
    ...parsed.data.investigationQuestions,
    parsed.data.strongestFinding,
    parsed.data.whyItMayMatter,
    parsed.data.supportingEvidence,
    parsed.data.investigationHypothesis,
    parsed.data.whatWouldDisproveThis,
    parsed.data.interpretation,
    parsed.data.suggestedControl,
    parsed.data.limitations,
  ].join("\n");

  const mentionedIds = combinedText.match(EVENT_ID_PATTERN) ?? [];
  for (const id of mentionedIds) {
    if (!allowed.has(id)) {
      return { valid: false, reason: `Response references unverified event id "${id}" not in this pattern's matching_event_ids` };
    }
  }

  return { valid: true, result: parsed.data };
}

/**
 * Same guardrails as `validateGroqResult`, for the 9-field issue-analysis
 * schema (`LlmIssueStructuredResult` — synthesis, not summary: the model
 * must argue both for the evidence, via `strongestFinding` /
 * `supportingEvidence` / `investigationHypothesis`, and against it, via
 * `weakeningEvidence` / `whatWouldDisproveThis`) and an issue's own
 * `matching_event_ids`.
 */
export function validateGroqIssueResult(raw: unknown, allowedEventIds: readonly string[]): AIIssueValidationOutcome {
  const parsed = GroqIssueStructuredResultSchema.safeParse(raw);
  if (!parsed.success) {
    return { valid: false, reason: `Schema validation failed: ${parsed.error.issues.map((i) => i.message).join("; ")}` };
  }

  const allowed = new Set(allowedEventIds);
  const combinedText = [
    parsed.data.strongestFinding,
    parsed.data.whyItMayMatter,
    parsed.data.supportingEvidence,
    parsed.data.weakeningEvidence,
    parsed.data.investigationHypothesis,
    parsed.data.whatWouldDisproveThis,
    ...parsed.data.investigationQuestions,
    parsed.data.suggestedControl,
    parsed.data.limitations,
  ].join("\n");

  const mentionedIds = combinedText.match(EVENT_ID_PATTERN) ?? [];
  for (const id of mentionedIds) {
    if (!allowed.has(id)) {
      return { valid: false, reason: `Response references unverified event id "${id}" not in this issue's matching_event_ids` };
    }
  }

  return { valid: true, result: parsed.data };
}
