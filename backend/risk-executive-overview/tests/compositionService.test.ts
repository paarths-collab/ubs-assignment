import { describe, expect, it } from "vitest";
import { buildComposition, buildExposureSummary } from "../src/services/CompositionService";
import { buildScenarioSignals, buildAttentionCards } from "../src/services/ScenarioService";
import { RiskRepository } from "../src/repositories/RiskRepository";
import type { RiskPattern } from "../src/types/Pattern";
import {makeEvent, makeConfig, resetCounter, makeFilters} from "./fixtures";

const defaultFilters = makeFilters();

function pattern(overrides: Partial<RiskPattern> = {}): RiskPattern {
  return {
    patternId: "test_pattern",
    patternType: "issue",
    eventIds: [],
    group: { issueDetail: "A test issue occurred." },
    ...overrides,
  };
}

describe("CompositionService - buildComposition", () => {
  it("severity and eventType counts match a hand-built fixture exactly", () => {
    resetCounter();
    const events = [
      makeEvent({ severity: "High", eventType: "Financial" }),
      makeEvent({ severity: "High", eventType: "Non-Financial" }),
      makeEvent({ severity: "Moderate", eventType: "Financial" }),
      makeEvent({ severity: "Low", eventType: "Non-Financial" }),
      makeEvent({ severity: "Low", eventType: "Non-Financial" }),
    ];
    const config = makeConfig();

    const composition = buildComposition(events, config);

    expect(composition.severity).toEqual({ High: 2, Moderate: 1, Low: 2 });
    expect(composition.eventType).toEqual({ Financial: 2, "Non-Financial": 3 });
  });

  it("workflow.open counts events NOT in excludedStatuses (Closed, Cancelled)", () => {
    resetCounter();
    const events = [
      makeEvent({ status: "Active" }),
      makeEvent({ status: "Under Investigation" }),
      makeEvent({ status: "Closed" }),
      makeEvent({ status: "Cancelled" }),
      makeEvent({ status: "Active" }),
    ];
    const config = makeConfig();

    const composition = buildComposition(events, config);

    expect(composition.workflow.open).toBe(3);
    expect(composition.workflow.closed).toBe(1);
    expect(composition.workflow.cancelled).toBe(1);
  });

  it("workflow counts independently: open excludes Closed and Cancelled, closed is ONLY Closed, cancelled is ONLY Cancelled", () => {
    resetCounter();
    const events = [
      makeEvent({ status: "Active" }),
      makeEvent({ status: "Closed" }),
      makeEvent({ status: "Cancelled" }),
      makeEvent({ status: "Under Investigation" }),
      makeEvent({ status: "Remediation in Progress" }),
    ];
    const config = makeConfig();

    const composition = buildComposition(events, config);

    // open: Active, Under Investigation, Remediation in Progress = 3
    expect(composition.workflow.open).toBe(3);
    // closed: only Closed = 1
    expect(composition.workflow.closed).toBe(1);
    // cancelled: only Cancelled = 1
    expect(composition.workflow.cancelled).toBe(1);
    // Sum of all workflow statuses: 3 + 1 + 1 = 5
    expect(composition.workflow.open + composition.workflow.closed + composition.workflow.cancelled).toBe(5);
  });

  it("workflow.highStillOpen counts ONLY High severity events not in excludedStatuses", () => {
    resetCounter();
    const events = [
      makeEvent({ severity: "High", status: "Active" }),
      makeEvent({ severity: "High", status: "Closed" }),
      makeEvent({ severity: "Moderate", status: "Active" }),
      makeEvent({ severity: "Low", status: "Active" }),
    ];
    const config = makeConfig();

    const composition = buildComposition(events, config);

    expect(composition.workflow.highStillOpen).toBe(1);
  });

  it("organisations breakdown has one row per distinct ownerOrganisation, sorted by eventCount descending", () => {
    resetCounter();
    const events = [
      makeEvent({ ownerOrganisation: "Org C" }),
      makeEvent({ ownerOrganisation: "Org C" }),
      makeEvent({ ownerOrganisation: "Org A" }),
      makeEvent({ ownerOrganisation: "Org A" }),
      makeEvent({ ownerOrganisation: "Org A" }),
      makeEvent({ ownerOrganisation: "Org B" }),
    ];
    const config = makeConfig();

    const composition = buildComposition(events, config);

    expect(composition.organisations).toHaveLength(3);
    expect(composition.organisations[0]!.key).toBe("Org A");
    expect(composition.organisations[0]!.eventCount).toBe(3);
    expect(composition.organisations[1]!.key).toBe("Org C");
    expect(composition.organisations[1]!.eventCount).toBe(2);
    expect(composition.organisations[2]!.key).toBe("Org B");
    expect(composition.organisations[2]!.eventCount).toBe(1);
  });

  it("against the real dataset: workflow.open is 721, closed is 252, cancelled is 27, organisations has 12 rows", () => {
    const repo = new RiskRepository();
    const events = repo.getEvents();
    const config = repo.getConfig();

    const composition = buildComposition([...events], config);

    expect(composition.workflow.open).toBe(721);
    expect(composition.workflow.closed).toBe(252);
    expect(composition.workflow.cancelled).toBe(27);
    expect(composition.organisations).toHaveLength(12);
  });
});

describe("CompositionService - buildExposureSummary", () => {
  it("realised.grossAmountUsd / netAmountUsd / recoveryAmountUsd return null (not 0) when no Financial event present", () => {
    resetCounter();
    const events = [
      makeEvent({ eventType: "Non-Financial", grossAmountUsd: null }),
      makeEvent({ eventType: "Non-Financial", netAmountUsd: null }),
      makeEvent({ eventType: "Non-Financial", recoveryAmountUsd: null }),
    ];

    const summary = buildExposureSummary(events);

    expect(summary.realised.grossAmountUsd).toBeNull();
    expect(summary.realised.netAmountUsd).toBeNull();
    expect(summary.realised.recoveryAmountUsd).toBeNull();
  });

  it("realised.recoveryRate equals recovery / gross, null when gross is zero or absent", () => {
    resetCounter();
    const events = [
      makeEvent({ eventType: "Financial", grossAmountUsd: 100, recoveryAmountUsd: 30 }),
    ];

    const summary = buildExposureSummary(events);

    expect(summary.realised.recoveryRate).toBe(0.3);
  });

  it("realised.recoveryRate is null when grossAmountUsd is null", () => {
    resetCounter();
    const events = [
      makeEvent({ eventType: "Financial", grossAmountUsd: null, recoveryAmountUsd: 30 }),
    ];

    const summary = buildExposureSummary(events);

    expect(summary.realised.recoveryRate).toBeNull();
  });

  it("potential.totalUsd spans BOTH event types, fromFinancialUsd and fromNonFinancialUsd split it by type", () => {
    resetCounter();
    const events = [
      makeEvent({ eventType: "Financial", potentialImpactUsd: 100 }),
      makeEvent({ eventType: "Non-Financial", potentialImpactUsd: 200 }),
    ];

    const summary = buildExposureSummary(events);

    expect(summary.potential.totalUsd).toBe(300);
    expect(summary.potential.fromFinancialUsd).toBe(100);
    expect(summary.potential.fromNonFinancialUsd).toBe(200);
    expect(summary.potential.fromFinancialUsd! + summary.potential.fromNonFinancialUsd!).toBe(summary.potential.totalUsd!);
  });

  it("potential.fromNonFinancialUsd is null (not 0) when no Non-Financial events have a value", () => {
    resetCounter();
    const events = [
      makeEvent({ eventType: "Financial", potentialImpactUsd: 100 }),
      makeEvent({ eventType: "Non-Financial", potentialImpactUsd: null }),
    ];

    const summary = buildExposureSummary(events);

    expect(summary.potential.fromNonFinancialUsd).toBeNull();
  });

  it("operational.totalRemediationHours is sum, averagePerEvent is mean rounded to 1 decimal, maxPerEvent is max", () => {
    resetCounter();
    const events = [
      makeEvent({ remediationHours: 10 }),
      makeEvent({ remediationHours: 20 }),
      makeEvent({ remediationHours: 30 }),
    ];

    const summary = buildExposureSummary(events);

    expect(summary.operational.totalRemediationHours).toBe(60);
    expect(summary.operational.averagePerEvent).toBe(20);
    expect(summary.operational.maxPerEvent).toBe(30);
  });

  it("operational.averagePerEvent rounds to 1 decimal place", () => {
    resetCounter();
    const events = [
      makeEvent({ remediationHours: 10 }),
      makeEvent({ remediationHours: 11 }),
      makeEvent({ remediationHours: 12 }),
    ];

    const summary = buildExposureSummary(events);

    // (10 + 11 + 12) / 3 = 33 / 3 = 11
    expect(summary.operational.averagePerEvent).toBe(11);
  });

  it("operational.averagePerEvent with rounding: (10 + 11) / 2 = 10.5", () => {
    resetCounter();
    const events = [
      makeEvent({ remediationHours: 10 }),
      makeEvent({ remediationHours: 11 }),
    ];

    const summary = buildExposureSummary(events);

    expect(summary.operational.averagePerEvent).toBe(10.5);
  });

  it("against the real dataset: potential.fromNonFinancialUsd is greater than potential.fromFinancialUsd", () => {
    const repo = new RiskRepository();
    const events = repo.getEvents();

    const summary = buildExposureSummary([...events]);

    expect(summary.potential.fromNonFinancialUsd).not.toBeNull();
    expect(summary.potential.fromFinancialUsd).not.toBeNull();
    expect(summary.potential.fromNonFinancialUsd! > summary.potential.fromFinancialUsd!).toBe(true);
  });

  it("realised amounts sum correctly across multiple Financial events", () => {
    resetCounter();
    const events = [
      makeEvent({ eventType: "Financial", grossAmountUsd: 100, netAmountUsd: 80, recoveryAmountUsd: 20 }),
      makeEvent({ eventType: "Financial", grossAmountUsd: 200, netAmountUsd: 150, recoveryAmountUsd: 50 }),
    ];

    const summary = buildExposureSummary(events);

    expect(summary.realised.grossAmountUsd).toBe(300);
    expect(summary.realised.netAmountUsd).toBe(230);
    expect(summary.realised.recoveryAmountUsd).toBe(70);
  });
});

describe("CompositionService - buildAttentionCards", () => {
  it("returns exactly 3 cards, one per lens, in order urgency / exposure / recurrence", () => {
    resetCounter();
    const issue = "Test attention card issue";
    const events = [
      makeEvent({ issueDetail: issue, severity: "High", status: "Active", potentialImpactUsd: 1000 }),
      makeEvent({ issueDetail: issue, severity: "High", status: "Active" }),
    ];
    const config = makeConfig();

    const scenarios = buildScenarioSignals(events, [pattern({ group: { issueDetail: issue } })], config, defaultFilters);
    const cards = buildAttentionCards(scenarios);

    expect(cards).toHaveLength(3);
    expect(cards[0]!.lens).toBe("urgency");
    expect(cards[1]!.lens).toBe("exposure");
    expect(cards[2]!.lens).toBe("recurrence");
  });

  it("urgency lens selects the scenario with the most high-severity events", () => {
    resetCounter();
    const issue1 = "High severity scenario";
    const issue2 = "Low severity scenario";
    const events = [
      makeEvent({ issueDetail: issue1, severity: "High" }),
      makeEvent({ issueDetail: issue1, severity: "High" }),
      makeEvent({ issueDetail: issue1, severity: "High" }),
      makeEvent({ issueDetail: issue2, severity: "Low" }),
      makeEvent({ issueDetail: issue2, severity: "Low" }),
    ];
    const config = makeConfig();

    const scenarios = buildScenarioSignals(events, [
      pattern({ group: { issueDetail: issue1 } }),
      pattern({ group: { issueDetail: issue2 } }),
    ], config, defaultFilters);
    const cards = buildAttentionCards(scenarios);

    const urgencyCard = cards.find((c) => c.lens === "urgency")!;
    expect(urgencyCard.title).toContain("High severity");
  });

  it("recurrence lens selects the scenario spanning the most organisations (distinct from urgency)", () => {
    resetCounter();
    const issue1 = "High severity single org";
    const issue2 = "Low severity multi org";
    const events = [
      makeEvent({ issueDetail: issue1, severity: "High", status: "Active", ownerOrganisation: "Org A" }),
      makeEvent({ issueDetail: issue1, severity: "High", status: "Active", ownerOrganisation: "Org A" }),
      makeEvent({ issueDetail: issue2, severity: "Low", status: "Active", ownerOrganisation: "Org A" }),
      makeEvent({ issueDetail: issue2, severity: "Low", status: "Active", ownerOrganisation: "Org B" }),
      makeEvent({ issueDetail: issue2, severity: "Low", status: "Active", ownerOrganisation: "Org C" }),
    ];
    const config = makeConfig();

    const scenarios = buildScenarioSignals(events, [
      pattern({ group: { issueDetail: issue1 } }),
      pattern({ group: { issueDetail: issue2 } }),
    ], config, defaultFilters);
    const cards = buildAttentionCards(scenarios);

    const urgencyCard = cards.find((c) => c.lens === "urgency")!;
    const recurrenceCard = cards.find((c) => c.lens === "recurrence")!;

    // urgency should pick issue1 (more High severity)
    expect(urgencyCard.title).toContain("High severity");
    // recurrence should pick issue2 (more organisations)
    expect(recurrenceCard.title).toContain("Low severity");
  });

  it("each card has non-empty headline and reason, reason ends with period", () => {
    resetCounter();
    const issue = "Test card fields";
    const events = [
      makeEvent({ issueDetail: issue, severity: "High", status: "Active" }),
      makeEvent({ issueDetail: issue, severity: "High", status: "Active" }),
    ];
    const config = makeConfig();

    const scenarios = buildScenarioSignals(events, [pattern({ group: { issueDetail: issue } })], config, defaultFilters);
    const cards = buildAttentionCards(scenarios);

    for (const card of cards) {
      expect(card.headline).not.toBe("");
      expect(card.headline.length).toBeGreaterThan(0);
      expect(card.reason).not.toBe("");
      expect(card.reason.length).toBeGreaterThan(0);
      expect(card.reason.endsWith(".")).toBe(true);
    }
  });

  it("buildAttentionCards([]) returns an empty array rather than throwing", () => {
    const cards = buildAttentionCards([]);

    expect(cards).toEqual([]);
  });

  it("buildAttentionCards with single scenario populates all three cards with the same scenario", () => {
    resetCounter();
    const issue = "Single scenario";
    const events = [
      makeEvent({ issueDetail: issue, severity: "High", status: "Active" }),
    ];
    const config = makeConfig();

    const scenarios = buildScenarioSignals(events, [pattern({ group: { issueDetail: issue } })], config, defaultFilters);
    const cards = buildAttentionCards(scenarios);

    expect(cards).toHaveLength(3);
    expect(cards[0]!.scenarioId).toBe(cards[1]!.scenarioId);
    expect(cards[1]!.scenarioId).toBe(cards[2]!.scenarioId);
  });

  it("exposure lens selects the scenario with the largest net exposure (or potential impact if no net recorded)", () => {
    resetCounter();
    const issue1 = "High exposure";
    const issue2 = "Low exposure";
    const events = [
      makeEvent({ issueDetail: issue1, eventType: "Financial", netAmountUsd: 5000, potentialImpactUsd: 1000 }),
      makeEvent({ issueDetail: issue2, eventType: "Financial", netAmountUsd: 100, potentialImpactUsd: 100 }),
    ];
    const config = makeConfig();

    const scenarios = buildScenarioSignals(events, [
      pattern({ group: { issueDetail: issue1 } }),
      pattern({ group: { issueDetail: issue2 } }),
    ], config, defaultFilters);
    const cards = buildAttentionCards(scenarios);

    const exposureCard = cards.find((c) => c.lens === "exposure")!;
    expect(exposureCard.title).toContain("High exposure");
  });
});
