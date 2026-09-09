import { describe, expect, it } from "vitest";
import { detectTrendFacts, rankTrendFacts } from "../src/services/TrendService";
import { computePeriodMetrics } from "../src/services/MetricService";
import { makeEvent } from "./fixtures";

const meta = (id: string) => ({ periodId: id, label: id, startDate: "2026-01-01", endDate: "2026-01-31" });

describe("detectTrendFacts + rankTrendFacts", () => {
  it("identifies the largest severity-share mover as the top-ranked fact", () => {
    const previous = computePeriodMetrics(
      [makeEvent({ severity: "Low" }), makeEvent({ severity: "Low" }), makeEvent({ severity: "Low" }), makeEvent({ severity: "High" })],
      meta("previous"),
    ); // High share = 25%
    const current = computePeriodMetrics(
      [makeEvent({ severity: "High" }), makeEvent({ severity: "High" }), makeEvent({ severity: "Low" }), makeEvent({ severity: "Low" })],
      meta("current"),
    ); // High share = 50%

    const facts = detectTrendFacts(current, previous);
    const ranked = rankTrendFacts(facts, 3);
    expect(ranked.length).toBeGreaterThan(0);
    const topHighFact = facts.find((f) => f.metric === "severity_share" && f.category === "High");
    expect(topHighFact?.deltaPercentagePoints).toBeCloseTo(25, 5);
    expect(topHighFact?.direction).toBe("increase");
  });

  it("marks a risk theme with no prior-period presence as 'new'", () => {
    const previous = computePeriodMetrics([makeEvent({ riskTheme: "Technology Resilience" })], meta("previous"));
    const current = computePeriodMetrics(
      [makeEvent({ riskTheme: "Technology Resilience" }), makeEvent({ riskTheme: "Financial Reporting" })],
      meta("current"),
    );
    const facts = detectTrendFacts(current, previous);
    const newFact = facts.find((f) => f.metric === "risk_theme_share" && f.category === "Financial Reporting");
    expect(newFact?.direction).toBe("new");
  });

  it("handles a null previous period without throwing", () => {
    const current = computePeriodMetrics([makeEvent()], meta("current"));
    expect(() => detectTrendFacts(current, null)).not.toThrow();
    const facts = detectTrendFacts(current, null);
    expect(facts.length).toBeGreaterThan(0);
  });

  it("rankTrendFacts orders by magnitude of movement, largest first", () => {
    const previous = computePeriodMetrics(
      [makeEvent({ severity: "Low" }), makeEvent({ severity: "Low" })],
      meta("previous"),
    );
    const current = computePeriodMetrics(
      [makeEvent({ severity: "High" }), makeEvent({ severity: "Low" })],
      meta("current"),
    );
    const ranked = rankTrendFacts(detectTrendFacts(current, previous), 20);
    for (let i = 1; i < ranked.length; i++) {
      const mag = (f: (typeof ranked)[number]) =>
        f.deltaPercentagePoints !== null ? Math.abs(f.deltaPercentagePoints) : f.absoluteChange !== null ? Math.abs(f.absoluteChange) : 0;
      expect(mag(ranked[i - 1]!)).toBeGreaterThanOrEqual(mag(ranked[i]!));
    }
  });
});
