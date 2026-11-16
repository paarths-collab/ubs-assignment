import { describe, expect, it } from "vitest";
import { computeFinancialFacts } from "../src/services/FinancialFacts";
import { makeEvent, resetCounter } from "./fixtures";

describe("computeFinancialFacts", () => {
  it("returns null (not zero) for Gross/Net/Recovery when the slice has no Financial events", () => {
    resetCounter();
    const events = [makeEvent({ eventType: "Non-Financial" }), makeEvent({ eventType: "Non-Financial" })];
    const facts = computeFinancialFacts(events);
    expect(facts.grossAmountUsd).toBeNull();
    expect(facts.netAmountUsd).toBeNull();
    expect(facts.recoveryAmountUsd).toBeNull();
    expect(facts.recoveryRate).toBeNull();
  });

  it("sums valid Financial amounts, ignoring events with null values in the same slice", () => {
    resetCounter();
    const events = [
      makeEvent({ eventType: "Financial", grossAmountUsd: 100, netAmountUsd: 90, recoveryAmountUsd: 10 }),
      makeEvent({ eventType: "Financial", grossAmountUsd: null, netAmountUsd: null, recoveryAmountUsd: null }),
    ];
    const facts = computeFinancialFacts(events);
    expect(facts.grossAmountUsd).toBe(100);
    expect(facts.netAmountUsd).toBe(90);
    expect(facts.recoveryAmountUsd).toBe(10);
    expect(facts.recoveryRate).toBeCloseTo(0.1);
  });

  it("returns null Potential Impact when no event in the slice carries a value, never a fabricated zero", () => {
    resetCounter();
    const events = [makeEvent({ potentialImpactUsd: null }), makeEvent({ potentialImpactUsd: null })];
    expect(computeFinancialFacts(events).potentialImpactUsd).toBeNull();
  });

  it("sums Potential Impact across Financial and Non-Financial events alike", () => {
    resetCounter();
    const events = [
      makeEvent({ eventType: "Financial", potentialImpactUsd: 400 }),
      makeEvent({ eventType: "Non-Financial", potentialImpactUsd: 100 }),
    ];
    expect(computeFinancialFacts(events).potentialImpactUsd).toBe(500);
  });

  it("returns null recovery rate when gross sums to exactly zero, avoiding a divide-by-zero", () => {
    resetCounter();
    const events = [makeEvent({ eventType: "Financial", grossAmountUsd: 0, recoveryAmountUsd: 0 })];
    expect(computeFinancialFacts(events).recoveryRate).toBeNull();
  });
});
