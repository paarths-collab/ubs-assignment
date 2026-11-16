export type EventType = "Financial" | "Non-Financial";
export type Severity = "Low" | "Moderate" | "High";

export interface RiskEvent {
  eventId: string;
  title: string;
  description: string;
  eventType: EventType;
  severity: Severity;

  rootCause: string;
  rootCauseDetail: string;
  riskTheme: string;
  orCategory: string;

  grossAmountUsd: number | null;
  netAmountUsd: number | null;
  recoveryAmountUsd: number | null;
  potentialImpactUsd: number | null;
  provisionStatus: string;

  status: string;
  stage: string;

  occurrenceDate: string;
  discoveredDate: string;
  createdOn: string;
  modifiedOn: string;

  ownerOrganisation: string;
  discoveryOrganisation: string;
  ownerName: string;
  currentAssignee: string;
  creatorName: string;
  administratorName: string;
  modifiedByName: string;

  backgroundDetail: string;
  issueDetail: string;
  impactDetail: string;
  opportunity: string;
  impactsRaw: string;

  detectionDelayDays: number;
  recordingDelayDays: number;
  occurrenceToRecordDays: number;

  /** Authoritative, cleaned remediation-hours figure. Do not re-derive from `impactsRaw`. */
  remediationHours: number;
  /** Audit-only figure from the conflicting narrative field. Never used in calculations. */
  remediationHoursFromImpactsField: number;
}
