import type { RiskEvent } from "../types/RiskEvent";
import type { RiskConfig } from "../types/Config";
import type { NormalizedFilters } from "../schemas/filters.schema";
import type { RiskDetailSelection } from "../types/RiskDetail";
import type { AiFactPackage } from "../types/AiFactPackage";
import type { RiskRepository } from "../repositories/RiskRepository";
import { resolveSelectionSlice } from "./RiskDetailService";
import { buildPatternLabel } from "./PatternService";
import { computeFinancialFacts } from "./FinancialFacts";
import { computeRecurrenceFacts } from "./RecurrenceService";
import { countWhere, groupCounts, sumValid, uniqueValues } from "../utils/aggregation";
import { computeDelayStats } from "../utils/statistics";
import { AppError } from "../utils/errors";

function buildSelectionLabel(
  selection: RiskDetailSelection,
  config: RiskConfig,
  repository: RiskRepository,
): { label: string; patternId: string | null; patternType: string | null } {
  switch (selection.type) {
    case "pattern": {
      const pattern = repository.getPatternById(selection.patternId);
      if (!pattern) throw new AppError("PATTERN_NOT_FOUND", `No pattern with id "${selection.patternId}"`);
      return { label: buildPatternLabel(pattern), patternId: pattern.patternId, patternType: pattern.patternType };
    }
    case "kpi": {
      const kpi = config.kpis.find((item) => item.id === selection.kpiId);
      if (!kpi) throw new AppError("INVALID_SELECTION", `Unknown kpiId "${selection.kpiId}"`);
      return { label: kpi.label, patternId: null, patternType: null };
    }
    case "issue":
      return { label: selection.issueDetail, patternId: null, patternType: null };
    case "period":
      return { label: `Events from ${selection.dateFrom} to ${selection.dateTo}`, patternId: null, patternType: null };
    case "eventIds":
      return { label: `${selection.eventIds.length} selected event(s)`, patternId: null, patternType: null };
  }
}

/**
 * Builds the verified fact package that will be sent to the LLM. This is
 * the only place allowed to decide what the model sees — every field is
 * derived here from the same deterministic services used elsewhere, never
 * recomputed independently and never accepted from the client.
 */
export function buildAiFactPackage(
  selection: RiskDetailSelection,
  filters: NormalizedFilters,
  filteredEvents: RiskEvent[],
  filteredEventIds: ReadonlySet<string>,
  config: RiskConfig,
  repository: RiskRepository,
): AiFactPackage {
  const sliceEvents = resolveSelectionSlice(selection, filteredEvents, filteredEventIds, config, repository);
  if (sliceEvents.length === 0) {
    throw new AppError("NO_EVENTS_MATCH", "No events match the requested selection within the current filters");
  }

  const { label, patternId, patternType } = buildSelectionLabel(selection, config, repository);
  const excluded = new Set(config.businessRules.openBacklog.excludedStatuses);
  const financial = computeFinancialFacts(sliceEvents);

  return {
    selectionType: selection.type,
    selectionLabel: label,
    filters,

    eventIds: sliceEvents.map((event) => event.eventId),
    eventCount: sliceEvents.length,

    severityCounts: groupCounts(sliceEvents, (event) => event.severity),
    highSeverityCount: countWhere(sliceEvents, (event) => event.severity === "High"),
    openEventCount: countWhere(sliceEvents, (event) => !excluded.has(event.status)),

    grossAmountUsd: financial.grossAmountUsd,
    recoveryAmountUsd: financial.recoveryAmountUsd,
    netAmountUsd: financial.netAmountUsd,
    recoveryRate: financial.recoveryRate,
    potentialImpactUsd: financial.potentialImpactUsd,
    remediationHours: sumValid(sliceEvents.map((event) => event.remediationHours)),

    ownerOrganisations: uniqueValues(sliceEvents, (event) => event.ownerOrganisation),
    ownerNames: uniqueValues(sliceEvents, (event) => event.ownerName),
    assigneeNames: uniqueValues(sliceEvents, (event) => event.currentAssignee),

    issueDetails: uniqueValues(sliceEvents, (event) => event.issueDetail),
    rootCauses: uniqueValues(sliceEvents, (event) => event.rootCause),
    riskThemes: uniqueValues(sliceEvents, (event) => event.riskTheme),
    orCategories: uniqueValues(sliceEvents, (event) => event.orCategory),

    statusCounts: groupCounts(sliceEvents, (event) => event.status),
    stageCounts: groupCounts(sliceEvents, (event) => event.stage),

    detectionDelay: computeDelayStats(sliceEvents.map((event) => event.detectionDelayDays)),
    recordingDelay: computeDelayStats(sliceEvents.map((event) => event.recordingDelayDays)),
    occurrenceToRecordDelay: computeDelayStats(sliceEvents.map((event) => event.occurrenceToRecordDays)),

    recurrenceFacts: computeRecurrenceFacts(sliceEvents),

    patternType,
    patternId,
  };
}
