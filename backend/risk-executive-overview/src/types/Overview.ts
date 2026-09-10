import type { BreakdownRow } from "./Scenario.js";

/** "Risk Composition" — what the filtered population is made of. */
export interface CompositionBlock {
  severity: Record<string, number>;
  eventType: Record<string, number>;
  workflow: {
    open: number;
    closed: number;
    cancelled: number;
    highStillOpen: number;
  };
  organisations: BreakdownRow[];
}

/**
 * "Exposure & Impact" — realised money, potential money and operational
 * burden kept apart, because conflating them is what makes Non-Financial
 * events look free.
 */
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
  operational: {
    totalRemediationHours: number;
    averagePerEvent: number;
    maxPerEvent: number;
  };
}
