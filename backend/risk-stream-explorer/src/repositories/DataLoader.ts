import type {
  RawFullEventDetailMap,
  RawStreamEvent,
  RawStreamEventList,
  StreamEvent,
} from "../types/Event.js";
import { validateDataset, type ValidationResult } from "../validation/validateDataset.js";

export interface LoadedDataset {
  events: StreamEvent[];
  detailsById: RawFullEventDetailMap;
  aiData: unknown;
  validation: ValidationResult;
}

function normalizeEvent(raw: RawStreamEvent): StreamEvent {
  return {
    eventId: raw.event_id,
    eventTitle: raw.event_title,
    occurrenceDate: raw.occurrence_date,
    discoveredDate: raw.discovered_date,
    eventType: raw.event_type,
    severity: raw.severity,
    ownerOrganisation: raw.owner_organisation,
    discoveryOrganisation: raw.discovery_organisation,
    riskTheme: raw.risk_theme,
    rootCause: raw.root_cause,
    orCategory: raw.or_category,
    eventStatus: raw.event_status,
    eventStage: raw.event_stage,
    provisionStatus: raw.provision_status,
    grossAmount: raw.gross_amount,
    netAmount: raw.net_amount,
    recoveryAmount: raw.recovery_amount,
    potentialImpact: raw.potential_impact,
    detectionDelayDays: raw.detection_delay_days,
    recordingDelayDays: raw.recording_delay_days,
    occurrenceToRecordDays: raw.occurrence_to_record_days,
    issueDetail: raw.issue_detail,
  };
}

/**
 * Validates the three raw JSON payloads and normalizes events_streamgraph.json
 * into the application's internal StreamEvent shape. Throws only when the
 * dataset fails hard validation (errors, not warnings) — callers should check
 * `validation.issues` for warnings regardless of the outcome.
 */
export function loadDataset(
  rawEvents: RawStreamEventList,
  rawDetails: RawFullEventDetailMap,
  rawAi: unknown,
): LoadedDataset {
  const validation = validateDataset(rawEvents, rawDetails, rawAi);
  if (!validation.valid) {
    const message = validation.issues
      .filter((i) => i.severity === "error")
      .map((i) => i.message)
      .join("\n");
    throw new Error(`Dataset validation failed:\n${message}`);
  }

  const events = rawEvents.map(normalizeEvent);

  return { events, detailsById: rawDetails, aiData: rawAi, validation };
}
