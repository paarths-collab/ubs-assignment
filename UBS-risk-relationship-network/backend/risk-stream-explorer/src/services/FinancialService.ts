import type { StreamEvent } from "../types/Event";
import type { FinancialMetrics, MoneyMetric } from "../types/Metrics";
import { mean } from "../utils/dateUtils";

/**
 * Null-safe aggregation of one monetary field across a set of events. Events
 * with a null value for the field are excluded from `total`/`average` but
 * still counted in `totalEventCount`, so callers can always tell how many
 * observations a figure represents.
 */
export function aggregateMoney(events: StreamEvent[], selector: (e: StreamEvent) => number | null): MoneyMetric {
  const values: number[] = [];
  for (const event of events) {
    const value = selector(event);
    if (value !== null) values.push(value);
  }
  const total = values.reduce((a, b) => a + b, 0);
  return {
    total,
    populatedCount: values.length,
    totalEventCount: events.length,
    average: values.length > 0 ? mean(values) : null,
  };
}

/**
 * Recovery rate is only meaningful when gross amount is a positive, populated
 * figure for the same population recovery is measured against. We compute it
 * as sum(recovery) / sum(gross) over events where gross is positive and
 * populated — never dividing by zero, and never treating a missing gross
 * amount as zero.
 */
export function computeRecoveryRate(events: StreamEvent[]): number | null {
  let grossSum = 0;
  let recoverySum = 0;
  let contributingEvents = 0;

  for (const event of events) {
    if (event.grossAmount !== null && event.grossAmount > 0) {
      grossSum += event.grossAmount;
      recoverySum += event.recoveryAmount ?? 0;
      contributingEvents += 1;
    }
  }

  if (contributingEvents === 0 || grossSum <= 0) return null;
  return recoverySum / grossSum;
}

export function computeFinancialMetrics(events: StreamEvent[]): FinancialMetrics {
  return {
    grossAmount: aggregateMoney(events, (e) => e.grossAmount),
    netAmount: aggregateMoney(events, (e) => e.netAmount),
    recoveryAmount: aggregateMoney(events, (e) => e.recoveryAmount),
    potentialImpact: aggregateMoney(events, (e) => e.potentialImpact),
    recoveryRate: computeRecoveryRate(events),
  };
}
