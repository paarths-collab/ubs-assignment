import type { PatternType } from "./Pattern";

export type ReasonCode =
  | "HIGH_SEVERITY_PRESENT"
  | "MULTIPLE_HIGH_EVENTS"
  | "HIGH_OPEN_BACKLOG"
  | "HIGH_NET_EXPOSURE"
  | "HIGH_POTENTIAL_IMPACT"
  | "CROSS_OWNER_RECURRENCE"
  | "CROSS_ASSIGNEE_RECURRENCE"
  | "CROSS_ORGANISATION_RECURRENCE"
  | "CONCENTRATED_EXPOSURE"
  | "HIGH_REMEDIATION_EFFORT";

/** The pattern's own grouping keys — what this signal is actually scoped to. */
export interface PriorityScope {
  issueDetail: string | null;
  ownerOrganisation: string | null;
  ownerName: string | null;
  currentAssignee: string | null;
}

export interface PrioritySignal {
  patternId: string;
  patternType: PatternType;
  label: string;
  scope: PriorityScope;

  eventCount: number;
  highSeverityCount: number;
  openEventCount: number;
  severityCounts: Record<string, number>;

  grossAmountUsd: number | null;
  recoveryAmountUsd: number | null;
  netAmountUsd: number | null;
  recoveryRate: number | null;
  potentialImpactUsd: number | null;
  remediationHours: number;

  organisationCount: number;
  ownerCount: number;
  assigneeCount: number;
  organisations: string[];
  ownerNames: string[];
  assigneeNames: string[];

  rootCauses: string[];
  firstOccurrence: string;
  lastOccurrence: string;

  shareOfFilteredEvents: number;
  shareOfFilteredNetExposure: number | null;
  shareOfFilteredPotentialImpact: number | null;

  reasonCodes: ReasonCode[];
  eventIds: string[];
}
