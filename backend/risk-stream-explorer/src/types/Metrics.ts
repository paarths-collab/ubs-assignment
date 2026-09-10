import type { EventType, Severity } from "./Event.js";

/**
 * Null-safe aggregate for a monetary field. `total` sums only the events that
 * actually carry a value for this field; `populatedCount` records how many of
 * `totalEventCount` events contributed. A missing value is never coerced to 0 —
 * callers must consult `populatedCount` before treating `total` as complete.
 */
export interface MoneyMetric {
  total: number;
  populatedCount: number;
  totalEventCount: number;
  average: number | null;
}

export function emptyMoneyMetric(totalEventCount: number): MoneyMetric {
  return { total: 0, populatedCount: 0, totalEventCount, average: null };
}

/** A count paired with its share of the containing population (0..1), or null if the population is empty. */
export interface CountShare {
  count: number;
  share: number | null;
}

export interface CategoryBreakdown {
  key: string;
  count: number;
  share: number | null;
}

/** A single directional comparison between a current and previous value. */
export interface Delta {
  current: number | null;
  previous: number | null;
  absoluteChange: number | null;
  percentChange: number | null;
  isNew: boolean;
}

/** A percentage-point comparison, used for shares (e.g. severity share movement). */
export interface ShareDelta {
  currentShare: number | null;
  previousShare: number | null;
  deltaPercentagePoints: number | null;
}

export interface DelayMetrics {
  averageDetectionDelayDays: number | null;
  medianDetectionDelayDays: number | null;
  averageRecordingDelayDays: number | null;
  medianRecordingDelayDays: number | null;
  averageOccurrenceToRecordDays: number | null;
  medianOccurrenceToRecordDays: number | null;
  populatedCount: number;
  totalEventCount: number;
}

export interface FinancialMetrics {
  grossAmount: MoneyMetric;
  netAmount: MoneyMetric;
  recoveryAmount: MoneyMetric;
  potentialImpact: MoneyMetric;
  recoveryRate: number | null;
}

/**
 * The full set of calculated facts for one time bucket (or arbitrary filtered
 * period). This is the single object that period summaries, tooltips, and AI
 * narration all read from — nothing downstream recomputes these numbers.
 */
export interface PeriodMetrics {
  periodId: string;
  label: string;
  startDate: string;
  endDate: string;

  eventCount: number;

  severityCounts: Record<Severity, number>;
  severityShares: Record<Severity, number | null>;

  eventTypeCounts: Record<EventType, number>;
  eventTypeShares: Record<EventType, number | null>;

  riskThemeBreakdown: CategoryBreakdown[];
  organisationBreakdown: CategoryBreakdown[];
  rootCauseBreakdown: CategoryBreakdown[];
  issueDetailBreakdown: CategoryBreakdown[];

  financial: FinancialMetrics;
  delays: DelayMetrics;
}

export interface PeriodComparison {
  current: PeriodMetrics;
  previous: PeriodMetrics | null;

  eventCountDelta: Delta;
  severityShareDeltas: Record<Severity, ShareDelta>;
  eventTypeShareDeltas: Record<EventType, ShareDelta>;
  netAmountDelta: Delta;
  potentialImpactDelta: Delta;
  recoveryAmountDelta: Delta;
  avgOccurrenceToRecordDelta: Delta;
}

export type TrendMetricCategory =
  | "severity_share"
  | "risk_theme_share"
  | "organisation_share"
  | "root_cause_share"
  | "net_amount"
  | "potential_impact"
  | "recording_delay";

export interface TrendFact {
  metric: TrendMetricCategory;
  category: string;
  previous: number | null;
  current: number | null;
  deltaPercentagePoints: number | null;
  absoluteChange: number | null;
  direction: "increase" | "decrease" | "new" | "flat";
}
