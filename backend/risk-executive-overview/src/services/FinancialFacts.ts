import type { RiskEvent } from "../types/RiskEvent";
import { hasAnyValid, sumValid } from "../utils/aggregation";

export interface FinancialFacts {
  grossAmountUsd: number | null;
  netAmountUsd: number | null;
  recoveryAmountUsd: number | null;
  recoveryRate: number | null;
  potentialImpactUsd: number | null;
}

function nullableSum(values: Array<number | null | undefined>): number | null {
  return hasAnyValid(values) ? sumValid(values) : null;
}

/**
 * Shared financial-fact calculation used by priority signals, risk detail
 * and the AI fact package alike, so a manager selection is described with
 * exactly the same numbers everywhere it appears. Gross/Net/Recovery are
 * scoped to Financial events in the slice; a slice with none returns null
 * (never a fabricated 0) for those fields. Potential Impact spans both
 * event types, since it remains meaningful for Non-Financial events.
 */
export function computeFinancialFacts(sliceEvents: readonly RiskEvent[]): FinancialFacts {
  const financialEvents = sliceEvents.filter((event) => event.eventType === "Financial");

  const grossAmountUsd = nullableSum(financialEvents.map((event) => event.grossAmountUsd));
  const netAmountUsd = nullableSum(financialEvents.map((event) => event.netAmountUsd));
  const recoveryAmountUsd = nullableSum(financialEvents.map((event) => event.recoveryAmountUsd));

  const recoveryRate =
    grossAmountUsd != null && grossAmountUsd !== 0 ? (recoveryAmountUsd ?? 0) / grossAmountUsd : null;

  const potentialImpactUsd = nullableSum(sliceEvents.map((event) => event.potentialImpactUsd));

  return { grossAmountUsd, netAmountUsd, recoveryAmountUsd, recoveryRate, potentialImpactUsd };
}
