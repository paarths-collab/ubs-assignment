import type { BrainDataModel, BrainEvent, Severity } from "./types";

/**
 * A summed money/quantity figure. `total` is null when no event in scope
 * carried a value at all — which is materially different from a total of
 * zero, and must never be rendered as "$0".
 */
export interface AmountSummary {
  total: number | null;
  /** How many events in scope actually carried a value. */
  contributingCount: number;
}

export interface DelaySummary {
  average: number | null;
  median: number | null;
  max: number | null;
}

export interface Metrics {
  eventCount: number;

  severityCounts: Record<Severity, number>;
  severityPercentages: Record<Severity, number>;

  financialCount: number;
  nonFinancialCount: number;

  /** Actual financial exposure — only Financial events carry these. */
  grossAmount: AmountSummary;
  netAmount: AmountSummary;
  recoveryAmount: AmountSummary;
  /** Potential exposure is a separate concept and must never be merged with actual. */
  potentialImpact: AmountSummary;

  detectionDelay: DelaySummary;
  recordingDelay: DelaySummary;
  occurrenceToRecord: DelaySummary;

  affectedRecords: AmountSummary;
  remediationHours: AmountSummary;

  statusCounts: Record<string, number>;
  stageCounts: Record<string, number>;
}

function summariseAmount(values: Array<number | null>): AmountSummary {
  let total = 0;
  let contributingCount = 0;
  for (const value of values) {
    if (value === null) continue;
    total += value;
    contributingCount += 1;
  }
  return { total: contributingCount === 0 ? null : total, contributingCount };
}

function summariseDelay(values: Array<number | null>): DelaySummary {
  const present = values.filter((value): value is number => value !== null).sort((a, b) => a - b);
  if (present.length === 0) return { average: null, median: null, max: null };

  const sum = present.reduce((accumulator, value) => accumulator + value, 0);
  const middle = Math.floor(present.length / 2);
  const median =
    present.length % 2 === 0 ? ((present[middle - 1] ?? 0) + (present[middle] ?? 0)) / 2 : (present[middle] ?? 0);

  return { average: sum / present.length, median, max: present[present.length - 1] ?? null };
}

function increment(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

/**
 * The single deterministic metrics function. Everything the analyst sees —
 * and everything the AI is later given as authoritative fact — is computed
 * here from a concrete set of event IDs, never estimated or inferred.
 */
export function calculateMetrics(data: BrainDataModel, eventIds: Iterable<string>): Metrics {
  const events: BrainEvent[] = [];
  for (const eventId of eventIds) {
    const event = data.eventsById.get(eventId);
    if (event) events.push(event);
  }

  const severityCounts: Record<Severity, number> = { Low: 0, Moderate: 0, High: 0 };
  const statusCounts: Record<string, number> = {};
  const stageCounts: Record<string, number> = {};
  let financialCount = 0;

  for (const event of events) {
    severityCounts[event.severity] += 1;
    increment(statusCounts, event.status);
    increment(stageCounts, event.stage);
    if (event.event_type === "Financial") financialCount += 1;
  }

  const eventCount = events.length;
  const percentage = (count: number): number => (eventCount === 0 ? 0 : (count / eventCount) * 100);

  return {
    eventCount,
    severityCounts,
    severityPercentages: {
      Low: percentage(severityCounts.Low),
      Moderate: percentage(severityCounts.Moderate),
      High: percentage(severityCounts.High),
    },
    financialCount,
    nonFinancialCount: eventCount - financialCount,

    grossAmount: summariseAmount(events.map((event) => event.gross_amount_usd)),
    netAmount: summariseAmount(events.map((event) => event.net_amount_usd)),
    recoveryAmount: summariseAmount(events.map((event) => event.recovery_amount_usd)),
    potentialImpact: summariseAmount(events.map((event) => event.potential_impact_amount_usd)),

    detectionDelay: summariseDelay(events.map((event) => event.detection_delay_days)),
    recordingDelay: summariseDelay(events.map((event) => event.recording_delay_days)),
    occurrenceToRecord: summariseDelay(events.map((event) => event.occurrence_to_record_days)),

    affectedRecords: summariseAmount(events.map((event) => event.affected_records)),
    remediationHours: summariseAmount(events.map((event) => event.remediation_hours)),

    statusCounts,
    stageCounts,
  };
}
