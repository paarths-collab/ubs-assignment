import type { StreamEvent } from "../types/Event";
import type { Period } from "../types/Timeline";
import type { PeriodComparison } from "../types/Metrics";
import { SEVERITY_STACK_ORDER } from "../config/constants";
import { compareIsoDate } from "../utils/dateUtils";
import { computePeriodMetrics } from "./MetricService";
import { comparePeriods } from "./ComparisonService";
import { getEventsInPeriod, getPreviousPeriod } from "./TimelineService";

export interface DayBucket {
  date: string;
  events: StreamEvent[];
}

export interface PeriodDetail {
  period: Period;
  comparison: PeriodComparison;
  days: DayBucket[];
}

const severityRank = new Map(SEVERITY_STACK_ORDER.map((s, i) => [s, i]));

function sortWithinDay(events: StreamEvent[]): StreamEvent[] {
  return [...events].sort((a, b) => {
    const rankDiff = (severityRank.get(b.severity) ?? 0) - (severityRank.get(a.severity) ?? 0);
    if (rankDiff !== 0) return rankDiff;
    return a.eventId.localeCompare(b.eventId);
  });
}

function groupByDay(events: StreamEvent[]): DayBucket[] {
  const byDate = new Map<string, StreamEvent[]>();
  for (const event of events) {
    const bucket = byDate.get(event.occurrenceDate) ?? [];
    bucket.push(event);
    byDate.set(event.occurrenceDate, bucket);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => compareIsoDate(a, b))
    .map(([date, dayEvents]) => ({ date, events: sortWithinDay(dayEvents) }));
}

export interface DatasetBounds {
  earliestOccurrenceDate: string;
  latestOccurrenceDate: string;
}

/**
 * Builds everything the period-selection UI needs from one call: the
 * period's verified metrics, its comparison against the previous comparable
 * period (using the SAME active filters on both sides), and its day-by-day
 * event sequence. Days with zero matching events are simply absent.
 *
 * `datasetBounds` (the repository's true, filter-independent occurrence-date
 * span) decides whether a previous period with zero *filtered* events is a
 * legitimate "went to zero" comparison versus a period that falls entirely
 * outside recorded data ("no baseline" / isNew) — the filtered event set alone
 * can't tell those two apart.
 */
export function getPeriodDetail(
  filteredEvents: StreamEvent[],
  period: Period,
  datasetBounds: DatasetBounds,
): PeriodDetail {
  const periodEvents = getEventsInPeriod(filteredEvents, period);
  const currentMetrics = computePeriodMetrics(periodEvents, {
    periodId: period.id,
    label: period.label,
    startDate: period.startDate,
    endDate: period.endDate,
  });

  const previousPeriod = getPreviousPeriod(period);
  const previousPeriodWithinDataset =
    compareIsoDate(previousPeriod.startDate, datasetBounds.latestOccurrenceDate) <= 0 &&
    compareIsoDate(previousPeriod.endDate, datasetBounds.earliestOccurrenceDate) >= 0;
  const previousEvents = getEventsInPeriod(filteredEvents, previousPeriod);
  const previousMetrics = previousPeriodWithinDataset
    ? computePeriodMetrics(previousEvents, {
        periodId: previousPeriod.id,
        label: previousPeriod.label,
        startDate: previousPeriod.startDate,
        endDate: previousPeriod.endDate,
      })
    : null;

  return {
    period,
    comparison: comparePeriods(currentMetrics, previousMetrics),
    days: groupByDay(periodEvents),
  };
}
