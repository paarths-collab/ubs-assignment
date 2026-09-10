import { describe, expect, it } from "vitest";
import { buildPrioritySignal, rankPrioritySignals } from "../src/services/PriorityService";
import type { FilteredPattern } from "../src/services/PatternService";
import type { RiskPattern } from "../src/types/Pattern";
import { makeEvent, resetCounter } from "./fixtures";

const excludedStatuses = new Set(["Closed", "Cancelled"]);

function pattern(overrides: Partial<RiskPattern> = {}): RiskPattern {
  return { patternId: "test_pattern", patternType: "issue", eventIds: [], group: { issueDetail: "Test issue" }, ...overrides };
}

function build(filtered: FilteredPattern) {
  return buildPrioritySignal(filtered, filtered.events.length || 1, 1_000_000, 1_000_000, excludedStatuses);
}

describe("PriorityService reason codes", () => {
  it("flags HIGH_SEVERITY_PRESENT for a single High event, MULTIPLE_HIGH_EVENTS only at 3+", () => {
    resetCounter();
    const one = build({ pattern: pattern(), events: [makeEvent({ severity: "High" })] });
    expect(one.reasonCodes).toContain("HIGH_SEVERITY_PRESENT");
    expect(one.reasonCodes).not.toContain("MULTIPLE_HIGH_EVENTS");

    resetCounter();
    const three = build({
      pattern: pattern(),
      events: [makeEvent({ severity: "High" }), makeEvent({ severity: "High" }), makeEvent({ severity: "High" })],
    });
    expect(three.reasonCodes).toContain("MULTIPLE_HIGH_EVENTS");
  });

  it("flags HIGH_OPEN_BACKLOG only when open events are both numerous and a majority", () => {
    resetCounter();
    const events = Array.from({ length: 5 }, () => makeEvent({ status: "Active" }));
    const signal = build({ pattern: pattern(), events });
    expect(signal.reasonCodes).toContain("HIGH_OPEN_BACKLOG");

    resetCounter();
    const mostlyClosed = [
      ...Array.from({ length: 5 }, () => makeEvent({ status: "Active" })),
      ...Array.from({ length: 10 }, () => makeEvent({ status: "Closed" })),
    ];
    expect(build({ pattern: pattern(), events: mostlyClosed }).reasonCodes).not.toContain("HIGH_OPEN_BACKLOG");
  });

  it("flags HIGH_NET_EXPOSURE and HIGH_POTENTIAL_IMPACT against their thresholds", () => {
    resetCounter();
    const belowThreshold = build({
      pattern: pattern(),
      events: [makeEvent({ eventType: "Financial", netAmountUsd: 1000, potentialImpactUsd: 1000 })],
    });
    expect(belowThreshold.reasonCodes).not.toContain("HIGH_NET_EXPOSURE");
    expect(belowThreshold.reasonCodes).not.toContain("HIGH_POTENTIAL_IMPACT");

    resetCounter();
    const aboveThreshold = build({
      pattern: pattern(),
      events: [makeEvent({ eventType: "Financial", netAmountUsd: 150_000, potentialImpactUsd: 300_000 })],
    });
    expect(aboveThreshold.reasonCodes).toContain("HIGH_NET_EXPOSURE");
    expect(aboveThreshold.reasonCodes).toContain("HIGH_POTENTIAL_IMPACT");
  });

  it("flags CROSS_OWNER_RECURRENCE only when 3+ distinct owners share exactly one issue", () => {
    resetCounter();
    const sameIssue = "Shared issue detail";
    const events = [
      makeEvent({ issueDetail: sameIssue, ownerName: "A" }),
      makeEvent({ issueDetail: sameIssue, ownerName: "B" }),
      makeEvent({ issueDetail: sameIssue, ownerName: "C" }),
    ];
    expect(build({ pattern: pattern(), events }).reasonCodes).toContain("CROSS_OWNER_RECURRENCE");

    resetCounter();
    const mixedIssues = [
      makeEvent({ issueDetail: "Issue 1", ownerName: "A" }),
      makeEvent({ issueDetail: "Issue 2", ownerName: "B" }),
      makeEvent({ issueDetail: "Issue 3", ownerName: "C" }),
    ];
    expect(build({ pattern: pattern(), events: mixedIssues }).reasonCodes).not.toContain("CROSS_OWNER_RECURRENCE");
  });

  it("flags HIGH_REMEDIATION_EFFORT at or above the hours threshold", () => {
    resetCounter();
    const signal = build({ pattern: pattern(), events: [makeEvent({ remediationHours: 120 })] });
    expect(signal.reasonCodes).toContain("HIGH_REMEDIATION_EFFORT");
  });

  it("every reason code traces back to a deterministic fact already on the signal", () => {
    resetCounter();
    const signal = build({
      pattern: pattern(),
      events: [makeEvent({ severity: "High", eventType: "Financial", netAmountUsd: 200_000 })],
    });
    expect(signal.reasonCodes).toContain("HIGH_SEVERITY_PRESENT");
    expect(signal.highSeverityCount).toBeGreaterThan(0);
    expect(signal.reasonCodes).toContain("HIGH_NET_EXPOSURE");
    expect(signal.netAmountUsd).toBeGreaterThanOrEqual(100_000);
  });
});

describe("PriorityService ranking", () => {
  it("ranks by severity presence, then event-count/backlog/impact facts, deterministically", () => {
    resetCounter();
    const low = build({ pattern: pattern({ patternId: "low" }), events: [makeEvent({ severity: "Low" })] });
    resetCounter();
    const high = build({ pattern: pattern({ patternId: "high" }), events: [makeEvent({ severity: "High" })] });

    const ranked = rankPrioritySignals([low, high]);
    expect(ranked.map((signal) => signal.patternId)).toEqual(["high", "low"]);
  });

  it("breaks ties deterministically by patternId so repeated calls are stable", () => {
    resetCounter();
    const a = build({ pattern: pattern({ patternId: "b_pattern" }), events: [makeEvent()] });
    resetCounter();
    const b = build({ pattern: pattern({ patternId: "a_pattern" }), events: [makeEvent()] });

    const ranked = rankPrioritySignals([a, b]);
    expect(ranked.map((signal) => signal.patternId)).toEqual(["a_pattern", "b_pattern"]);
  });

  it("flags CONCENTRATED_EXPOSURE when a small slice holds a disproportionate share of exposure", () => {
    resetCounter();
    // 1 event out of a much larger filtered population, but holding a large share of net exposure.
    const signal = buildPrioritySignal(
      { pattern: pattern(), events: [makeEvent({ eventType: "Financial", netAmountUsd: 200_000 })] },
      1000,
      1_000_000,
      1_000_000,
      excludedStatuses,
    );
    expect(signal.shareOfFilteredEvents).toBeCloseTo(0.001);
    expect(signal.shareOfFilteredNetExposure).toBeCloseTo(0.2);
    expect(signal.reasonCodes).toContain("CONCENTRATED_EXPOSURE");
  });
});
