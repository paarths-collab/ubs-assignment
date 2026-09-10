import type { EventType, Severity } from "./Event.js";

/**
 * Types for `data/risk_events_final.json` (Component 4's dataset). This is a
 * distinct dataset from Component 2/3's `events_streamgraph.json` — same
 * enterprise, richer per-event shape (nested financial/workflow/risk/timeline/
 * narrative groups) — so it gets its own type file rather than overloading
 * `StreamEvent`. `EventType`/`Severity` are shared because the value sets are
 * identical ("Financial" | "Non-Financial", "Low" | "Moderate" | "High").
 */

export interface RiskEventFinancial {
  gross_amount: number | null;
  net_amount_reported: number | null;
  recovery_amount_reported: number | null;
  net_amount_for_analysis: number | null;
  recovery_amount_for_analysis: number | null;
  potential_impact: number | null;
  provision_status: string | null;
}

export interface RiskEventWorkflow {
  status: string;
  stage: string;
  is_open: boolean;
  owner_organisation: string;
  owner_organisation_short: string;
  owner_name: string;
  current_assignee: string;
  creator_name: string;
  administrator_name: string;
  discovery_organisation: string;
  modified_by_name: string;
}

export interface RiskEventRisk {
  root_cause: string;
  risk_theme: string;
  or_category: string;
}

export interface RiskEventTimeline {
  occurrence_date: string;
  discovered_date: string | null;
  created_on: string | null;
  modified_on: string | null;
  occurrence_month: string;
  detection_delay_days: number | null;
  recording_delay_days: number | null;
  occurrence_to_record_days: number | null;
}

export interface RiskEventNarrative {
  background_detail: string | null;
  issue_detail: string | null;
  root_cause_detail: string | null;
  impact_detail: string | null;
  opportunity: string | null;
  impacts_raw: string | null;
}

/** One record of `risk_events_final.json`'s `events` array. */
export interface RiskEvent {
  event_id: string;
  title: string;
  issue: string;
  event_type: EventType;
  classification: Severity;
  financial: RiskEventFinancial;
  workflow: RiskEventWorkflow;
  risk: RiskEventRisk;
  timeline: RiskEventTimeline;
  narrative: RiskEventNarrative;
}

/** Enterprise-wide baseline stats, shared verbatim between both Component 4 data files. */
export interface EnterpriseBaseline {
  event_count: number;
  severity_counts: Record<string, number>;
  high_rate: number;
  high_rate_pct: number;
  open_event_count: number;
  open_rate: number;
  open_rate_pct: number;
  detection_delay_mean_days: number;
  detection_delay_median_days: number;
  recording_delay_mean_days: number;
  recording_delay_median_days: number;
  occurrence_to_record_mean_days: number;
  occurrence_to_record_median_days: number;
  gross_amount_total: number;
  net_amount_total: number;
  recovery_amount_total: number;
  potential_impact_total: number;
  occurrence_date_min: string;
  occurrence_date_max: string;
}

/** Top-level shape of `data/risk_events_final.json`. */
export interface RiskEventsDataset {
  schema_version: number;
  source_file: string;
  definitions: Record<string, unknown>;
  enterprise: EnterpriseBaseline;
  events: RiskEvent[];
}
