/**
 * Provenance vocabulary for every AI-assisted response.
 *
 * A response must always say where its text and its evidence came from, so a
 * client never has to infer that from a model-name string. These types are
 * deliberately provider-neutral and are reused by every AI route.
 */

/**
 * Where a piece of content came from.
 *
 * - `ai-generated`: model output that passed server-side validation (schema,
 *   Event/Pattern ID guards and numeric grounding against the evidence that
 *   was sent to the model).
 * - `deterministic-fallback`: a server-side template built only from verified
 *   evidence; no model text is involved.
 * - `stored-pattern`: precomputed values read from the pattern dataset file
 *   (`risk_patterns_final.json`); the backend forwards them, it never
 *   recomputes them.
 * - `computed`: a deterministic runtime calculation over dataset records.
 * - `dataset-record`: raw synthetic records exactly as stored.
 */
export type ProvenanceSource =
  | "ai-generated"
  | "deterministic-fallback"
  | "stored-pattern"
  | "computed"
  | "dataset-record";

/** Why a deterministic fallback was served instead of model output. */
export type FallbackReason =
  | "provider-not-configured"
  | "provider-timeout"
  | "provider-error"
  | "validation-failed";

/** Machine-readable provenance attached to every AI analysis response. */
export interface AnalysisProvenance {
  /** What produced the analysis text. */
  analysis: Extract<ProvenanceSource, "ai-generated" | "deterministic-fallback">;
  /** What kind of data the evidence handed to the model (or the template) is. */
  evidence: Extract<ProvenanceSource, "stored-pattern" | "computed">;
  /** True when this exact response was served from the in-memory AI cache. */
  cached: boolean;
  /** Present only when `analysis` is `deterministic-fallback`. */
  fallbackReason?: FallbackReason;
  validation: {
    /** Server-side checks the served text passed, e.g. `["schema","event-ids","pattern-ids","numeric-grounding"]`. */
    checks: string[];
    /** Model attempts that were rejected by validation before the served result. */
    rejectedAttempts: number;
    /** Stable machine-readable failure strings of the most recent rejected attempt. */
    lastRejection?: string[];
  };
}

/** Provenance block for model output that passed validation. */
export function aiGeneratedProvenance(input: {
  evidence: AnalysisProvenance["evidence"];
  checks: string[];
  rejectedAttempts: number;
  lastRejection?: string[];
  cached?: boolean;
}): AnalysisProvenance {
  return {
    analysis: "ai-generated",
    evidence: input.evidence,
    cached: input.cached ?? false,
    validation: {
      checks: input.checks,
      rejectedAttempts: input.rejectedAttempts,
      ...(input.lastRejection && input.lastRejection.length > 0 ? { lastRejection: input.lastRejection } : {}),
    },
  };
}

/** Provenance block for a deterministic fallback; never cached, so `cached` is always false. */
export function fallbackProvenance(input: {
  evidence: AnalysisProvenance["evidence"];
  reason: FallbackReason;
  checks: string[];
  rejectedAttempts: number;
  lastRejection?: string[];
}): AnalysisProvenance {
  return {
    analysis: "deterministic-fallback",
    evidence: input.evidence,
    cached: false,
    fallbackReason: input.reason,
    validation: {
      checks: input.checks,
      rejectedAttempts: input.rejectedAttempts,
      ...(input.lastRejection && input.lastRejection.length > 0 ? { lastRejection: input.lastRejection } : {}),
    },
  };
}
