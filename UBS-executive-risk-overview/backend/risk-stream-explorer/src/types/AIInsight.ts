export type PeriodInsightIntent =
  | "explain_period"
  | "what_changed"
  | "what_is_driving_change"
  | "what_to_investigate"
  | "control_considerations";

export type EventInsightIntent =
  | "summarise_event"
  | "why_it_matters"
  | "what_to_investigate"
  | "suggest_controls"
  | "find_similar_events"
  | "explain_reporting_delay";

export interface SupportingMetric {
  label: string;
  value: string;
}

/**
 * The structured shape every AI answer takes, at both period and event scope.
 * Every field is either populated from verified calculated facts, or the
 * entire insight is replaced with an `InsufficientEvidence` marker — never
 * partially fabricated.
 */
export interface InsightPayload {
  intent: PeriodInsightIntent | EventInsightIntent;
  scope: "period" | "event";
  scopeId: string;

  observed: string;
  whyItMatters: string;
  drivers: string[];
  investigate: string[];
  controlConsiderations: string[];
  supportingEvidence: SupportingMetric[];

  source: "verified-narrative";
  generatedAt: string;
}

export const INSUFFICIENT_EVIDENCE_TEXT =
  "The available verified data does not support that conclusion.";

export interface SimilarEventMatch {
  eventId: string;
  eventTitle: string;
  score: number;
  matchedOn: string[];
}
