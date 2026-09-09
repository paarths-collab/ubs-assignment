import type { RiskEvent } from "../types/RiskEvent";
import type { RiskConfig } from "../types/Config";
import type { KpiSet, KpiValue, Distributions } from "../types/Kpi";
import type { NormalizedFilters } from "../schemas/filters.schema";
import { countWhere, groupCounts, hasAnyValid, sumValid } from "../utils/aggregation";

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
export function calculateKPIs(filteredEvents: RiskEvent[], config: RiskConfig, filters: NormalizedFilters): KpiSet {
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
