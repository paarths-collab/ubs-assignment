import type { EventType, Severity } from "../types/Event.js";
import type { Delta, PeriodComparison, PeriodMetrics, ShareDelta } from "../types/Metrics.js";
import { EVENT_TYPE_VALUES, SEVERITY_VALUES } from "../config/constants.js";

/**
 * Computes a directional delta between a current and previous value.
 *
 * `previous === null` means no prior period exists at all (e.g. the dataset's
 * first bucket) — reported as "new", never as a percentage. `previous === 0`
 * with a positive current value is also reported as "new" rather than an
 * undefined/infinite percentage, per product decision (never show "+Infinity%").
 */
export function computeDelta(current: number | null, previous: number | null): Delta {
  if (current === null) {
    return { current: null, previous, absoluteChange: null, percentChange: null, isNew: false };
  }
  if (previous === null) {
    return { current, previous: null, absoluteChange: null, percentChange: null, isNew: true };
  }
  const absoluteChange = current - previous;
  if (previous === 0) {
    return {
      current,
      previous,
      absoluteChange,
      percentChange: null,
      isNew: current > 0,
    };
  }
  return {
    current,
    previous,
    absoluteChange,
    percentChange: absoluteChange / previous,
    isNew: false,
  };
}

export function computeShareDelta(currentShare: number | null, previousShare: number | null): ShareDelta {
  return {
    currentShare,
    previousShare,
    deltaPercentagePoints:
      currentShare !== null && previousShare !== null ? (currentShare - previousShare) * 100 : null,
  };
}

/**
 * Builds the full current-vs-previous comparison for a period. `previous`
 * being null (no comparable prior period in the dataset) still produces a
 * valid comparison object — every delta simply reports `isNew: true`.
 */
export function comparePeriods(current: PeriodMetrics, previous: PeriodMetrics | null): PeriodComparison {
  const severityShareDeltas = {} as Record<Severity, ShareDelta>;
  for (const severity of SEVERITY_VALUES) {
    severityShareDeltas[severity] = computeShareDelta(
      current.severityShares[severity],
      previous?.severityShares[severity] ?? null,
    );
  }

  const eventTypeShareDeltas = {} as Record<EventType, ShareDelta>;
  for (const eventType of EVENT_TYPE_VALUES) {
    eventTypeShareDeltas[eventType] = computeShareDelta(
      current.eventTypeShares[eventType],
      previous?.eventTypeShares[eventType] ?? null,
    );
  }

  return {
    current,
    previous,
    eventCountDelta: computeDelta(current.eventCount, previous?.eventCount ?? null),
    severityShareDeltas,
    eventTypeShareDeltas,
    netAmountDelta: computeDelta(
      current.financial.netAmount.populatedCount > 0 ? current.financial.netAmount.total : null,
      previous && previous.financial.netAmount.populatedCount > 0 ? previous.financial.netAmount.total : null,
    ),
    potentialImpactDelta: computeDelta(
      current.financial.potentialImpact.populatedCount > 0 ? current.financial.potentialImpact.total : null,
      previous && previous.financial.potentialImpact.populatedCount > 0
        ? previous.financial.potentialImpact.total
        : null,
    ),
    recoveryAmountDelta: computeDelta(
      current.financial.recoveryAmount.populatedCount > 0 ? current.financial.recoveryAmount.total : null,
      previous && previous.financial.recoveryAmount.populatedCount > 0
        ? previous.financial.recoveryAmount.total
        : null,
    ),
    avgOccurrenceToRecordDelta: computeDelta(
      current.delays.averageOccurrenceToRecordDays,
      previous?.delays.averageOccurrenceToRecordDays ?? null,
    ),
  };
}
