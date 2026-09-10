/**
 * DTOs for Component 4's API (Pattern Intelligence + Investigation Workspace).
 * Deliberately NOT imported from `@backend/index` — that barrel is the
 * Component 2/3 library surface. Component 4's backend is a real HTTP
 * server (Fastify, groq-sdk, etc. — Node-only), so the frontend only ever
 * talks to it over `fetch()`; these types just describe its JSON responses.
 */

export type Severity = "Low" | "Moderate" | "High";
export type EventType = "Financial" | "Non-Financial";

export interface RiskEventFinancial {
  gross_amount: number | null;
  net_amount_reported: number | null;
  recovery_amount_reported: number | null;
  net_amount_for_analysis: number | null;
  recovery_amount_for_analysis: number | null;
  potential_impact: number | null;
  provision_status: string | null;
}

export interface RiskEventWorkflow {
  status: string;
  stage: string;
  is_open: boolean;
  owner_organisation: string;
  owner_organisation_short: string;
  owner_name: string;
  current_assignee: string;
  creator_name: string;
  administrator_name: string;
  discovery_organisation: string;
  modified_by_name: string;
}

export interface RiskEventRisk {
  root_cause: string;
  risk_theme: string;
  or_category: string;
}

export interface RiskEventTimeline {
  occurrence_date: string;
  discovered_date: string | null;
  created_on: string | null;
  modified_on: string | null;
  occurrence_month: string;
  detection_delay_days: number | null;
  recording_delay_days: number | null;
  occurrence_to_record_days: number | null;
}

export interface RiskEventNarrative {
  background_detail: string | null;
  issue_detail: string | null;
  root_cause_detail: string | null;
  impact_detail: string | null;
  opportunity: string | null;
  impacts_raw: string | null;
}

export interface RiskEvent {
  event_id: string;
  title: string;
  issue: string;
  event_type: EventType;
  classification: Severity;
  financial: RiskEventFinancial;
  workflow: RiskEventWorkflow;
  risk: RiskEventRisk;
  timeline: RiskEventTimeline;
  narrative: RiskEventNarrative;
}

export interface EnterpriseBaseline {
  event_count: number;
  severity_counts: Record<string, number>;
  high_rate: number;
  high_rate_pct: number;
  open_event_count: number;
  open_rate: number;
  open_rate_pct: number;
  detection_delay_mean_days: number;
  detection_delay_median_days: number;
  recording_delay_mean_days: number;
  recording_delay_median_days: number;
  occurrence_to_record_mean_days: number;
  occurrence_to_record_median_days: number;
  gross_amount_total: number;
  net_amount_total: number;
  recovery_amount_total: number;
  potential_impact_total: number;
  occurrence_date_min: string;
  occurrence_date_max: string;
}

export interface PatternObserved {
  event_count: number;
  severity: Record<string, number>;
  high_rate: number;
  high_rate_pct: number;
  enterprise_high_rate: number;
  enterprise_high_rate_pct: number;
  high_rate_lift: number;
  open_events: number;
  open_rate: number;
  gross_amount: number;
  net_amount: number;
  recovery_amount: number;
  potential_impact: number;
  detection_delay_mean_days: number;
  detection_delay_median_days: number;
  recording_delay_mean_days: number;
  recording_delay_median_days: number;
  occurrence_to_record_mean_days: number;
  occurrence_to_record_median_days: number;
}

export interface PatternComparedWithEnterprise {
  high_rate_lift: number;
  high_rate_delta_pct_points: number;
  detection_delay_delta_days: number;
  recording_delay_delta_days: number;
  occurrence_to_record_delta_days: number;
}

export interface PatternNarrativeContext {
  issue_details: string[];
  root_cause_details: string[];
  opportunities: string[];
}

export interface Pattern {
  pattern_id: string;
  pattern_type: string;
  title: string;
  why_seen: string;
  priority_level: string;
  priority_reasons: string[];
  dimensions: Record<string, string>;
  observed: PatternObserved;
  compared_with_enterprise: PatternComparedWithEnterprise;
  graph_filter: Record<string, string[]>;
  matching_event_ids: string[];
  narrative_context: PatternNarrativeContext;
}

export interface PriorityPatternsResponse {
  patterns: Pattern[];
  count: number;
}

export interface Investigation {
  pattern: Pattern;
  enterpriseComparison: PatternComparedWithEnterprise;
  graphFilter: Record<string, string[]>;
  deterministicSummary: string;
  matchingEvents: RiskEvent[];
  enterprise: EnterpriseBaseline;
}

export interface ObservedFacts {
  patternId: string;
  title: string;
  priorityLevel: string;
  priorityReasons: string[];
  observed: PatternObserved;
  comparedWithEnterprise: PatternComparedWithEnterprise;
}

export interface GroqStructuredResult {
  strongestFinding: string;
  whyItMayMatter: string;
  supportingEvidence: string;
  investigationHypothesis: string;
  whatWouldDisproveThis: string;
  interpretation: string;
  investigationQuestions: string[];
  suggestedControl: string;
  limitations: string;
}

export interface AiFollowUpResponse {
  status: "ok";
  answer: string;
  provider: string;
  model: string;
}

export type AiPatternResponse =
  | {
      status: "ok";
      provider: string;
      model: string;
      observed: ObservedFacts;
      matchingEventIds: string[];
      ai: GroqStructuredResult;
      cached: boolean;
    }
  | {
      status: "fallback";
      provider: string;
      model: string;
      observed: ObservedFacts;
      matchingEventIds: string[];
      ai: null;
      message: string;
    };

export interface ApiErrorBody {
  error: { code: string; message: string; requestId: string };
}
