import type { BrainDataModel, BrainEvent, FilterDimension } from "./types";
import type { FilterState, NumericRangeFilter } from "./app-state";

type CategoricalRule = { filterKey: keyof FilterState | "advanced"; advancedKey?: keyof FilterState["advanced"]; dimension: FilterDimension };

const CATEGORICAL_RULES: CategoricalRule[] = [
  { filterKey: "eventType", dimension: "event_type" },
  { filterKey: "severity", dimension: "severity" },
  { filterKey: "status", dimension: "status" },
  { filterKey: "stage", dimension: "stage" },
  { filterKey: "ownerOrganisation", dimension: "owner_organisation" },
  { filterKey: "discoveryOrganisation", dimension: "discovery_organisation" },
  { filterKey: "owner", dimension: "owner_name" },
  { filterKey: "assignee", dimension: "current_assignee" },
  { filterKey: "issue", dimension: "issue_detail" },
  { filterKey: "rootCause", dimension: "root_cause" },
  { filterKey: "riskTheme", dimension: "risk_theme" },
  { filterKey: "orCategory", dimension: "or_category" },
  { filterKey: "advanced", advancedKey: "creator", dimension: "creator_name" },
  { filterKey: "advanced", advancedKey: "administrator", dimension: "administrator_name" },
  { filterKey: "advanced", advancedKey: "modifiedBy", dimension: "modified_by_name" },
  { filterKey: "advanced", advancedKey: "provisionStatus", dimension: "provision_status" },
];

type NumericRule = { filterKey: keyof FilterState; eventField: keyof BrainEvent };

const NUMERIC_RULES: NumericRule[] = [
  { filterKey: "grossAmount", eventField: "gross_amount_usd" },
  { filterKey: "netAmount", eventField: "net_amount_usd" },
  { filterKey: "potentialImpact", eventField: "potential_impact_amount_usd" },
  { filterKey: "detectionDelay", eventField: "detection_delay_days" },
  { filterKey: "recordingDelay", eventField: "recording_delay_days" },
  { filterKey: "occurrenceToRecord", eventField: "occurrence_to_record_days" },
  { filterKey: "affectedRecords", eventField: "affected_records" },
  { filterKey: "remediationHours", eventField: "remediation_hours" },
];

function intersect(a: Set<string>, b: Set<string>): Set<string> {
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  const result = new Set<string>();
  for (const id of smaller) {
    if (larger.has(id)) result.add(id);
  }
  return result;
}

function unionOfValues(byValue: Record<string, string[]>, values: string[]): Set<string> {
  const result = new Set<string>();
  for (const value of values) {
    for (const id of byValue[value] ?? []) {
      result.add(id);
    }
  }
  return result;
}

function isWithinNumericRange(value: number | null, range: NumericRangeFilter): boolean {
  if (value === null) return false;
  if (range.min !== null && value < range.min) return false;
  if (range.max !== null && value > range.max) return false;
  return true;
}

/**
 * Computes the single filtered event ID set that every downstream widget
 * (graph, metrics, inspector, event table, AI context) must consume.
 * Multi-select values within one dimension are OR'd; dimensions are AND'd.
 */
export function computeFilteredEventIds(data: BrainDataModel, filters: FilterState): Set<string> {
  let candidateIds = data.allEventIds;

  for (const rule of CATEGORICAL_RULES) {
    const values = rule.filterKey === "advanced" ? filters.advanced[rule.advancedKey!] : (filters[rule.filterKey] as string[]);
    if (!values || values.length === 0) continue;
    const byValue = data.filterEventIds[rule.dimension] ?? {};
    candidateIds = intersect(candidateIds, unionOfValues(byValue, values));
    if (candidateIds.size === 0) return candidateIds;
  }

  const { from, to } = filters.occurrenceDate;
  if (from || to) {
    const next = new Set<string>();
    for (const id of candidateIds) {
      const event = data.eventsById.get(id);
      if (!event) continue;
      if (from && event.occurrence_date < from) continue;
      if (to && event.occurrence_date > to) continue;
      next.add(id);
    }
    candidateIds = next;
    if (candidateIds.size === 0) return candidateIds;
  }

  for (const rule of NUMERIC_RULES) {
    const range = filters[rule.filterKey] as NumericRangeFilter;
    if (range.min === null && range.max === null) continue;
    const next = new Set<string>();
    for (const id of candidateIds) {
      const event = data.eventsById.get(id);
      if (!event) continue;
      const value = event[rule.eventField] as number | null;
      if (isWithinNumericRange(value, range)) next.add(id);
    }
    candidateIds = next;
    if (candidateIds.size === 0) return candidateIds;
  }

  return candidateIds;
}
