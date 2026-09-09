import type { PrioritySignal, ReasonCode } from "../types/Priority";
import { type FilteredPattern, buildPatternLabel } from "./PatternService";
import { computeFinancialFacts } from "./FinancialFacts";
import { computeRecurrenceFacts } from "./RecurrenceService";
import { countWhere, groupCounts, sumValid, uniqueValues } from "../utils/aggregation";
import { PRIORITY_THRESHOLDS, DEFAULT_PRIORITY_LIMIT } from "./PriorityThresholds";

/** Exactly the facts a reason code can be derived from — nothing else is in scope for this decision. */
export interface ReasonCodeFacts {
  eventCount: number;
  highSeverityCount: number;
  openEventCount: number;
  netAmountUsd: number | null;
  potentialImpactUsd: number | null;
  remediationHours: number;
  organisationCount: number;
  ownerCount: number;
  assigneeCount: number;
  shareOfFilteredEvents: number;
  shareOfFilteredNetExposure: number | null;
  shareOfFilteredPotentialImpact: number | null;
}

export function deriveReasonCodes(signal: ReasonCodeFacts, distinctIssueCount: number): ReasonCode[] {
  const codes: ReasonCode[] = [];
  const t = PRIORITY_THRESHOLDS;

  if (signal.highSeverityCount >= 1) codes.push("HIGH_SEVERITY_PRESENT");
  if (signal.highSeverityCount >= t.multipleHighSeverityCount) codes.push("MULTIPLE_HIGH_EVENTS");

  if (signal.openEventCount >= t.highOpenBacklogCount && signal.openEventCount / signal.eventCount >= t.highOpenBacklogShare) {
    codes.push("HIGH_OPEN_BACKLOG");
  }

  if (signal.netAmountUsd != null && signal.netAmountUsd >= t.highNetExposureUsd) codes.push("HIGH_NET_EXPOSURE");
  if (signal.potentialImpactUsd != null && signal.potentialImpactUsd >= t.highPotentialImpactUsd) {
    codes.push("HIGH_POTENTIAL_IMPACT");
  }

  if (distinctIssueCount === 1) {
    if (signal.ownerCount >= t.crossOwnerRecurrenceCount) codes.push("CROSS_OWNER_RECURRENCE");
    if (signal.assigneeCount >= t.crossAssigneeRecurrenceCount) codes.push("CROSS_ASSIGNEE_RECURRENCE");
    if (signal.organisationCount >= t.crossOrganisationRecurrenceCount) codes.push("CROSS_ORGANISATION_RECURRENCE");
  }

  const concentratedOnNet =
    signal.shareOfFilteredNetExposure != null &&
    signal.shareOfFilteredNetExposure >= t.concentratedExposureShare &&
    signal.shareOfFilteredNetExposure > signal.shareOfFilteredEvents;
  const concentratedOnImpact =
    signal.shareOfFilteredPotentialImpact != null &&
    signal.shareOfFilteredPotentialImpact >= t.concentratedExposureShare &&
    signal.shareOfFilteredPotentialImpact > signal.shareOfFilteredEvents;
  if (concentratedOnNet || concentratedOnImpact) codes.push("CONCENTRATED_EXPOSURE");

  if (signal.remediationHours >= t.highRemediationHours) codes.push("HIGH_REMEDIATION_EFFORT");

  return codes;
}

function shareOrNull(part: number | null, whole: number): number | null {
  if (part == null || whole === 0) return null;
  return part / whole;
}

/** Builds a fully-factual priority signal for one pattern's filtered event slice. */
export function buildPrioritySignal(
  filtered: FilteredPattern,
  totalFilteredEvents: number,
  totalFilteredNetExposure: number,
  totalFilteredPotentialImpact: number,
  excludedStatuses: ReadonlySet<string>,
): PrioritySignal {
  const { pattern, events } = filtered;
  const financial = computeFinancialFacts(events);
  const recurrence = computeRecurrenceFacts(events);
  const occurrenceDates = events.map((event) => event.occurrenceDate).sort();

  const base = {
    eventCount: events.length,
    highSeverityCount: countWhere(events, (event) => event.severity === "High"),
    openEventCount: countWhere(events, (event) => !excludedStatuses.has(event.status)),
    grossAmountUsd: financial.grossAmountUsd,
    recoveryAmountUsd: financial.recoveryAmountUsd,
    netAmountUsd: financial.netAmountUsd,
    recoveryRate: financial.recoveryRate,
    potentialImpactUsd: financial.potentialImpactUsd,
    remediationHours: sumValid(events.map((event) => event.remediationHours)),
    organisationCount: recurrence.organisationCount,
    ownerCount: recurrence.ownerCount,
    assigneeCount: recurrence.assigneeCount,
    shareOfFilteredEvents: totalFilteredEvents === 0 ? 0 : events.length / totalFilteredEvents,
    shareOfFilteredNetExposure: shareOrNull(financial.netAmountUsd, totalFilteredNetExposure),
    shareOfFilteredPotentialImpact: shareOrNull(financial.potentialImpactUsd, totalFilteredPotentialImpact),
  };

  return {
    patternId: pattern.patternId,
    patternType: pattern.patternType,
    label: buildPatternLabel(pattern),
    scope: {
      issueDetail: pattern.group.issueDetail ?? null,
      ownerOrganisation: pattern.group.ownerOrganisation ?? null,
      ownerName: pattern.group.ownerName ?? null,
      currentAssignee: pattern.group.currentAssignee ?? null,
    },
    ...base,
    severityCounts: groupCounts(events, (event) => event.severity),
    organisations: recurrence.organisations,
    ownerNames: recurrence.ownerNames,
    assigneeNames: recurrence.assigneeNames,
    rootCauses: uniqueValues(events, (event) => event.rootCause),
    firstOccurrence: occurrenceDates[0] as string,
    lastOccurrence: occurrenceDates[occurrenceDates.length - 1] as string,
    reasonCodes: deriveReasonCodes(base, recurrence.distinctIssueCount),
    eventIds: events.map((event) => event.eventId),
  };
}

const RANK_KEYS: Array<(signal: PrioritySignal) => number> = [
  (s) => (s.highSeverityCount > 0 ? 1 : 0),
  (s) => s.highSeverityCount,
  (s) => s.openEventCount,
  (s) => s.potentialImpactUsd ?? -1,
  (s) => s.netAmountUsd ?? -1,
  (s) => Math.max(s.ownerCount, s.assigneeCount, s.organisationCount),
  (s) => s.eventCount,
];

export function rankPrioritySignals(signals: PrioritySignal[]): PrioritySignal[] {
  return [...signals].sort((a, b) => {
    for (const key of RANK_KEYS) {
      const diff = key(b) - key(a);
      if (diff !== 0) return diff;
    }
    return a.patternId.localeCompare(b.patternId);
  });
}

export function limitPrioritySignals(signals: PrioritySignal[], limit = DEFAULT_PRIORITY_LIMIT): PrioritySignal[] {
  return signals.slice(0, limit);
}
