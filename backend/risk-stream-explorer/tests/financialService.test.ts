import { describe, expect, it } from "vitest";
import { aggregateMoney, computeFinancialMetrics, computeRecoveryRate } from "../src/services/FinancialService";
import { makeEvent } from "./fixtures";

describe("aggregateMoney", () => {
  it("never treats null as zero — populatedCount tracks real observations", () => {
    const events = [
      makeEvent({ netAmount: 100 }),
      makeEvent({ netAmount: null }),
      makeEvent({ netAmount: 300 }),
    ];
    const result = aggregateMoney(events, (e) => e.netAmount);
    expect(result.total).toBe(400);
    expect(result.populatedCount).toBe(2);
    expect(result.totalEventCount).toBe(3);
    expect(result.average).toBe(200);
  });

  it("returns a zero-observation metric (not a crash) for an all-null field", () => {
    const events = [makeEvent({ netAmount: null }), makeEvent({ netAmount: null })];
    const result = aggregateMoney(events, (e) => e.netAmount);
    expect(result.total).toBe(0);
    expect(result.populatedCount).toBe(0);
    expect(result.average).toBeNull();
  });

  it("handles an empty event list", () => {
    const result = aggregateMoney([], (e) => e.netAmount);
    expect(result).toEqual({ total: 0, populatedCount: 0, totalEventCount: 0, average: null });
  });
});

describe("computeRecoveryRate", () => {
  it("computes recovery / gross only over events with positive populated gross", () => {
    const events = [
      makeEvent({ grossAmount: 1000, recoveryAmount: 250 }),
      makeEvent({ grossAmount: 500, recoveryAmount: null }), // recovery null treated as 0 recovery for this event
      makeEvent({ grossAmount: null, recoveryAmount: 100 }), // excluded: no gross to compare against
    ];
    // grossSum = 1500, recoverySum = 250 + 0 = 250
    expect(computeRecoveryRate(events)).toBeCloseTo(250 / 1500);
  });

  it("returns null when no event has a positive populated gross amount", () => {
    expect(computeRecoveryRate([makeEvent({ grossAmount: null }), makeEvent({ grossAmount: 0 })])).toBeNull();
  });

  it("returns null for an empty event list", () => {
    expect(computeRecoveryRate([])).toBeNull();
  });
});

describe("computeFinancialMetrics", () => {
  it("assembles all four money metrics plus recovery rate", () => {
    const events = [
      makeEvent({ eventType: "Financial", grossAmount: 1000, netAmount: 800, recoveryAmount: 200, potentialImpact: null }),
      makeEvent({ eventType: "Non-Financial", grossAmount: null, netAmount: null, recoveryAmount: null, potentialImpact: 5000 }),
    ];
    const metrics = computeFinancialMetrics(events);
    expect(metrics.grossAmount.total).toBe(1000);
    expect(metrics.grossAmount.populatedCount).toBe(1);
    expect(metrics.potentialImpact.total).toBe(5000);
    expect(metrics.potentialImpact.populatedCount).toBe(1);
    expect(metrics.recoveryRate).toBeCloseTo(0.2);
  });
});
