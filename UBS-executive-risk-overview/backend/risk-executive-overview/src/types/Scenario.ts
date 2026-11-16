import type { RecurrenceFacts } from "../services/RecurrenceService.js";
import type { DelayStats } from "../utils/statistics.js";
import type { ReasonCode } from "./Priority.js";
import type { TrendFacts } from "./Dossier.js";

export type SignalLevel = "normal" | "elevated" | "critical";

/**
 * One of the four analytical dimensions shown on a scenario card, replacing
 * the previous wall of reason chips. Each carries a plain-language verdict
 * plus the figures that verdict was derived from.
 */
export interface DimensionRating {
  dimension: "Severity" | "Exposure" | "Workflow" | "Recurrence";
  label: string;
  detail: string;
  level: SignalLevel;
}

/** A row in any of the drill-down breakdown tables (by organisation, owner, root cause…). */
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
  severity: {
    counts: Record<string, number>;
    highShare: number;
  };
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
  effort: {
    totalRemediationHours: number;
    averagePerEvent: number;
    maxPerEvent: number;
  };
  recurrence: RecurrenceFacts;
}

/**
 * One consolidated management item. All pattern records sharing the same
 * underlying scenario (issue / organisation+issue / owner+issue /
 * assignee+issue / cross-organisation) collapse into a single card here —
 * the per-pattern analytical records still exist in the backend and remain
 * reachable for drill-down via `contributingPatternIds`.
 */
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
  /** First half vs second half of the filtered window, for the Emerging Risk lens. Null when the window can't be split (e.g. a single-day filter). */
  trend: TrendFacts | null;
  eventIds: string[];
}
