import { describe, expect, it } from "vitest";
import { calculateKPIs, calculateRecoveryRate } from "../src/services/KpiService";
import { normalizeFilters, ENTERPRISE_WIDE } from "../src/services/FilterService";
import { makeConfig, makeEvent, resetCounter } from "./fixtures";

describe("KpiService", () => {
  const config = makeConfig();

  function filtersFor(eventType: "All" | "Financial" | "Non-Financial") {
    return normalizeFilters({ organisation: ENTERPRISE_WIDE, eventType, severity: "All" }, config);
  }

  it("counts total and high-severity events", () => {
    resetCounter();
    const events = [
      makeEvent({ severity: "High" }),
      makeEvent({ severity: "Low" }),
      makeEvent({ severity: "Moderate" }),
    ];
    const kpis = calculateKPIs(events, config, filtersFor("All"));
    expect(kpis.totalEvents).toEqual({ value: 3, applicable: true, unit: "events" });
    expect(kpis.highSeverityEvents).toEqual({ value: 1, applicable: true, unit: "events" });
  });

  it("computes open backlog from the config's excluded statuses, not a hardcoded list", () => {
    resetCounter();
    const events = [
      makeEvent({ status: "Closed" }),
      makeEvent({ status: "Cancelled" }),
      makeEvent({ status: "Active" }),
      makeEvent({ status: "Under Investigation" }),
    ];
    const kpis = calculateKPIs(events, config, filtersFor("All"));
    expect(kpis.openBacklog.value).toBe(2);
  });

  it("sums Gross/Net ignoring nulls, never coercing them to zero", () => {
    resetCounter();
    const events = [
      makeEvent({ eventType: "Financial", grossAmountUsd: 1000, netAmountUsd: 800 }),
      makeEvent({ eventType: "Financial", grossAmountUsd: null, netAmountUsd: null }),
      makeEvent({ eventType: "Non-Financial", grossAmountUsd: null, netAmountUsd: null }),
    ];
    const kpis = calculateKPIs(events, config, filtersFor("All"));
    expect(kpis.grossExposure).toEqual({ value: 1000, applicable: true, unit: "USD" });
    expect(kpis.netExposure).toEqual({ value: 800, applicable: true, unit: "USD" });
  });

  it("sums Potential Impact across both event types", () => {
    resetCounter();
    const events = [
      makeEvent({ eventType: "Financial", potentialImpactUsd: 500 }),
      makeEvent({ eventType: "Non-Financial", potentialImpactUsd: 250 }),
      makeEvent({ eventType: "Non-Financial", potentialImpactUsd: null }),
    ];
    const kpis = calculateKPIs(events, config, filtersFor("All"));
    expect(kpis.potentialImpact).toEqual({ value: 750, applicable: true, unit: "USD" });
  });

  it("sums remediation hours from the cleaned field, ignoring the conflicting audit field", () => {
    resetCounter();
    const events = [
      makeEvent({ remediationHours: 10, remediationHoursFromImpactsField: 999 }),
      makeEvent({ remediationHours: 5, remediationHoursFromImpactsField: 1 }),
    ];
    const kpis = calculateKPIs(events, config, filtersFor("All"));
    expect(kpis.remediationHours).toEqual({ value: 15, applicable: true, unit: "hours" });
  });

  describe("Financial vs Non-Financial applicability", () => {
    resetCounter();
    const events = [makeEvent({ eventType: "Non-Financial", potentialImpactUsd: 300, remediationHours: 4 })];

    it("marks Gross/Net/Recovery Rate as not applicable when Non-Financial is selected", () => {
      const kpis = calculateKPIs(events, config, filtersFor("Non-Financial"));
      expect(kpis.grossExposure).toEqual({ value: null, applicable: false, unit: "USD" });
      expect(kpis.netExposure).toEqual({ value: null, applicable: false, unit: "USD" });
      expect(kpis.recoveryRate).toEqual({ value: null, applicable: false, unit: "ratio" });
    });

    it("keeps Potential Impact and Remediation Hours applicable for Non-Financial", () => {
      const kpis = calculateKPIs(events, config, filtersFor("Non-Financial"));
      expect(kpis.potentialImpact).toEqual({ value: 300, applicable: true, unit: "USD" });
      expect(kpis.remediationHours).toEqual({ value: 4, applicable: true, unit: "hours" });
    });

    it("never returns $0 for Non-Financial Gross/Net (must be null, not a fabricated zero)", () => {
      const kpis = calculateKPIs(events, config, filtersFor("Non-Financial"));
      expect(kpis.grossExposure.value).not.toBe(0);
      expect(kpis.grossExposure.value).toBeNull();
    });
  });

  describe("calculateRecoveryRate", () => {
    it("divides recovery by gross across Financial events", () => {
      resetCounter();
      const events = [
        makeEvent({ eventType: "Financial", grossAmountUsd: 1000, recoveryAmountUsd: 250 }),
        makeEvent({ eventType: "Financial", grossAmountUsd: 1000, recoveryAmountUsd: 250 }),
      ];
      const result = calculateRecoveryRate(events);
      expect(result).toEqual({ value: 0.25, applicable: true, unit: "ratio" });
    });

    it("returns null (not an invalid percentage) when total gross is zero", () => {
      resetCounter();
      const events = [makeEvent({ eventType: "Financial", grossAmountUsd: null, recoveryAmountUsd: null })];
      const result = calculateRecoveryRate(events);
      expect(result).toEqual({ value: null, applicable: false, unit: "ratio" });
    });
  });
});
