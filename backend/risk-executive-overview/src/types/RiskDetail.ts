import type { FinancialFacts } from "../services/FinancialFacts";
import type { RecurrenceFacts } from "../services/RecurrenceService";
import type { DelayStats } from "../utils/statistics";

export type RiskDetailSelection =
  | { type: "pattern"; patternId: string }
  | { type: "kpi"; kpiId: string }
  | { type: "issue"; issueDetail: string }
  | { type: "period"; dateFrom: string; dateTo: string }
  | { type: "eventIds"; eventIds: string[] };

export interface IssueSummary {
  issueDetail: string;
  eventCount: number;
}

export interface RiskDetailResponse {
  selection: RiskDetailSelection;
  summary: {
    eventCount: number;
  };
  severity: Record<string, number>;
  ownership: {
    organisationCount: number;
    organisations: string[];
    ownerCount: number;
    owners: string[];
    assigneeCount: number;
    assignees: string[];
  };
  recurrence: RecurrenceFacts;
  financial: FinancialFacts;
  operationalImpact: {
    remediationHours: number;
    potentialImpactUsd: number | null;
  };
  workflow: {
    statusCounts: Record<string, number>;
    stageCounts: Record<string, number>;
    openEventCount: number;
    closedEventCount: number;
  };
  timeliness: {
    detectionDelayDays: DelayStats | null;
    recordingDelayDays: DelayStats | null;
    occurrenceToRecordDays: DelayStats | null;
  };
  issues: IssueSummary[];
  evidence: {
    eventIds: string[];
    patternId: string | null;
  };
}
