import type { RawFullEventDetailMap, RawStreamEvent, RawStreamEventList } from "../types/Event";
import { EVENT_TYPE_VALUES, SEVERITY_VALUES } from "../config/constants";
import { assertFieldRegistryComplete } from "../config/fieldRegistry";
import { isValidIsoDate } from "../utils/dateUtils";

export interface ValidationIssue {
  severity: "error" | "warning";
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

function isNumberOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function validateRawStreamEvent(event: RawStreamEvent, index: number, issues: ValidationIssue[]): void {
  const where = `events_streamgraph[${index}] (${event.event_id ?? "unknown id"})`;

  if (!event.event_id || typeof event.event_id !== "string") {
    issues.push({ severity: "error", message: `${where}: missing or invalid event_id` });
  }
  if (!event.event_title || typeof event.event_title !== "string") {
    issues.push({ severity: "error", message: `${where}: missing event_title` });
  }
  if (!isValidIsoDate(event.occurrence_date)) {
    issues.push({ severity: "error", message: `${where}: invalid occurrence_date "${event.occurrence_date}"` });
  }
  if (event.discovered_date !== null && !isValidIsoDate(event.discovered_date)) {
    issues.push({ severity: "error", message: `${where}: invalid discovered_date "${event.discovered_date}"` });
  }
  if (!EVENT_TYPE_VALUES.includes(event.event_type)) {
    issues.push({ severity: "error", message: `${where}: invalid event_type "${event.event_type}"` });
  }
  if (!SEVERITY_VALUES.includes(event.severity)) {
    issues.push({ severity: "error", message: `${where}: invalid severity "${event.severity}"` });
  }
  if (!event.owner_organisation) {
    issues.push({ severity: "error", message: `${where}: missing owner_organisation` });
  }
  if (!event.risk_theme) {
    issues.push({ severity: "error", message: `${where}: missing risk_theme` });
  }
  const moneyFields: (keyof RawStreamEvent)[] = [
    "gross_amount",
    "net_amount",
    "recovery_amount",
    "potential_impact",
  ];
  for (const field of moneyFields) {
    if (!isNumberOrNull(event[field])) {
      issues.push({ severity: "error", message: `${where}: ${field} must be number or null, got ${JSON.stringify(event[field])}` });
    }
  }
  const delayFields: (keyof RawStreamEvent)[] = [
    "detection_delay_days",
    "recording_delay_days",
    "occurrence_to_record_days",
  ];
  for (const field of delayFields) {
    if (!isNumberOrNull(event[field])) {
      issues.push({ severity: "warning", message: `${where}: ${field} must be number or null, got ${JSON.stringify(event[field])}` });
    }
  }
}

export function validateDataset(
  rawEvents: RawStreamEventList,
  rawDetails: RawFullEventDetailMap,
  rawAi: unknown,
): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!Array.isArray(rawEvents) || rawEvents.length === 0) {
    return { valid: false, issues: [{ severity: "error", message: "events_streamgraph.json is empty or not an array" }] };
  }
  if (!rawDetails || typeof rawDetails !== "object") {
    return { valid: false, issues: [{ severity: "error", message: "event_details_streamgraph.json is missing or malformed" }] };
  }

  const seenIds = new Set<string>();
  rawEvents.forEach((event, index) => {
    validateRawStreamEvent(event, index, issues);
    if (event.event_id) {
      if (seenIds.has(event.event_id)) {
        issues.push({ severity: "error", message: `Duplicate event_id "${event.event_id}" at index ${index}` });
      }
      seenIds.add(event.event_id);
    }
  });

  for (const id of seenIds) {
    if (!(id in rawDetails)) {
      issues.push({ severity: "error", message: `Event "${id}" present in events_streamgraph.json but missing from event_details_streamgraph.json` });
    }
  }
  for (const id of Object.keys(rawDetails)) {
    if (!seenIds.has(id)) {
      issues.push({ severity: "warning", message: `Event "${id}" present in event_details_streamgraph.json but missing from events_streamgraph.json` });
    }
  }

  const sampleDetail = Object.values(rawDetails)[0];
  if (sampleDetail) {
    try {
      assertFieldRegistryComplete(Object.keys(sampleDetail));
    } catch (err) {
      issues.push({ severity: "error", message: (err as Error).message });
    }
  }

  if (!rawAi || typeof rawAi !== "object") {
    issues.push({ severity: "warning", message: "event_ai_streamgraph.json is missing or malformed; AI narration will fall back to deterministic generation only" });
  }

  const hasErrors = issues.some((i) => i.severity === "error");
  return { valid: !hasErrors, issues };
}
