import type { EnterpriseBaseline, RiskEvent, RiskEventsDataset } from "../src/types/RiskEvent";
import type { GroqFactPayload, Pattern, RiskPatternsDataset } from "../src/types/Pattern";

let eventCounter = 0;
let patternCounter = 0;

export function makeEnterpriseBaseline(overrides: Partial<EnterpriseBaseline> = {}): EnterpriseBaseline {
  return {
    event_count: 1000,
    severity_counts: { Low: 705, Moderate: 244, High: 51 },
    high_rate: 0.051,
    high_rate_pct: 5.1,
    open_event_count: 721,
    open_rate: 0.721,
    open_rate_pct: 72.1,
    detection_delay_mean_days: 2.46,
    detection_delay_median_days: 1.0,
    recording_delay_mean_days: 3.61,
    recording_delay_median_days: 3.0,
    occurrence_to_record_mean_days: 6.07,
    occurrence_to_record_median_days: 5.0,
    gross_amount_total: 2512564.44,
    net_amount_total: 1746532.7,
    recovery_amount_total: 766031.74,
    potential_impact_total: 21549693.02,
    occurrence_date_min: "2024-09-01",
    occurrence_date_max: "2026-08-31",
    ...overrides,
  };
}

export function makeRiskEvent(overrides: Partial<RiskEvent> = {}): RiskEvent {
  eventCounter += 1;
  const id = `SIM-TEST-${String(eventCounter).padStart(4, "0")}`;
  return {
    event_id: id,
    title: `Test Org / Test City / Test issue ${id}`,
    issue: "Test issue",
    event_type: "Non-Financial",
    classification: "Low",
    financial: {
      gross_amount: null,
      net_amount_reported: null,
      recovery_amount_reported: null,
      net_amount_for_analysis: null,
      recovery_amount_for_analysis: null,
      potential_impact: 10000,
      provision_status: "Not Required",
    },
    workflow: {
      status: "Closed",
      stage: "Closed",
      is_open: false,
      owner_organisation: "Test Org → Fictional Enterprise Operations",
      owner_organisation_short: "Test Org",
      owner_name: "Test Owner",
      current_assignee: "Test Assignee",
      creator_name: "Test Creator",
      administrator_name: "Test Admin",
      discovery_organisation: "Test Org",
      modified_by_name: "Test Owner",
    },
    risk: {
      root_cause: "Process / Control Design Gap",
      risk_theme: "Technology Resilience",
      or_category: "Internal Control and Governance",
    },
    timeline: {
      occurrence_date: "2026-01-15",
      discovered_date: "2026-01-20",
      created_on: "2026-01-22",
      modified_on: "2026-01-25",
      occurrence_month: "2026-01",
      detection_delay_days: 5,
      recording_delay_days: 2,
      occurrence_to_record_days: 7,
    },
    narrative: {
      background_detail: "Fully simulated background for an internship assessment.",
      issue_detail: "A test issue occurred.",
      root_cause_detail: "Simulated root cause detail.",
      impact_detail: "Simulated impact detail.",
      opportunity: "Add a test control.",
      impacts_raw: "Synthetic impact: 1 test record.",
    },
    ...overrides,
  };
}

export function makeGroqFactPayload(overrides: Partial<GroqFactPayload> = {}, patternId = "PAT-TEST-0001"): GroqFactPayload {
  return {
    pattern_id: patternId,
    pattern_type: "combination",
    title: "Test pattern",
    observed: {
      event_count: 4,
      severity: { Low: 1, Moderate: 1, High: 2 },
      high_rate: 0.5,
      high_rate_pct: 50.0,
      enterprise_high_rate: 0.051,
      enterprise_high_rate_pct: 5.1,
      high_rate_lift: 9.8,
      open_events: 3,
      open_rate: 0.75,
      gross_amount: 1000,
      net_amount: 900,
      recovery_amount: 100,
      potential_impact: 5000,
      detection_delay_mean_days: 3.0,
      detection_delay_median_days: 2.0,
      recording_delay_mean_days: 4.0,
      recording_delay_median_days: 3.0,
      occurrence_to_record_mean_days: 7.0,
      occurrence_to_record_median_days: 6.0,
    },
    compared_with_enterprise: {
      high_rate_lift: 9.8,
      high_rate_delta_pct_points: 44.9,
      detection_delay_delta_days: 0.5,
      recording_delay_delta_days: 0.4,
      occurrence_to_record_delta_days: 0.9,
    },
    dimensions: { issue: "Test issue", root_cause: "Test root cause" },
    matching_event_ids: ["SIM-TEST-0001", "SIM-TEST-0002", "SIM-TEST-0003", "SIM-TEST-0004"],
    narrative_context: {
      issue_details: ["A test issue narrative."],
      root_cause_details: ["A test root cause narrative."],
      opportunities: ["Add a test control."],
    },
    ...overrides,
  };
}

export function makePattern(overrides: Partial<Pattern> = {}): Pattern {
  patternCounter += 1;
  const id = `PAT-TEST-${String(patternCounter).padStart(4, "0")}`;
  const payload = makeGroqFactPayload({}, id);
  return {
    pattern_id: id,
    pattern_type: payload.pattern_type,
    title: payload.title,
    why_seen: "Issue × Root Cause behaves differently from the enterprise baseline.",
    priority_level: "High",
    priority_reasons: ["HIGH_CLASSIFICATION_CONCENTRATION", "COMBINATION_PATTERN"],
    dimensions: payload.dimensions,
    observed: payload.observed,
    compared_with_enterprise: payload.compared_with_enterprise,
    graph_filter: { issue: ["Test issue"], root_cause: ["Test root cause"] },
    matching_event_ids: payload.matching_event_ids,
    narrative_context: payload.narrative_context,
    groq_fact_payload: payload,
    ...overrides,
  };
}

export function makeEventsDataset(events: RiskEvent[], overrides: Partial<RiskEventsDataset> = {}): RiskEventsDataset {
  return {
    schema_version: 1.0,
    source_file: "test.csv",
    definitions: {},
    enterprise: makeEnterpriseBaseline(),
    events,
    ...overrides,
  };
}

export function makePatternsDataset(
  patterns: Pattern[],
  priorityQueue: string[],
  overrides: Partial<RiskPatternsDataset> = {},
): RiskPatternsDataset {
  return {
    schema_version: 1.0,
    source_file: "test.csv",
    purpose: "test",
    definitions: {},
    enterprise: makeEnterpriseBaseline(),
    data_quality: {
      operational_impact_pattern_maker_enabled: false,
      reason: "test",
      safe_fields_preserved: [],
    },
    priority_queue: priorityQueue,
    pattern_count: patterns.length,
    patterns,
    priority_queue_metadata: {
      original_count: priorityQueue.length,
      deduplicated_count: priorityQueue.length,
      deduplication_rule: "test",
      removed_duplicate_pattern_ids: [],
      duplicate_of: {},
    },
    pattern_maker_status: {},
    ...overrides,
  };
}

export function resetRiskFixtureCounters(): void {
  eventCounter = 0;
  patternCounter = 0;
}
