import type { CounterSignalId, SignalId } from "../types/Issue.js";

/**
 * The ONE place every threshold and weight for issue-intelligence ranking
 * lives. `IssueIntelligenceService` must never hardcode a magic number
 * inline — every cutoff below was chosen by profiling the shipped
 * `risk_events_final.json` directly (the comment on each documents the
 * observed range that justified it), not guessed.
 *
 * Dataset flatness this ranking deliberately does NOT use as a signal
 * (verified by direct profiling — see the project brief): event count per
 * issue (66-67 for all 15), organisation count per issue (always 4), owner
 * count per issue (always 16), and top-organisation *volume* share within an
 * issue (always ~25.4%). None of these carry information; ranking or
 * narrative built on them would be fabricated.
 */
export const ISSUE_SIGNAL_THRESHOLDS = {
  /** Issue-level High-severity rate, expressed as a lift over the enterprise baseline (5.1%). Observed range across the 15 issues: 0x-2.05x. 1.4x separates the 4 issues with a real concentration of High-severity events from the other 11. */
  HIGH_RATE_LIFT_MIN: 1.4,

  /** Issue x Root-cause combination: minimum event support before its High rate is treated as a real signal rather than noise from a handful of events. */
  ROOT_CAUSE_COMBO_MIN_SUPPORT: 5,
  /** Issue x Root-cause combination High-rate lift vs the enterprise baseline. Observed lifts among combinations that clear the support floor: 2.18x-7.84x. 3.5x keeps the flag to combinations running more than triple the enterprise High rate. */
  ROOT_CAUSE_COMBO_LIFT_MIN: 3.5,

  /** Total potential impact (sum of each event's non-null potential_impact; Non-Financial events without a figure are excluded, not zeroed). Observed per-issue totals: $807,842-$3,198,993 (per-issue average ~$1.44M). $1.5M sits just above that average and isolates the issues with genuinely outsized headline exposure. */
  POTENTIAL_IMPACT_MIN_USD: 1_500_000,

  /** How many of an issue's largest-magnitude net-exposure events are summed for the concentration share. */
  NET_EXPOSURE_TOP_N: 5,
  /** Share of an issue's total net exposure held by its top-N events. Observed range: 62.6%-97.2%. 85% flags issues where a handful of events, not the issue as a whole, drive nearly all the dollar exposure. */
  NET_EXPOSURE_CONCENTRATION_MIN_PCT: 85,

  /** Share of an issue's events still open. Enterprise baseline: 72.1%. Observed per-issue range: 62.7%-80.6%. 78% flags issues meaningfully above baseline. */
  OPEN_RATE_MIN_PCT: 78,

  /** Mean detection delay in days. Enterprise baseline: 2.46d. Observed per-issue range: 1.9d-3.0d. 2.8d flags the slower tail. */
  DETECTION_DELAY_MEAN_MIN_DAYS: 2.8,
  /** Mean recording delay in days. Enterprise baseline: 3.61d. */
  RECORDING_DELAY_MEAN_MIN_DAYS: 4.0,
  /** Mean occurrence-to-record ("event journey") in days. Enterprise baseline: 6.07d. Observed per-issue range: 5.4d-6.8d. 6.3d flags the slower tail. */
  OCCURRENCE_TO_RECORD_MEAN_MIN_DAYS: 6.3,

  /** An issue x organisation High rate is flagged "small sample" (caveat required in the UI) when the slice has fewer than this many High-classified events — with per-org N around 17, a couple of High events swing the rate a great deal. */
  ORG_HIGH_RATE_SMALL_SAMPLE_MAX_HIGH_COUNT: 5,

  /**
   * Every issue spans exactly 4 organisations with a uniform ~25% volume
   * share each (see the module comment) — that flatness is deliberately not
   * a signal. What DOES vary is the High *rate* per organisation. Signal
   * input: the spread (max - min) of per-org High rate within an issue, in
   * percentage points. Observed spreads across the 15 issues: 0-17.65 points.
   * There is a real gap in the distribution between 11.76 (5 issues) and
   * 6.62 (the next-highest) — 10 sits in that gap and isolates the 9 issues
   * with a genuine organisational split from the 6 where the org-level rate
   * is essentially flat. Every org slice behind this signal rests on 0-3
   * High events out of ~17, so its `detail` always carries a small-sample
   * caveat — this is a directional signal, not a robust one.
   */
  ORG_HIGH_RATE_VARIATION_SPREAD_MIN_PCT: 10,

  /** How many top owners/assignees to surface as "workflow concentration" per issue. */
  WORKFLOW_CONCENTRATION_TOP_N: 5,

  /**
   * Trend windowing: complete calendar months compared recent-vs-prior,
   * anchored to the dataset's own last complete occurrence month — never to
   * wall-clock "today". Anchoring to a fixed calendar boundary (e.g. a
   * Jan-Jun/Jul-Dec half) would let the dataset's final partial period
   * (2026-07 and 2026-08 only, 81 events total, vs a full ~240-250 for a
   * complete 6-month span) manufacture a fake trend purely from missing
   * months, not real change.
   */
  TREND_WINDOW_MONTHS: 6,
  /** A trend is only called "material" when |percent change| exceeds this AND the smaller window has enough events for the percentage to mean anything. With this windowing, observed per-issue swings top out around 13% — comfortably under this threshold, so no issue should manufacture a rising/falling narrative from this dataset. */
  TREND_MATERIAL_CHANGE_MIN_ABS_PCT: 25,
  TREND_MATERIAL_CHANGE_MIN_WINDOW_COUNT: 5,

  /**
   * Counter-signal margins: how close a timeliness/open-rate metric must sit
   * to its enterprise baseline before it is honestly reported as "not
   * unusual" rather than left unmentioned. Each margin is chosen to sit
   * comfortably below the corresponding triggered-signal cutoff above so a
   * metric can never be flagged as both elevated and near-baseline at once.
   */
  /** Detection delay: baseline 2.46d, observed per-issue range 1.94d-3.02d (deltas -0.52 to +0.56). The SLOW_DETECTION trigger fires at a 0.34d delta from baseline (2.8d); 0.3d stays under that with no overlap. */
  DETECTION_NEAR_BASELINE_MAX_ABS_DELTA_DAYS: 0.3,
  /** Recording delay: baseline 3.61d, observed per-issue range 3.28d-4.0d (deltas -0.33 to +0.39). The SLOW_RECORDING trigger fires at a 0.39d delta from baseline (4.0d); 0.35d stays under that with no overlap. */
  RECORDING_NEAR_BASELINE_MAX_ABS_DELTA_DAYS: 0.35,
  /** Occurrence-to-record ("event journey"): baseline 6.07d, observed per-issue range 5.40d-6.83d (deltas -0.67 to +0.76). The LONG_EVENT_JOURNEY trigger fires at a 0.23d delta from baseline (6.3d); 0.2d stays under that with no overlap. */
  JOURNEY_NEAR_BASELINE_MAX_ABS_DELTA_DAYS: 0.2,
  /** Open rate: baseline 72.1%, observed per-issue range 62.7%-80.6% (deltas -9.4 to +8.5 points). The OPEN_WORKLOAD trigger fires at a 5.9-point delta from baseline (78%); 4.0 points stays under that with no overlap. */
  OPEN_RATE_NEAR_BASELINE_MAX_ABS_DELTA_PCT: 4.0,
} as const;

/**
 * Weight each triggered signal contributes to an issue's rank score. This is
 * NOT an opaque AI/ML score: every issue's score is just the sum of these
 * fixed, documented weights for whichever named signals it actually
 * triggered, and the UI always renders the specific triggered signals (with
 * their underlying numbers) alongside the score — "why am I seeing this" is
 * always answerable from data already in the response.
 */
export const SIGNAL_WEIGHTS: Record<SignalId, number> = {
  STRONG_ROOT_CAUSE_INTERACTION: 3,
  HIGH_SEVERITY_CONCENTRATION: 3,
  POTENTIAL_IMPACT: 2,
  NET_EXPOSURE_CONCENTRATION: 2,
  OPEN_WORKLOAD: 1,
  SLOW_DETECTION: 1,
  SLOW_RECORDING: 1,
  LONG_EVENT_JOURNEY: 1,
  /** Weighted like the other secondary timeliness/workload signals — every org slice behind it is a small sample (see the threshold comment above), so it should never outweigh a signal built on the issue's full event count. */
  ORG_HIGH_RATE_VARIATION: 1,
};

export const SIGNAL_LABELS: Record<SignalId, string> = {
  STRONG_ROOT_CAUSE_INTERACTION: "Strong root-cause interaction",
  HIGH_SEVERITY_CONCENTRATION: "High-severity concentration",
  POTENTIAL_IMPACT: "Elevated potential impact",
  NET_EXPOSURE_CONCENTRATION: "Net exposure concentration",
  OPEN_WORKLOAD: "Elevated open workload",
  SLOW_DETECTION: "Slow detection",
  SLOW_RECORDING: "Slow recording",
  LONG_EVENT_JOURNEY: "Long event journey",
  ORG_HIGH_RATE_VARIATION: "Organisation High-rate variation",
};

export const COUNTER_SIGNAL_LABELS: Record<CounterSignalId, string> = {
  DETECTION_NEAR_BASELINE: "Detection delay near baseline",
  RECORDING_NEAR_BASELINE: "Recording delay near baseline",
  JOURNEY_NEAR_BASELINE: "Event journey near baseline",
  OPEN_RATE_NEAR_BASELINE: "Open rate near baseline",
  NO_MATERIAL_TREND: "No material trend",
  NO_STRONG_ROOT_CAUSE_INTERACTION: "No strong root-cause interaction",
  SEVERITY_AT_OR_BELOW_BASELINE: "Severity at or below baseline",
};

/**
 * Breaks ties when two or more triggered signals share the top weight (e.g.
 * HIGH_SEVERITY_CONCENTRATION and STRONG_ROOT_CAUSE_INTERACTION both weigh
 * 3): the earliest entry in this list among the tied signals becomes
 * "primary". Root-cause interaction is ranked ahead of general severity
 * concentration because it names a more specific mechanism (a particular
 * root cause, not just "severity is elevated") — that specificity is what
 * `whyItSurfaced` should lead the card with. Order beyond the tied weight
 * classes doesn't matter since a strictly higher weight always wins first.
 */
export const SIGNAL_TIE_BREAK_PRIORITY: SignalId[] = [
  "STRONG_ROOT_CAUSE_INTERACTION",
  "HIGH_SEVERITY_CONCENTRATION",
  "POTENTIAL_IMPACT",
  "NET_EXPOSURE_CONCENTRATION",
  "OPEN_WORKLOAD",
  "SLOW_DETECTION",
  "SLOW_RECORDING",
  "LONG_EVENT_JOURNEY",
  "ORG_HIGH_RATE_VARIATION",
];
