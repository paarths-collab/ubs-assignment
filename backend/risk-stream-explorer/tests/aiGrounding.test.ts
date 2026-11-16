import { describe, expect, it } from "vitest";
import {
  checkEventIds,
  checkGrounding,
  checkModelGrounding,
  checkNumbers,
  checkPatternIds,
  collectResultTexts,
  extractNumericTokens,
} from "../src/services/aiGrounding";

const KNOWN_EVENTS = ["SIM-0000025", "SIM-0000130", "SIM-0000999"];
const ALLOWED_EVENTS = ["SIM-0000025", "SIM-0000130"];

describe("checkEventIds (tolerant extraction)", () => {
  it.each([
    ["SIM-0000025", "canonical"],
    ["SIM-25", "short form"],
    ["sim 0000025", "lower-case with a space"],
    ["SIM–25", "en dash"],
    ["SIM—25", "em dash"],
    ["SIM−25", "unicode minus"],
    ["SIM_25", "underscore"],
    ["SIM0000025", "no separator"],
    ["Sim - 25", "spaces around the hyphen"],
  ])("resolves %s (%s) to the canonical ID", (written) => {
    const report = checkEventIds([`See ${written} for detail.`], KNOWN_EVENTS, ALLOWED_EVENTS);
    expect(report.mentioned).toEqual(["SIM-0000025"]);
    expect(report.unknownEventIds).toEqual([]);
    expect(report.outOfScopeEventIds).toEqual([]);
  });

  it("separates IDs missing from the dataset from IDs that exist but are out of scope", () => {
    const report = checkEventIds(
      ["Compare SIM-0000025 with SIM-0000999 and SIM-9999999, also sim_26."],
      KNOWN_EVENTS,
      ALLOWED_EVENTS,
    );
    expect(report.unknownEventIds).toEqual(["SIM-9999999", "SIM-0000026"]);
    expect(report.outOfScopeEventIds).toEqual(["SIM-0000999"]);
  });

  it("does not mistake ordinary prose for an Event ID", () => {
    const report = checkEventIds(["This simulation covers 25 events; the SIM data is synthetic, similar to 100 others."], KNOWN_EVENTS, ALLOWED_EVENTS);
    expect(report.mentioned).toEqual([]);
  });

  it("understands fixture-style IDs that carry a word part", () => {
    const report = checkEventIds(["See SIM-TEST-0001 and SIM-TEST-0002."], ["SIM-TEST-0001", "SIM-TEST-0002", "SIM-TEST-0003"], ["SIM-TEST-0001"]);
    expect(report.mentioned).toEqual(["SIM-TEST-0001", "SIM-TEST-0002"]);
    expect(report.outOfScopeEventIds).toEqual(["SIM-TEST-0002"]);
  });
});

describe("checkPatternIds", () => {
  const known = ["PAT-0067", "PAT-0070"];

  it("rejects a pattern ID that does not exist and tolerates written variants of one that does", () => {
    const report = checkPatternIds(["Related: PAT-0067, pat_67 and PAT-9999."], known);
    expect(report.unknownPatternIds).toEqual(["PAT-9999"]);
    expect(report.mentioned).toEqual(["PAT-0067", "PAT-9999"]);
  });

  it("flags an existing pattern that is outside the allowed set", () => {
    const report = checkPatternIds(["See PAT-0070."], known, ["PAT-0067"]);
    expect(report.outOfScopePatternIds).toEqual(["PAT-0070"]);
    expect(report.unknownPatternIds).toEqual([]);
  });

  it("does not treat a first name or the word 'pattern' as an ID", () => {
    expect(checkPatternIds(["Pat 3 reviewed the pattern 12 times."], known).mentioned).toEqual([]);
  });
});

describe("checkNumbers (numeric grounding)", () => {
  const evidence = {
    observed: {
      event_count: 5,
      high_rate: 0.1,
      high_rate_pct: 10.0,
      high_rate_lift: 7.84,
      high_rate_delta_pct_points: 34.9,
      gross_amount: 2512564.44,
      detection_delay_mean_days: 2.46,
      potential_impact: 157493.22,
    },
    matching_event_ids: ["SIM-0000025", "SIM-0000130"],
    trend: { start_month: "2026-03", end_month: "2026-05" },
    note: "The recent window holds 14 events (since 2026-03).",
  };
  const ungrounded = (text: string) => checkNumbers([text], evidence).ungroundedNumbers;
  const undated = (text: string) => checkNumbers([text], evidence).ungroundedDates;

  it("accepts fraction <-> percent renderings and rounding to the written precision", () => {
    expect(ungrounded("The High rate is 10%.")).toEqual([]);
    expect(ungrounded("The High rate is 10.0%.")).toEqual([]);
    expect(ungrounded("The High rate is 0.1.")).toEqual([]);
    expect(ungrounded("Lift is 7.84x, about 7.8x or roughly 8x the baseline.")).toEqual([]);
    expect(ungrounded("The delta is 34.9 pp (about 35 percentage points).")).toEqual([]);
    expect(ungrounded("Mean delay is 2.46 days, or 2.5 days.")).toEqual([]);
  });

  it("rejects a fabricated percentage or multiple", () => {
    expect(ungrounded("The High rate is 37%.")).toEqual(["37%"]);
    expect(ungrounded("Lift is 9.1x.")).toEqual(["9.1x"]);
    expect(ungrounded("The delta is 12 pp.")).toEqual(["12 pp"]);
  });

  it("accepts abbreviated and separated amounts and rejects wrong ones", () => {
    expect(ungrounded("Gross exposure is $2.5m.")).toEqual([]);
    expect(ungrounded("Gross exposure is $2.51 million, i.e. 2,512,564 in total.")).toEqual([]);
    expect(ungrounded("Impact is about 157k.")).toEqual([]);
    expect(ungrounded("Impact is USD 157,493.")).toEqual([]);
    expect(ungrounded("Gross exposure is $9.5m.")).toEqual(["$9.5m"]);
    expect(ungrounded("Gross exposure is $2,600,000.")).toEqual(["$2,600,000"]);
  });

  it("requires a figure attached to a unit to be grounded, whatever its size", () => {
    expect(ungrounded("It shows 3 events.")).toEqual(["3 events"]);
    expect(ungrounded("It shows 3 High-severity events.")).toEqual(["3 High-severity events"]);
    expect(ungrounded("Open for 45 days.")).toEqual(["45 days"]);
    expect(ungrounded("A 1-month lag.")).toEqual(["1-month"]);
    expect(ungrounded("It shows 5 events and 14 events.")).toEqual([]);
    expect(ungrounded("It shows 2 events.")).toEqual([]); // two IDs in matching_event_ids
  });

  it("requires every bare number above 10, and every decimal, to be grounded", () => {
    expect(ungrounded("There were 42 of them.")).toEqual(["42"]);
    expect(ungrounded("A score of 3.7.")).toEqual(["3.7"]);
    expect(ungrounded("There were 14 of them.")).toEqual([]);
  });

  it("exempts bare integers 0-10 (list counts and ordinals) and numbered-list markers", () => {
    expect(ungrounded("Ask these 2 questions first, then 9 follow-ups; this is the 3rd step.")).toEqual([]);
    expect(ungrounded("2. Check the owner")).toEqual([]);
    expect(ungrounded("1. First point\n2. Second point\n10) Tenth point")).toEqual([]);
    expect(ungrounded("(3) A parenthesised marker")).toEqual([]);
  });

  it("ignores the digits inside SIM- and PAT- identifiers", () => {
    expect(ungrounded("See SIM-0000025, SIM-0000999 and PAT-0067, plus sim_8812345.")).toEqual([]);
  });

  it("requires dates and years to appear in the evidence", () => {
    expect(undated("The window starts in 2026-03 and ends in March 2026.")).toEqual([]);
    expect(undated("Since 2026 the trend is rising.")).toEqual([]);
    expect(undated("This will peak in 2031.")).toEqual(["2031"]);
    expect(undated("It began on 2024-11-02.")).toEqual(["2024-11-02"]);
    expect(undated("It began in November 2024.")).toEqual(["November 2024"]);
    expect(ungrounded("It began in November 2024.")).toEqual([]); // the date is judged as a date, not as figures
  });

  it("documents the known limitation: number words are not interpreted", () => {
    expect(ungrounded("There were forty-two events and seven incidents.")).toEqual([]);
  });

  it("extracts tokens with their units", () => {
    const tokens = extractNumericTokens("Up 12.5% to $3.2bn across 4 events");
    expect(tokens.map((t) => [t.mantissa, t.unit])).toEqual([
      [12.5, "percent"],
      [3.2, "currency"],
      [4, "count"],
    ]);
  });
});

describe("checkGrounding (combined)", () => {
  const evidence = { observed: { event_count: 5, high_rate: 0.1 }, matching_event_ids: ["SIM-0000025", "SIM-0000130"] };
  const ctx = {
    evidence,
    knownEventIds: KNOWN_EVENTS,
    allowedEventIds: ALLOWED_EVENTS,
    knownPatternIds: ["PAT-0067"],
    allowedPatternIds: ["PAT-0067"],
  };

  it("passes grounded text and lists the checks that ran", () => {
    const result = checkGrounding(["SIM-25 and SIM-0000130 account for 10% of the 5 events (PAT-0067)."], ctx);
    expect(result).toEqual({ ok: true, failures: [], checks: ["event-ids", "pattern-ids", "numeric-grounding"] });
  });

  it("emits stable machine-readable failure strings", () => {
    const result = checkGrounding(
      ["SIM-9999999 caused 42% losses; SIM-0000999 is related; PAT-0001 too; and 2031 looks bad."],
      ctx,
    );
    expect(result.ok).toBe(false);
    expect(result.failures).toEqual([
      "unknown-event-id:SIM-9999999",
      "out-of-scope-event-id:SIM-0000999",
      "unknown-pattern-id:PAT-0001",
      "ungrounded-number:42%",
      "ungrounded-date:2031",
    ]);
    expect(result.checks).toEqual([]);
  });

  it("treats an ID that appears inside the evidence payload as in scope", () => {
    const withExtra = { ...ctx, evidence: { ...evidence, top_event_ids: ["SIM-0000999"] } };
    expect(checkGrounding(["SIM-0000999 is the largest."], withExtra).ok).toBe(true);
  });

  it("skips numeric grounding when no evidence is supplied", () => {
    const result = checkGrounding(["There were 4242 events."], { knownEventIds: KNOWN_EVENTS, allowedEventIds: ALLOWED_EVENTS });
    expect(result.ok).toBe(true);
    expect(result.checks).toEqual(["event-ids"]);
  });

  it("collects every string of a structured result", () => {
    expect(collectResultTexts({ a: "x", b: ["y", "z"], c: { d: "w", n: 3 } })).toEqual(["x", "y", "z", "w"]);
  });
});


describe("model quantitative claims cannot borrow an unrelated evidence value", () => {
  const ctx = { evidence: { observed: { event_count: 10, high_rate_pct: 40, detection_delay_mean_days: 3.4 } }, knownEventIds: [], allowedEventIds: [] };
  it.each(["The High rate is 10%.", "The detection delay is $40.", "The High rate is 40%.", "There were seven events."])("rejects %s, leaving figures to deterministic panels", (text) => {
    expect(checkModelGrounding([text], ctx).ok).toBe(false);
  });
  it("accepts qualitative interpretation without certifying numerical claims", () => {
    expect(checkModelGrounding(["The verified severity mix warrants review; it does not establish causation."], ctx).ok).toBe(true);
  });
  it.each([
    "The High rate is .5%.",
    "The exposure is $.5m.",
    "The change is -.5 percentage points.",
    "The rate is ５％.",
    "The share is ½.",
    "The latency is p99.",
    "The net exposure is ten million USD.",
    "There were twenty affected transactions.",
    "Ten remained unresolved.",
    "Twenty of the affected transactions remain open.",
    "The value is one point one.",
    "One of the events remains open.",
    "There were **twenty** affected transactions.",
    "The share is five%.",
    "There were twenty-one affected transactions.",
    "There were three hundred and twenty transactions.",
    "The rate is five per cent.",
    "The shift is ten basis points.",
    "The backlog spans seven weeks.",
    "There were four organisations and six owners.",
    "The cost was CHF ten.",
    "The cost was $ten.",
    "Half of the events were closed.",
  ])("withholds common formatted and spelled quantities: %s", (text) => {
    const result = checkModelGrounding([text], ctx);
    expect(result.ok).toBe(false);
    expect(result.checks).not.toContain("numeric-grounding");
  });
  it("keeps qualitative suggestions, list markers and scoped citations usable", () => {
    const result = checkModelGrounding([
      "One possible explanation for the events is a workflow gap.",
      "1. Review the evidence.\n2. Test this hypothesis.",
      "Review SIM-TEST-0001 alongside PAT-0067.",
    ], { ...ctx, knownEventIds: ["SIM-TEST-0001"], allowedEventIds: ["SIM-TEST-0001"], knownPatternIds: ["PAT-0067"], allowedPatternIds: ["PAT-0067"] });
    expect(result.ok).toBe(true);
  });
  it("extracts leading decimals as complete quantities for deterministic diagnostics", () => {
    expect(extractNumericTokens("The rate is .5% and exposure $.25m.").map(({ mantissa, unit, scale }) => [mantissa, unit, scale])).toEqual([
      [0.5, "percent", 1], [0.25, "currency", 1_000_000],
    ]);
  });
});
