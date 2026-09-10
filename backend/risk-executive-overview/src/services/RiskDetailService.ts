import type { RiskEvent } from "../types/RiskEvent";
import type { RiskConfig } from "../types/Config";
import type { RiskDetailResponse, RiskDetailSelection, IssueSummary } from "../types/RiskDetail";
import type { RiskRepository } from "../repositories/RiskRepository";
import { resolveFilteredPattern } from "./PatternService";
import { computeFinancialFacts } from "./FinancialFacts";
import { computeRecurrenceFacts } from "./RecurrenceService";
import { countWhere, groupCounts, sumValid, uniqueValues } from "../utils/aggregation";
import { computeDelayStats } from "../utils/statistics";
import { AppError } from "../utils/errors";

function resolveKpiSlice(kpiId: string, filteredEvents: RiskEvent[]): RiskEvent[] {
  switch (kpiId) {
    case "totalEvents":
    case "remediationHours":
      return filteredEvents;
    case "highSeverityEvents":
      return filteredEvents.filter((event) => event.severity === "High");
    case "grossExposure":
      return filteredEvents.filter((event) => event.eventType === "Financial" && event.grossAmountUsd != null);
    case "netExposure":
      return filteredEvents.filter((event) => event.eventType === "Financial" && event.netAmountUsd != null);
    case "recoveryRate":
      return filteredEvents.filter((event) => event.eventType === "Financial" && event.grossAmountUsd != null);
    case "potentialImpact":
      return filteredEvents.filter((event) => event.potentialImpactUsd != null);
    default:
      throw new AppError("INVALID_SELECTION", `Unknown kpiId "${kpiId}"`);
  }
}

function resolveOpenBacklogSlice(filteredEvents: RiskEvent[], config: RiskConfig): RiskEvent[] {
  const excluded = new Set(config.businessRules.openBacklog.excludedStatuses);
  return filteredEvents.filter((event) => !excluded.has(event.status));
}

/** Resolves a manager selection to the concrete event slice it refers to, always inside the current filter population. */
export function resolveSelectionSlice(
  selection: RiskDetailSelection,
  filteredEvents: RiskEvent[],
  filteredEventIds: ReadonlySet<string>,
  config: RiskConfig,
  repository: RiskRepository,
): RiskEvent[] {
  switch (selection.type) {
    case "pattern": {
      const pattern = repository.getPatternById(selection.patternId);
      if (!pattern) throw new AppError("PATTERN_NOT_FOUND", `No pattern with id "${selection.patternId}"`);
      return resolveFilteredPattern(pattern, filteredEventIds, repository).events;
    }
    case "kpi":
      return selection.kpiId === "openBacklog"
        ? resolveOpenBacklogSlice(filteredEvents, config)
        : resolveKpiSlice(selection.kpiId, filteredEvents);
    case "issue":
      return filteredEvents.filter((event) => event.issueDetail === selection.issueDetail);
    case "period":
      return filteredEvents.filter(
        (event) => event.occurrenceDate >= selection.dateFrom && event.occurrenceDate <= selection.dateTo,
      );
    case "eventIds": {
      const requested = new Set(selection.eventIds);
      return filteredEvents.filter((event) => requested.has(event.eventId));
    }
    default:
      throw new AppError("INVALID_SELECTION", "Unrecognised selection type");
  }
}

function buildIssueSummaries(sliceEvents: RiskEvent[]): IssueSummary[] {
  const counts = groupCounts(sliceEvents, (event) => event.issueDetail);
  return Object.entries(counts)
    .map(([issueDetail, eventCount]) => ({ issueDetail, eventCount }))
    .sort((a, b) => b.eventCount - a.eventCount || a.issueDetail.localeCompare(b.issueDetail));
}

export function buildRiskDetail(
  selection: RiskDetailSelection,
  sliceEvents: RiskEvent[],
  config: RiskConfig,
  patternId: string | null,
): RiskDetailResponse {
  if (sliceEvents.length === 0) {
    throw new AppError("NO_EVENTS_MATCH", "No events match the requested selection within the current filters");
  }

  const excluded = new Set(config.businessRules.openBacklog.excludedStatuses);
  const openEventCount = countWhere(sliceEvents, (event) => !excluded.has(event.status));

  return {
    selection,
    summary: { eventCount: sliceEvents.length },
    severity: groupCounts(sliceEvents, (event) => event.severity),
    ownership: {
      organisations: uniqueValues(sliceEvents, (event) => event.ownerOrganisation),
      organisationCount: uniqueValues(sliceEvents, (event) => event.ownerOrganisation).length,
      owners: uniqueValues(sliceEvents, (event) => event.ownerName),
      ownerCount: uniqueValues(sliceEvents, (event) => event.ownerName).length,
      assignees: uniqueValues(sliceEvents, (event) => event.currentAssignee),
      assigneeCount: uniqueValues(sliceEvents, (event) => event.currentAssignee).length,
    },
    recurrence: computeRecurrenceFacts(sliceEvents),
    financial: computeFinancialFacts(sliceEvents),
    operationalImpact: {
      remediationHours: sumValid(sliceEvents.map((event) => event.remediationHours)),
      potentialImpactUsd: computeFinancialFacts(sliceEvents).potentialImpactUsd,
    },
    workflow: {
      statusCounts: groupCounts(sliceEvents, (event) => event.status),
      stageCounts: groupCounts(sliceEvents, (event) => event.stage),
      openEventCount,
      closedEventCount: sliceEvents.length - openEventCount,
    },
    timeliness: {
      detectionDelayDays: computeDelayStats(sliceEvents.map((event) => event.detectionDelayDays)),
      recordingDelayDays: computeDelayStats(sliceEvents.map((event) => event.recordingDelayDays)),
      occurrenceToRecordDays: computeDelayStats(sliceEvents.map((event) => event.occurrenceToRecordDays)),
    },
    issues: buildIssueSummaries(sliceEvents),
    evidence: {
      eventIds: sliceEvents.map((event) => event.eventId),
      patternId,
    },
  };
}
