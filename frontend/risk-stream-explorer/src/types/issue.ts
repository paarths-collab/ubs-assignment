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
  | "LONG_EVENT_JOURNEY";

export interface TriggeredSignal {
  id: SignalId;
  label: string;
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
  rankScore: number;
}

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

export interface IssueDetailResponse {
  profile: IssueProfile;
  enterprise: EnterpriseBaseline;
  graphFilter: Record<string, string[]>;
  deterministicSummary: string;
}

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
