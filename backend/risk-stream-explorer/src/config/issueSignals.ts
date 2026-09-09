import type { SignalId } from "../types/Issue";

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
};
