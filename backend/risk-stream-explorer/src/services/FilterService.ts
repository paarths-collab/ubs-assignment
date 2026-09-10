import type { StreamEvent } from "../types/Event.js";
import type { FilterState } from "../types/Filters.js";
import { compareIsoDate } from "../utils/dateUtils.js";

/**
 * The single filtering pipeline used everywhere in the app. Every component
 * (timeline, period summary, day sequence, cards, AI narration) must derive
 * its event set by calling this function with the same FilterState so results
 * can never disagree with each other.
 */
export function applyFilters(events: StreamEvent[], filters: FilterState): StreamEvent[] {
  return events.filter((event) => {
    if (filters.organisation !== null && event.ownerOrganisation !== filters.organisation) {
      return false;
    }
    if (filters.severity !== null && event.severity !== filters.severity) {
      return false;
    }
    if (filters.eventType !== null && event.eventType !== filters.eventType) {
      return false;
    }
    if (filters.riskTheme !== null && event.riskTheme !== filters.riskTheme) {
      return false;
    }
    if (filters.dateStart !== null && compareIsoDate(event.occurrenceDate, filters.dateStart) < 0) {
      return false;
    }
    if (filters.dateEnd !== null && compareIsoDate(event.occurrenceDate, filters.dateEnd) > 0) {
      return false;
    }
    return true;
  });
}

export function filterByDateRange(events: StreamEvent[], startDate: string, endDate: string): StreamEvent[] {
  return events.filter(
    (event) =>
      compareIsoDate(event.occurrenceDate, startDate) >= 0 &&
      compareIsoDate(event.occurrenceDate, endDate) <= 0,
  );
}
