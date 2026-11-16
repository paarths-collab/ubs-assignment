import { config } from "../config";
import { ApiError } from "../middleware/error-handler";
import type { BrainEvent, CanonicalBrainData, Severity } from "../types/brain";

export interface AmountFact {
  total: number | null;
  contributingCount: number;
}

export interface DelayFact {
  average: number | null;
  median: number | null;
  max: number | null;
}

export interface LabelCount {
  label: string;
  count: number;
}

export interface RepresentativeEvent {
  eventId: string;
  occurrenceDate: string;
  severity: Severity;
  eventType: string;
  ownerOrganisation: string;
  issue: string;
  rootCause: string;
  status: string;
  netAmountUsd: number | null;
  potentialImpactUsd: number | null;
  occurrenceToRecordDays: number;
}

export interface InvestigationContext {
  scope: {
    eventCount: number;
    requestedEventCount: number;
    /** Submitted IDs dropped because they are not connected to the selected node. */
    droppedEventCount: number;
    occurrenceDateRange: { earliest: string; latest: string } | null;
  };
  selectedNode: { id: string; type: string; label: string } | null;
  severityCounts: Record<Severity, number>;
  eventTypeCounts: { financial: number; nonFinancial: number };
  actualExposure: { gross: AmountFact; recovery: AmountFact; net: AmountFact };
  potentialExposure: AmountFact;
  delays: { detection: DelayFact; recording: DelayFact; occurrenceToRecord: DelayFact };
  operational: { affectedRecords: AmountFact; remediationHours: AmountFact };
  distributions: { status: LabelCount[]; stage: LabelCount[] };
  topOrganisations: LabelCount[];
  topIssues: LabelCount[];
  topRootCauses: LabelCount[];
  topRiskThemes: LabelCount[];
  topOrCategories: LabelCount[];
  topOwners: LabelCount[];
  topAssignees: LabelCount[];
  recurrence: { distinctIssues: number; mostRepeatedIssue: LabelCount | null };
  representativeEvents: RepresentativeEvent[];
  evidenceEventIds: string[];
}

function summariseAmount(values: Array<number | null>): AmountFact {
  let total = 0;
  let contributingCount = 0;
  for (const value of values) {
    if (value === null || value === undefined) continue;
    total += value;
    contributingCount += 1;
  }
  return { total: contributingCount === 0 ? null : total, contributingCount };
}

function summariseDelay(values: number[]): DelayFact {
  if (values.length === 0) return { average: null, median: null, max: null };
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2 : (sorted[middle] ?? 0);
  return {
    average: values.reduce((sum, value) => sum + value, 0) / values.length,
    median,
    max: sorted[sorted.length - 1] ?? null,
  };
}

function topCounts(events: BrainEvent[], pick: (event: BrainEvent) => string, limit = 8): LabelCount[] {
  const counts = new Map<string, number>();
  for (const event of events) {
    const label = pick(event);
    if (!label) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Array.from(counts, ([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

const SEVERITY_RANK: Record<Severity, number> = { High: 3, Moderate: 2, Low: 1 };

/**
 * Ranks events so the sample handed to the model is the most
 * investigation-relevant slice, with a stable tiebreak so the same scope
 * always produces the same prompt.
 */
function rankForSampling(a: BrainEvent, b: BrainEvent): number {
  const severity = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
  if (severity !== 0) return severity;
  const potential = (b.potential_impact_amount_usd ?? 0) - (a.potential_impact_amount_usd ?? 0);
  if (potential !== 0) return potential;
  const actual = (b.net_amount_usd ?? 0) - (a.net_amount_usd ?? 0);
  if (actual !== 0) return actual;
  const delay = b.occurrence_to_record_days - a.occurrence_to_record_days;
  if (delay !== 0) return delay;
  return a.event_id.localeCompare(b.event_id);
}

/**
 * Turns a client-submitted scope into verified, server-computed facts.
 *
 * The client is trusted only for *which* events it is looking at — never
 * for what those events mean. Every ID is checked against the canonical
 * dataset, IDs unconnected to the selected node are dropped, and all
 * metrics are recomputed here so the model can never be fed numbers the
 * browser invented.
 */
export function buildInvestigationContext(
  data: CanonicalBrainData,
  input: { selectedNodeId?: string | null; eventIds: string[] },
): InvestigationContext {
  const requestedEventCount = input.eventIds.length;

  const unknownIds = input.eventIds.filter((eventId) => !data.eventsById.has(eventId));
  if (unknownIds.length > 0) {
    throw new ApiError(400, "UNKNOWN_EVENT_IDS", "One or more submitted event IDs do not exist in the dataset.", {
      unknownEventIds: unknownIds.slice(0, 10),
      unknownCount: unknownIds.length,
    });
  }

  let selectedNode: InvestigationContext["selectedNode"] = null;
  let scopedEventIds = Array.from(new Set(input.eventIds));

  if (input.selectedNodeId) {
    const node = data.nodesById.get(input.selectedNodeId);
    if (!node) {
      throw new ApiError(400, "UNKNOWN_NODE_ID", "The selected node does not exist in the dataset.");
    }
    selectedNode = { id: node.id, type: node.type, label: node.label };

    const nodeEvents = new Set(data.nodeToEvents.get(node.id) ?? []);
    const connected = scopedEventIds.filter((eventId) => nodeEvents.has(eventId));
    if (connected.length === 0) {
      throw new ApiError(
        400,
        "NODE_SCOPE_MISMATCH",
        "None of the submitted events are connected to the selected node.",
      );
    }
    scopedEventIds = connected;
  }

  scopedEventIds.sort();
  const events = scopedEventIds.map((eventId) => data.eventsById.get(eventId)!);

  const severityCounts: Record<Severity, number> = { Low: 0, Moderate: 0, High: 0 };
  const statusCounts = new Map<string, number>();
  const stageCounts = new Map<string, number>();
  let financial = 0;
  let earliest = events[0]?.occurrence_date ?? null;
  let latest = events[0]?.occurrence_date ?? null;

  for (const event of events) {
    severityCounts[event.severity] += 1;
    statusCounts.set(event.status, (statusCounts.get(event.status) ?? 0) + 1);
    stageCounts.set(event.stage, (stageCounts.get(event.stage) ?? 0) + 1);
    if (event.event_type === "Financial") financial += 1;
    if (earliest && event.occurrence_date < earliest) earliest = event.occurrence_date;
    if (latest && event.occurrence_date > latest) latest = event.occurrence_date;
  }

  const asLabelCounts = (counts: Map<string, number>): LabelCount[] =>
    Array.from(counts, ([label, count]) => ({ label, count })).sort(
      (a, b) => b.count - a.count || a.label.localeCompare(b.label),
    );

  const topIssues = topCounts(events, (event) => event.issue_detail);
  const representativeEvents = [...events]
    .sort(rankForSampling)
    .slice(0, config.ai.maxEventSamples)
    .map((event) => ({
      eventId: event.event_id,
      occurrenceDate: event.occurrence_date,
      severity: event.severity,
      eventType: event.event_type,
      ownerOrganisation: event.owner_organisation,
      issue: event.issue_detail,
      rootCause: event.root_cause,
      status: event.status,
      netAmountUsd: event.net_amount_usd,
      potentialImpactUsd: event.potential_impact_amount_usd,
      occurrenceToRecordDays: event.occurrence_to_record_days,
    }));

  return {
    scope: {
      eventCount: events.length,
      requestedEventCount,
      droppedEventCount: requestedEventCount - events.length,
      occurrenceDateRange: earliest && latest ? { earliest, latest } : null,
    },
    selectedNode,
    severityCounts,
    eventTypeCounts: { financial, nonFinancial: events.length - financial },
    actualExposure: {
      gross: summariseAmount(events.map((event) => event.gross_amount_usd)),
      recovery: summariseAmount(events.map((event) => event.recovery_amount_usd)),
      net: summariseAmount(events.map((event) => event.net_amount_usd)),
    },
    potentialExposure: summariseAmount(events.map((event) => event.potential_impact_amount_usd)),
    delays: {
      detection: summariseDelay(events.map((event) => event.detection_delay_days)),
      recording: summariseDelay(events.map((event) => event.recording_delay_days)),
      occurrenceToRecord: summariseDelay(events.map((event) => event.occurrence_to_record_days)),
    },
    operational: {
      affectedRecords: summariseAmount(events.map((event) => event.affected_records)),
      remediationHours: summariseAmount(events.map((event) => event.remediation_hours)),
    },
    distributions: { status: asLabelCounts(statusCounts), stage: asLabelCounts(stageCounts) },
    topOrganisations: topCounts(events, (event) => event.owner_organisation),
    topIssues,
    topRootCauses: topCounts(events, (event) => event.root_cause),
    topRiskThemes: topCounts(events, (event) => event.risk_theme),
    topOrCategories: topCounts(events, (event) => event.or_category),
    topOwners: topCounts(events, (event) => event.owner_name),
    topAssignees: topCounts(events, (event) => event.current_assignee),
    recurrence: {
      distinctIssues: new Set(events.map((event) => event.issue_detail)).size,
      mostRepeatedIssue: topIssues[0] ?? null,
    },
    representativeEvents,
    evidenceEventIds: scopedEventIds,
  };
}
