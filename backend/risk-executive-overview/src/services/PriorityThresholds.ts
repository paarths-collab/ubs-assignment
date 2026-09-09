/**
 * Deterministic evidence thresholds behind each priority reason code.
 * Named and exported (rather than inlined) so they read as an auditable
 * policy and so tests can assert behaviour at the boundary.
 */
export const PRIORITY_THRESHOLDS = {
  /** "Multiple" high-severity events, distinct from merely "present". */
  multipleHighSeverityCount: 3,
  /** Open backlog is only flagged when it's both a real count and a majority of the slice. */
  highOpenBacklogCount: 5,
  highOpenBacklogShare: 0.5,
  highNetExposureUsd: 100_000,
  highPotentialImpactUsd: 250_000,
  /** Recurrence needs breadth (3+), not just two occurrences, to read as a pattern rather than coincidence. */
  crossOwnerRecurrenceCount: 3,
  crossAssigneeRecurrenceCount: 3,
  crossOrganisationRecurrenceCount: 2,
  /** A slice holds a disproportionate share of filtered exposure relative to its share of events. */
  concentratedExposureShare: 0.15,
  highRemediationHours: 100,
} as const;

export const DEFAULT_PRIORITY_LIMIT = 9;
