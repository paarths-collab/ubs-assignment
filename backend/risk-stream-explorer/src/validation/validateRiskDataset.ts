import type { RiskEventsDataset } from "../types/RiskEvent.js";
import type { RiskPatternsDataset } from "../types/Pattern.js";
import type { ValidationIssue, ValidationResult } from "./validateDataset.js";

const EXPECTED_EVENT_COUNT = 1000;
const EXPECTED_PATTERN_COUNT = 137;
const EXPECTED_PRIORITY_QUEUE_LENGTH = 22;

/**
 * Startup validation for Component 4's dataset pair. Mirrors the strictness
 * of `validateDataset.ts` (Component 2/3): every cross-reference between the
 * two files must resolve, or the server refuses to start. This is the only
 * thing standing between a malformed/hand-edited data file and a runtime
 * `undefined` reaching the API — deliberately fail fast instead.
 */
export function validateRiskDataset(
  eventsDataset: RiskEventsDataset,
  patternsDataset: RiskPatternsDataset,
): ValidationResult {
  const issues: ValidationIssue[] = [];

  const events = eventsDataset?.events;
  if (!Array.isArray(events)) {
    return { valid: false, issues: [{ severity: "error", message: "risk_events_final.json: `events` is missing or not an array" }] };
  }
  if (events.length !== EXPECTED_EVENT_COUNT) {
    issues.push({
      severity: "error",
      message: `risk_events_final.json: expected ${EXPECTED_EVENT_COUNT} events, got ${events.length}`,
    });
  }

  const eventIds = new Set<string>();
  events.forEach((event, index) => {
    if (!event?.event_id || typeof event.event_id !== "string") {
      issues.push({ severity: "error", message: `risk_events_final.json: events[${index}] missing event_id` });
      return;
    }
    if (eventIds.has(event.event_id)) {
      issues.push({ severity: "error", message: `risk_events_final.json: duplicate event_id "${event.event_id}" at index ${index}` });
    }
    eventIds.add(event.event_id);
  });

  const patterns = patternsDataset?.patterns;
  if (!Array.isArray(patterns)) {
    return { valid: false, issues: [...issues, { severity: "error", message: "risk_patterns_final.json: `patterns` is missing or not an array" }] };
  }

  const patternIds = new Set<string>();
  patterns.forEach((pattern, index) => {
    if (!pattern?.pattern_id || typeof pattern.pattern_id !== "string") {
      issues.push({ severity: "error", message: `risk_patterns_final.json: patterns[${index}] missing pattern_id` });
      return;
    }
    if (patternIds.has(pattern.pattern_id)) {
      issues.push({ severity: "error", message: `risk_patterns_final.json: duplicate pattern_id "${pattern.pattern_id}" at index ${index}` });
    }
    patternIds.add(pattern.pattern_id);
  });

  if (patternIds.size !== EXPECTED_PATTERN_COUNT) {
    issues.push({
      severity: "error",
      message: `risk_patterns_final.json: expected ${EXPECTED_PATTERN_COUNT} unique pattern IDs, got ${patternIds.size}`,
    });
  }

  const priorityQueue = patternsDataset?.priority_queue ?? [];
  if (priorityQueue.length !== EXPECTED_PRIORITY_QUEUE_LENGTH) {
    issues.push({
      severity: "error",
      message: `risk_patterns_final.json: expected ${EXPECTED_PRIORITY_QUEUE_LENGTH} priority_queue entries, got ${priorityQueue.length}`,
    });
  }
  for (const patternId of priorityQueue) {
    if (!patternIds.has(patternId)) {
      issues.push({ severity: "error", message: `risk_patterns_final.json: priority_queue references unknown pattern_id "${patternId}"` });
    }
  }

  for (const pattern of patterns) {
    if (!pattern?.pattern_id) continue;
    const matchingIds = pattern.matching_event_ids ?? [];
    for (const eventId of matchingIds) {
      if (!eventIds.has(eventId)) {
        issues.push({
          severity: "error",
          message: `risk_patterns_final.json: pattern "${pattern.pattern_id}" matching_event_ids references unknown event_id "${eventId}"`,
        });
      }
    }

    const matchingSet = new Set(matchingIds);
    const payloadIds = pattern.groq_fact_payload?.matching_event_ids ?? [];
    for (const eventId of payloadIds) {
      if (!matchingSet.has(eventId)) {
        issues.push({
          severity: "error",
          message: `risk_patterns_final.json: pattern "${pattern.pattern_id}" groq_fact_payload.matching_event_ids contains "${eventId}", which is not in its own matching_event_ids`,
        });
      }
    }
  }

  const hasErrors = issues.some((issue) => issue.severity === "error");
  return { valid: !hasErrors, issues };
}
