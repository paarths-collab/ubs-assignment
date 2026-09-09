import { describe, expect, it } from "vitest";
import { breakdownByKey, computePeriodMetrics } from "../src/services/MetricService";
import { makeEvent } from "./fixtures";

describe("breakdownByKey", () => {
  it("counts and shares categories, sorted by count descending", () => {
    const events = [
      makeEvent({ riskTheme: "A" }),
      makeEvent({ riskTheme: "A" }),
      makeEvent({ riskTheme: "B" }),
    ];
    const result = breakdownByKey(events, (e) => e.riskTheme);
    expect(result).toEqual([
      { key: "A", count: 2, share: 2 / 3 },
      { key: "B", count: 1, share: 1 / 3 },
    ]);
  });

  it("returns an empty array for no events, never divides by zero", () => {
    expect(breakdownByKey([], (e) => e.riskTheme)).toEqual([]);
  });

  it("respects an optional limit", () => {
    const events = ["A", "B", "C", "D"].map((k) => makeEvent({ riskTheme: k }));
    expect(breakdownByKey(events, (e) => e.riskTheme, 2)).toHaveLength(2);
  });
});

describe("computePeriodMetrics", () => {
  const meta = { periodId: "test", label: "Test", startDate: "2026-01-01", endDate: "2026-01-31" };

  it("computes severity and event-type counts and shares over a mixed set", () => {
    const events = [
      makeEvent({ severity: "High", eventType: "Financial" }),
      makeEvent({ severity: "High", eventType: "Non-Financial" }),
      makeEvent({ severity: "Low", eventType: "Non-Financial" }),
      makeEvent({ severity: "Low", eventType: "Non-Financial" }),
    ];
    const metrics = computePeriodMetrics(events, meta);
    expect(metrics.eventCount).toBe(4);
    expect(metrics.severityCounts).toEqual({ Low: 2, Moderate: 0, High: 2 });
    expect(metrics.severityShares.High).toBe(0.5);
    expect(metrics.severityShares.Moderate).toBe(0);
    expect(metrics.eventTypeCounts).toEqual({ Financial: 1, "Non-Financial": 3 });
    expect(metrics.eventTypeShares.Financial).toBe(0.25);
  });

  it("produces null shares (not divide-by-zero) for an empty period", () => {
    const metrics = computePeriodMetrics([], meta);
    expect(metrics.eventCount).toBe(0);
    expect(metrics.severityShares).toEqual({ Low: null, Moderate: null, High: null });
    expect(metrics.eventTypeShares).toEqual({ Financial: null, "Non-Financial": null });
    expect(metrics.riskThemeBreakdown).toEqual([]);
    expect(metrics.financial.netAmount).toEqual({ total: 0, populatedCount: 0, totalEventCount: 0, average: null });
  });

  it("never treats a missing potential impact as zero exposure", () => {
    const events = [
      makeEvent({ eventType: "Non-Financial", potentialImpact: null }),
      makeEvent({ eventType: "Non-Financial", potentialImpact: null }),
    ];
    const metrics = computePeriodMetrics(events, meta);
    expect(metrics.financial.potentialImpact.populatedCount).toBe(0);
    expect(metrics.financial.potentialImpact.total).toBe(0);
  });

  it("computes average and median delay metrics, ignoring nulls", () => {
    const events = [
      makeEvent({ occurrenceToRecordDays: 2 }),
      makeEvent({ occurrenceToRecordDays: 4 }),
      makeEvent({ occurrenceToRecordDays: null }),
    ];
    const metrics = computePeriodMetrics(events, meta);
    expect(metrics.delays.averageOccurrenceToRecordDays).toBe(3);
    expect(metrics.delays.medianOccurrenceToRecordDays).toBe(3);
    expect(metrics.delays.populatedCount).toBe(2);
    expect(metrics.delays.totalEventCount).toBe(3);
  });
});
