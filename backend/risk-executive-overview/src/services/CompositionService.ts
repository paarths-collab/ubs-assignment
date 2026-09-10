import type { RiskEvent } from "../types/RiskEvent.js";
import type { RiskConfig } from "../types/Config.js";
import type { CompositionBlock, ExposureBlock } from "../types/Overview.js";
import { buildBreakdown } from "./Breakdown.js";
import { computeFinancialFacts } from "./FinancialFacts.js";
import { countWhere, groupCounts, hasAnyValid, sumValid } from "../utils/aggregation.js";

const CANCELLED_STATUS = "Cancelled";
const CLOSED_STATUS = "Closed";

export function buildComposition(filteredEvents: readonly RiskEvent[], config: RiskConfig): CompositionBlock {
  const excludedStatuses = new Set(config.businessRules.openBacklog.excludedStatuses);

  return {
    severity: groupCounts(filteredEvents, (event) => event.severity),
    eventType: groupCounts(filteredEvents, (event) => event.eventType),
    workflow: {
      open: countWhere(filteredEvents, (event) => !excludedStatuses.has(event.status)),
      closed: countWhere(filteredEvents, (event) => event.status === CLOSED_STATUS),
      cancelled: countWhere(filteredEvents, (event) => event.status === CANCELLED_STATUS),
      highStillOpen: countWhere(
        filteredEvents,
        (event) => event.severity === "High" && !excludedStatuses.has(event.status),
      ),
    },
    organisations: buildBreakdown(filteredEvents, (event) => event.ownerOrganisation, excludedStatuses),
  };
}

function nullableSum(values: Array<number | null | undefined>): number | null {
  return hasAnyValid(values) ? sumValid(values) : null;
}

export function buildExposureSummary(filteredEvents: readonly RiskEvent[]): ExposureBlock {
  const financial = computeFinancialFacts(filteredEvents);
  const financialEvents = filteredEvents.filter((event) => event.eventType === "Financial");
  const nonFinancialEvents = filteredEvents.filter((event) => event.eventType === "Non-Financial");
  const remediationHours = filteredEvents.map((event) => event.remediationHours);
  const totalRemediationHours = sumValid(remediationHours);

  return {
    realised: {
      grossAmountUsd: financial.grossAmountUsd,
      recoveryAmountUsd: financial.recoveryAmountUsd,
      netAmountUsd: financial.netAmountUsd,
      recoveryRate: financial.recoveryRate,
    },
    potential: {
      totalUsd: financial.potentialImpactUsd,
      fromFinancialUsd: nullableSum(financialEvents.map((event) => event.potentialImpactUsd)),
      fromNonFinancialUsd: nullableSum(nonFinancialEvents.map((event) => event.potentialImpactUsd)),
    },
    operational: {
      totalRemediationHours,
      averagePerEvent:
        filteredEvents.length === 0 ? 0 : Math.round((totalRemediationHours / filteredEvents.length) * 10) / 10,
      maxPerEvent: remediationHours.reduce((max, hours) => Math.max(max, hours ?? 0), 0),
    },
  };
}
