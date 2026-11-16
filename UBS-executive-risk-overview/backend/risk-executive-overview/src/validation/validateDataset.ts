import { EXPECTED_TOTAL_EVENTS } from "../config/constants.js";
import type { RiskEvent } from "../types/RiskEvent.js";
import type { RiskConfig } from "../types/Config.js";
import type { RiskPattern } from "../types/Pattern.js";

const REQUIRED_STRING_FIELDS: Array<keyof RiskEvent> = [
  "eventId",
  "title",
  "eventType",
  "severity",
  "status",
  "stage",
  "occurrenceDate",
  "ownerOrganisation",
  "ownerName",
  "currentAssignee",
  "issueDetail",
  "rootCause",
];

const VALID_EVENT_TYPES = new Set(["Financial", "Non-Financial"]);
const VALID_SEVERITIES = new Set(["Low", "Moderate", "High"]);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Fails server startup (rather than surfacing broken data at request time)
 * when the source-of-truth assets don't match the shape Component 1's
 * calculations depend on. Anchors mirror the dataset's known regression
 * counts so a bad regeneration is caught immediately.
 */
export function validateDataset(events: readonly RiskEvent[], patterns: readonly RiskPattern[], config: RiskConfig): void {
  const errors: string[] = [];

  if (events.length !== EXPECTED_TOTAL_EVENTS) {
    errors.push(`Expected ${EXPECTED_TOTAL_EVENTS} events, found ${events.length}`);
  }

  const seenIds = new Set<string>();
  for (const event of events) {
    for (const field of REQUIRED_STRING_FIELDS) {
      if (event[field] == null || event[field] === "") {
        errors.push(`Event ${event.eventId ?? "<unknown>"} missing required field "${field}"`);
      }
    }

    if (event.eventId) {
      if (seenIds.has(event.eventId)) {
        errors.push(`Duplicate eventId "${event.eventId}"`);
      }
      seenIds.add(event.eventId);
    }

    if (event.eventType && !VALID_EVENT_TYPES.has(event.eventType)) {
      errors.push(`Event ${event.eventId} has invalid eventType "${event.eventType}"`);
    }

    if (event.severity && !VALID_SEVERITIES.has(event.severity)) {
      errors.push(`Event ${event.eventId} has invalid severity "${event.severity}"`);
    }

    if (event.occurrenceDate && !ISO_DATE_RE.test(event.occurrenceDate)) {
      errors.push(`Event ${event.eventId} has non-ISO occurrenceDate "${event.occurrenceDate}"`);
    }
  }

  const seenPatternIds = new Set<string>();
  for (const pattern of patterns) {
    if (seenPatternIds.has(pattern.patternId)) {
      errors.push(`Duplicate patternId "${pattern.patternId}"`);
    }
    seenPatternIds.add(pattern.patternId);

    for (const eventId of pattern.eventIds) {
      if (!seenIds.has(eventId)) {
        errors.push(`Pattern ${pattern.patternId} references unknown eventId "${eventId}"`);
      }
    }
  }

  if (!config?.businessRules?.openBacklog?.excludedStatuses?.length) {
    errors.push("Config is missing businessRules.openBacklog.excludedStatuses");
  }

  if (errors.length > 0) {
    throw new Error(`Dataset validation failed:\n${errors.slice(0, 25).join("\n")}${errors.length > 25 ? `\n...and ${errors.length - 25} more` : ""}`);
  }
}
