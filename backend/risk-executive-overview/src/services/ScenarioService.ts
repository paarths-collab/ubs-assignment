import type { RiskEvent } from "../types/RiskEvent";
import type { RiskConfig } from "../types/Config";
import type { RiskPattern } from "../types/Pattern";
import type {
  BreakdownRow,
  DimensionRating,
  ScenarioAnalytics,
  ScenarioSignal,
  SignalLevel,
} from "../types/Scenario";
import { deriveScenarioTitle } from "../config/scenarioTitles";
import { buildBreakdown } from "./Breakdown";
import { computeFinancialFacts } from "./FinancialFacts";
import { computeRecurrenceFacts } from "./RecurrenceService";
import { deriveReasonCodes } from "./PriorityService";
import { PRIORITY_THRESHOLDS } from "./PriorityThresholds";
import { countWhere, groupCounts, sumValid, uniqueValues } from "../utils/aggregation";
import { computeDelayStats } from "../utils/statistics";

export interface FilteredTotals {
  eventCount: number;
  netExposure: number;
  potentialImpact: number;
  highSeverityCount: number;
}

function shareOrNull(part: number | null, whole: number): number | null {
  if (part == null || whole === 0) return null;
  return part / whole;
}

function buildAnalytics(
  events: RiskEvent[],
  totals: FilteredTotals,
  excludedStatuses: ReadonlySet<string>,
): ScenarioAnalytics {
  const financial = computeFinancialFacts(events);
  const recurrence = computeRecurrenceFacts(events);
  const occurrenceDates = events.map((event) => event.occurrenceDate).sort();
  const highSeverityCount = countWhere(events, (event) => event.severity === "High");
  const openEventCount = countWhere(events, (event) => !excludedStatuses.has(event.status));
  const remediationHours = events.map((event) => event.remediationHours);
  const totalRemediationHours = sumValid(remediationHours);

  return {
    volume: {
      eventCount: events.length,
      shareOfFilteredEvents: totals.eventCount === 0 ? 0 : events.length / totals.eventCount,
      financialCount: countWhere(events, (event) => event.eventType === "Financial"),
      nonFinancialCount: countWhere(events, (event) => event.eventType === "Non-Financial"),
      firstOccurrence: occurrenceDates[0] as string,
      lastOccurrence: occurrenceDates[occurrenceDates.length - 1] as string,
    },
    severity: {
      counts: groupCounts(events, (event) => event.severity),
      highShare: events.length === 0 ? 0 : highSeverityCount / events.length,
    },
    workflow: {
      statusCounts: groupCounts(events, (event) => event.status),
      stageCounts: groupCounts(events, (event) => event.stage),
      openEventCount,
      closedEventCount: events.length - openEventCount,
      openShare: events.length === 0 ? 0 : openEventCount / events.length,
    },
    exposure: {
      grossAmountUsd: financial.grossAmountUsd,
      recoveryAmountUsd: financial.recoveryAmountUsd,
      netAmountUsd: financial.netAmountUsd,
      potentialImpactUsd: financial.potentialImpactUsd,
      recoveryRate: financial.recoveryRate,
    },
    concentration: {
      shareOfFilteredEvents: totals.eventCount === 0 ? 0 : events.length / totals.eventCount,
      shareOfFilteredNetExposure: shareOrNull(financial.netAmountUsd, totals.netExposure),
      shareOfFilteredPotentialImpact: shareOrNull(financial.potentialImpactUsd, totals.potentialImpact),
      shareOfFilteredHighSeverity: shareOrNull(highSeverityCount, totals.highSeverityCount),
    },
    organisations: buildBreakdown(events, (event) => event.ownerOrganisation, excludedStatuses),
    owners: buildBreakdown(events, (event) => event.ownerName, excludedStatuses),
    assignees: buildBreakdown(events, (event) => event.currentAssignee, excludedStatuses),
    rootCauses: buildBreakdown(events, (event) => event.rootCause, excludedStatuses),
    riskThemes: groupCounts(events, (event) => event.riskTheme),
    orCategories: groupCounts(events, (event) => event.orCategory),
    timeliness: {
      detectionDelayDays: computeDelayStats(events.map((event) => event.detectionDelayDays)),
      recordingDelayDays: computeDelayStats(events.map((event) => event.recordingDelayDays)),
      occurrenceToRecordDays: computeDelayStats(events.map((event) => event.occurrenceToRecordDays)),
    },
    effort: {
      totalRemediationHours,
      averagePerEvent: events.length === 0 ? 0 : Math.round((totalRemediationHours / events.length) * 10) / 10,
      maxPerEvent: remediationHours.reduce((max, hours) => Math.max(max, hours ?? 0), 0),
    },
    recurrence,
  };
}

/** Four plain-language verdicts, each traceable to the figures beside it. */
function buildDimensions(analytics: ScenarioAnalytics): DimensionRating[] {
  const high = analytics.severity.counts.High ?? 0;
  const { eventCount } = analytics.volume;
  const potential = analytics.exposure.potentialImpactUsd;
  const { openEventCount, openShare } = analytics.workflow;
  const { organisationCount, ownerCount } = analytics.recurrence;

  const severityLevel: SignalLevel = high >= PRIORITY_THRESHOLDS.multipleHighSeverityCount ? "critical" : high > 0 ? "elevated" : "normal";
  const exposureLevel: SignalLevel =
    potential != null && potential >= PRIORITY_THRESHOLDS.highPotentialImpactUsd * 4
      ? "critical"
      : potential != null && potential >= PRIORITY_THRESHOLDS.highPotentialImpactUsd
        ? "elevated"
        : "normal";
  const workflowLevel: SignalLevel = openShare >= 0.6 ? "critical" : openShare >= 0.3 ? "elevated" : "normal";
  const recurrenceLevel: SignalLevel =
    organisationCount > 1 ? "critical" : ownerCount >= PRIORITY_THRESHOLDS.crossOwnerRecurrenceCount ? "elevated" : "normal";

  return [
    {
      dimension: "Severity",
      label: severityLevel === "critical" ? "Elevated" : severityLevel === "elevated" ? "Watch" : "Contained",
      detail: `${high} High of ${eventCount}`,
      level: severityLevel,
    },
    {
      dimension: "Exposure",
      label: exposureLevel === "critical" ? "Material" : exposureLevel === "elevated" ? "Moderate" : "Limited",
      detail: potential == null ? "No recorded impact" : `${formatCompactUsd(potential)} potential`,
      level: exposureLevel,
    },
    {
      dimension: "Workflow",
      label: workflowLevel === "critical" ? "High backlog" : workflowLevel === "elevated" ? "Active backlog" : "Mostly closed",
      detail: `${openEventCount} of ${eventCount} open`,
      level: workflowLevel,
    },
    {
      dimension: "Recurrence",
      label: recurrenceLevel === "critical" ? "Cross-organisation" : recurrenceLevel === "elevated" ? "Multi-owner" : "Localised",
      detail: `${organisationCount} org${organisationCount === 1 ? "" : "s"} · ${ownerCount} owners`,
      level: recurrenceLevel,
    },
  ];
}

function formatCompactUsd(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

/**
 * One sentence explaining the ranking, assembled only from facts that
 * actually cleared a threshold. Deterministic — the AI assistant explains
 * this, it never authors it.
 */
function buildWhyAttention(analytics: ScenarioAnalytics): string {
  const high = analytics.severity.counts.High ?? 0;
  const { openEventCount, openShare } = analytics.workflow;
  const { eventCount } = analytics.volume;
  const { organisationCount, ownerCount } = analytics.recurrence;
  const netShare = analytics.concentration.shareOfFilteredNetExposure;

  const clauses: string[] = [];
  if (high > 0) clauses.push(`${high} high-severity event${high === 1 ? "" : "s"}`);
  if (openShare >= 0.5) clauses.push(`${openEventCount} of ${eventCount} still open`);
  if (organisationCount > 1) clauses.push(`recurring across ${organisationCount} organisations`);
  else if (ownerCount >= PRIORITY_THRESHOLDS.crossOwnerRecurrenceCount) clauses.push(`spanning ${ownerCount} owners`);
  if (netShare != null && netShare >= PRIORITY_THRESHOLDS.concentratedExposureShare) {
    clauses.push(`holding ${(netShare * 100).toFixed(0)}% of filtered net exposure`);
  }

  if (clauses.length === 0) return `${eventCount} events with no threshold-level severity, backlog or recurrence signals.`;
  if (clauses.length === 1) return `${capitalise(clauses[0] as string)}.`;

  const leading = clauses.slice(0, -1).join(", ");
  return `${capitalise(leading)} and ${clauses[clauses.length - 1]}.`;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function buildContextLine(analytics: ScenarioAnalytics): string {
  const { organisationCount, ownerCount } = analytics.recurrence;
  if (organisationCount > 1) return `Recurring across ${organisationCount} organisations`;
  const organisation = analytics.organisations[0]?.key ?? "one organisation";
  return `Concentrated in ${organisation.split(" → ")[0]} across ${ownerCount} owner${ownerCount === 1 ? "" : "s"}`;
}

/**
 * Collapses every pattern record sharing an underlying scenario into a
 * single management item. The dataset carries the same scenario as up to
 * five pattern types (issue, organisation+issue, owner+issue,
 * assignee+issue, cross-organisation) — showing those as separate priority
 * rows presented the manager with the same finding several times over.
 */
export function buildScenarioSignals(
  filteredEvents: readonly RiskEvent[],
  patterns: readonly RiskPattern[],
  config: RiskConfig,
): ScenarioSignal[] {
  const excludedStatuses = new Set(config.businessRules.openBacklog.excludedStatuses);
  const overallFinancial = computeFinancialFacts(filteredEvents);
  const totals: FilteredTotals = {
    eventCount: filteredEvents.length,
    netExposure: overallFinancial.netAmountUsd ?? 0,
    potentialImpact: overallFinancial.potentialImpactUsd ?? 0,
    highSeverityCount: countWhere(filteredEvents, (event) => event.severity === "High"),
  };

  const byIssue = new Map<string, RiskEvent[]>();
  for (const event of filteredEvents) {
    const bucket = byIssue.get(event.issueDetail);
    if (bucket) bucket.push(event);
    else byIssue.set(event.issueDetail, [event]);
  }

  return [...byIssue.entries()].map(([issueDetail, events]) => {
    const analytics = buildAnalytics(events, totals, excludedStatuses);
    const contributing = patterns.filter((pattern) => pattern.group.issueDetail === issueDetail);
    const representative =
      contributing.find((pattern) => pattern.patternType === "issue") ?? contributing[0] ?? null;

    const high = analytics.severity.counts.High ?? 0;
    const level: SignalLevel =
      high >= PRIORITY_THRESHOLDS.multipleHighSeverityCount ? "critical" : high > 0 ? "elevated" : "normal";

    const reasonCodes = deriveReasonCodes(
      {
        eventCount: events.length,
        highSeverityCount: high,
        openEventCount: analytics.workflow.openEventCount,
        netAmountUsd: analytics.exposure.netAmountUsd,
        potentialImpactUsd: analytics.exposure.potentialImpactUsd,
        remediationHours: analytics.effort.totalRemediationHours,
        organisationCount: analytics.recurrence.organisationCount,
        ownerCount: analytics.recurrence.ownerCount,
        assigneeCount: analytics.recurrence.assigneeCount,
        shareOfFilteredEvents: analytics.concentration.shareOfFilteredEvents,
        shareOfFilteredNetExposure: analytics.concentration.shareOfFilteredNetExposure,
        shareOfFilteredPotentialImpact: analytics.concentration.shareOfFilteredPotentialImpact,
      },
      analytics.recurrence.distinctIssueCount,
    );

    return {
      scenarioId: representative?.patternId ?? `scenario_${uniqueValues(events, (event) => event.eventId)[0]}`,
      patternId: representative?.patternId ?? null,
      contributingPatternIds: contributing.map((pattern) => pattern.patternId),
      title: deriveScenarioTitle(issueDetail),
      issueDetail,
      contextLine: buildContextLine(analytics),
      eventCount: events.length,
      highSeverityCount: high,
      openEventCount: analytics.workflow.openEventCount,
      netAmountUsd: analytics.exposure.netAmountUsd,
      potentialImpactUsd: analytics.exposure.potentialImpactUsd,
      level,
      whyAttention: buildWhyAttention(analytics),
      dimensions: buildDimensions(analytics),
      reasonCodes,
      analytics,
      eventIds: events.map((event) => event.eventId),
    };
  });
}

export type AttentionLens = "urgency" | "exposure" | "recurrence";

export interface AttentionCard {
  lens: AttentionLens;
  scenarioId: string;
  title: string;
  headline: string;
  reason: string;
}

/**
 * Picks the single leading scenario for each of the three questions a
 * manager actually asks — what is most urgent, where is the money, and what
 * keeps coming back. Each lens ranks on its own measure, so one dominant
 * scenario cannot occupy all three slots unless it genuinely leads all three.
 */
export function buildAttentionCards(scenarios: ScenarioSignal[]): AttentionCard[] {
  if (scenarios.length === 0) return [];

  const best = (score: (signal: ScenarioSignal) => number): ScenarioSignal =>
    [...scenarios].sort((a, b) => score(b) - score(a) || a.scenarioId.localeCompare(b.scenarioId))[0] as ScenarioSignal;

  const urgency = best((s) => s.highSeverityCount * 1000 + s.openEventCount);
  const exposure = best((s) => s.analytics.concentration.shareOfFilteredNetExposure ?? s.potentialImpactUsd ?? 0);
  const recurrence = best((s) => s.analytics.recurrence.organisationCount * 1000 + s.analytics.recurrence.ownerCount);

  const netShare = exposure.analytics.concentration.shareOfFilteredNetExposure;

  return [
    {
      lens: "urgency",
      scenarioId: urgency.scenarioId,
      title: urgency.title,
      headline: `${urgency.highSeverityCount} High · ${urgency.openEventCount} open · ${urgency.eventCount} events`,
      reason:
        urgency.highSeverityCount > 0
          ? "High-severity events remain unresolved."
          : "Largest unresolved backlog in the current selection.",
    },
    {
      lens: "exposure",
      scenarioId: exposure.scenarioId,
      title: exposure.title,
      headline: `${formatCompactUsd(exposure.netAmountUsd ?? 0)} net · ${formatCompactUsd(exposure.potentialImpactUsd ?? 0)} potential`,
      reason:
        netShare != null
          ? `Represents ${(netShare * 100).toFixed(1)}% of filtered net exposure.`
          : "Largest potential impact in the current selection.",
    },
    {
      lens: "recurrence",
      scenarioId: recurrence.scenarioId,
      title: recurrence.title,
      headline: `${recurrence.eventCount} events · ${recurrence.analytics.recurrence.organisationCount} organisations`,
      reason:
        recurrence.analytics.recurrence.organisationCount > 1
          ? "Repeats across several owners and assignees."
          : "Concentrated within a single business unit's workflow.",
    },
  ];
}

const SCENARIO_RANK_KEYS: Array<(signal: ScenarioSignal) => number> = [
  (s) => s.highSeverityCount,
  (s) => s.openEventCount,
  (s) => s.potentialImpactUsd ?? -1,
  (s) => s.netAmountUsd ?? -1,
  (s) => s.analytics.recurrence.organisationCount,
  (s) => s.eventCount,
];

export function rankScenarioSignals(signals: ScenarioSignal[]): ScenarioSignal[] {
  return [...signals].sort((a, b) => {
    for (const key of SCENARIO_RANK_KEYS) {
      const diff = key(b) - key(a);
      if (diff !== 0) return diff;
    }
    return a.scenarioId.localeCompare(b.scenarioId);
  });
}
