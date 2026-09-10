import type { RawFullEventDetail, RawFullEventDetailMap, StreamEvent } from "../types/Event.js";
import { compareIsoDate, getMonthBounds, getWeekBounds, parseIsoDate } from "../utils/dateUtils.js";

/**
 * Owns the normalized event list and every index derived from it. Built once
 * at startup; all downstream services read through this repository rather
 * than re-scanning the raw array.
 */
export class EventRepository {
  private readonly events: StreamEvent[];
  private readonly detailsById: RawFullEventDetailMap;
  private readonly byId: Map<string, StreamEvent>;
  private readonly byMonthId: Map<string, StreamEvent[]>;
  private readonly byWeekId: Map<string, StreamEvent[]>;
  private readonly sortedByOccurrence: StreamEvent[];

  constructor(events: StreamEvent[], detailsById: RawFullEventDetailMap) {
    this.events = events;
    this.detailsById = detailsById;

    this.byId = new Map();
    this.byMonthId = new Map();
    this.byWeekId = new Map();

    for (const event of events) {
      this.byId.set(event.eventId, event);

      const date = parseIsoDate(event.occurrenceDate);
      const { monthId } = getMonthBounds(date);
      const { mondayDate } = getWeekBounds(date);

      const monthBucket = this.byMonthId.get(monthId) ?? [];
      monthBucket.push(event);
      this.byMonthId.set(monthId, monthBucket);

      const weekBucket = this.byWeekId.get(mondayDate) ?? [];
      weekBucket.push(event);
      this.byWeekId.set(mondayDate, weekBucket);
    }

    this.sortedByOccurrence = [...events].sort((a, b) =>
      compareIsoDate(a.occurrenceDate, b.occurrenceDate),
    );
  }

  getAll(): StreamEvent[] {
    return this.events;
  }

  getAllSortedByOccurrence(): StreamEvent[] {
    return this.sortedByOccurrence;
  }

  count(): number {
    return this.events.length;
  }

  getById(eventId: string): StreamEvent | null {
    return this.byId.get(eventId) ?? null;
  }

  getDetailById(eventId: string): RawFullEventDetail | null {
    return this.detailsById[eventId] ?? null;
  }

  getByMonthId(monthId: string): StreamEvent[] {
    return this.byMonthId.get(monthId) ?? [];
  }

  getByWeekMondayId(mondayDate: string): StreamEvent[] {
    return this.byWeekId.get(mondayDate) ?? [];
  }

  getDistinctOrganisations(): string[] {
    return [...new Set(this.events.map((e) => e.ownerOrganisation))].sort();
  }

  getDistinctRiskThemes(): string[] {
    return [...new Set(this.events.map((e) => e.riskTheme))].sort();
  }

  getEarliestOccurrenceDate(): string | null {
    return this.sortedByOccurrence[0]?.occurrenceDate ?? null;
  }

  getLatestOccurrenceDate(): string | null {
    return this.sortedByOccurrence[this.sortedByOccurrence.length - 1]?.occurrenceDate ?? null;
  }
}
