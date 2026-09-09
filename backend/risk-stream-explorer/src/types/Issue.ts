import type { EnterpriseBaseline } from "./RiskEvent";

/**
 * Types for the issue-intelligence layer (Component 4's issue-centric entry
 * point). Every number here is computed once at startup by
 * `IssueIntelligenceService` directly from `risk_events_final.json` — this
 * layer does not read any AI output, and Groq is only ever handed the
 * trimmed `IssueEvidencePayload` subset to interpret.
 */

export type SignalId =
  | "HIGH_SEVERITY_CONCENTRATION"
  | "STRONG_ROOT_CAUSE_INTERACTION"
  | "POTENTIAL_IMPACT"
  | "NET_EXPOSURE_CONCENTRATION"
  | "OPEN_WORKLOAD"
  | "SLOW_DETECTION"
  | "SLOW_RECORDING"
  | "LONG_EVENT_JOURNEY";

/** One named, individually-displayable contributor to an issue's rank score. */
export interface TriggeredSignal {
  id: SignalId;
  label: string;
  /** Human-readable sentence citing the actual numbers behind this signal. */
  detail: string;
  weight: number;
}

export interface IssueSeveritySummary {
  event_count: number;
  severity: Record<string, number>;
  high_count: number;
  high_rate_pct: number;
  enterprise_high_rate_pct: number;
  high_rate_lift: number;
}

export interface IssueOpenWorkload {
  open_events: number;
  open_rate_pct: number;
  enterprise_open_rate_pct: number;
}

/** Null-safe money aggregate: `populated_count` of `event_count` events actually carried a value; the rest (Non-Financial events with no figure) are excluded from the total, never coerced to 0. */
export interface MoneyAggregate {
  total: number | null;
  populated_count: number;
  event_count: number;
}

export interface IssueFinancials {
  gross_amount: MoneyAggregate;
  net_amount: MoneyAggregate;
  recovery_amount: MoneyAggregate;
  potential_impact: MoneyAggregate;
}

export interface NetExposureConcentration {
  top_n: number;
  top_event_ids: string[];
  top_share_pct: number | null;
  total_net_amount: number | null;
  populated_count: number;
}

export interface RootCauseBreakdownEntry {
  root_cause: string;
  event_count: number;
  high_count: number;
  high_rate_pct: number;
  high_rate_lift: number;
  /** True once event_count clears ROOT_CAUSE_COMBO_MIN_SUPPORT — below that, high_rate_lift is not treated as meaningful. */
  meets_support_threshold: boolean;
}

export interface OrganisationBreakdownEntry {
  organisation: string;
  event_count: number;
  high_count: number;
  high_rate_pct: number;
  /** True when high_count is below the small-sample threshold — the UI must show a caveat rather than presenting the rate as robust. */
  small_sample: boolean;
}

/** Framed as workflow concentration (how handling clusters), never as blame on a named individual. */
export interface WorkflowConcentrationEntry {
  name: string;
  event_count: number;
  share_pct: number;
}

export interface TimelinessMetric {
  mean_days: number | null;
  median_days: number | null;
  enterprise_mean_days: number;
  delta_days: number | null;
}

export interface IssueTimeliness {
  detection_delay: TimelinessMetric;
  recording_delay: TimelinessMetric;
  occurrence_to_record: TimelinessMetric;
}

export interface TrendWindow {
  start_month: string;
  end_month: string;
  event_count: number;
}

export interface IssueTrend {
  recent: TrendWindow;
  prior: TrendWindow;
  percent_change: number | null;
  material_change: boolean;
  /** Always populated, including the "no material change" case — never left for the UI to infer. */
  note: string;
}

export interface RelatedPatternRef {
  pattern_id: string;
  title: string;
  priority_level: string;
  high_rate_lift: number;
}

/** Full deterministic analysis for one issue. */
export interface IssueProfile {
  issue: string;
  slug: string;
  severity: IssueSeveritySummary;
  openWorkload: IssueOpenWorkload;
  financials: IssueFinancials;
  netExposureConcentration: NetExposureConcentration;
  rootCauseBreakdown: RootCauseBreakdownEntry[];
  strongestRootCauseCombination: RootCauseBreakdownEntry | null;
  organisationBreakdown: OrganisationBreakdownEntry[];
  ownerConcentration: WorkflowConcentrationEntry[];
  assigneeConcentration: WorkflowConcentrationEntry[];
  timeliness: IssueTimeliness;
  trend: IssueTrend;
  matchingEventIds: string[];
  relatedPatterns: RelatedPatternRef[];
  triggeredSignals: TriggeredSignal[];
  /** Transparent sum of triggered signals' documented weights — used only for ordering, never shown as an opaque score without its constituent signals alongside it. */
  rankScore: number;
}

/** One row of `GET /api/issues` — the "Issues Requiring Attention" list. */
export interface IssueSummary {
  issue: string;
  slug: string;
  rank: number;
  rankScore: number;
  triggeredSignals: TriggeredSignal[];
  headline: {
    event_count: number;
    high_rate_pct: number;
    high_rate_lift: number;
    potential_impact: number | null;
    open_events: number;
    open_rate_pct: number;
    strongestRootCauseCombination: RootCauseBreakdownEntry | null;
  };
}

export interface IssuesListResponse {
  issues: IssueSummary[];
  count: number;
  totalIssues: number;
}

/** Response body of `GET /api/issues/:issueId`. */
export interface IssueDetailResponse {
  profile: IssueProfile;
  enterprise: EnterpriseBaseline;
  graphFilter: Record<string, string[]>;
  deterministicSummary: string;
}

/** The trimmed, already-verified subset of an issue's profile handed to Groq — mirrors `GroqFactPayload` for patterns. */
export interface IssueEvidencePayload {
  issue: string;
  triggered_signals: Array<{ id: SignalId; label: string; detail: string }>;
  severity: IssueSeveritySummary;
  openWorkload: IssueOpenWorkload;
  financials: IssueFinancials;
  netExposureConcentration: NetExposureConcentration;
  rootCauseBreakdown: RootCauseBreakdownEntry[];
  strongestRootCauseCombination: RootCauseBreakdownEntry | null;
  organisationBreakdown: OrganisationBreakdownEntry[];
  ownerConcentration: WorkflowConcentrationEntry[];
  assigneeConcentration: WorkflowConcentrationEntry[];
  timeliness: IssueTimeliness;
  trend: IssueTrend;
  matching_event_ids: string[];
  related_patterns: RelatedPatternRef[];
}

/** The five fields Groq is allowed to produce for an issue interpretation — everything else in the AI route response comes from already-verified deterministic facts. */
export interface GroqIssueStructuredResult {
  interpretation: string;
  whyItMayMatter: string;
  investigationQuestions: string[];
  suggestedControl: string;
  limitations: string;
}

export type AiIssueResponse =
  | {
      status: "ok";
      matchingEventIds: string[];
      ai: GroqIssueStructuredResult;
      cached: boolean;
    }
  | {
      status: "fallback";
      matchingEventIds: string[];
      ai: null;
      message: string;
    };
