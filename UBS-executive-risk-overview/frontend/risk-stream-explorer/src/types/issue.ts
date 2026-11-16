/**
 * DTOs for the issue-intelligence API (`GET /api/issues`,
 * `GET /api/issues/:issueId`, `POST /api/ai/issue/:issueId`). Mirrors
 * `backend/risk-stream-explorer/src/types/Issue.ts` field-for-field —
 * deliberately not imported from `@backend/index` for the same reason as
 * `types/pattern.ts`: Component 4's backend is a real HTTP server, so the
 * frontend only ever talks to it over `fetch()`.
 */
import type { EnterpriseBaseline } from "./pattern";

export type SignalId =
  | "HIGH_SEVERITY_CONCENTRATION"
  | "STRONG_ROOT_CAUSE_INTERACTION"
  | "POTENTIAL_IMPACT"
  | "NET_EXPOSURE_CONCENTRATION"
  | "OPEN_WORKLOAD"
  | "SLOW_DETECTION"
  | "SLOW_RECORDING"
  | "LONG_EVENT_JOURNEY"
  | "ORG_HIGH_RATE_VARIATION";

/** Dimensions on which an issue is NOT unusual — the case against investigating it. */
export type CounterSignalId =
  | "DETECTION_NEAR_BASELINE"
  | "RECORDING_NEAR_BASELINE"
  | "JOURNEY_NEAR_BASELINE"
  | "OPEN_RATE_NEAR_BASELINE"
  | "NO_MATERIAL_TREND"
  | "NO_STRONG_ROOT_CAUSE_INTERACTION"
  | "SEVERITY_AT_OR_BELOW_BASELINE";

export type SignalTier = "primary" | "secondary";

export interface CounterSignal {
  id: CounterSignalId;
  label: string;
  detail: string;
}

export interface TriggeredSignal {
  id: SignalId;
  label: string;
  detail: string;
  weight: number;
  tier: SignalTier;
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
  meets_support_threshold: boolean;
}

export interface OrganisationBreakdownEntry {
  organisation: string;
  event_count: number;
  high_count: number;
  high_rate_pct: number;
  small_sample: boolean;
}

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
  note: string;
}

export interface RelatedPatternRef {
  pattern_id: string;
  title: string;
  priority_level: string;
  high_rate_lift: number;
}

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
  counterSignals: CounterSignal[];
  rankScore: number;
}

export interface IssueSummary {
  issue: string;
  slug: string;
  rank: number;
  rankScore: number;
  triggeredSignals: TriggeredSignal[];
  counterSignals: CounterSignal[];
  /** Deterministic sentence naming why this issue was selected — cards lead with this, not raw metrics. */
  whyItSurfaced: string;
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

export interface IssueDetailResponse {
  profile: IssueProfile;
  enterprise: EnterpriseBaseline;
  graphFilter: Record<string, string[]>;
  deterministicSummary: string;
}

/**
 * Synthesis, not summary: the model argues the case and against it. Every
 * field is prose — numbers, Event IDs, organisations and severities are
 * merged server-side from the deterministic profile, never taken from here.
 */
export interface LlmIssueStructuredResult {
  strongestFinding: string;
  whyItMayMatter: string;
  supportingEvidence: string;
  weakeningEvidence: string;
  investigationHypothesis: string;
  whatWouldDisproveThis: string;
  investigationQuestions: string[];
  suggestedControl: string;
  limitations: string;
}

/** @deprecated Provider-neutral name is `LlmIssueStructuredResult`. */
export type GroqIssueStructuredResult = LlmIssueStructuredResult;

export type AiIssueResponse =
  | {
      status: "ok";
      provider: string;
      model: string;
      matchingEventIds: string[];
      ai: GroqIssueStructuredResult;
      cached: boolean;
    }
  | {
      status: "fallback";
      provider: string;
      model: string;
      matchingEventIds: string[];
      ai: null;
      message: string;
  };

export interface IssueFollowUpResponse {
  status: "ok";
  answer: string;
  provider: string;
  model: string;
}
