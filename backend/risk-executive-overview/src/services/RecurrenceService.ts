import type { RiskEvent } from "../types/RiskEvent";
import { uniqueValues } from "../utils/aggregation";

export type RecurrenceCase =
  | "same_person_same_issue"
  | "multiple_people_same_issue_same_organisation"
  | "same_issue_multiple_organisations"
  | "none";

export interface RecurrenceFacts {
  ownerCount: number;
  ownerNames: string[];
  assigneeCount: number;
  assigneeNames: string[];
  organisationCount: number;
  organisations: string[];
  distinctIssueCount: number;
  recurrenceCase: RecurrenceCase;
  interpretation: string;
}

/**
 * Guardrail language mirroring the spec verbatim (Section 8 / 35). Repeated
 * owners or assignees are described as workflow concentration, never
 * personal blame — this is the ONLY place that language should be composed,
 * so both the Risk Detail response and the AI fact package stay consistent.
 */
export const RECURRENCE_INTERPRETATION: Record<RecurrenceCase, string> = {
  same_person_same_issue: "Repeated occurrence within this individual's assigned or owned workflow.",
  multiple_people_same_issue_same_organisation:
    "The recurrence across multiple people may indicate a shared process or control pattern within the business unit.",
  same_issue_multiple_organisations:
    "The scenario may represent a broader enterprise-level pattern rather than an isolated team issue.",
  none: "No single recurring issue pattern was identified in this selection.",
};

export function computeRecurrenceFacts(sliceEvents: readonly RiskEvent[]): RecurrenceFacts {
  const ownerNames = uniqueValues(sliceEvents, (event) => event.ownerName);
  const assigneeNames = uniqueValues(sliceEvents, (event) => event.currentAssignee);
  const organisations = uniqueValues(sliceEvents, (event) => event.ownerOrganisation);
  const distinctIssues = uniqueValues(sliceEvents, (event) => event.issueDetail);

  const distinctIssueCount = distinctIssues.length;
  const ownerCount = ownerNames.length;
  const organisationCount = organisations.length;

  let recurrenceCase: RecurrenceCase = "none";
  if (distinctIssueCount === 1) {
    if (organisationCount > 1) {
      recurrenceCase = "same_issue_multiple_organisations";
    } else if (ownerCount > 1) {
      recurrenceCase = "multiple_people_same_issue_same_organisation";
    } else if (ownerCount === 1 && sliceEvents.length > 1) {
      recurrenceCase = "same_person_same_issue";
    }
  }

  return {
    ownerCount,
    ownerNames,
    assigneeCount: assigneeNames.length,
    assigneeNames,
    organisationCount,
    organisations,
    distinctIssueCount,
    recurrenceCase,
    interpretation: RECURRENCE_INTERPRETATION[recurrenceCase],
  };
}
