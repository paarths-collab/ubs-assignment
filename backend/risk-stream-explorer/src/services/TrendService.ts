import type { CategoryBreakdown, PeriodMetrics, TrendFact, TrendMetricCategory } from "../types/Metrics.js";
import { SEVERITY_VALUES } from "../config/constants.js";

function directionOf(deltaPercentagePoints: number | null, isNewCategory: boolean): TrendFact["direction"] {
  if (isNewCategory) return "new";
  if (deltaPercentagePoints === null) return "flat";
  if (deltaPercentagePoints > 0.01) return "increase";
  if (deltaPercentagePoints < -0.01) return "decrease";
  return "flat";
}

function breakdownShareFacts(
  metric: TrendMetricCategory,
  current: CategoryBreakdown[],
  previous: CategoryBreakdown[],
): TrendFact[] {
  const previousByKey = new Map(previous.map((b) => [b.key, b]));
  const currentByKey = new Map(current.map((b) => [b.key, b]));
  const allKeys = new Set([...currentByKey.keys(), ...previousByKey.keys()]);

  const facts: TrendFact[] = [];
  for (const key of allKeys) {
    const currentShare = currentByKey.get(key)?.share ?? null;
    const previousShare = previousByKey.get(key)?.share ?? null;
    const isNewCategory = previousShare === null && currentShare !== null;
    const deltaPercentagePoints =
      currentShare !== null && previousShare !== null ? (currentShare - previousShare) * 100 : null;

    facts.push({
      metric,
      category: key,
      previous: previousShare,
      current: currentShare,
      deltaPercentagePoints,
      absoluteChange: null,
      direction: directionOf(deltaPercentagePoints, isNewCategory),
    });
  }
  return facts;
}

function severityShareFacts(current: PeriodMetrics, previous: PeriodMetrics | null): TrendFact[] {
  return SEVERITY_VALUES.map((severity) => {
    const currentShare = current.severityShares[severity];
    const previousShare = previous?.severityShares[severity] ?? null;
    const deltaPercentagePoints =
      currentShare !== null && previousShare !== null ? (currentShare - previousShare) * 100 : null;
    return {
      metric: "severity_share" as const,
      category: severity,
      previous: previousShare,
      current: currentShare,
      deltaPercentagePoints,
      absoluteChange: null,
      direction: directionOf(deltaPercentagePoints, previousShare === null && currentShare !== null),
    };
  });
}

function moneyFact(
  metric: TrendMetricCategory,
  category: string,
  currentTotal: number | null,
  previousTotal: number | null,
): TrendFact {
  const isNewCategory = previousTotal === null && currentTotal !== null;
  const absoluteChange =
    currentTotal !== null && previousTotal !== null ? currentTotal - previousTotal : null;
  return {
    metric,
    category,
    previous: previousTotal,
    current: currentTotal,
    deltaPercentagePoints: null,
    absoluteChange,
    direction:
      absoluteChange === null
        ? isNewCategory
          ? "new"
          : "flat"
        : absoluteChange > 0
          ? "increase"
          : absoluteChange < 0
            ? "decrease"
            : "flat",
  };
}

/**
 * Extracts every candidate "what changed" fact between two periods, ranked by
 * magnitude. The largest few facts here are the ones surfaced as drivers in
 * period-level AI narration — every number traces directly back to
 * PeriodMetrics, nothing here is invented.
 */
export function detectTrendFacts(current: PeriodMetrics, previous: PeriodMetrics | null): TrendFact[] {
  const facts: TrendFact[] = [
    ...severityShareFacts(current, previous),
    ...breakdownShareFacts("risk_theme_share", current.riskThemeBreakdown, previous?.riskThemeBreakdown ?? []),
    ...breakdownShareFacts(
      "organisation_share",
      current.organisationBreakdown,
      previous?.organisationBreakdown ?? [],
    ),
    ...breakdownShareFacts("root_cause_share", current.rootCauseBreakdown, previous?.rootCauseBreakdown ?? []),
    moneyFact(
      "net_amount",
      "Net Amount",
      current.financial.netAmount.populatedCount > 0 ? current.financial.netAmount.total : null,
      previous && previous.financial.netAmount.populatedCount > 0 ? previous.financial.netAmount.total : null,
    ),
    moneyFact(
      "potential_impact",
      "Potential Impact",
      current.financial.potentialImpact.populatedCount > 0 ? current.financial.potentialImpact.total : null,
      previous && previous.financial.potentialImpact.populatedCount > 0
        ? previous.financial.potentialImpact.total
        : null,
    ),
    moneyFact(
      "recording_delay",
      "Average Recording Delay",
      current.delays.averageRecordingDelayDays,
      previous?.delays.averageRecordingDelayDays ?? null,
    ),
  ];

  return facts;
}

/** Ranks trend facts by the magnitude of their movement, largest first. */
export function rankTrendFacts(facts: TrendFact[], limit = 5): TrendFact[] {
  const magnitude = (f: TrendFact): number => {
    if (f.deltaPercentagePoints !== null) return Math.abs(f.deltaPercentagePoints);
    if (f.absoluteChange !== null) return Math.abs(f.absoluteChange);
    return f.direction === "new" ? 0.01 : 0;
  };
  return [...facts].sort((a, b) => magnitude(b) - magnitude(a)).slice(0, limit);
}
