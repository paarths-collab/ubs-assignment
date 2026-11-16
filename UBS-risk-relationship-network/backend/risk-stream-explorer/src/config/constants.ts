import type { EventType, Severity } from "../types/Event";

/** Known-true facts about the shipped dataset, used by validation and regression tests. */
export const DATASET_REGRESSION_TRUTHS = {
  totalEvents: 1000,
  eventTypeCounts: { Financial: 239, "Non-Financial": 761 } as Record<EventType, number>,
  severityCounts: { Low: 705, Moderate: 244, High: 51 } as Record<Severity, number>,
  occurrenceDateStart: "2024-09-01",
  occurrenceDateEnd: "2026-08-31",
  organisationCount: 12,
  rootCauseCount: 7,
} as const;

export const SEVERITY_VALUES: readonly Severity[] = ["Low", "Moderate", "High"];
export const EVENT_TYPE_VALUES: readonly EventType[] = ["Financial", "Non-Financial"];

/** Fixed display/stack ordering so series never jump position between renders. */
export const SEVERITY_STACK_ORDER: readonly Severity[] = ["Low", "Moderate", "High"];
export const EVENT_TYPE_STACK_ORDER: readonly EventType[] = ["Non-Financial", "Financial"];

export const TOP_N_BREAKDOWN = 5;
export const SIMILAR_EVENTS_LIMIT = 5;

/** The common organisational suffix present on every owner/discovery organisation value. */
export const ORGANISATION_SUFFIX = " → Fictional Enterprise Operations";

export function shortOrganisationName(fullName: string): string {
  return fullName.endsWith(ORGANISATION_SUFFIX)
    ? fullName.slice(0, -ORGANISATION_SUFFIX.length)
    : fullName;
}
