// Hand-written mirror of the backend's wire types (backend/risk-executive-overview/src/types/*).
// Kept separate rather than imported across the network boundary — this is a
// real client/server split, not a bundled single-file app.

export type EventTypeFilter = "All" | "Financial" | "Non-Financial";
export type SeverityFilter = "All" | "Low" | "Moderate" | "High";

export interface FilterInput {
  organisation: string;
  dateFrom?: string | null;
  dateTo?: string | null;
  eventType: EventTypeFilter;
  severity: SeverityFilter;
}

export interface NormalizedFilters {
  organisation: string;
  dateFrom: string;
  dateTo: string;
  eventType: EventTypeFilter;
  severity: SeverityFilter;
}

export interface Metadata {
  recordCount: number;
  dateRange: { min: string; max: string };
  organisations: string[];
  eventTypes: string[];
  severities: string[];
  statuses: string[];
  stages: string[];
  rootCauses: string[];
  riskThemes: string[];
  orCategories: string[];
}

export type KpiUnit = "events" | "USD" | "ratio" | "hours";

export interface KpiValue {
  value: number | null;
  applicable: boolean;
  unit: KpiUnit;
}

export interface KpiSet {
  totalEvents: KpiValue;
  highSeverityEvents: KpiValue;
  openBacklog: KpiValue;
  grossExposure: KpiValue;
  netExposure: KpiValue;
  recoveryRate: KpiValue;
  potentialImpact: KpiValue;
  remediationHours: KpiValue;
}

export interface Distributions {
  severity: Record<string, number>;
  status: Record<string, number>;
  eventType: Record<string, number>;
}

export interface CompositionBlock {
  severity: Record<string, number>;
  eventType: Record<string, number>;
  workflow: { open: number; closed: number; cancelled: number; highStillOpen: number };
  organisations: BreakdownRow[];
}

export interface ExposureBlock {
  realised: {
    grossAmountUsd: number | null;
    recoveryAmountUsd: number | null;
    netAmountUsd: number | null;
    recoveryRate: number | null;
  };
  potential: {
    totalUsd: number | null;
    fromFinancialUsd: number | null;
    fromNonFinancialUsd: number | null;
  };
  operational: { totalRemediationHours: number; averagePerEvent: number; maxPerEvent: number };
}

export type KpiDeltaDirection = "up" | "down" | "flat";

export interface KpiDelta {
  deltaValue: number;
  deltaPct: number | null;
  direction: KpiDeltaDirection;
}

/** Earlier half vs more recent half of the filtered date range — the only period comparison this dataset supports, since it has no data before 2024-09-01. Absent (or a missing key) when a KPI cannot be compared for that half. */
export type KpiDeltas = Partial<Record<keyof KpiSet, KpiDelta>>;

export interface OverviewResponse {
  filters: NormalizedFilters;
  eventCount: number;
  datasetEventCount: number;
  kpis: KpiSet;
  kpiTrend: KpiDeltas | null;
  distributions: Distributions;
  composition: CompositionBlock;
  exposure: ExposureBlock;
}

export type PatternType = "issue" | "organisation_issue" | "owner_issue" | "assignee_issue" | "cross_organisation_issue";

export type ReasonCode =
  | "HIGH_SEVERITY_PRESENT"
  | "MULTIPLE_HIGH_EVENTS"
  | "HIGH_OPEN_BACKLOG"
  | "HIGH_NET_EXPOSURE"
  | "HIGH_POTENTIAL_IMPACT"
  | "CROSS_OWNER_RECURRENCE"
  | "CROSS_ASSIGNEE_RECURRENCE"
  | "CROSS_ORGANISATION_RECURRENCE"
  | "CONCENTRATED_EXPOSURE"
  | "HIGH_REMEDIATION_EFFORT";

export type PriorityTier = "enterprise" | "organisation" | "workflow";

export interface PriorityScope {
  issueDetail: string | null;
  ownerOrganisation: string | null;
  ownerName: string | null;
  currentAssignee: string | null;
}

export interface PrioritySignal {
  patternId: string;
  patternType: PatternType;
  tier: PriorityTier;
  label: string;
  scope: PriorityScope;

  eventCount: number;
  highSeverityCount: number;
  openEventCount: number;
  severityCounts: Record<string, number>;

  grossAmountUsd: number | null;
  recoveryAmountUsd: number | null;
  netAmountUsd: number | null;
  recoveryRate: number | null;
  potentialImpactUsd: number | null;
  remediationHours: number;

  organisationCount: number;
  ownerCount: number;
  assigneeCount: number;
  organisations: string[];
  ownerNames: string[];
  assigneeNames: string[];

  rootCauses: string[];
  firstOccurrence: string;
  lastOccurrence: string;

  shareOfFilteredEvents: number;
  shareOfFilteredNetExposure: number | null;
  shareOfFilteredPotentialImpact: number | null;

  reasonCodes: ReasonCode[];
  eventIds: string[];
}

export type SignalLevel = "normal" | "elevated" | "critical";

export interface DimensionRating {
  dimension: "Severity" | "Exposure" | "Workflow" | "Recurrence";
  label: string;
  detail: string;
  level: SignalLevel;
}

export interface BreakdownRow {
  key: string;
  eventCount: number;
  highSeverityCount: number;
  openEventCount: number;
  netAmountUsd: number | null;
  potentialImpactUsd: number | null;
}

export interface ScenarioAnalytics {
  volume: {
    eventCount: number;
    shareOfFilteredEvents: number;
    financialCount: number;
    nonFinancialCount: number;
    firstOccurrence: string;
    lastOccurrence: string;
  };
  severity: { counts: Record<string, number>; highShare: number };
  workflow: {
    statusCounts: Record<string, number>;
    stageCounts: Record<string, number>;
    openEventCount: number;
    closedEventCount: number;
    openShare: number;
  };
  exposure: {
    grossAmountUsd: number | null;
    recoveryAmountUsd: number | null;
    netAmountUsd: number | null;
    potentialImpactUsd: number | null;
    recoveryRate: number | null;
  };
  concentration: {
    shareOfFilteredEvents: number;
    shareOfFilteredNetExposure: number | null;
    shareOfFilteredPotentialImpact: number | null;
    shareOfFilteredHighSeverity: number | null;
  };
  organisations: BreakdownRow[];
  owners: BreakdownRow[];
  assignees: BreakdownRow[];
  rootCauses: BreakdownRow[];
  riskThemes: Record<string, number>;
  orCategories: Record<string, number>;
  timeliness: {
    detectionDelayDays: DelayStats | null;
    recordingDelayDays: DelayStats | null;
    occurrenceToRecordDays: DelayStats | null;
  };
  effort: { totalRemediationHours: number; averagePerEvent: number; maxPerEvent: number };
  recurrence: RecurrenceFacts;
}

export interface ScenarioSignal {
  scenarioId: string;
  patternId: string | null;
  contributingPatternIds: string[];

  title: string;
  issueDetail: string;
  contextLine: string;

  eventCount: number;
  highSeverityCount: number;
  openEventCount: number;
  netAmountUsd: number | null;
  potentialImpactUsd: number | null;

  level: SignalLevel;
  whyAttention: string;
  dimensions: DimensionRating[];
  reasonCodes: ReasonCode[];

  analytics: ScenarioAnalytics;
  trend: TrendFacts | null;
  eventIds: string[];
}

/** Earlier half vs more recent half of the filtered window — same convention as KpiDeltas, applied per scenario. */
export interface TrendFacts {
  firstPeriod: { from: string; to: string; eventCount: number; highSeverityCount: number; openEventCount: number };
  secondPeriod: { from: string; to: string; eventCount: number; highSeverityCount: number; openEventCount: number };
  eventCountChange: number;
  eventCountChangePct: number | null;
  highSeverityChange: number;
  direction: "increasing" | "decreasing" | "stable";
}

export type AttentionLens = "urgency" | "exposure" | "recurrence" | "emerging";

export interface AttentionCard {
  lens: AttentionLens;
  scenarioId: string;
  title: string;
  headline: string;
  reason: string;
}

export interface PriorityResponse {
  filters: NormalizedFilters;
  items: ScenarioSignal[];
  attention: AttentionCard[];
  totalCandidates: number;
}

export type RiskDetailSelection =
  | { type: "pattern"; patternId: string }
  | { type: "kpi"; kpiId: string }
  | { type: "issue"; issueDetail: string }
  | { type: "period"; dateFrom: string; dateTo: string }
  | { type: "eventIds"; eventIds: string[] };

export interface RecurrenceFacts {
  ownerCount: number;
  ownerNames: string[];
  assigneeCount: number;
  assigneeNames: string[];
  organisationCount: number;
  organisations: string[];
  distinctIssueCount: number;
  recurrenceCase: "same_person_same_issue" | "multiple_people_same_issue_same_organisation" | "same_issue_multiple_organisations" | "none";
  interpretation: string;
}

export interface FinancialFacts {
  grossAmountUsd: number | null;
  netAmountUsd: number | null;
  recoveryAmountUsd: number | null;
  recoveryRate: number | null;
  potentialImpactUsd: number | null;
}

export interface DelayStats {
  min: number;
  max: number;
  mean: number;
  median: number;
}

export interface IssueSummary {
  issueDetail: string;
  eventCount: number;
}

export interface RiskDetailResponse {
  selection: RiskDetailSelection;
  summary: { eventCount: number };
  severity: Record<string, number>;
  ownership: {
    organisationCount: number;
    organisations: string[];
    ownerCount: number;
    owners: string[];
    assigneeCount: number;
    assignees: string[];
  };
  recurrence: RecurrenceFacts;
  financial: FinancialFacts;
  operationalImpact: { remediationHours: number; potentialImpactUsd: number | null };
  workflow: {
    statusCounts: Record<string, number>;
    stageCounts: Record<string, number>;
    openEventCount: number;
    closedEventCount: number;
  };
  timeliness: {
    detectionDelayDays: DelayStats | null;
    recordingDelayDays: DelayStats | null;
    occurrenceToRecordDays: DelayStats | null;
  };
  issues: IssueSummary[];
  evidence: { eventIds: string[]; patternId: string | null };
}

export interface RiskDetailApiResponse {
  filters: NormalizedFilters;
  detail: RiskDetailResponse;
}

export interface ManagerInsightResponse {
  whatHappened: string;
  whyItMatters: string;
  whereItSits: string;
  managementQuestion: string;
  suggestedAction: string;
  evidence: { eventIds: string[]; patternId: string | null };
}

export type ManagerInsightApiResponse =
  | { available: true; insight: ManagerInsightResponse }
  | { available: false; reason: string };

export type ActionType = "OPEN_INVESTIGATION" | "ASSIGN_REVIEW" | "ESCALATE";

export interface ActionApiResponse {
  action: {
    actionId: string;
    actionType: ActionType;
    patternId?: string | null;
    eventIds: string[];
    note?: string;
    createdAt: string;
    status: "SIMULATED";
  };
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}
