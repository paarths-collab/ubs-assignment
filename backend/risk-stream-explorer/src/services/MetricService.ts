import type { EventType, Severity, StreamEvent } from "../types/Event.js";
import type { CategoryBreakdown, DelayMetrics, PeriodMetrics } from "../types/Metrics.js";
import { SEVERITY_VALUES, EVENT_TYPE_VALUES, shortOrganisationName } from "../config/constants.js";
import { mean, median } from "../utils/dateUtils.js";
import { computeFinancialMetrics } from "./FinancialService.js";

export function breakdownByKey(
  events: StreamEvent[],
  keySelector: (e: StreamEvent) => string,
  limit?: number,
): CategoryBreakdown[] {
  const counts = new Map<string, number>();
  for (const event of events) {
    const key = keySelector(event);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const total = events.length;
  const sorted = [...counts.entries()]
    .map(([key, count]) => ({ key, count, share: total > 0 ? count / total : null }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  return limit !== undefined ? sorted.slice(0, limit) : sorted;
}

function countBySeverity(events: StreamEvent[]): Record<Severity, number> {
  const counts = { Low: 0, Moderate: 0, High: 0 } as Record<Severity, number>;
  for (const event of events) counts[event.severity] += 1;
  return counts;
}

function countByEventType(events: StreamEvent[]): Record<EventType, number> {
  const counts = { Financial: 0, "Non-Financial": 0 } as Record<EventType, number>;
  for (const event of events) counts[event.eventType] += 1;
  return counts;
}

function sharesOf<K extends string>(counts: Record<K, number>, total: number): Record<K, number | null> {
  const result = {} as Record<K, number | null>;
  for (const key of Object.keys(counts) as K[]) {
    result[key] = total > 0 ? counts[key] / total : null;
  }
  return result;
}

function computeDelayMetrics(events: StreamEvent[]): DelayMetrics {
  const detection = events.map((e) => e.detectionDelayDays).filter((v): v is number => v !== null);
  const recording = events.map((e) => e.recordingDelayDays).filter((v): v is number => v !== null);
  const occToRecord = events
    .map((e) => e.occurrenceToRecordDays)
    .filter((v): v is number => v !== null);

  return {
    averageDetectionDelayDays: mean(detection),
    medianDetectionDelayDays: median(detection),
    averageRecordingDelayDays: mean(recording),
    medianRecordingDelayDays: median(recording),
    averageOccurrenceToRecordDays: mean(occToRecord),
    medianOccurrenceToRecordDays: median(occToRecord),
    populatedCount: occToRecord.length,
    totalEventCount: events.length,
  };
}

export interface PeriodMeta {
  periodId: string;
  label: string;
  startDate: string;
  endDate: string;
}

/**
 * Computes the complete, verified fact set for an arbitrary set of events
 * (a time bucket, a hand-picked date range, a single day — anything). This is
 * the one function that produces authoritative numbers; nothing else in the
 * app is allowed to recompute counts, shares, or money totals independently.
 */
export function computePeriodMetrics(events: StreamEvent[], meta: PeriodMeta): PeriodMetrics {
  const severityCounts = countBySeverity(events);
  const eventTypeCounts = countByEventType(events);

  return {
    periodId: meta.periodId,
    label: meta.label,
    startDate: meta.startDate,
    endDate: meta.endDate,

    eventCount: events.length,

    severityCounts,
    severityShares: sharesOf(severityCounts, events.length),

    eventTypeCounts,
    eventTypeShares: sharesOf(eventTypeCounts, events.length),

    riskThemeBreakdown: breakdownByKey(events, (e) => e.riskTheme),
    organisationBreakdown: breakdownByKey(events, (e) => shortOrganisationName(e.ownerOrganisation)),
    rootCauseBreakdown: breakdownByKey(events, (e) => e.rootCause),
    issueDetailBreakdown: breakdownByKey(events, (e) => e.issueDetail),

    financial: computeFinancialMetrics(events),
    delays: computeDelayMetrics(events),
  };
}

export { SEVERITY_VALUES, EVENT_TYPE_VALUES };
