import type { RiskEvent } from "../types/RiskEvent";
import type { RiskConfig } from "../types/Config";
import type { ScenarioSignal } from "../types/Scenario";
import type { NormalizedFilters } from "../schemas/filters.schema";
import type {
  ComparisonMetric,
  EnterpriseComparison,
  PeopleConcentration,
  RiskDossier,
  TrendFacts,
} from "../types/Dossier";
import { countWhere } from "../utils/aggregation";

/**
 * Splits the filtered window at its midpoint and compares the two halves.
 * Using the filtered range (rather than fixed calendar periods) keeps the
 * comparison well-defined whatever date filter the manager has applied.
 */
export function computeTrend(
  events: readonly RiskEvent[],
  filters: NormalizedFilters,
  excludedStatuses: ReadonlySet<string>,
): TrendFacts | null {
  if (events.length === 0) return null;

  const fromTime = Date.parse(filters.dateFrom);
  const toTime = Date.parse(filters.dateTo);
  if (Number.isNaN(fromTime) || Number.isNaN(toTime) || toTime <= fromTime) return null;

  const midpoint = new Date((fromTime + toTime) / 2).toISOString().slice(0, 10);

  const summarise = (slice: RiskEvent[], from: string, to: string) => ({
    from,
    to,
    eventCount: slice.length,
    highSeverityCount: countWhere(slice, (event) => event.severity === "High"),
    openEventCount: countWhere(slice, (event) => !excludedStatuses.has(event.status)),
  });

  const firstHalf = events.filter((event) => event.occurrenceDate < midpoint);
  const secondHalf = events.filter((event) => event.occurrenceDate >= midpoint);

  const firstPeriod = summarise(firstHalf, filters.dateFrom, midpoint);
  const secondPeriod = summarise(secondHalf, midpoint, filters.dateTo);

  const eventCountChange = secondPeriod.eventCount - firstPeriod.eventCount;
  const eventCountChangePct =
    firstPeriod.eventCount === 0 ? null : eventCountChange / firstPeriod.eventCount;

  // A single event of drift either way is noise at these volumes.
  const direction: TrendFacts["direction"] =
    Math.abs(eventCountChange) <= 1 ? "stable" : eventCountChange > 0 ? "increasing" : "decreasing";

  return {
    firstPeriod,
    secondPeriod,
    eventCountChange,
    eventCountChangePct,
    highSeverityChange: secondPeriod.highSeverityCount - firstPeriod.highSeverityCount,
    direction,
  };
}

function rankOf(values: Array<number | null>, value: number | null): ComparisonMetric {
  const present = values.filter((candidate): candidate is number => candidate != null).sort((a, b) => b - a);
  const totalIssues = values.length;

  if (value == null || present.length === 0) {
    return { value, rank: totalIssues, totalIssues, percentile: 0, median: null };
  }

  const rank = present.findIndex((candidate) => candidate <= value) + 1;
  const median = present[Math.floor(present.length / 2)] ?? null;
  const percentile = totalIssues <= 1 ? 100 : Math.round(((totalIssues - rank) / (totalIssues - 1)) * 100);

  return { value, rank: rank === 0 ? totalIssues : rank, totalIssues, percentile, median };
}

/**
 * Ranks the selected issue against every other issue in the filtered
 * population. Calculated here so the model is asked only to interpret the
 * comparison, never to compute it.
 */
export function buildEnterpriseComparison(
  selected: ScenarioSignal,
  allScenarios: ScenarioSignal[],
): EnterpriseComparison {
  const metricOf = (pick: (signal: ScenarioSignal) => number | null): ComparisonMetric =>
    rankOf(allScenarios.map(pick), pick(selected));

  return {
    selectedIssue: selected.title,
    totalIssues: allScenarios.length,
    metrics: {
      eventCount: metricOf((s) => s.eventCount),
      highSeverityCount: metricOf((s) => s.highSeverityCount),
      openEventCount: metricOf((s) => s.openEventCount),
      openRate: metricOf((s) => s.analytics.workflow.openShare),
      netExposureUsd: metricOf((s) => s.analytics.exposure.netAmountUsd),
      potentialImpactUsd: metricOf((s) => s.potentialImpactUsd),
      remediationHours: metricOf((s) => s.analytics.effort.totalRemediationHours),
      organisationSpread: metricOf((s) => s.analytics.recurrence.organisationCount),
      detectionDelayMedian: metricOf((s) => s.analytics.timeliness.detectionDelayDays?.median ?? null),
      recordingDelayMedian: metricOf((s) => s.analytics.timeliness.recordingDelayDays?.median ?? null),
    },
  };
}

function buildPeopleConcentration(selected: ScenarioSignal): PeopleConcentration {
  const { owners, assignees, recurrence } = selected.analytics;
  const maxEvents = (rows: typeof owners): number => rows.reduce((max, row) => Math.max(max, row.eventCount), 0);

  return {
    uniqueOwners: recurrence.ownerCount,
    repeatedOwners: owners.filter((row) => row.eventCount > 1).length,
    uniqueAssignees: recurrence.assigneeCount,
    repeatedAssignees: assignees.filter((row) => row.eventCount > 1).length,
    maxEventsUnderOneOwner: maxEvents(owners),
    maxEventsUnderOneAssignee: maxEvents(assignees),
  };
}

export function buildRiskDossier(
  selected: ScenarioSignal,
  allScenarios: ScenarioSignal[],
  scenarioEvents: readonly RiskEvent[],
  filters: NormalizedFilters,
  config: RiskConfig,
): RiskDossier {
  const excludedStatuses = new Set(config.businessRules.openBacklog.excludedStatuses);
  const a = selected.analytics;

  return {
    scenarioId: selected.scenarioId,
    title: selected.title,
    issueDetail: selected.issueDetail,
    filters,

    volume: a.volume,
    severity: {
      counts: a.severity.counts,
      highShare: a.severity.highShare,
      highStillOpen: countWhere(
        scenarioEvents,
        (event) => event.severity === "High" && !excludedStatuses.has(event.status),
      ),
    },
    workflow: a.workflow,
    financial: { ...a.exposure, concentration: a.concentration },

    organisations: a.organisations,
    people: buildPeopleConcentration(selected),
    recurrence: a.recurrence,

    rootCauses: a.rootCauses,
    riskThemes: a.riskThemes,
    orCategories: a.orCategories,

    timeliness: a.timeliness,
    operationalBurden: a.effort,

    trend: computeTrend(scenarioEvents, filters, excludedStatuses),
    enterpriseComparison: buildEnterpriseComparison(selected, allScenarios),

    evidence: { eventCount: selected.eventIds.length, eventIds: selected.eventIds },
  };
}
