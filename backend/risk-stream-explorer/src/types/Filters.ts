import type { EventType, Severity } from "./Event.js";

export type GroupByDimension = "riskTheme" | "severity" | "organisation" | "eventType";
export type Granularity = "month" | "week";

/**
 * The single filter state applied consistently across the whole experience:
 * timeline, period summary, day sequence, event cards, and AI narration all
 * derive from the same filtered event set.
 */
export interface FilterState {
  organisation: string | null;
  severity: Severity | null;
  eventType: EventType | null;
  riskTheme: string | null;
  dateStart: string | null;
  dateEnd: string | null;
}

export const EMPTY_FILTER_STATE: FilterState = {
  organisation: null,
  severity: null,
  eventType: null,
  riskTheme: null,
  dateStart: null,
  dateEnd: null,
};

export function isFilterActive(filters: FilterState): boolean {
  return (
    filters.organisation !== null ||
    filters.severity !== null ||
    filters.eventType !== null ||
    filters.riskTheme !== null ||
    filters.dateStart !== null ||
    filters.dateEnd !== null
  );
}

/** Stable cache key for a given filter + granularity + groupBy combination. */
export function filterCacheKey(
  filters: FilterState,
  granularity: Granularity,
  groupBy: GroupByDimension,
): string {
  return [
    granularity,
    groupBy,
    filters.organisation ?? "",
    filters.severity ?? "",
    filters.eventType ?? "",
    filters.riskTheme ?? "",
    filters.dateStart ?? "",
    filters.dateEnd ?? "",
  ].join("|");
}
