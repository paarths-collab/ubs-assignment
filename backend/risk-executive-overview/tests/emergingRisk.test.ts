import { describe, expect, it } from "vitest";
import { buildScenarioSignals, buildAttentionCards } from "../src/services/ScenarioService";
import { RiskRepository } from "../src/repositories/RiskRepository";
import { makeEvent, makeConfig, makeFilters, resetCounter } from "./fixtures";

/**
 * The "emerging" attention lens: the scenario whose High-severity count is
 * rising fastest between the earlier and more recent half of the filtered
 * window. Built on the same trend split as computeKpiDeltas, applied per
 * scenario instead of to the whole portfolio.
 */
describe("Emerging Risk attention lens", () => {
  const config = makeConfig();
  // dateFrom=Jan1, dateTo=Jan5 -> midpoint=Jan3. earlier: Jan1-2. recent: Jan3-5.
  const filters = makeFilters({ dateFrom: "2025-01-01", dateTo: "2025-01-05" });

  it("surfaces the scenario with rising High-severity events as the emerging card, not just the largest scenario", () => {
    resetCounter();
    const risingIssue = "Rising issue detail";
    const stableIssue = "Stable issue detail";

    const events = [
      // Rising: 1 Low event early, 3 events late (2 High) -> event count and High severity both climb.
      makeEvent({ issueDetail: risingIssue, occurrenceDate: "2025-01-01", severity: "Low" }),
      makeEvent({ issueDetail: risingIssue, occurrenceDate: "2025-01-04", severity: "High" }),
      makeEvent({ issueDetail: risingIssue, occurrenceDate: "2025-01-04", severity: "High" }),
      makeEvent({ issueDetail: risingIssue, occurrenceDate: "2025-01-04", severity: "Low" }),

      // Stable/larger: more total events than the rising issue, but flat across the window.
      makeEvent({ issueDetail: stableIssue, occurrenceDate: "2025-01-01", severity: "Low" }),
      makeEvent({ issueDetail: stableIssue, occurrenceDate: "2025-01-01", severity: "Low" }),
      makeEvent({ issueDetail: stableIssue, occurrenceDate: "2025-01-04", severity: "Low" }),
      makeEvent({ issueDetail: stableIssue, occurrenceDate: "2025-01-04", severity: "Low" }),
    ];

    const scenarios = buildScenarioSignals(events, [], config, filters);
    const cards = buildAttentionCards(scenarios);
    const emerging = cards.find((card) => card.lens === "emerging");

    expect(emerging).toBeDefined();
    const risingScenario = scenarios.find((s) => s.issueDetail === risingIssue)!;
    expect(emerging!.scenarioId).toBe(risingScenario.scenarioId);
    expect(emerging!.headline).toContain("1 → 3 events");
    expect(emerging!.reason).toContain("High-severity events rose from 0 to 2");
  });

  it("omits the emerging card entirely when no scenario is genuinely trending up, rather than manufacturing one from noise", () => {
    resetCounter();
    const issue = "Flat issue";
    const events = [
      makeEvent({ issueDetail: issue, occurrenceDate: "2025-01-01" }),
      makeEvent({ issueDetail: issue, occurrenceDate: "2025-01-02" }),
      makeEvent({ issueDetail: issue, occurrenceDate: "2025-01-04" }),
      makeEvent({ issueDetail: issue, occurrenceDate: "2025-01-05" }),
    ];

    const scenarios = buildScenarioSignals(events, [], config, filters);
    const cards = buildAttentionCards(scenarios);

    expect(cards.some((card) => card.lens === "emerging")).toBe(false);
    // The other three lenses are unaffected.
    expect(cards.map((c) => c.lens)).toEqual(["urgency", "exposure", "recurrence"]);
  });

  it("treats a change of exactly one event as noise (still 'stable'), matching the computeTrend convention", () => {
    resetCounter();
    const issue = "Barely moving issue";
    const events = [
      makeEvent({ issueDetail: issue, occurrenceDate: "2025-01-01" }),
      makeEvent({ issueDetail: issue, occurrenceDate: "2025-01-02" }),
      makeEvent({ issueDetail: issue, occurrenceDate: "2025-01-04" }),
      makeEvent({ issueDetail: issue, occurrenceDate: "2025-01-04" }),
      makeEvent({ issueDetail: issue, occurrenceDate: "2025-01-04" }),
    ];

    const scenarios = buildScenarioSignals(events, [], config, filters);
    expect(scenarios[0]!.trend!.direction).toBe("stable");
    const cards = buildAttentionCards(scenarios);
    expect(cards.some((card) => card.lens === "emerging")).toBe(false);
  });

  it("breaks a tie in High-severity growth by picking the scenario with the larger overall event-count growth", () => {
    resetCounter();
    const issueA = "Tie issue A";
    const issueB = "Tie issue B";

    const events = [
      // Issue A: 1 event early -> 3 events late (eventCountChange=+2, clears the
      // >1 "stable" noise threshold so it genuinely counts as "increasing").
      // High-severity change: 0 -> 1.
      makeEvent({ issueDetail: issueA, occurrenceDate: "2025-01-01", severity: "Low" }),
      makeEvent({ issueDetail: issueA, occurrenceDate: "2025-01-04", severity: "High" }),
      makeEvent({ issueDetail: issueA, occurrenceDate: "2025-01-04", severity: "Low" }),
      makeEvent({ issueDetail: issueA, occurrenceDate: "2025-01-04", severity: "Low" }),

      // Issue B: same High-severity change (0 -> 1, a genuine tie with A) but a
      // larger overall event-count increase (1 -> 5), so it should win the tie.
      makeEvent({ issueDetail: issueB, occurrenceDate: "2025-01-01", severity: "Low" }),
      makeEvent({ issueDetail: issueB, occurrenceDate: "2025-01-04", severity: "High" }),
      makeEvent({ issueDetail: issueB, occurrenceDate: "2025-01-04", severity: "Low" }),
      makeEvent({ issueDetail: issueB, occurrenceDate: "2025-01-04", severity: "Low" }),
      makeEvent({ issueDetail: issueB, occurrenceDate: "2025-01-04", severity: "Low" }),
      makeEvent({ issueDetail: issueB, occurrenceDate: "2025-01-04", severity: "Low" }),
    ];

    const scenarios = buildScenarioSignals(events, [], config, filters);
    const scenarioA = scenarios.find((s) => s.issueDetail === issueA)!;
    const scenarioB = scenarios.find((s) => s.issueDetail === issueB)!;

    // Guard the tie itself: both must actually clear the "increasing" bar and
    // tie on highSeverityChange, or this test isn't exercising the tie-break
    // path it claims to.
    expect(scenarioA.trend!.direction).toBe("increasing");
    expect(scenarioB.trend!.direction).toBe("increasing");
    expect(scenarioA.trend!.highSeverityChange).toBe(scenarioB.trend!.highSeverityChange);
    expect(scenarioB.trend!.eventCountChange).toBeGreaterThan(scenarioA.trend!.eventCountChange);

    const cards = buildAttentionCards(scenarios);
    const emerging = cards.find((card) => card.lens === "emerging");
    expect(emerging!.scenarioId).toBe(scenarioB.scenarioId);
  });

  it("attaches a trend to every scenario, and marks it null only when the filtered window cannot be split", () => {
    resetCounter();
    const events = [makeEvent({ occurrenceDate: "2025-01-01" })];
    const singleDayFilters = makeFilters({ dateFrom: "2025-01-01", dateTo: "2025-01-01" });
    const scenarios = buildScenarioSignals(events, [], config, singleDayFilters);
    expect(scenarios[0]!.trend).toBeNull();
  });

  it("finds a real emerging signal against the actual dataset (regression guard)", () => {
    // Pinned to the exact value verified live via curl during development —
    // catches a future change to the ranking or trend logic silently drifting.
    const repository = new RiskRepository();
    const realConfig = repository.getConfig();
    const realFilters = { organisation: "Enterprise-wide", dateFrom: "2024-09-01", dateTo: "2026-08-31", eventType: "All" as const, severity: "All" as const };
    const scenarios = buildScenarioSignals(repository.getEvents(), repository.getPatterns(), realConfig, realFilters);
    const cards = buildAttentionCards(scenarios);
    const emerging = cards.find((card) => card.lens === "emerging");

    expect(emerging).toBeDefined();
    expect(emerging!.title).toBe("Statement delivery failure");
  });
});
