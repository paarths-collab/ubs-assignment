/**
 * Independent re-derivation of the precomputed pattern statistics.
 *
 * Provenance, stated plainly: the numbers in `data/risk_patterns_final.json`
 * (counts, severity mix, rates, lifts, financial sums, delay statistics,
 * deltas, the enterprise baseline, ...) are precomputed by an external
 * generator that is NOT part of this repository. This module independently
 * re-derives them from the raw synthetic events in `risk_events_final.json`
 * at validation time and reports every disagreement. The API serves the
 * stored values; nothing here changes them.
 *
 * Tolerance rules (applied per compared field):
 *  - counts / ids / strings / arrays: exact equality.
 *  - money sums (gross, net, recovery, potential impact, enterprise totals):
 *    |stored - recomputed| <= 0.005 absolute.
 *  - rounded statistics (rates, percentages, lifts, means, medians, deltas,
 *    ratios): |stored - recomputed| <= 0.5 * 10^-d, where d is the larger of
 *    (a) the number of decimal places in the stored number and (b) the
 *    minimum precision the generator is known to round that field to (2, or 4
 *    for 0..1 rates). JSON drops trailing zeros ("40.0" is stored as 40), so
 *    (b) stops an integer-looking stored value from silently getting a +/-0.5
 *    tolerance. If the stored value has more than 6 decimals it is treated as
 *    unrounded and the tolerance is capped at 1e-6 relative.
 *  - deltas (pattern value minus enterprise value, both 2 dp in the stored
 *    file): the exact unrounded difference can differ from the stored
 *    difference of two rounded numbers by up to two half-units, so the
 *    tolerance is 10^-d. To keep this from hiding errors, each delta is ALSO
 *    required to equal (stored observed value - stored enterprise value)
 *    within the plain rounded tolerance.
 *  - every tolerance gets a 1e-9 absolute allowance for binary
 *    floating-point noise (e.g. a true half-unit difference of 0.005 that
 *    evaluates to 0.005000000000000782).
 *
 * Null semantics (matches `utils/riskMath.ts`): a sum, mean or median over
 * values that are all null is `null`, never 0. The stored file follows the
 * same convention (24 patterns store null gross/net/recovery). Null must
 * match null; null vs a number is a mismatch. Net and recovery sums use the
 * `*_for_analysis` event fields.
 *
 * Definitions used: High = `classification === "High"`; open = `workflow.is_open`;
 * `high_rate_lift` = pattern high_rate / enterprise high_rate (undefined, so
 * expected to be stored as null, when the enterprise rate is 0 or the pattern
 * has no events).
 */

import type { EnterpriseBaseline, RiskEvent } from "../types/RiskEvent.js";
import type { Pattern, RiskPatternsDataset } from "../types/Pattern.js";
import { aggregateMoney, meanNullable, medianNullable } from "../utils/riskMath.js";

/** Scope label used for enterprise-baseline and dataset-wide comparisons. */
export const ENTERPRISE_SCOPE = "enterprise";
/** Scope label used for priority-queue / dataset-level structural comparisons. */
export const DATASET_SCOPE = "dataset";

export interface StatisticComparison {
  /** Pattern ID, or `ENTERPRISE_SCOPE` / `DATASET_SCOPE`. */
  patternId: string;
  /** Dotted field name, e.g. `observed.high_rate` or `matching_event_ids.duplicates`. */
  field: string;
  stored: unknown;
  recomputed: unknown;
  ok: boolean;
}

export interface NotCheckableField {
  patternId: string;
  field: string;
  reason: string;
}

export interface PatternStatisticsReport {
  /** Per-pattern comparisons (and priority-queue comparisons under `DATASET_SCOPE`). */
  patternComparisons: StatisticComparison[];
  /** Enterprise baseline comparisons (events-file block, patterns-file block, event-level sanity). */
  enterpriseComparisons: StatisticComparison[];
  mismatches: StatisticComparison[];
  patternsChecked: number;
  /** Total number of compared fields across patterns and the enterprise block. */
  fieldsCompared: number;
  /** Number of comparisons made for each pattern ID — each must be > 0. */
  fieldsComparedByPattern: Record<string, number>;
  /** Stored fields that exist but could not be re-derived, with the reason. */
  notCheckable: NotCheckableField[];
}

export interface RecomputeOptions {
  /** `enterprise` block of `risk_events_final.json`, compared when provided. */
  eventsFileEnterprise?: EnterpriseBaseline | undefined;
}

// ---------------------------------------------------------------------------
// Tolerance helpers
// ---------------------------------------------------------------------------

const FP_EPSILON = 1e-9;
const MONEY_TOLERANCE = 0.005;
const UNROUNDED_DECIMALS = 6;
const UNROUNDED_RELATIVE_CEILING = 1e-6;

export function decimalPlaces(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const text = String(value);
  const exponentMatch = /e([+-]\d+)$/i.exec(text);
  const mantissa = exponentMatch ? text.slice(0, exponentMatch.index) : text;
  const exponent = exponentMatch ? Number(exponentMatch[1]) : 0;
  const dot = mantissa.indexOf(".");
  const fractionDigits = dot < 0 ? 0 : mantissa.length - dot - 1;
  return Math.max(0, fractionDigits - exponent);
}

export type FieldKind =
  | { kind: "count" }
  | { kind: "money" }
  | { kind: "rounded"; minDecimals: number }
  | { kind: "delta"; minDecimals: number };

const COUNT: FieldKind = { kind: "count" };
const MONEY: FieldKind = { kind: "money" };
const ROUND2: FieldKind = { kind: "rounded", minDecimals: 2 };
const ROUND4: FieldKind = { kind: "rounded", minDecimals: 4 };
const DELTA2: FieldKind = { kind: "delta", minDecimals: 2 };

export function toleranceFor(kind: FieldKind, stored: number, recomputed: number): number {
  if (kind.kind === "count") return 0;
  if (kind.kind === "money") return MONEY_TOLERANCE + FP_EPSILON;
  const d = Math.max(decimalPlaces(stored), kind.minDecimals);
  if (kind.kind === "delta") return 10 ** -d + FP_EPSILON;
  let tolerance = 0.5 * 10 ** -d;
  if (d > UNROUNDED_DECIMALS) {
    tolerance = Math.min(tolerance, Math.max(UNROUNDED_RELATIVE_CEILING * Math.abs(recomputed), 1e-12));
  }
  return tolerance + FP_EPSILON;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Null must match null; numbers must agree within the field's tolerance. */
export function agrees(kind: FieldKind, stored: unknown, recomputed: number | null): boolean {
  if (recomputed === null) return stored === null;
  if (!isFiniteNumber(stored)) return false;
  return Math.abs(stored - recomputed) <= toleranceFor(kind, stored, recomputed);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function roundOrNull(value: number | null, decimals: number): number | null {
  return value === null ? null : round(value, decimals);
}

function subtractOrNull(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : a - b;
}

function divideOrNull(a: number | null, b: number | null): number | null {
  if (a === null || b === null || b === 0) return null;
  return a / b;
}

// ---------------------------------------------------------------------------
// Event-level derivations
// ---------------------------------------------------------------------------

const SEVERITY_KEYS = ["Low", "Moderate", "High"] as const;

interface GroupStats {
  eventCount: number;
  severity: Record<string, number>;
  highRate: number | null;
  openEvents: number;
  openRate: number | null;
  gross: number | null;
  net: number | null;
  recovery: number | null;
  potentialImpact: number | null;
  detectionMean: number | null;
  detectionMedian: number | null;
  recordingMean: number | null;
  recordingMedian: number | null;
  occurrenceToRecordMean: number | null;
  occurrenceToRecordMedian: number | null;
}

function computeGroupStats(events: RiskEvent[]): GroupStats {
  const severity: Record<string, number> = { Low: 0, Moderate: 0, High: 0 };
  let open = 0;
  for (const event of events) {
    severity[event.classification] = (severity[event.classification] ?? 0) + 1;
    if (event.workflow.is_open) open += 1;
  }
  const n = events.length;
  return {
    eventCount: n,
    severity,
    highRate: n === 0 ? null : (severity["High"] ?? 0) / n,
    openEvents: open,
    openRate: n === 0 ? null : open / n,
    gross: aggregateMoney(events, (e) => e.financial.gross_amount).total,
    net: aggregateMoney(events, (e) => e.financial.net_amount_for_analysis).total,
    recovery: aggregateMoney(events, (e) => e.financial.recovery_amount_for_analysis).total,
    potentialImpact: aggregateMoney(events, (e) => e.financial.potential_impact).total,
    detectionMean: meanNullable(events.map((e) => e.timeline.detection_delay_days)),
    detectionMedian: medianNullable(events.map((e) => e.timeline.detection_delay_days)),
    recordingMean: meanNullable(events.map((e) => e.timeline.recording_delay_days)),
    recordingMedian: medianNullable(events.map((e) => e.timeline.recording_delay_days)),
    occurrenceToRecordMean: meanNullable(events.map((e) => e.timeline.occurrence_to_record_days)),
    occurrenceToRecordMedian: medianNullable(events.map((e) => e.timeline.occurrence_to_record_days)),
  };
}

/** Event field behind each graph_filter / dimensions key. */
const DIMENSION_ACCESSORS: Record<string, (event: RiskEvent) => string> = {
  issue: (e) => e.issue,
  root_cause: (e) => e.risk.root_cause,
  owner: (e) => e.workflow.owner_name,
  assignee: (e) => e.workflow.current_assignee,
  event_type: (e) => e.event_type,
  organisation: (e) => e.workflow.owner_organisation,
  or_category: (e) => e.risk.or_category,
};

function distinctCount(events: RiskEvent[], accessor: (e: RiskEvent) => string): number {
  return new Set(events.map(accessor)).size;
}

function sortedDistinctMonths(events: RiskEvent[]): string[] {
  return [...new Set(events.map((e) => e.timeline.occurrence_month))].sort();
}

// ---------------------------------------------------------------------------
// Enterprise baseline
// ---------------------------------------------------------------------------

export interface RecomputedEnterprise {
  event_count: number;
  severity_counts: Record<string, number>;
  high_rate: number | null;
  high_rate_pct: number | null;
  open_event_count: number;
  open_rate: number | null;
  open_rate_pct: number | null;
  detection_delay_mean_days: number | null;
  detection_delay_median_days: number | null;
  recording_delay_mean_days: number | null;
  recording_delay_median_days: number | null;
  occurrence_to_record_mean_days: number | null;
  occurrence_to_record_median_days: number | null;
  gross_amount_total: number | null;
  net_amount_total: number | null;
  recovery_amount_total: number | null;
  potential_impact_total: number | null;
  occurrence_date_min: string | null;
  occurrence_date_max: string | null;
}

export function recomputeEnterpriseBaseline(events: RiskEvent[]): RecomputedEnterprise {
  const stats = computeGroupStats(events);
  const dates = events.map((e) => e.timeline.occurrence_date).sort();
  return {
    event_count: stats.eventCount,
    severity_counts: stats.severity,
    high_rate: stats.highRate,
    high_rate_pct: stats.highRate === null ? null : stats.highRate * 100,
    open_event_count: stats.openEvents,
    open_rate: stats.openRate,
    open_rate_pct: stats.openRate === null ? null : stats.openRate * 100,
    detection_delay_mean_days: stats.detectionMean,
    detection_delay_median_days: stats.detectionMedian,
    recording_delay_mean_days: stats.recordingMean,
    recording_delay_median_days: stats.recordingMedian,
    occurrence_to_record_mean_days: stats.occurrenceToRecordMean,
    occurrence_to_record_median_days: stats.occurrenceToRecordMedian,
    gross_amount_total: stats.gross,
    net_amount_total: stats.net,
    recovery_amount_total: stats.recovery,
    potential_impact_total: stats.potentialImpact,
    occurrence_date_min: dates[0] ?? null,
    occurrence_date_max: dates[dates.length - 1] ?? null,
  };
}

const ENTERPRISE_NUMERIC_FIELDS: Array<[keyof RecomputedEnterprise & keyof EnterpriseBaseline, FieldKind]> = [
  ["event_count", COUNT],
  ["high_rate", ROUND4],
  ["high_rate_pct", ROUND2],
  ["open_event_count", COUNT],
  ["open_rate", ROUND4],
  ["open_rate_pct", ROUND2],
  ["detection_delay_mean_days", ROUND2],
  ["detection_delay_median_days", ROUND2],
  ["recording_delay_mean_days", ROUND2],
  ["recording_delay_median_days", ROUND2],
  ["occurrence_to_record_mean_days", ROUND2],
  ["occurrence_to_record_median_days", ROUND2],
  ["gross_amount_total", MONEY],
  ["net_amount_total", MONEY],
  ["recovery_amount_total", MONEY],
  ["potential_impact_total", MONEY],
];

function compareEnterpriseBlock(
  label: string,
  stored: EnterpriseBaseline | undefined,
  recomputed: RecomputedEnterprise,
  out: StatisticComparison[],
): void {
  const block = (stored ?? {}) as unknown as Record<string, unknown>;
  const push = (field: string, storedValue: unknown, recomputedValue: unknown, ok: boolean) =>
    out.push({ patternId: ENTERPRISE_SCOPE, field: `${label}.${field}`, stored: storedValue, recomputed: recomputedValue, ok });

  for (const [field, kind] of ENTERPRISE_NUMERIC_FIELDS) {
    const recomputedValue = recomputed[field] as number | null;
    push(field, block[field], recomputedValue, agrees(kind, block[field], recomputedValue));
  }
  const storedSeverity = (block["severity_counts"] ?? {}) as Record<string, unknown>;
  const severityKeys = new Set<string>([...SEVERITY_KEYS, ...Object.keys(storedSeverity)]);
  for (const key of severityKeys) {
    const recomputedValue = recomputed.severity_counts[key] ?? 0;
    push(`severity_counts.${key}`, storedSeverity[key], recomputedValue, agrees(COUNT, storedSeverity[key], recomputedValue));
  }
  push("occurrence_date_min", block["occurrence_date_min"], recomputed.occurrence_date_min, block["occurrence_date_min"] === recomputed.occurrence_date_min);
  push("occurrence_date_max", block["occurrence_date_max"], recomputed.occurrence_date_max, block["occurrence_date_max"] === recomputed.occurrence_date_max);
}

// ---------------------------------------------------------------------------
// Per-pattern comparison
// ---------------------------------------------------------------------------

/** Stored `observed` keys this module knows how to re-derive. */
const BASE_OBSERVED_FIELDS = new Set([
  "event_count", "severity", "high_rate", "high_rate_pct", "enterprise_high_rate", "enterprise_high_rate_pct",
  "high_rate_lift", "open_events", "open_rate", "gross_amount", "net_amount", "recovery_amount", "potential_impact",
  "detection_delay_mean_days", "detection_delay_median_days", "recording_delay_mean_days", "recording_delay_median_days",
  "occurrence_to_record_mean_days", "occurrence_to_record_median_days",
]);

const EXTRA_OBSERVED_FIELDS = new Set([
  "distinct_organisations", "distinct_owners", "distinct_assignees", "distinct_issues",
  "event_share_pct", "potential_impact_share_pct", "impact_to_event_share_ratio",
  "top_event_count", "top_event_share_pct", "net_exposure_share_pct", "financial_event_count",
  "recovery_to_gross_rate_pct", "financial_baseline_recovery_to_gross_rate_pct", "recovery_rate_delta_pct_points",
  "previous_3_month_event_count", "latest_3_month_event_count", "event_count_change", "event_count_ratio",
  "previous_3_month_potential_impact", "latest_3_month_potential_impact", "potential_impact_ratio",
  "previous_months", "latest_months", "threshold_days",
]);

const KNOWN_DIMENSION_KEYS = new Set([...Object.keys(DIMENSION_ACCESSORS), "top_n", "latest_months", "previous_months", "threshold_days"]);

interface DatasetContext {
  events: RiskEvent[];
  byId: Map<string, RiskEvent>;
  enterprise: RecomputedEnterprise;
  /** The `enterprise` block as stored in the patterns file. */
  storedEnterprise: Record<string, unknown>;
  financialEvents: RiskEvent[];
  financialRecoveryRatePct: number | null;
  months: string[];
}

function setsEqual(a: Iterable<string>, b: Iterable<string>): boolean {
  const left = new Set(a);
  const right = new Set(b);
  if (left.size !== right.size) return false;
  for (const item of left) if (!right.has(item)) return false;
  return true;
}

function comparePattern(pattern: Pattern, ctx: DatasetContext, out: StatisticComparison[], notCheckable: NotCheckableField[]): void {
  const patternId = pattern.pattern_id;
  const push = (field: string, stored: unknown, recomputed: unknown, ok: boolean) =>
    out.push({ patternId, field, stored, recomputed, ok });
  const num = (field: string, kind: FieldKind, stored: unknown, recomputed: number | null) =>
    push(field, stored, recomputed, agrees(kind, stored, recomputed));
  const skip = (field: string, reason: string) => notCheckable.push({ patternId, field, reason });

  // --- matching_event_ids: integrity -------------------------------------
  const listed = Array.isArray(pattern.matching_event_ids) ? pattern.matching_event_ids : [];
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of listed) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  const unknown = [...seen].filter((id) => !ctx.byId.has(id));
  push("matching_event_ids.duplicates", [...duplicates], [], duplicates.size === 0);
  push("matching_event_ids.unknown_ids", unknown, [], unknown.length === 0);
  const matching = [...seen].map((id) => ctx.byId.get(id)).filter((e): e is RiskEvent => e !== undefined);

  const observed = (pattern.observed ?? {}) as unknown as Record<string, unknown>;
  const stats = computeGroupStats(matching);
  const enterprise = ctx.enterprise;

  // --- counts, severity, rates -------------------------------------------
  num("observed.event_count", COUNT, observed["event_count"], stats.eventCount);
  push("matching_event_ids.length", observed["event_count"], listed.length, observed["event_count"] === listed.length);

  const storedSeverity = (observed["severity"] ?? {}) as Record<string, unknown>;
  for (const key of new Set<string>([...SEVERITY_KEYS, ...Object.keys(storedSeverity)])) {
    num(`observed.severity.${key}`, COUNT, storedSeverity[key], stats.severity[key] ?? 0);
  }

  num("observed.high_rate", ROUND4, observed["high_rate"], stats.highRate);
  num("observed.high_rate_pct", ROUND2, observed["high_rate_pct"], stats.highRate === null ? null : stats.highRate * 100);
  num("observed.enterprise_high_rate", ROUND4, observed["enterprise_high_rate"], enterprise.high_rate);
  num("observed.enterprise_high_rate_pct", ROUND2, observed["enterprise_high_rate_pct"], enterprise.high_rate_pct);

  // Lift is undefined (expected stored as null) when the enterprise rate is 0 or the pattern is empty.
  const lift = divideOrNull(stats.highRate, enterprise.high_rate);
  num("observed.high_rate_lift", ROUND2, observed["high_rate_lift"], lift);

  num("observed.open_events", COUNT, observed["open_events"], stats.openEvents);
  num("observed.open_rate", ROUND4, observed["open_rate"], stats.openRate);

  // --- money (null when nothing is populated) ----------------------------
  num("observed.gross_amount", MONEY, observed["gross_amount"], stats.gross);
  num("observed.net_amount", MONEY, observed["net_amount"], stats.net);
  num("observed.recovery_amount", MONEY, observed["recovery_amount"], stats.recovery);
  num("observed.potential_impact", MONEY, observed["potential_impact"], stats.potentialImpact);

  // --- delays -------------------------------------------------------------
  num("observed.detection_delay_mean_days", ROUND2, observed["detection_delay_mean_days"], stats.detectionMean);
  num("observed.detection_delay_median_days", ROUND2, observed["detection_delay_median_days"], stats.detectionMedian);
  num("observed.recording_delay_mean_days", ROUND2, observed["recording_delay_mean_days"], stats.recordingMean);
  num("observed.recording_delay_median_days", ROUND2, observed["recording_delay_median_days"], stats.recordingMedian);
  num("observed.occurrence_to_record_mean_days", ROUND2, observed["occurrence_to_record_mean_days"], stats.occurrenceToRecordMean);
  num("observed.occurrence_to_record_median_days", ROUND2, observed["occurrence_to_record_median_days"], stats.occurrenceToRecordMedian);

  // --- compared_with_enterprise ------------------------------------------
  const compared = (pattern.compared_with_enterprise ?? {}) as unknown as Record<string, unknown>;
  num("compared_with_enterprise.high_rate_lift", ROUND2, compared["high_rate_lift"], lift);
  const storedEnterprise = ctx.storedEnterprise;
  const delta = (
    field: string,
    storedDelta: unknown,
    exactDelta: number | null,
    observedKey: string,
    enterpriseKey: string,
  ) => {
    num(`compared_with_enterprise.${field}`, DELTA2, storedDelta, exactDelta);
    const o = observed[observedKey];
    const e = storedEnterprise[enterpriseKey];
    const fromStored = isFiniteNumber(o) && isFiniteNumber(e) ? o - e : null;
    num(`compared_with_enterprise.${field}.vs_observed`, ROUND2, storedDelta, fromStored);
  };
  delta("high_rate_delta_pct_points", compared["high_rate_delta_pct_points"],
    subtractOrNull(stats.highRate === null ? null : stats.highRate * 100, enterprise.high_rate_pct),
    "high_rate_pct", "high_rate_pct");
  delta("detection_delay_delta_days", compared["detection_delay_delta_days"],
    subtractOrNull(stats.detectionMean, enterprise.detection_delay_mean_days), "detection_delay_mean_days", "detection_delay_mean_days");
  delta("recording_delay_delta_days", compared["recording_delay_delta_days"],
    subtractOrNull(stats.recordingMean, enterprise.recording_delay_mean_days), "recording_delay_mean_days", "recording_delay_mean_days");
  delta("occurrence_to_record_delta_days", compared["occurrence_to_record_delta_days"],
    subtractOrNull(stats.occurrenceToRecordMean, enterprise.occurrence_to_record_mean_days), "occurrence_to_record_mean_days", "occurrence_to_record_mean_days");

  // --- extra, pattern-type-specific stored statistics --------------------
  for (const key of Object.keys(observed)) {
    if (!BASE_OBSERVED_FIELDS.has(key) && !EXTRA_OBSERVED_FIELDS.has(key)) {
      skip(`observed.${key}`, "unknown stored field; no recomputation rule exists for it");
    }
  }
  const has = (key: string) => key in observed;
  const dimensions = (pattern.dimensions ?? {}) as unknown as Record<string, unknown>;

  if (has("distinct_organisations")) num("observed.distinct_organisations", COUNT, observed["distinct_organisations"], distinctCount(matching, DIMENSION_ACCESSORS["organisation"]!));
  if (has("distinct_owners")) num("observed.distinct_owners", COUNT, observed["distinct_owners"], distinctCount(matching, DIMENSION_ACCESSORS["owner"]!));
  if (has("distinct_assignees")) num("observed.distinct_assignees", COUNT, observed["distinct_assignees"], distinctCount(matching, DIMENSION_ACCESSORS["assignee"]!));
  if (has("distinct_issues")) num("observed.distinct_issues", COUNT, observed["distinct_issues"], distinctCount(matching, DIMENSION_ACCESSORS["issue"]!));

  if (has("event_share_pct")) num("observed.event_share_pct", ROUND2, observed["event_share_pct"], ctx.events.length === 0 ? null : (stats.eventCount / ctx.events.length) * 100);
  const impactShare = divideOrNull(stats.potentialImpact, enterprise.potential_impact_total);
  if (has("potential_impact_share_pct")) num("observed.potential_impact_share_pct", ROUND2, observed["potential_impact_share_pct"], impactShare === null ? null : impactShare * 100);
  if (has("impact_to_event_share_ratio")) {
    const eventShare = ctx.events.length === 0 ? null : stats.eventCount / ctx.events.length;
    num("observed.impact_to_event_share_ratio", ROUND2, observed["impact_to_event_share_ratio"], divideOrNull(impactShare, eventShare));
  }

  if (has("top_event_count")) num("observed.top_event_count", COUNT, observed["top_event_count"], stats.eventCount);
  if (has("financial_event_count")) num("observed.financial_event_count", COUNT, observed["financial_event_count"], ctx.financialEvents.length);
  if (has("top_event_share_pct")) {
    num("observed.top_event_share_pct", ROUND2, observed["top_event_share_pct"],
      ctx.financialEvents.length === 0 ? null : (stats.eventCount / ctx.financialEvents.length) * 100);
  }
  if (has("net_exposure_share_pct")) {
    const totalNet = aggregateMoney(ctx.financialEvents, (e) => e.financial.net_amount_for_analysis).total;
    const share = divideOrNull(stats.net, totalNet);
    num("observed.net_exposure_share_pct", ROUND2, observed["net_exposure_share_pct"], share === null ? null : share * 100);
  }

  if (has("recovery_to_gross_rate_pct") || has("financial_baseline_recovery_to_gross_rate_pct") || has("recovery_rate_delta_pct_points")) {
    const rate = divideOrNull(stats.recovery, stats.gross);
    const ratePct = rate === null ? null : rate * 100;
    if (has("recovery_to_gross_rate_pct")) num("observed.recovery_to_gross_rate_pct", ROUND2, observed["recovery_to_gross_rate_pct"], ratePct);
    if (has("financial_baseline_recovery_to_gross_rate_pct")) {
      num("observed.financial_baseline_recovery_to_gross_rate_pct", ROUND2, observed["financial_baseline_recovery_to_gross_rate_pct"], ctx.financialRecoveryRatePct);
    }
    if (has("recovery_rate_delta_pct_points")) {
      const exact = subtractOrNull(ratePct, ctx.financialRecoveryRatePct);
      num("observed.recovery_rate_delta_pct_points", DELTA2, observed["recovery_rate_delta_pct_points"], exact);
      const a = observed["recovery_to_gross_rate_pct"];
      const b = observed["financial_baseline_recovery_to_gross_rate_pct"];
      num("observed.recovery_rate_delta_pct_points.vs_observed", ROUND2, observed["recovery_rate_delta_pct_points"],
        isFiniteNumber(a) && isFiniteNumber(b) ? a - b : null);
    }
  }

  if (has("threshold_days")) {
    push("observed.threshold_days", observed["threshold_days"], dimensions["threshold_days"], observed["threshold_days"] === dimensions["threshold_days"]);
  }

  // --- dimensions / graph_filter ------------------------------------------
  const graphFilter = (pattern.graph_filter ?? {}) as unknown as Record<string, unknown>;
  for (const key of Object.keys(dimensions)) {
    const accessor = DIMENSION_ACCESSORS[key];
    if (accessor) {
      const seenValues = [...new Set(matching.map(accessor))].sort();
      const holds = matching.length > 0 && seenValues.length === 1 && seenValues[0] === dimensions[key];
      push(`dimensions.${key}`, dimensions[key], seenValues, holds);
    } else if (!KNOWN_DIMENSION_KEYS.has(key)) {
      skip(`dimensions.${key}`, "unknown dimension key; no event field mapping exists");
    }
  }

  const mappedFilterKeys: string[] = [];
  for (const key of Object.keys(graphFilter)) {
    const accessor = DIMENSION_ACCESSORS[key];
    const allowed = graphFilter[key];
    if (accessor && Array.isArray(allowed)) {
      mappedFilterKeys.push(key);
      const seenValues = [...new Set(matching.map(accessor))].sort();
      push(`graph_filter.${key}`, allowed, seenValues, seenValues.every((value) => allowed.includes(value)));
    } else if (key !== "event_ids") {
      skip(`graph_filter.${key}`, "unknown graph_filter key; no event field mapping exists");
    }
  }

  const matchingIdSet = new Set(matching.map((e) => e.event_id));
  const completeness = (candidates: RiskEvent[]) => {
    const expected = candidates.map((e) => e.event_id);
    push("matching_event_ids.completeness", { listed: matchingIdSet.size }, { expected: expected.length }, setsEqual(matchingIdSet, expected));
  };

  const hasTrend = Array.isArray(observed["previous_months"]) && Array.isArray(observed["latest_months"]);
  const isEventIdFilter = Array.isArray(graphFilter["event_ids"]);

  if (hasTrend) {
    const previous = observed["previous_months"] as string[];
    const latest = observed["latest_months"] as string[];
    push("observed.latest_months", latest, ctx.months.slice(-3), stableStringify(latest) === stableStringify(ctx.months.slice(-3)));
    push("observed.previous_months", previous, ctx.months.slice(-6, -3), stableStringify(previous) === stableStringify(ctx.months.slice(-6, -3)));
    push("dimensions.window_months", { previous: dimensions["previous_months"], latest: dimensions["latest_months"] }, { previous, latest },
      stableStringify(dimensions["previous_months"]) === stableStringify(previous) && stableStringify(dimensions["latest_months"]) === stableStringify(latest));

    const issue = dimensions["issue"];
    const issueEvents = ctx.events.filter((e) => e.issue === issue);
    const inWindow = (months: string[]) => issueEvents.filter((e) => months.includes(e.timeline.occurrence_month));
    const prevEvents = inWindow(previous);
    const latestEvents = inWindow(latest);
    completeness([...prevEvents, ...latestEvents]);
    const prevImpact = aggregateMoney(prevEvents, (e) => e.financial.potential_impact).total;
    const latestImpact = aggregateMoney(latestEvents, (e) => e.financial.potential_impact).total;
    num("observed.previous_3_month_event_count", COUNT, observed["previous_3_month_event_count"], prevEvents.length);
    num("observed.latest_3_month_event_count", COUNT, observed["latest_3_month_event_count"], latestEvents.length);
    num("observed.event_count_change", COUNT, observed["event_count_change"], latestEvents.length - prevEvents.length);
    num("observed.event_count_ratio", ROUND2, observed["event_count_ratio"], divideOrNull(latestEvents.length, prevEvents.length));
    num("observed.previous_3_month_potential_impact", MONEY, observed["previous_3_month_potential_impact"], prevImpact);
    num("observed.latest_3_month_potential_impact", MONEY, observed["latest_3_month_potential_impact"], latestImpact);
    num("observed.potential_impact_ratio", ROUND2, observed["potential_impact_ratio"], divideOrNull(latestImpact, prevImpact));
  } else if (isEventIdFilter) {
    const filterIds = graphFilter["event_ids"] as string[];
    push("graph_filter.event_ids", filterIds, [...matchingIdSet], setsEqual(filterIds, matchingIdSet));

    if (has("threshold_days") && isFiniteNumber(observed["threshold_days"])) {
      const threshold = observed["threshold_days"];
      completeness(ctx.events.filter((e) => e.timeline.occurrence_to_record_days !== null && e.timeline.occurrence_to_record_days >= threshold));
    } else if (isFiniteNumber(dimensions["top_n"])) {
      // Top-N events by net exposure: compare net values (tie-safe) rather than ids.
      const topN = dimensions["top_n"];
      const netValues = ctx.financialEvents
        .map((e) => e.financial.net_amount_for_analysis)
        .filter((v): v is number => v !== null)
        .sort((a, b) => b - a)
        .slice(0, topN);
      const listedNet = matching
        .map((e) => e.financial.net_amount_for_analysis)
        .filter((v): v is number => v !== null)
        .sort((a, b) => b - a);
      push("matching_event_ids.top_n_by_net", { count: matching.length, net: listedNet }, { count: topN, net: netValues },
        matching.length === topN && stableStringify(listedNet) === stableStringify(netValues));
    } else {
      skip("matching_event_ids.completeness", "event_ids graph_filter without a known selection rule (threshold_days / top_n)");
    }
  } else if (mappedFilterKeys.length > 0 && mappedFilterKeys.length === Object.keys(graphFilter).length) {
    // graph_filter fully describes the pattern: every event satisfying all filter keys must be listed.
    completeness(
      ctx.events.filter((e) => mappedFilterKeys.every((key) => (graphFilter[key] as string[]).includes(DIMENSION_ACCESSORS[key]!(e)))),
    );
  } else {
    skip("matching_event_ids.completeness", "graph_filter has no usable keys");
  }

  // --- groq_fact_payload mirrors the pattern ------------------------------
  const payload = pattern.groq_fact_payload as unknown as Record<string, unknown> | undefined;
  if (payload) {
    for (const field of ["pattern_id", "pattern_type", "title", "observed", "compared_with_enterprise", "dimensions"] as const) {
      const storedValue = payload[field];
      const patternValue = (pattern as unknown as Record<string, unknown>)[field];
      push(`groq_fact_payload.${field}`, storedValue, patternValue, stableStringify(storedValue) === stableStringify(patternValue));
    }
  }
}

// ---------------------------------------------------------------------------
// Priority queue
// ---------------------------------------------------------------------------

function compareQueue(patternsFile: RiskPatternsDataset, patterns: Map<string, Pattern>, out: StatisticComparison[]): void {
  const push = (field: string, stored: unknown, recomputed: unknown, ok: boolean) =>
    out.push({ patternId: DATASET_SCOPE, field, stored, recomputed, ok });
  const queue = Array.isArray(patternsFile.priority_queue) ? patternsFile.priority_queue : [];
  const meta = patternsFile.priority_queue_metadata;

  // The queue stores pattern IDs only (no duplicated statistics), so what is checkable is its structure.
  push("priority_queue.duplicates", queue.filter((id, i) => queue.indexOf(id) !== i), [], new Set(queue).size === queue.length);
  push("pattern_count", patternsFile.pattern_count, patterns.size, patternsFile.pattern_count === patterns.size);

  if (meta) {
    const removed = Array.isArray(meta.removed_duplicate_pattern_ids) ? meta.removed_duplicate_pattern_ids : [];
    push("priority_queue_metadata.deduplicated_count", meta.deduplicated_count, queue.length, meta.deduplicated_count === queue.length);
    push("priority_queue_metadata.original_count", meta.original_count, queue.length + removed.length, meta.original_count === queue.length + removed.length);
    const inQueue = new Set(queue);
    for (const [removedId, keeperId] of Object.entries(meta.duplicate_of ?? {})) {
      const dup = patterns.get(removedId);
      const keeper = patterns.get(keeperId);
      const sameSet = !!dup && !!keeper && setsEqual(dup.matching_event_ids ?? [], keeper.matching_event_ids ?? []);
      push(`priority_queue_metadata.duplicate_of.${removedId}`, { duplicate: removedId, keeper: keeperId },
        { sameMatchingEventIds: true, duplicateInQueue: false, keeperInQueue: true },
        sameSet && !inQueue.has(removedId) && inQueue.has(keeperId));
    }
  }

  const signatures = new Map<string, string>();
  const collisions: string[] = [];
  for (const id of queue) {
    const pattern = patterns.get(id);
    if (!pattern) continue;
    const signature = [...new Set(pattern.matching_event_ids ?? [])].sort().join("|");
    const earlier = signatures.get(signature);
    if (earlier) collisions.push(`${id}~${earlier}`);
    else signatures.set(signature, id);
  }
  push("priority_queue.same_matching_event_set", collisions, [], collisions.length === 0);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function recomputePatternStatistics(
  events: RiskEvent[],
  patternsFile: RiskPatternsDataset,
  options: RecomputeOptions = {},
): PatternStatisticsReport {
  const enterprise = recomputeEnterpriseBaseline(events);
  const financialEvents = events.filter((e) => e.event_type === "Financial");
  const financialStats = computeGroupStats(financialEvents);
  const financialRate = divideOrNull(financialStats.recovery, financialStats.gross);
  const ctx: DatasetContext = {
    events,
    byId: new Map(events.map((e) => [e.event_id, e])),
    enterprise,
    storedEnterprise: (patternsFile.enterprise ?? {}) as unknown as Record<string, unknown>,
    financialEvents,
    financialRecoveryRatePct: financialRate === null ? null : financialRate * 100,
    months: sortedDistinctMonths(events),
  };

  const patternComparisons: StatisticComparison[] = [];
  const enterpriseComparisons: StatisticComparison[] = [];
  const notCheckable: NotCheckableField[] = [];

  compareEnterpriseBlock("patterns_file.enterprise", patternsFile.enterprise, enterprise, enterpriseComparisons);
  if (options.eventsFileEnterprise) {
    compareEnterpriseBlock("events_file.enterprise", options.eventsFileEnterprise, enterprise, enterpriseComparisons);
  }

  // Event-level definition check behind every open_* statistic: is_open must agree with the status definition.
  const inconsistentOpen = events.filter((e) => e.workflow.is_open !== !(e.workflow.status === "Closed" || e.workflow.status === "Cancelled"));
  enterpriseComparisons.push({
    patternId: ENTERPRISE_SCOPE,
    field: "events.is_open_matches_status",
    stored: inconsistentOpen.map((e) => e.event_id),
    recomputed: [],
    ok: inconsistentOpen.length === 0,
  });

  const patterns = Array.isArray(patternsFile.patterns) ? patternsFile.patterns : [];
  for (const pattern of patterns) {
    comparePattern(pattern, ctx, patternComparisons, notCheckable);
  }
  compareQueue(patternsFile, new Map(patterns.map((p) => [p.pattern_id, p])), patternComparisons);

  const fieldsComparedByPattern: Record<string, number> = {};
  for (const comparison of patternComparisons) {
    fieldsComparedByPattern[comparison.patternId] = (fieldsComparedByPattern[comparison.patternId] ?? 0) + 1;
  }

  const all = [...patternComparisons, ...enterpriseComparisons];
  return {
    patternComparisons,
    enterpriseComparisons,
    mismatches: all.filter((c) => !c.ok),
    patternsChecked: patterns.length,
    fieldsCompared: all.length,
    fieldsComparedByPattern,
    notCheckable,
  };
}

function formatValue(value: unknown): string {
  const text = stableStringify(value);
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

export function formatMismatch(comparison: StatisticComparison): string {
  const scope = comparison.patternId === ENTERPRISE_SCOPE || comparison.patternId === DATASET_SCOPE
    ? comparison.patternId
    : `pattern "${comparison.patternId}"`;
  return `${scope} ${comparison.field}: stored ${formatValue(comparison.stored)} != recomputed ${formatValue(comparison.recomputed)}`;
}

/** One-line summary, e.g. "137/137 patterns: 4321 fields recomputed, 0 mismatches". */
export function summarizeReport(report: PatternStatisticsReport): string {
  const patternsWithMismatch = new Set(report.mismatches.filter((m) => m.patternId !== ENTERPRISE_SCOPE && m.patternId !== DATASET_SCOPE).map((m) => m.patternId));
  const clean = report.patternsChecked - patternsWithMismatch.size;
  return `${clean}/${report.patternsChecked} patterns: ${report.fieldsCompared} fields recomputed (incl. enterprise baseline), ${report.mismatches.length} mismatches`;
}
