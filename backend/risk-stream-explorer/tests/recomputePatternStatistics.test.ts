import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  agrees,
  decimalPlaces,
  recomputePatternStatistics,
  type StatisticComparison,
} from "../src/validation/recomputePatternStatistics";
import { validateRiskDataset, validateRiskPatternStatistics } from "../src/validation/validateRiskDataset";
import type { RiskEvent, RiskEventsDataset } from "../src/types/RiskEvent";
import type { Pattern, RiskPatternsDataset } from "../src/types/Pattern";
import {
  makeEnterpriseBaseline,
  makeEventsDataset,
  makeGroqFactPayload,
  makePattern,
  makePatternsDataset,
  makeRiskEvent,
} from "./riskFixtures";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../data");

function readJson<T>(fileName: string): T {
  return JSON.parse(readFileSync(path.join(dataDir, fileName), "utf-8")) as T;
}

function fieldsOf(mismatches: StatisticComparison[]): string[] {
  return mismatches.map((m) => m.field);
}

// ---------------------------------------------------------------------------
// (a) Real data
// ---------------------------------------------------------------------------

describe("recomputePatternStatistics on the real dataset", () => {
  const eventsDataset = readJson<RiskEventsDataset>("risk_events_final.json");
  const patternsDataset = readJson<RiskPatternsDataset>("risk_patterns_final.json");
  const report = recomputePatternStatistics(eventsDataset.events, patternsDataset, {
    eventsFileEnterprise: eventsDataset.enterprise,
  });

  it("re-derives all 137 patterns and the enterprise baseline with 0 mismatches", () => {
    expect(report.patternsChecked).toBe(137);
    expect(report.mismatches.map((m) => `${m.patternId} ${m.field} stored=${JSON.stringify(m.stored)} recomputed=${JSON.stringify(m.recomputed)}`)).toEqual([]);
  });

  it("compares a non-zero number of fields for every pattern (cannot pass vacuously)", () => {
    for (const pattern of patternsDataset.patterns) {
      expect(report.fieldsComparedByPattern[pattern.pattern_id] ?? 0).toBeGreaterThan(0);
    }
    // 19 base `observed` stats alone are well above this floor.
    const minPerPattern = Math.min(...patternsDataset.patterns.map((p) => report.fieldsComparedByPattern[p.pattern_id] ?? 0));
    expect(minPerPattern).toBeGreaterThanOrEqual(30);
    expect(report.fieldsCompared).toBeGreaterThan(5000);
  });

  it("compares the enterprise baseline from both files (ok and non-empty)", () => {
    const fields = report.enterpriseComparisons.map((c) => c.field);
    expect(fields).toContain("patterns_file.enterprise.high_rate");
    expect(fields).toContain("events_file.enterprise.gross_amount_total");
    expect(fields).toContain("patterns_file.enterprise.severity_counts.High");
    expect(report.enterpriseComparisons.length).toBeGreaterThan(40);
    expect(report.enterpriseComparisons.every((c) => c.ok)).toBe(true);
  });

  it("compares the null-valued money sums of the 24 patterns that store null gross/net/recovery", () => {
    const nullGross = patternsDataset.patterns.filter((p) => (p.observed.gross_amount as number | null) === null);
    expect(nullGross).toHaveLength(24);
    for (const pattern of nullGross) {
      const comparison = report.patternComparisons.find((c) => c.patternId === pattern.pattern_id && c.field === "observed.gross_amount");
      expect(comparison).toMatchObject({ stored: null, recomputed: null, ok: true });
    }
  });

  it("leaves no stored statistic un-recomputed (notCheckable is empty)", () => {
    expect(report.notCheckable).toEqual([]);
  });

  it("is wired into validateRiskDataset, which stays valid on the real data", () => {
    expect(validateRiskDataset(eventsDataset, patternsDataset)).toMatchObject({ valid: true });
    expect(validateRiskPatternStatistics(eventsDataset, patternsDataset)).toEqual({ valid: true, issues: [] });
  });

  it("makes validateRiskDataset fail when a real stored statistic is corrupted", () => {
    const corrupted = structuredClone(patternsDataset);
    corrupted.patterns[0]!.observed.high_rate += 0.01;
    const result = validateRiskDataset(eventsDataset, corrupted);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.message.includes(corrupted.patterns[0]!.pattern_id) && i.message.includes("observed.high_rate"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tolerance rule
// ---------------------------------------------------------------------------

describe("tolerance rules", () => {
  const ROUND2 = { kind: "rounded", minDecimals: 2 } as const;
  const MONEY = { kind: "money" } as const;
  const COUNT = { kind: "count" } as const;

  it("counts are exact", () => {
    expect(agrees(COUNT, 5, 5)).toBe(true);
    expect(agrees(COUNT, 5, 6)).toBe(false);
  });

  it("accepts half-unit rounding at the stored precision and rejects more", () => {
    expect(agrees(ROUND2, 4.67, 4.666666)).toBe(true);
    expect(agrees(ROUND2, 0.05, 0.054)).toBe(true);
    expect(agrees(ROUND2, 0.05, 0.056)).toBe(false);
    expect(agrees(ROUND2, 4.68, 4.666666)).toBe(false);
  });

  it("does not give integer-looking stored values a +/-0.5 tolerance", () => {
    expect(decimalPlaces(2)).toBe(0);
    expect(agrees(ROUND2, 2, 2.5)).toBe(false);
    expect(agrees(ROUND2, 2, 2.004)).toBe(true);
  });

  it("money sums allow 0.005 absolute", () => {
    expect(agrees(MONEY, 1000, 1000.004)).toBe(true);
    expect(agrees(MONEY, 1000, 1000.01)).toBe(false);
  });

  it("treats null as its own value, never as 0", () => {
    expect(agrees(MONEY, null, null)).toBe(true);
    expect(agrees(MONEY, 0, null)).toBe(false);
    expect(agrees(MONEY, null, 0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// (b) Synthetic fixtures with deliberate corruption
// ---------------------------------------------------------------------------

interface EventSpec {
  id: string;
  classification: "Low" | "Moderate" | "High";
  financial?: { gross: number; net: number; recovery: number };
  potentialImpact: number;
  open: boolean;
  delays: [number | null, number | null, number | null];
  issue?: string;
  rootCause?: string;
}

function buildEvent(spec: EventSpec): RiskEvent {
  const base = makeRiskEvent();
  return {
    ...base,
    event_id: spec.id,
    issue: spec.issue ?? "Other issue",
    event_type: spec.financial ? "Financial" : "Non-Financial",
    classification: spec.classification,
    financial: {
      gross_amount: spec.financial?.gross ?? null,
      net_amount_reported: spec.financial?.net ?? null,
      recovery_amount_reported: spec.financial?.recovery ?? null,
      net_amount_for_analysis: spec.financial?.net ?? null,
      recovery_amount_for_analysis: spec.financial?.recovery ?? null,
      potential_impact: spec.potentialImpact,
      provision_status: null,
    },
    workflow: {
      ...base.workflow,
      status: spec.open ? "Remediation in Progress" : "Closed",
      is_open: spec.open,
    },
    risk: { ...base.risk, root_cause: spec.rootCause ?? "Other root cause" },
    timeline: {
      ...base.timeline,
      detection_delay_days: spec.delays[0],
      recording_delay_days: spec.delays[1],
      occurrence_to_record_days: spec.delays[2],
    },
  };
}

const FIX_PATTERN_ID = "PAT-FIX-0001";
const FIX_LISTED_IDS = ["FIX-E1", "FIX-E2", "FIX-E3", "FIX-E4"];

/**
 * Hand-calculated fixture: 4 pattern events inside a 10-event enterprise.
 *
 *  pattern events    class     gross/net/rec         impact  open  delays (det, rec, occ)
 *  FIX-E1            High      1000 / 900 / 100      5000    yes   2, 1, 3
 *  FIX-E2            High      2000 / 1500 / 500     3000    no    4, 3, 7
 *  FIX-E3            Moderate  null                 1000    yes   6, 2, 8
 *  FIX-E4            Low       null                 1000    yes   null x3
 *  6 other events    Low, closed, no financials, impact 10000, delays 5, 2, 7
 *
 * Pattern: n=4, severity 1/1/2, high_rate 0.5, enterprise high_rate 0.2, lift 2.5, open 3 (0.75),
 * gross 3000, net 2400, recovery 600, impact 10000, delay means 4/2/6, medians 4/2/7.
 * Enterprise: n=10, High 2 (0.2), open 3 (0.3), impact 70000, delay means 4.6667/2/6.6667, medians 5/2/7.
 */
function buildFixture() {
  const patternEvents = [
    buildEvent({ id: "FIX-E1", classification: "High", financial: { gross: 1000, net: 900, recovery: 100 }, potentialImpact: 5000, open: true, delays: [2, 1, 3], issue: "Fix issue", rootCause: "Fix RC" }),
    buildEvent({ id: "FIX-E2", classification: "High", financial: { gross: 2000, net: 1500, recovery: 500 }, potentialImpact: 3000, open: false, delays: [4, 3, 7], issue: "Fix issue", rootCause: "Fix RC" }),
    buildEvent({ id: "FIX-E3", classification: "Moderate", potentialImpact: 1000, open: true, delays: [6, 2, 8], issue: "Fix issue", rootCause: "Fix RC" }),
    buildEvent({ id: "FIX-E4", classification: "Low", potentialImpact: 1000, open: true, delays: [null, null, null], issue: "Fix issue", rootCause: "Fix RC" }),
  ];
  const others = Array.from({ length: 6 }, (_, i) =>
    buildEvent({ id: `FIX-O${i + 1}`, classification: "Low", potentialImpact: 10000, open: false, delays: [5, 2, 7] }),
  );
  const events = [...patternEvents, ...others];

  const observed = {
    event_count: 4,
    severity: { Low: 1, Moderate: 1, High: 2 },
    high_rate: 0.5,
    high_rate_pct: 50,
    enterprise_high_rate: 0.2,
    enterprise_high_rate_pct: 20,
    high_rate_lift: 2.5,
    open_events: 3,
    open_rate: 0.75,
    gross_amount: 3000,
    net_amount: 2400,
    recovery_amount: 600,
    potential_impact: 10000,
    detection_delay_mean_days: 4,
    detection_delay_median_days: 4,
    recording_delay_mean_days: 2,
    recording_delay_median_days: 2,
    occurrence_to_record_mean_days: 6,
    occurrence_to_record_median_days: 7,
  };
  const compared = {
    high_rate_lift: 2.5,
    high_rate_delta_pct_points: 30,
    detection_delay_delta_days: -0.67,
    recording_delay_delta_days: 0,
    occurrence_to_record_delta_days: -0.67,
  };
  const dimensions = { issue: "Fix issue", root_cause: "Fix RC" };
  const payload = makeGroqFactPayload(
    { observed, compared_with_enterprise: compared, dimensions, matching_event_ids: FIX_LISTED_IDS },
    FIX_PATTERN_ID,
  );
  const pattern: Pattern = makePattern({
    pattern_id: FIX_PATTERN_ID,
    dimensions,
    observed,
    compared_with_enterprise: compared,
    graph_filter: { issue: ["Fix issue"], root_cause: ["Fix RC"] },
    matching_event_ids: FIX_LISTED_IDS,
    groq_fact_payload: payload,
  });
  const enterprise = makeEnterpriseBaseline({
    event_count: 10,
    severity_counts: { Low: 7, Moderate: 1, High: 2 },
    high_rate: 0.2,
    high_rate_pct: 20,
    open_event_count: 3,
    open_rate: 0.3,
    open_rate_pct: 30,
    detection_delay_mean_days: 4.67,
    detection_delay_median_days: 5,
    recording_delay_mean_days: 2,
    recording_delay_median_days: 2,
    occurrence_to_record_mean_days: 6.67,
    occurrence_to_record_median_days: 7,
    gross_amount_total: 3000,
    net_amount_total: 2400,
    recovery_amount_total: 600,
    potential_impact_total: 70000,
    occurrence_date_min: "2026-01-15",
    occurrence_date_max: "2026-01-15",
  });
  const eventsDataset = makeEventsDataset(events, { enterprise });
  const patternsDataset = makePatternsDataset([pattern], [FIX_PATTERN_ID], { enterprise });
  return { events, eventsDataset, patternsDataset };
}

function run(mutate: (fixture: ReturnType<typeof buildFixture>) => void = () => {}) {
  const fixture = buildFixture();
  mutate(fixture);
  return recomputePatternStatistics(fixture.events, fixture.patternsDataset, {
    eventsFileEnterprise: fixture.eventsDataset.enterprise,
  });
}

describe("recomputePatternStatistics on a hand-calculated fixture", () => {
  it("passes with 0 mismatches when the stored statistics are correct", () => {
    const report = run();
    expect(report.mismatches).toEqual([]);
    expect(report.fieldsComparedByPattern[FIX_PATTERN_ID]).toBeGreaterThan(30);
    expect(report.notCheckable).toEqual([]);
  });

  it("detects a corrupted event_count", () => {
    const report = run(({ patternsDataset }) => {
      patternsDataset.patterns[0]!.observed.event_count = 5;
    });
    expect(fieldsOf(report.mismatches)).toContain("observed.event_count");
  });

  it("detects a corrupted severity count (including a zero-count key)", () => {
    const report = run(({ patternsDataset }) => {
      patternsDataset.patterns[0]!.observed.severity = { Low: 1, Moderate: 0, High: 2 };
    });
    expect(fieldsOf(report.mismatches)).toEqual(["observed.severity.Moderate"]);
  });

  it("detects rates beyond the rounding tolerance", () => {
    const beyond = run(({ patternsDataset }) => {
      patternsDataset.patterns[0]!.observed.open_rate = 0.7501;
    });
    expect(fieldsOf(beyond.mismatches)).toEqual(["observed.open_rate"]);

    const highRate = run(({ patternsDataset }) => {
      patternsDataset.patterns[0]!.observed.high_rate = 0.5002;
    });
    expect(fieldsOf(highRate.mismatches)).toEqual(["observed.high_rate"]);
  });

  it("detects a corrupted money sum", () => {
    const report = run(({ patternsDataset }) => {
      patternsDataset.patterns[0]!.observed.net_amount = 2400.01;
    });
    expect(fieldsOf(report.mismatches)).toEqual(["observed.net_amount"]);
  });

  it("detects a corrupted delay median", () => {
    const report = run(({ patternsDataset }) => {
      patternsDataset.patterns[0]!.observed.occurrence_to_record_median_days = 6;
    });
    expect(fieldsOf(report.mismatches)).toEqual(["observed.occurrence_to_record_median_days"]);
  });

  it("detects a corrupted lift", () => {
    const report = run(({ patternsDataset }) => {
      patternsDataset.patterns[0]!.observed.high_rate_lift = 3;
    });
    expect(fieldsOf(report.mismatches)).toEqual(["observed.high_rate_lift"]);
  });

  it("detects corrupted compared_with_enterprise deltas", () => {
    const report = run(({ patternsDataset }) => {
      patternsDataset.patterns[0]!.compared_with_enterprise.detection_delay_delta_days = 0.5;
    });
    expect(fieldsOf(report.mismatches)).toContain("compared_with_enterprise.detection_delay_delta_days");
  });

  it("detects a duplicate ID in matching_event_ids", () => {
    const report = run(({ patternsDataset }) => {
      patternsDataset.patterns[0]!.matching_event_ids = [...FIX_LISTED_IDS, "FIX-E1"];
    });
    const duplicate = report.mismatches.find((m) => m.field === "matching_event_ids.duplicates");
    expect(duplicate?.stored).toEqual(["FIX-E1"]);
    // The statistics themselves are still derived from the distinct events.
    expect(fieldsOf(report.mismatches)).not.toContain("observed.event_count");
  });

  it("detects an unknown ID in matching_event_ids", () => {
    const report = run(({ patternsDataset }) => {
      patternsDataset.patterns[0]!.matching_event_ids = [...FIX_LISTED_IDS, "FIX-GHOST"];
    });
    const unknown = report.mismatches.find((m) => m.field === "matching_event_ids.unknown_ids");
    expect(unknown?.stored).toEqual(["FIX-GHOST"]);
  });

  it("detects an event that violates the pattern's dimensions / graph_filter", () => {
    const report = run(({ events }) => {
      events[0]!.issue = "Some other issue";
    });
    expect(fieldsOf(report.mismatches)).toEqual(expect.arrayContaining(["dimensions.issue", "graph_filter.issue"]));
  });

  it("detects a non-listed event that matches the graph_filter (incomplete matching_event_ids)", () => {
    const report = run(({ events }) => {
      events[4]!.issue = "Fix issue";
      events[4]!.risk.root_cause = "Fix RC";
    });
    expect(fieldsOf(report.mismatches)).toContain("matching_event_ids.completeness");
  });

  it("detects a corrupted enterprise baseline in the patterns file and in the events file", () => {
    const report = run(({ patternsDataset, eventsDataset }) => {
      patternsDataset.enterprise.high_rate_pct = 5.1;
      eventsDataset.enterprise.gross_amount_total = 1;
    });
    const fields = fieldsOf(report.mismatches);
    expect(fields).toContain("patterns_file.enterprise.high_rate_pct");
    expect(fields).toContain("events_file.enterprise.gross_amount_total");
  });

  it("detects a groq_fact_payload that disagrees with the pattern", () => {
    const report = run(({ patternsDataset }) => {
      patternsDataset.patterns[0]!.groq_fact_payload.observed = { ...patternsDataset.patterns[0]!.groq_fact_payload.observed, open_events: 99 };
    });
    expect(fieldsOf(report.mismatches)).toEqual(["groq_fact_payload.observed"]);
  });

  it("flags a priority_queue whose metadata does not match", () => {
    const report = run(({ patternsDataset }) => {
      patternsDataset.priority_queue_metadata.deduplicated_count = 7;
    });
    expect(fieldsOf(report.mismatches)).toContain("priority_queue_metadata.deduplicated_count");
  });

  it("is surfaced as a validation error by validateRiskPatternStatistics", () => {
    const fixture = buildFixture();
    fixture.patternsDataset.patterns[0]!.observed.gross_amount = 1;
    const result = validateRiskPatternStatistics(fixture.eventsDataset, fixture.patternsDataset);
    expect(result.valid).toBe(false);
    expect(result.issues[0]?.message).toContain(`pattern "${FIX_PATTERN_ID}" observed.gross_amount`);
  });

  it("defines lift as null when the enterprise high rate is 0", () => {
    const fixture = buildFixture();
    for (const event of fixture.events) event.classification = "Low";
    const pattern = fixture.patternsDataset.patterns[0]!;
    pattern.observed = {
      ...pattern.observed,
      severity: { Low: 4, Moderate: 0, High: 0 },
      high_rate: 0,
      high_rate_pct: 0,
      enterprise_high_rate: 0,
      enterprise_high_rate_pct: 0,
      high_rate_lift: null as unknown as number,
    };
    pattern.compared_with_enterprise = { ...pattern.compared_with_enterprise, high_rate_lift: null as unknown as number, high_rate_delta_pct_points: 0 };
    const liftComparisons = (stored: unknown) => {
      pattern.observed.high_rate_lift = stored as number;
      return recomputePatternStatistics(fixture.events, fixture.patternsDataset).patternComparisons.find((c) => c.field === "observed.high_rate_lift")!;
    };
    expect(liftComparisons(null)).toMatchObject({ recomputed: null, ok: true });
    expect(liftComparisons(0)).toMatchObject({ recomputed: null, ok: false });
  });
});

// ---------------------------------------------------------------------------
// (c) Null handling
// ---------------------------------------------------------------------------

describe("null handling", () => {
  function nullFixture(storedGross: number | null) {
    const matching = [
      buildEvent({ id: "NUL-1", classification: "Low", potentialImpact: 100, open: true, delays: [null, 2, 4], issue: "Null issue" }),
      buildEvent({ id: "NUL-2", classification: "Low", potentialImpact: 200, open: false, delays: [null, 4, 6], issue: "Null issue" }),
    ];
    const rest = [buildEvent({ id: "NUL-3", classification: "High", financial: { gross: 50, net: 40, recovery: 10 }, potentialImpact: 1, open: false, delays: [1, 1, 1] })];
    const events = [...matching, ...rest];
    const pattern = makePattern({
      pattern_id: "PAT-NUL-0001",
      dimensions: { issue: "Null issue" },
      graph_filter: { issue: ["Null issue"] },
      matching_event_ids: ["NUL-1", "NUL-2"],
    });
    pattern.observed = { ...pattern.observed, gross_amount: storedGross as number, net_amount: null as unknown as number, recovery_amount: null as unknown as number };
    const patternsDataset = makePatternsDataset([pattern], ["PAT-NUL-0001"]);
    return recomputePatternStatistics(events, patternsDataset);
  }

  const find = (report: ReturnType<typeof nullFixture>, field: string) =>
    report.patternComparisons.find((c) => c.patternId === "PAT-NUL-0001" && c.field === field)!;

  it("recomputes null (not 0) money sums when every matching event has a null value, and accepts a stored null", () => {
    const report = nullFixture(null);
    for (const field of ["observed.gross_amount", "observed.net_amount", "observed.recovery_amount"]) {
      expect(find(report, field)).toMatchObject({ stored: null, recomputed: null, ok: true });
    }
    // potential_impact is populated on every event, so it is a real sum.
    expect(find(report, "observed.potential_impact").recomputed).toBe(300);
  });

  it("rejects a stored 0 where the recomputation is null", () => {
    const report = nullFixture(0);
    expect(find(report, "observed.gross_amount")).toMatchObject({ stored: 0, recomputed: null, ok: false });
  });

  it("recomputes null delay mean/median when every delay is null, and means over populated values only otherwise", () => {
    const report = nullFixture(null);
    expect(find(report, "observed.detection_delay_mean_days").recomputed).toBeNull();
    expect(find(report, "observed.detection_delay_median_days").recomputed).toBeNull();
    expect(find(report, "observed.recording_delay_mean_days").recomputed).toBe(3);
    expect(find(report, "observed.occurrence_to_record_median_days").recomputed).toBe(5);
  });

  it("sums only populated values when some are null (mixed case does not become null or 0)", () => {
    const report = run();
    // FIX-E3 and FIX-E4 have null gross; FIX-E1 + FIX-E2 are populated.
    const gross = report.patternComparisons.find((c) => c.field === "observed.gross_amount")!;
    expect(gross).toMatchObject({ stored: 3000, recomputed: 3000, ok: true });
  });
});
