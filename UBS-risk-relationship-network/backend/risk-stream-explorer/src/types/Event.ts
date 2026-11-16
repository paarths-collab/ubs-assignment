export type Severity = "Low" | "Moderate" | "High";
export type EventType = "Financial" | "Non-Financial";

export const SEVERITY_ORDER: readonly Severity[] = ["High", "Moderate", "Low"];
export const EVENT_TYPE_ORDER: readonly EventType[] = ["Financial", "Non-Financial"];

/**
 * Raw shape of one record in events_streamgraph.json, exactly as authored
 * (snake_case keys, ISO date strings, numeric money fields already parsed).
 */
export interface RawStreamEvent {
  event_id: string;
  event_title: string;
  occurrence_date: string;
  discovered_date: string | null;
  event_type: EventType;
  severity: Severity;
  owner_organisation: string;
  discovery_organisation: string;
  risk_theme: string;
  root_cause: string;
  or_category: string;
  event_status: string;
  event_stage: string;
  provision_status: string | null;
  gross_amount: number | null;
  net_amount: number | null;
  recovery_amount: number | null;
  potential_impact: number | null;
  detection_delay_days: number | null;
  recording_delay_days: number | null;
  occurrence_to_record_days: number | null;
  issue_detail: string;
}

/**
 * Normalized, camelCase, application-internal representation of a risk event
 * used by every filtering/aggregation/rendering code path. This is the single
 * source of truth for lightweight (timeline-scale) event data.
 */
export interface StreamEvent {
  eventId: string;
  eventTitle: string;

  occurrenceDate: string;
  discoveredDate: string | null;

  eventType: EventType;
  severity: Severity;

  ownerOrganisation: string;
  discoveryOrganisation: string;

  riskTheme: string;
  rootCause: string;
  orCategory: string;

  eventStatus: string;
  eventStage: string;
  provisionStatus: string | null;

  grossAmount: number | null;
  netAmount: number | null;
  recoveryAmount: number | null;
  potentialImpact: number | null;

  detectionDelayDays: number | null;
  recordingDelayDays: number | null;
  occurrenceToRecordDays: number | null;

  issueDetail: string;
}

/**
 * Exact key set of one record in event_details_streamgraph.json. Money fields
 * are pre-formatted display strings (e.g. "$10,000.00"); everything else is a
 * plain string or number, all nullable per-field except identifiers.
 * NOTE: the potential-impact key has two spaces before "(USD)" in the source data.
 */
export interface RawFullEventDetail {
  "Event ID": string;
  "Event Title": string;
  "Event Description": string | null;
  "Event Type": EventType;
  "Overall Event Classification": Severity;
  "Event Gross Amount (USD)": string | null;
  "Event Net Amount (USD)": string | null;
  "Event Recovery Amount (USD)": string | null;
  "Event Potential Impact Amount  (USD)": string | null;
  "Provision Status": string | null;
  "Event Status": string | null;
  "Event Stage": string | null;
  "Date Event Discovered": string | null;
  "Event Occurrence Date": string;
  "Event Owner Organisation": string;
  "Event Creator Name": string | null;
  "Event Administrator Name": string | null;
  "Event Owner Name": string | null;
  "Discovery Organisation": string | null;
  "Root Cause": string | null;
  "Risk Theme": string | null;
  "OR Category": string | null;
  "Current Assignee": string | null;
  "Created On": string | null;
  "Modified By Name": string | null;
  "Modified On": string | null;
  "Impacts": string | null;
  "Background Detail": string | null;
  "Issue Detail": string | null;
  "Root Cause Detail": string | null;
  "Impact Detail": string | null;
  "Opportunity": string | null;
  "Detection Delay Days": number | null;
  "Recording Delay Days": number | null;
  "Occurrence to Record Days": number | null;
}

export type RawFullEventDetailMap = Record<string, RawFullEventDetail>;
export type RawStreamEventList = RawStreamEvent[];
