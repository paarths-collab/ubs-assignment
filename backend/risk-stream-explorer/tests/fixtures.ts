import type { StreamEvent } from "../src/types/Event";

let counter = 0;

export function makeEvent(overrides: Partial<StreamEvent> = {}): StreamEvent {
  counter += 1;
  return {
    eventId: `SIM-TEST-${String(counter).padStart(4, "0")}`,
    eventTitle: "Test Event",
    occurrenceDate: "2026-01-15",
    discoveredDate: "2026-01-20",
    eventType: "Non-Financial",
    severity: "Low",
    ownerOrganisation: "Summit Payments → Fictional Enterprise Operations",
    discoveryOrganisation: "Summit Payments → Fictional Enterprise Operations",
    riskTheme: "Technology Resilience",
    rootCause: "Process / Control Design Gap",
    orCategory: "Internal Control and Governance",
    eventStatus: "Closed",
    eventStage: "Closed",
    provisionStatus: null,
    grossAmount: null,
    netAmount: null,
    recoveryAmount: null,
    potentialImpact: null,
    detectionDelayDays: 3,
    recordingDelayDays: 2,
    occurrenceToRecordDays: 5,
    issueDetail: "A test issue occurred.",
    ...overrides,
  };
}

export function resetCounter(): void {
  counter = 0;
}
