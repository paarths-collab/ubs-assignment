import type { RiskEvent } from "../src/types/RiskEvent";
import type { RiskConfig } from "../src/types/Config";

let counter = 0;

export function makeEvent(overrides: Partial<RiskEvent> = {}): RiskEvent {
  counter += 1;
  return {
    eventId: `SIM-TEST-${String(counter).padStart(4, "0")}`,
    title: "Test event",
    description: "Test event description",
    eventType: "Non-Financial",
    severity: "Low",

    rootCause: "Process / Control Design Gap",
    rootCauseDetail: "Test root cause detail",
    riskTheme: "Technology Resilience",
    orCategory: "Internal Control and Governance",

    grossAmountUsd: null,
    netAmountUsd: null,
    recoveryAmountUsd: null,
    potentialImpactUsd: null,
    provisionStatus: "Not Required",

    status: "Active",
    stage: "Initial Assessment",

    occurrenceDate: "2025-06-15",
    discoveredDate: "2025-06-16",
    createdOn: "2025-06-17",
    modifiedOn: "2025-06-18",

    ownerOrganisation: "Summit Payments → Fictional Enterprise Operations",
    discoveryOrganisation: "Riverbend Advisory Operations",
    ownerName: "Test Owner",
    currentAssignee: "Test Assignee",
    creatorName: "Test Creator",
    administratorName: "Test Administrator",
    modifiedByName: "Test Modifier",

    backgroundDetail: "Test background",
    issueDetail: "A test issue occurred.",
    impactDetail: "Test impact detail",
    opportunity: "Test opportunity",
    impactsRaw: "Synthetic impact: test",

    detectionDelayDays: 3,
    recordingDelayDays: 2,
    occurrenceToRecordDays: 5,

    remediationHours: 10,
    remediationHoursFromImpactsField: 99,

    ...overrides,
  };
}

export function resetCounter(): void {
  counter = 0;
}

export function makeConfig(overrides: Partial<RiskConfig> = {}): RiskConfig {
  return {
    schemaVersion: 1,
    component: "Executive Risk Overview",
    recordCount: 0,
    globalDateField: "occurrenceDate",
    dateRange: { min: "2024-09-01", max: "2026-08-31" },
    filters: {
      organisations: [
        "Enterprise-wide",
        "Summit Payments → Fictional Enterprise Operations",
        "Northstar Advisory Services → Fictional Enterprise Operations",
      ],
      eventTypes: ["All", "Financial", "Non-Financial"],
      severities: ["All", "Low", "Moderate", "High"],
      statuses: ["Active", "Cancelled", "Closed", "Fully Validated", "Pending Closure", "Remediation in Progress", "Under Investigation"],
      stages: ["Closure Review", "Complete", "Fact Finding", "Initial Assessment", "Remediation", "Validation"],
      rootCauses: ["Process / Control Design Gap"],
      riskThemes: ["Technology Resilience"],
      orCategories: ["Internal Control and Governance"],
    },
    businessRules: {
      openBacklog: {
        definition: "All events except Closed and Cancelled",
        excludedStatuses: ["Closed", "Cancelled"],
      },
      financialAmounts: {
        financialEventType: "Financial",
        nonFinancialStructuralNullFields: ["grossAmountUsd", "netAmountUsd", "recoveryAmountUsd"],
        missingAmountBehaviour: "null_not_zero",
      },
      recoveryRate: {
        formula: "sum(recoveryAmountUsd) / sum(grossAmountUsd)",
        scope: "Financial events only",
        zeroGrossBehaviour: "null",
      },
      remediationHours: {
        authoritativeSource: "Impact Detail",
        parsedField: "remediationHours",
        auditSource: "Impacts",
        reason: "Impact Detail is also represented in Event Description.",
      },
      peopleRecurrence: { interpretation: "workflow_concentration_not_personal_blame" },
    },
    kpis: [
      { id: "totalEvents", label: "Total Events", calculation: "count(filteredEvents)" },
      { id: "highSeverityEvents", label: "High-Severity Events", calculation: "count(severity == High)" },
      { id: "openBacklog", label: "Open Backlog", calculation: "count(status not in excludedStatuses)" },
      { id: "grossExposure", label: "Gross Loss / Exposure", calculation: "sum(grossAmountUsd)" },
      { id: "netExposure", label: "Net Loss / Exposure", calculation: "sum(netAmountUsd)" },
      { id: "recoveryRate", label: "Recovery Rate", calculation: "sum(recoveryAmountUsd)/sum(grossAmountUsd)" },
      { id: "potentialImpact", label: "Potential Impact", calculation: "sum(potentialImpactUsd)" },
      { id: "remediationHours", label: "Remediation Hours", calculation: "sum(remediationHours)" },
    ],
    ...overrides,
  };
}
