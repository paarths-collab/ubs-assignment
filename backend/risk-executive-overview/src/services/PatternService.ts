import type { RiskPattern } from "../types/Pattern";
import type { RiskEvent } from "../types/RiskEvent";
import type { RiskRepository } from "../repositories/RiskRepository";

export interface FilteredPattern {
  pattern: RiskPattern;
  events: RiskEvent[];
}

/**
 * Intersects a pattern's membership with the currently filtered event set
 * and resolves the surviving Event IDs to full event records. Every fact
 * about a pattern (counts, exposure, severity mix, recurrence) must be
 * recalculated from this intersection — never from the pattern's original,
 * unfiltered membership.
 */
export function resolveFilteredPattern(
  pattern: RiskPattern,
  filteredEventIds: ReadonlySet<string>,
  repository: RiskRepository,
): FilteredPattern {
  const matchingIds = pattern.eventIds.filter((id) => filteredEventIds.has(id));
  return { pattern, events: repository.getEventsByIds(matchingIds) };
}

/** Human-readable label for a pattern, shared by priority signals and the AI fact package. */
export function buildPatternLabel(pattern: RiskPattern): string {
  const issue = pattern.group.issueDetail ?? "Unlabeled issue";

  switch (pattern.patternType) {
    case "organisation_issue":
      return `${pattern.group.ownerOrganisation ?? "Unknown organisation"}: ${issue}`;
    case "owner_issue":
      return `${pattern.group.ownerName ?? "Unknown owner"}: ${issue}`;
    case "assignee_issue":
      return `${pattern.group.currentAssignee ?? "Unknown assignee"}: ${issue}`;
    case "cross_organisation_issue":
      return `${issue} (across ${pattern.organisations?.length ?? "multiple"} organisations)`;
    case "issue":
    default:
      return issue;
  }
}

export function resolveAllFilteredPatterns(
  patterns: readonly RiskPattern[],
  filteredEventIds: ReadonlySet<string>,
  repository: RiskRepository,
): FilteredPattern[] {
  return patterns
    .map((pattern) => resolveFilteredPattern(pattern, filteredEventIds, repository))
    .filter((filtered) => filtered.events.length > 0);
}
