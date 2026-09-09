import type { NormalizedFilters } from "../schemas/filters.schema";
import type { RecurrenceFacts } from "../services/RecurrenceService";
import type { DelayStats } from "../utils/statistics";

/**
 * The complete verified fact package handed to the LLM. Field names mirror
 * `risk_ai_config_overview.json`'s `allowedInputFields` exactly — the model
 * is only ever shown fields from this shape, and every value here is
 * calculated by the same deterministic services the rest of the API uses.
 */
export interface AiFactPackage {
  selectionType: string;
  selectionLabel: string;
  filters: NormalizedFilters;

  eventIds: string[];
  eventCount: number;

  severityCounts: Record<string, number>;
  highSeverityCount: number;
  openEventCount: number;

  grossAmountUsd: number | null;
  recoveryAmountUsd: number | null;
  netAmountUsd: number | null;
  recoveryRate: number | null;
  potentialImpactUsd: number | null;
  remediationHours: number;

  ownerOrganisations: string[];
  ownerNames: string[];
  assigneeNames: string[];

  issueDetails: string[];
  rootCauses: string[];
  riskThemes: string[];
  orCategories: string[];

  statusCounts: Record<string, number>;
  stageCounts: Record<string, number>;

  detectionDelay: DelayStats | null;
  recordingDelay: DelayStats | null;
  occurrenceToRecordDelay: DelayStats | null;

  recurrenceFacts: RecurrenceFacts;

  patternType: string | null;
  patternId: string | null;
}
