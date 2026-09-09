import { describe, expect, it } from "vitest";
import { comparePeriods, computeDelta, computeShareDelta } from "../src/services/ComparisonService";
import { computePeriodMetrics } from "../src/services/MetricService";
import { makeEvent } from "./fixtures";

describe("computeDelta", () => {
  it("computes absolute and percent change for two positive values", () => {
    const delta = computeDelta(120, 100);
    expect(delta).toEqual({ current: 120, previous: 100, absoluteChange: 20, percentChange: 0.2, isNew: false });
  });

  it("marks isNew when there is no previous baseline at all", () => {
    const delta = computeDelta(50, null);
    expect(delta.isNew).toBe(true);
    expect(delta.percentChange).toBeNull();
    expect(delta.absoluteChange).toBeNull();
  });

  it("never produces +Infinity% when previous is zero and current is positive", () => {
    const delta = computeDelta(10, 0);
    expect(delta.percentChange).toBeNull();
    expect(delta.isNew).toBe(true);
    expect(delta.absoluteChange).toBe(10);
    expect(Number.isFinite(delta.absoluteChange)).toBe(true);
  });

  it("treats zero-to-zero as flat, not new", () => {
    const delta = computeDelta(0, 0);
    expect(delta.isNew).toBe(false);
    expect(delta.absoluteChange).toBe(0);
    expect(delta.percentChange).toBeNull();
  });

  it("passes through a null current value untouched", () => {
    expect(computeDelta(null, 100)).toEqual({ current: null, previous: 100, absoluteChange: null, percentChange: null, isNew: false });
  });
});

describe("computeShareDelta", () => {
  it("computes a percentage-point delta between two shares", () => {
    const delta = computeShareDelta(0.118, 0.067);
    expect(delta.deltaPercentagePoints).toBeCloseTo(5.1, 5);
  });

  it("returns null delta when either share is unavailable", () => {
    expect(computeShareDelta(0.5, null).deltaPercentagePoints).toBeNull();
    expect(computeShareDelta(null, 0.5).deltaPercentagePoints).toBeNull();
  });
});

describe("comparePeriods", () => {
  const meta = (id: string) => ({ periodId: id, label: id, startDate: "2026-01-01", endDate: "2026-01-31" });

  it("compares two populated periods correctly", () => {
    const current = computePeriodMetrics(
      [makeEvent({ severity: "High" }), makeEvent({ severity: "High" }), makeEvent({ severity: "Low" })],
      meta("current"),
    );
    const previous = computePeriodMetrics([makeEvent({ severity: "Low" })], meta("previous"));

    const comparison = comparePeriods(current, previous);
    expect(comparison.eventCountDelta).toEqual({ current: 3, previous: 1, absoluteChange: 2, percentChange: 2, isNew: false });
    // High share: current 2/3 = 0.667, previous 0/1 = 0
    expect(comparison.severityShareDeltas.High.deltaPercentagePoints).toBeCloseTo((2 / 3) * 100, 5);
  });

  it("handles a null previous period (no baseline) as fully 'new'", () => {
    const current = computePeriodMetrics([makeEvent()], meta("current"));
    const comparison = comparePeriods(current, null);
    expect(comparison.eventCountDelta.isNew).toBe(true);
    expect(comparison.previous).toBeNull();
  });

  it("treats a money metric with zero populated observations as null, not zero, for delta purposes", () => {
    const current = computePeriodMetrics([makeEvent({ netAmount: 500 })], meta("current"));
    const previous = computePeriodMetrics([makeEvent({ netAmount: null })], meta("previous"));
    const comparison = comparePeriods(current, previous);
    expect(comparison.netAmountDelta.previous).toBeNull();
    expect(comparison.netAmountDelta.isNew).toBe(true);
  });
});
