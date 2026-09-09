import type { RiskEvent } from "../types/RiskEvent";
import type { BreakdownRow } from "../types/Scenario";
import { computeFinancialFacts } from "./FinancialFacts";
import { countWhere } from "../utils/aggregation";

/**
 * Groups a slice of events by any key and reports the same six figures for
 * each group. Shared by the scenario drill-downs and the enterprise-level
 * "where is risk concentrated" table so a given organisation reads
 * identically wherever it appears.
 */
export function buildBreakdown(
  events: readonly RiskEvent[],
  keyOf: (event: RiskEvent) => string,
  excludedStatuses: ReadonlySet<string>,
): BreakdownRow[] {
  const grouped = new Map<string, RiskEvent[]>();
  for (const event of events) {
    const key = keyOf(event);
    const bucket = grouped.get(key);
    if (bucket) bucket.push(event);
    else grouped.set(key, [event]);
  }

  return [...grouped.entries()]
    .map(([key, groupEvents]) => {
      const financial = computeFinancialFacts(groupEvents);
      return {
        key,
        eventCount: groupEvents.length,
        highSeverityCount: countWhere(groupEvents, (event) => event.severity === "High"),
        openEventCount: countWhere(groupEvents, (event) => !excludedStatuses.has(event.status)),
        netAmountUsd: financial.netAmountUsd,
        potentialImpactUsd: financial.potentialImpactUsd,
      };
    })
    .sort(
      (a, b) =>
        b.eventCount - a.eventCount || b.highSeverityCount - a.highSeverityCount || a.key.localeCompare(b.key),
    );
}
