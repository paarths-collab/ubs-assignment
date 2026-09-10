import type { RiskEvent } from "../types/RiskEvent.js";
import type { RiskConfig } from "../types/Config.js";
import type { KpiSet, KpiValue, Distributions } from "../types/Kpi.js";
import type { NormalizedFilters } from "../schemas/filters.schema.js";
import { countWhere, groupCounts, hasAnyValid, sumValid } from "../utils/aggregation.js";

const events = (value: number): KpiValue => ({ value, applicable: true, unit: "events" });
const usd = (value: number): KpiValue => ({ value, applicable: true, unit: "USD" });
const notApplicable = (unit: KpiValue["unit"]): KpiValue => ({ value: null, applicable: false, unit });

/**
 * Deterministic KPI calculations over an already-filtered event population.
 * Every value here must come from the same `filteredEvents` array the
 * caller used for everything else in the response — no independent
 * re-filtering, no re-derivation from raw fields the preprocessing pipeline
 * already resolved (e.g. remediationHours, not remediationHoursFromImpactsField).
 */
export function calculateKPIs(
  filteredEvents: readonly RiskEvent[],
  config: RiskConfig,
  filters: NormalizedFilters,
): KpiSet {
  const excludedStatuses = new Set(config.businessRules.openBacklog.excludedStatuses);
  const financialEvents = filteredEvents.filter((event) => event.eventType === "Financial");

  /*
   * Realised-money KPIs are applicable only when the selection can actually
   * contain them: a Non-Financial selection structurally cannot, and a
   * selection holding no Financial event has nothing to report either.
   * Reporting "$0" in those cases reads as "we looked and there was no loss"
   * rather than "this metric does not apply" — and would contradict the
   * Exposure & Impact section, which derives the same figures from
   * computeFinancialFacts.
   */
  const financialKpisApplicable = filters.eventType !== "Non-Financial" && financialEvents.length > 0;
  const potentialImpactValues = filteredEvents.map((event) => event.potentialImpactUsd);

  return {
    totalEvents: events(filteredEvents.length),
    highSeverityEvents: events(countWhere(filteredEvents, (event) => event.severity === "High")),
    openBacklog: events(countWhere(filteredEvents, (event) => !excludedStatuses.has(event.status))),

    grossExposure: financialKpisApplicable
      ? usd(sumValid(financialEvents.map((event) => event.grossAmountUsd)))
      : notApplicable("USD"),

    netExposure: financialKpisApplicable
      ? usd(sumValid(financialEvents.map((event) => event.netAmountUsd)))
      : notApplicable("USD"),

    recoveryRate: financialKpisApplicable ? calculateRecoveryRate(financialEvents) : notApplicable("ratio"),

    potentialImpact: hasAnyValid(potentialImpactValues)
      ? usd(sumValid(potentialImpactValues))
      : notApplicable("USD"),

    remediationHours: {
      value: sumValid(filteredEvents.map((event) => event.remediationHours)),
      applicable: true,
      unit: "hours",
    },
  };
}

/** sum(recoveryAmountUsd) / sum(grossAmountUsd) over Financial events only; null when gross is zero. */
export function calculateRecoveryRate(financialEvents: RiskEvent[]): KpiValue {
  const grossSum = sumValid(financialEvents.map((event) => event.grossAmountUsd));
  if (grossSum === 0) {
    return { value: null, applicable: false, unit: "ratio" };
  }
  const recoverySum = sumValid(financialEvents.map((event) => event.recoveryAmountUsd));
  return { value: recoverySum / grossSum, applicable: true, unit: "ratio" };
}

export function calculateDistributions(filteredEvents: RiskEvent[]): Distributions {
  return {
    severity: groupCounts(filteredEvents, (event) => event.severity),
    status: groupCounts(filteredEvents, (event) => event.status),
    eventType: groupCounts(filteredEvents, (event) => event.eventType),
  };
}

export type KpiDeltaDirection = "up" | "down" | "flat";

export interface KpiDelta {
  deltaValue: number;
  deltaPct: number | null;
  direction: KpiDeltaDirection;
}

export type KpiDeltas = Partial<Record<keyof KpiSet, KpiDelta>>;

/**
 * Period-over-period movement for the headline KPIs. There is no data
 * before the dataset's own start date (2024-09-01), so a true "previous
 * calendar period" comparison is undefined whenever the full range is
 * selected — the only comparison this dataset can actually support is the
 * earlier half of the manager's own filtered window against the more
 * recent half, which is what this computes. A KPI is omitted (not zeroed)
 * when either half can't produce it — e.g. Gross/Net on a slice with no
 * Financial events in one half.
 */
export function computeKpiDeltas(
  filteredEvents: readonly RiskEvent[],
  config: RiskConfig,
  filters: NormalizedFilters,
): KpiDeltas | null {
  const fromTime = Date.parse(filters.dateFrom);
  const toTime = Date.parse(filters.dateTo);
  if (Number.isNaN(fromTime) || Number.isNaN(toTime) || toTime <= fromTime) return null;

  const midpoint = new Date((fromTime + toTime) / 2).toISOString().slice(0, 10);
  const earlierHalf = filteredEvents.filter((event) => event.occurrenceDate < midpoint);
  const recentHalf = filteredEvents.filter((event) => event.occurrenceDate >= midpoint);
  if (earlierHalf.length === 0 || recentHalf.length === 0) return null;

  const earlierKpis = calculateKPIs(earlierHalf, config, filters);
  const recentKpis = calculateKPIs(recentHalf, config, filters);

  const deltas: KpiDeltas = {};
  for (const key of Object.keys(earlierKpis) as Array<keyof KpiSet>) {
    const before = earlierKpis[key];
    const after = recentKpis[key];
    if (!before.applicable || !after.applicable || before.value == null || after.value == null) continue;

    const deltaValue = after.value - before.value;
    const deltaPct = before.value === 0 ? null : deltaValue / before.value;
    const direction: KpiDeltaDirection = Math.abs(deltaValue) < 1e-9 ? "flat" : deltaValue > 0 ? "up" : "down";

    deltas[key] = { deltaValue, deltaPct, direction };
  }

  return deltas;
}
