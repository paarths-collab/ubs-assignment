import { describe, expect, it } from "vitest";
import { computeKpiDeltas } from "../src/services/KpiService";
import { RiskRepository } from "../src/repositories/RiskRepository";
import { normalizeFilters, filterEvents } from "../src/services/FilterService";
import { makeEvent, makeConfig, makeFilters, resetCounter } from "./fixtures";

/**
 * computeKpiDeltas splits the *filtered* window at its midpoint and compares
 * the two halves — the only period-over-period comparison this dataset can
 * support, since there is no data before its own start date.
 */
describe("computeKpiDeltas", () => {
  const config = makeConfig();
  // dateFrom=Jan1, dateTo=Jan5 -> midpoint = Jan3.
  // earlierHalf: occurrenceDate < Jan3 (Jan1, Jan2). recentHalf: >= Jan3 (Jan3, Jan4, Jan5).
  const filters = makeFilters({ dateFrom: "2025-01-01", dateTo: "2025-01-05" });

  it("returns null when dateFrom equals dateTo (window cannot be split)", () => {
    resetCounter();
    const events = [makeEvent({ occurrenceDate: "2025-01-01" })];
    const sameDay = makeFilters({ dateFrom: "2025-01-01", dateTo: "2025-01-01" });
    expect(computeKpiDeltas(events, config, sameDay)).toBeNull();
  });

  it("returns null when dateFrom is after dateTo", () => {
    resetCounter();
    const events = [makeEvent({ occurrenceDate: "2025-01-01" })];
    const inverted = makeFilters({ dateFrom: "2025-01-05", dateTo: "2025-01-01" });
    expect(computeKpiDeltas(events, config, inverted)).toBeNull();
  });

  it("returns null when one half of the window has zero events", () => {
    resetCounter();
    // All events fall in the recent half; the earlier half is empty.
    const events = [makeEvent({ occurrenceDate: "2025-01-04" }), makeEvent({ occurrenceDate: "2025-01-05" })];
    expect(computeKpiDeltas(events, config, filters)).toBeNull();
  });

  it("computes totalEvents delta, percentage and direction for a genuine split", () => {
    resetCounter();
    const events = [
      makeEvent({ occurrenceDate: "2025-01-01" }),
      makeEvent({ occurrenceDate: "2025-01-04" }),
      makeEvent({ occurrenceDate: "2025-01-04" }),
      makeEvent({ occurrenceDate: "2025-01-04" }),
    ];
    const deltas = computeKpiDeltas(events, config, filters);
    expect(deltas).not.toBeNull();
    // earlier half = 1 event, recent half = 3 events.
    expect(deltas!.totalEvents).toEqual({ deltaValue: 2, deltaPct: 2, direction: "up" });
  });

  it("reports direction 'down' when the recent half has fewer events than the earlier half", () => {
    resetCounter();
    const events = [
      makeEvent({ occurrenceDate: "2025-01-01" }),
      makeEvent({ occurrenceDate: "2025-01-02" }),
      makeEvent({ occurrenceDate: "2025-01-02" }),
      makeEvent({ occurrenceDate: "2025-01-04" }),
    ];
    const deltas = computeKpiDeltas(events, config, filters);
    expect(deltas!.totalEvents!.direction).toBe("down");
    expect(deltas!.totalEvents!.deltaValue).toBe(-2);
  });

  it("reports direction 'flat' when both halves have identical counts", () => {
    resetCounter();
    const events = [
      makeEvent({ occurrenceDate: "2025-01-01" }),
      makeEvent({ occurrenceDate: "2025-01-02" }),
      makeEvent({ occurrenceDate: "2025-01-04" }),
      makeEvent({ occurrenceDate: "2025-01-05" }),
    ];
    const deltas = computeKpiDeltas(events, config, filters);
    expect(deltas!.totalEvents).toEqual({ deltaValue: 0, deltaPct: 0, direction: "flat" });
  });

  it("returns deltaPct null when the earlier half's value is zero, not a division-by-zero result", () => {
    resetCounter();
    // No High-severity events in the earlier half, two in the recent half.
    const events = [
      makeEvent({ occurrenceDate: "2025-01-01", severity: "Low" }),
      makeEvent({ occurrenceDate: "2025-01-04", severity: "High" }),
      makeEvent({ occurrenceDate: "2025-01-04", severity: "High" }),
    ];
    const deltas = computeKpiDeltas(events, config, filters);
    expect(deltas!.highSeverityEvents).toEqual({ deltaValue: 2, deltaPct: null, direction: "up" });
  });

  it("omits a KPI from the result when it is not applicable in either half (Gross/Net/Recovery Rate with no Financial events in one half)", () => {
    resetCounter();
    const events = [
      makeEvent({ occurrenceDate: "2025-01-01", eventType: "Non-Financial" }),
      makeEvent({ occurrenceDate: "2025-01-04", eventType: "Financial", grossAmountUsd: 100, netAmountUsd: 90, recoveryAmountUsd: 10 }),
    ];
    const deltas = computeKpiDeltas(events, config, filters);
    expect(deltas).not.toBeNull();
    expect(deltas!.grossExposure).toBeUndefined();
    expect(deltas!.netExposure).toBeUndefined();
    expect(deltas!.recoveryRate).toBeUndefined();
    // Potential Impact / total events are still applicable in both halves.
    expect(deltas!.totalEvents).toBeDefined();
  });

  it("computes a Recovery Rate delta as a raw fraction difference (percentage points), not a percent-of-percent", () => {
    resetCounter();
    const events = [
      makeEvent({ occurrenceDate: "2025-01-01", eventType: "Financial", grossAmountUsd: 100, recoveryAmountUsd: 10, netAmountUsd: 90 }),
      makeEvent({ occurrenceDate: "2025-01-04", eventType: "Financial", grossAmountUsd: 100, recoveryAmountUsd: 50, netAmountUsd: 50 }),
    ];
    const deltas = computeKpiDeltas(events, config, filters);
    // earlier recoveryRate = 10/100 = 0.10, recent = 50/100 = 0.50 -> delta = 0.40 (40 percentage points)
    expect(deltas!.recoveryRate!.deltaValue).toBeCloseTo(0.4);
    expect(deltas!.recoveryRate!.direction).toBe("up");
  });

  it("matches deterministically against the real dataset's known anchors (regression guard)", () => {
    // This assertion pins the exact figures once, so a future change to the
    // midpoint logic or KPI calculations is caught rather than silently
    // drifting — matches the values verified live via curl during development.
    const repository = new RiskRepository();
    const realConfig = repository.getConfig();
    const realFilters = normalizeFilters({ organisation: "Enterprise-wide", eventType: "All", severity: "All" }, realConfig);
    const filteredEvents = filterEvents(repository.getEvents(), realFilters);

    const deltas = computeKpiDeltas(filteredEvents, realConfig, realFilters);
    expect(deltas).not.toBeNull();
    expect(deltas!.totalEvents!.deltaValue).toBe(-16);
    expect(deltas!.highSeverityEvents!.deltaValue).toBe(1);
  });
});
