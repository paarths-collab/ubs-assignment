import type { EnterpriseBaseline } from "./RiskEvent.js";

/**
 * Types for `data/risk_patterns_final.json` (Component 4's pattern-intelligence
 * dataset). Every numeric fact here is precomputed by the Python pattern maker —
 * the backend only reads, resolves and forwards these; it never recomputes
 * statistics, and the Groq integration is only ever handed `groq_fact_payload`
 * (a trimmed, already-verified subset) to interpret.
 */

export interface PatternObserved {
  event_count: number;
  severity: Record<string, number>;
  high_rate: number;
  high_rate_pct: number;
  enterprise_high_rate: number;
  enterprise_high_rate_pct: number;
  high_rate_lift: number;
  open_events: number;
  open_rate: number;
  gross_amount: number;
  net_amount: number;
  recovery_amount: number;
  potential_impact: number;
  detection_delay_mean_days: number;
  detection_delay_median_days: number;
  recording_delay_mean_days: number;
  recording_delay_median_days: number;
  occurrence_to_record_mean_days: number;
  occurrence_to_record_median_days: number;
}

export interface PatternComparedWithEnterprise {
  high_rate_lift: number;
  high_rate_delta_pct_points: number;
  detection_delay_delta_days: number;
  recording_delay_delta_days: number;
  occurrence_to_record_delta_days: number;
}

export interface PatternNarrativeContext {
  issue_details: string[];
  root_cause_details: string[];
  opportunities: string[];
}

/** The exact trimmed subset of a pattern that gets sent to Groq. */
export interface GroqFactPayload {
  pattern_id: string;
  pattern_type: string;
  title: string;
  observed: PatternObserved;
  compared_with_enterprise: PatternComparedWithEnterprise;
  dimensions: Record<string, string>;
  matching_event_ids: string[];
  narrative_context: PatternNarrativeContext;
}

/** One record of `risk_patterns_final.json`'s `patterns` array. */
export interface Pattern {
  pattern_id: string;
  pattern_type: string;
  title: string;
  why_seen: string;
  priority_level: string;
  priority_reasons: string[];
  dimensions: Record<string, string>;
  observed: PatternObserved;
  compared_with_enterprise: PatternComparedWithEnterprise;
  graph_filter: Record<string, string[]>;
  matching_event_ids: string[];
  narrative_context: PatternNarrativeContext;
  groq_fact_payload: GroqFactPayload;
}

export interface DataQuality {
  operational_impact_pattern_maker_enabled: boolean;
  reason: string;
  safe_fields_preserved: string[];
}

export interface PriorityQueueMetadata {
  original_count: number;
  deduplicated_count: number;
  deduplication_rule: string;
  removed_duplicate_pattern_ids: string[];
  duplicate_of: Record<string, string>;
}

export interface PatternMakerStatusEntry {
  ran: boolean;
  patterns_found: number;
  note?: string;
}

/** Top-level shape of `data/risk_patterns_final.json`. */
export interface RiskPatternsDataset {
  schema_version: number;
  source_file: string;
  purpose: string;
  definitions: Record<string, unknown>;
  enterprise: EnterpriseBaseline;
  data_quality: DataQuality;
  priority_queue: string[];
  pattern_count: number;
  patterns: Pattern[];
  priority_queue_metadata: PriorityQueueMetadata;
  pattern_maker_status: Record<string, PatternMakerStatusEntry>;
}
