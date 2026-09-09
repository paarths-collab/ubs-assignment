import type { RiskEvent } from "../types/RiskEvent";
import type { RiskConfig } from "../types/Config";
import type { FilterInput, NormalizedFilters } from "../schemas/filters.schema";
import { AppError } from "../utils/errors";

export const ENTERPRISE_WIDE = "Enterprise-wide";

/**
 * Resolves a client-supplied filter into the normalized shape every
 * analytical service consumes, validating organisation and date bounds
 * against the config-driven source of truth rather than trusting the client.
 */
export function normalizeFilters(input: FilterInput, config: RiskConfig): NormalizedFilters {
  const { organisation, eventType, severity } = input;

  if (organisation !== ENTERPRISE_WIDE && !config.filters.organisations.includes(organisation)) {
    throw new AppError("INVALID_FILTER", `Unknown organisation "${organisation}"`);
  }

  const dateFrom = input.dateFrom ?? config.dateRange.min;
  const dateTo = input.dateTo ?? config.dateRange.max;

  if (dateFrom > dateTo) {
    throw new AppError("INVALID_DATE_RANGE", `dateFrom (${dateFrom}) is after dateTo (${dateTo})`);
  }

  return { organisation, dateFrom, dateTo, eventType, severity };
}

/**
 * The single filtering implementation every endpoint must go through so all
 * KPI/priority/detail responses stay consistent for a given filter state.
 * Order: Organisation -> Occurrence Date -> Event Type -> Severity.
 */
export function filterEvents(events: readonly RiskEvent[], filters: NormalizedFilters): RiskEvent[] {
  return events.filter((event) => {
    if (filters.organisation !== ENTERPRISE_WIDE && event.ownerOrganisation !== filters.organisation) {
      return false;
    }

    if (event.occurrenceDate < filters.dateFrom || event.occurrenceDate > filters.dateTo) {
      return false;
    }

    if (filters.eventType !== "All" && event.eventType !== filters.eventType) {
      return false;
    }

    if (filters.severity !== "All" && event.severity !== filters.severity) {
      return false;
    }

    return true;
  });
}
