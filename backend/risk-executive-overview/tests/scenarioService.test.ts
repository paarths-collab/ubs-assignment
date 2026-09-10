import { describe, expect, it } from "vitest";
import { buildScenarioSignals, rankScenarioSignals } from "../src/services/ScenarioService";
import { deriveScenarioTitle } from "../src/config/scenarioTitles";
import { PRIORITY_THRESHOLDS } from "../src/services/PriorityThresholds";
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

describe("ScenarioService - Consolidation", () => {
  it("collapses events sharing one issueDetail into exactly ONE ScenarioSignal regardless of pattern records", () => {
    resetCounter();
    const sharedIssue = "Shared scenario detail";
    const events = [
      makeEvent({ issueDetail: sharedIssue, ownerOrganisation: "Org A", ownerName: "Owner 1" }),
      makeEvent({ issueDetail: sharedIssue, ownerOrganisation: "Org A", ownerName: "Owner 2" }),
      makeEvent({ issueDetail: sharedIssue, ownerOrganisation: "Org A", ownerName: "Owner 3" }),
      makeEvent({ issueDetail: sharedIssue, ownerOrganisation: "Org B", ownerName: "Owner 1" }),
      makeEvent({ issueDetail: sharedIssue, ownerOrganisation: "Org B", ownerName: "Owner 2" }),
      makeEvent({ issueDetail: sharedIssue, ownerOrganisation: "Org B", ownerName: "Owner 3" }),
    ];

    const patterns: RiskPattern[] = [
      pattern({ patternId: "pat1", patternType: "issue", group: { issueDetail: sharedIssue } }),
      pattern({ patternId: "pat2", patternType: "organisation_issue", group: { issueDetail: sharedIssue } }),
      pattern({ patternId: "pat3", patternType: "owner_issue", group: { issueDetail: sharedIssue } }),
      pattern({ patternId: "pat4", patternType: "assignee_issue", group: { issueDetail: sharedIssue } }),
      pattern({ patternId: "pat5", patternType: "cross_organisation_issue", group: { issueDetail: sharedIssue } }),
    ];

    const config = makeConfig();
    const signals = buildScenarioSignals(events, patterns, config, defaultFilters);

    expect(signals).toHaveLength(1);
    expect(signals[0]!.issueDetail).toBe(sharedIssue);
    expect(signals[0]!.eventCount).toBe(6);
    expect(signals[0]!.contributingPatternIds).toEqual(["pat1", "pat2", "pat3", "pat4", "pat5"]);
  });

  it("produces separate signals for two different issueDetail values", () => {
    resetCounter();
    const issue1 = "First scenario detail";
    const issue2 = "Second scenario detail";
    const events = [
      makeEvent({ issueDetail: issue1 }),
      makeEvent({ issueDetail: issue1 }),
      makeEvent({ issueDetail: issue2 }),
    ];

    const patterns: RiskPattern[] = [
      pattern({ patternId: "pat1", group: { issueDetail: issue1 } }),
      pattern({ patternId: "pat2", group: { issueDetail: issue2 } }),
    ];

    const config = makeConfig();
    const signals = buildScenarioSignals(events, patterns, config, defaultFilters);

    expect(signals).toHaveLength(2);
    const sorted = signals.sort((a, b) => a.issueDetail.localeCompare(b.issueDetail));
    expect(sorted[0]!.issueDetail).toBe(issue1);
    expect(sorted[0]!.eventCount).toBe(2);
    expect(sorted[1]!.issueDetail).toBe(issue2);
    expect(sorted[1]!.eventCount).toBe(1);
  });

  it("against the REAL dataset, buildScenarioSignals returns exactly 15 signals (one per scenario)", () => {
    const repo = new RiskRepository();
    const events = repo.getEvents();
    const patterns = repo.getPatterns();
    const config = repo.getConfig();

    const signals = buildScenarioSignals([...events], patterns, config, defaultFilters);

    expect(signals).toHaveLength(15);
  });

  it("real dataset: sum of all eventCounts equals 1000 and eventIds are disjoint", () => {
    const repo = new RiskRepository();
    const events = repo.getEvents();
    const patterns = repo.getPatterns();
    const config = repo.getConfig();

    const signals = buildScenarioSignals([...events], patterns, config, defaultFilters);

    const totalEvents = signals.reduce((sum, signal) => sum + signal.eventCount, 0);
    expect(totalEvents).toBe(1000);

    const allEventIds = new Set<string>();
    for (const signal of signals) {
      for (const eventId of signal.eventIds) {
        expect(allEventIds.has(eventId)).toBe(false);
        allEventIds.add(eventId);
      }
    }
    expect(allEventIds.size).toBe(1000);
  });

  it("real dataset: patternId on each signal resolves to an existing pattern", () => {
    const repo = new RiskRepository();
    const events = repo.getEvents();
    const patterns = repo.getPatterns();
    const config = repo.getConfig();

    const signals = buildScenarioSignals([...events], patterns, config, defaultFilters);
    const patternsById = new Map(patterns.map((p) => [p.patternId, p]));

    for (const signal of signals) {
      if (signal.patternId !== null) {
        expect(patternsById.has(signal.patternId)).toBe(true);
      }
    }
  });
});

describe("ScenarioService - Analytics Correctness", () => {
  it("analytics.severity.counts matches fixture severity mix", () => {
    resetCounter();
    const issue = "Test severity analytics";
    const events = [
      makeEvent({ issueDetail: issue, severity: "High" }),
      makeEvent({ issueDetail: issue, severity: "High" }),
      makeEvent({ issueDetail: issue, severity: "Moderate" }),
      makeEvent({ issueDetail: issue, severity: "Low" }),
      makeEvent({ issueDetail: issue, severity: "Low" }),
    ];

    const config = makeConfig();
    const signals = buildScenarioSignals(events, [pattern({ group: { issueDetail: issue } })], config, defaultFilters);

    expect(signals).toHaveLength(1);
    const analytics = signals[0]!.analytics;
    expect(analytics.severity.counts.High).toBe(2);
    expect(analytics.severity.counts.Moderate).toBe(1);
    expect(analytics.severity.counts.Low).toBe(2);
    expect(signals[0]!.highSeverityCount).toBe(2);
  });

  it("analytics.workflow counts: openEventCount excludes Closed and Cancelled, sum equals eventCount", () => {
    resetCounter();
    const issue = "Test workflow analytics";
    const events = [
      makeEvent({ issueDetail: issue, status: "Active" }),
      makeEvent({ issueDetail: issue, status: "Active" }),
      makeEvent({ issueDetail: issue, status: "Under Investigation" }),
      makeEvent({ issueDetail: issue, status: "Closed" }),
      makeEvent({ issueDetail: issue, status: "Cancelled" }),
    ];

    const config = makeConfig();
    const signals = buildScenarioSignals(events, [pattern({ group: { issueDetail: issue } })], config, defaultFilters);

    const analytics = signals[0]!.analytics;
    expect(analytics.workflow.openEventCount).toBe(3);
    expect(analytics.workflow.closedEventCount).toBe(2);
    expect(analytics.workflow.openEventCount + analytics.workflow.closedEventCount).toBe(events.length);
  });

  it("analytics.exposure returns null (not 0) for financial amounts when scenario contains only Non-Financial events", () => {
    resetCounter();
    const issue = "Test non-financial exposure";
    const events = [
      makeEvent({ issueDetail: issue, eventType: "Non-Financial", grossAmountUsd: null }),
      makeEvent({ issueDetail: issue, eventType: "Non-Financial", netAmountUsd: null }),
    ];

    const config = makeConfig();
    const signals = buildScenarioSignals(events, [pattern({ group: { issueDetail: issue } })], config, defaultFilters);

    const exposure = signals[0]!.analytics.exposure;
    expect(exposure.grossAmountUsd).toBeNull();
    expect(exposure.netAmountUsd).toBeNull();
    expect(exposure.recoveryAmountUsd).toBeNull();
    expect(exposure.potentialImpactUsd).toBeNull();
  });

  it("analytics.concentration.shareOfFilteredEvents equals scenario events / total filtered population", () => {
    resetCounter();
    const issue1 = "Scenario 1";
    const issue2 = "Scenario 2";
    const events = [
      makeEvent({ issueDetail: issue1 }),
      makeEvent({ issueDetail: issue1 }),
      makeEvent({ issueDetail: issue2 }),
      makeEvent({ issueDetail: issue2 }),
      makeEvent({ issueDetail: issue2 }),
    ];

    const config = makeConfig();
    const signals = buildScenarioSignals(events, [pattern({ group: { issueDetail: issue1 } }), pattern({ group: { issueDetail: issue2 } })], config, defaultFilters);

    const signal1 = signals.find((s) => s.issueDetail === issue1);
    const signal2 = signals.find((s) => s.issueDetail === issue2);

    expect(signal1!.analytics.concentration.shareOfFilteredEvents).toBeCloseTo(2 / 5);
    expect(signal2!.analytics.concentration.shareOfFilteredEvents).toBeCloseTo(3 / 5);
  });

  it("analytics breakdown rows (organisations, owners, rootCauses) are sorted by eventCount descending", () => {
    resetCounter();
    const issue = "Test breakdown sorting";
    const events = [
      makeEvent({ issueDetail: issue, ownerName: "Owner A" }),
      makeEvent({ issueDetail: issue, ownerName: "Owner B" }),
      makeEvent({ issueDetail: issue, ownerName: "Owner B" }),
      makeEvent({ issueDetail: issue, ownerName: "Owner C" }),
      makeEvent({ issueDetail: issue, ownerName: "Owner C" }),
      makeEvent({ issueDetail: issue, ownerName: "Owner C" }),
    ];

    const config = makeConfig();
    const signals = buildScenarioSignals(events, [pattern({ group: { issueDetail: issue } })], config, defaultFilters);

    const owners = signals[0]!.analytics.owners;
    expect(owners[0]!.key).toBe("Owner C");
    expect(owners[0]!.eventCount).toBe(3);
    expect(owners[1]!.key).toBe("Owner B");
    expect(owners[1]!.eventCount).toBe(2);
    expect(owners[2]!.key).toBe("Owner A");
    expect(owners[2]!.eventCount).toBe(1);
  });

  it("analytics.effort: totalRemediationHours is sum, averagePerEvent is mean (rounded to 1 decimal), maxPerEvent is max", () => {
    resetCounter();
    const issue = "Test remediation hours";
    const events = [
      makeEvent({ issueDetail: issue, remediationHours: 10 }),
      makeEvent({ issueDetail: issue, remediationHours: 20 }),
      makeEvent({ issueDetail: issue, remediationHours: 30 }),
    ];

    const config = makeConfig();
    const signals = buildScenarioSignals(events, [pattern({ group: { issueDetail: issue } })], config, defaultFilters);

    const effort = signals[0]!.analytics.effort;
    expect(effort.totalRemediationHours).toBe(60);
    expect(effort.averagePerEvent).toBe(20);
    expect(effort.maxPerEvent).toBe(30);
  });

  it("analytics.effort with rounding: average is rounded to 1 decimal place", () => {
    resetCounter();
    const issue = "Test effort rounding";
    const events = [
      makeEvent({ issueDetail: issue, remediationHours: 10 }),
      makeEvent({ issueDetail: issue, remediationHours: 11 }),
      makeEvent({ issueDetail: issue, remediationHours: 12 }),
    ];

    const config = makeConfig();
    const signals = buildScenarioSignals(events, [pattern({ group: { issueDetail: issue } })], config, defaultFilters);

    const effort = signals[0]!.analytics.effort;
    expect(effort.totalRemediationHours).toBe(33);
    expect(effort.averagePerEvent).toBe(11.0);
  });
});

describe("ScenarioService - Presentation Layer", () => {
  it("deriveScenarioTitle returns curated short title for known scenarios from real dataset", () => {
    const repo = new RiskRepository();
    const events = repo.getEvents();

    const corporateActionEvent = events.find((e) => e.issueDetail.includes("corporate action instruction was not reflected"));
    expect(corporateActionEvent).toBeDefined();

    const title = deriveScenarioTitle(corporateActionEvent?.issueDetail ?? "");
    expect(title).toBe("Corporate action processing delay");
  });

  it("deriveScenarioTitle falls back gracefully: strips leading article and truncates long sentences", () => {
    const longIssue = "A very long sentence that exceeds the maximum fallback length and should be truncated on a word boundary with an ellipsis.";
    const title = deriveScenarioTitle(longIssue);

    expect(title).toContain("…");
    expect(title.length).toBeLessThanOrEqual(54);
    expect(title).not.toContain("A very long");
  });

  it("dimensions always returns exactly 4 ratings (Severity, Exposure, Workflow, Recurrence) with level in normal|elevated|critical", () => {
    resetCounter();
    const issue = "Test dimensions";
    const events = [makeEvent({ issueDetail: issue })];

    const config = makeConfig();
    const signals = buildScenarioSignals(events, [pattern({ group: { issueDetail: issue } })], config, defaultFilters);

    const dimensions = signals[0]!.dimensions;
    expect(dimensions).toHaveLength(4);

    const dimensionNames = dimensions.map((d) => d.dimension);
    expect(dimensionNames).toContain("Severity");
    expect(dimensionNames).toContain("Exposure");
    expect(dimensionNames).toContain("Workflow");
    expect(dimensionNames).toContain("Recurrence");

    for (const dim of dimensions) {
      expect(["normal", "elevated", "critical"]).toContain(dim.level);
    }
  });

  it("multi-organisation scenario: Recurrence dimension labelled Cross-organisation and contextLine mentions organisations count", () => {
    resetCounter();
    const issue = "Test cross-org recurrence";
    const events = [
      makeEvent({ issueDetail: issue, ownerOrganisation: "Org A" }),
      makeEvent({ issueDetail: issue, ownerOrganisation: "Org B" }),
    ];

    const config = makeConfig();
    const signals = buildScenarioSignals(events, [pattern({ group: { issueDetail: issue } })], config, defaultFilters);

    const recurrenceDim = signals[0]!.dimensions.find((d) => d.dimension === "Recurrence");
    expect(recurrenceDim!.label).toBe("Cross-organisation");
    expect(signals[0]!.contextLine).toMatch(/Recurring across [0-9]+ organisations/);
  });

  it("single-organisation scenario: Recurrence dimension not Cross-organisation, contextLine mentions owner count", () => {
    resetCounter();
    const issue = "Test single-org recurrence";
    const events = [
      makeEvent({ issueDetail: issue, ownerOrganisation: "Org A", ownerName: "Owner 1" }),
      makeEvent({ issueDetail: issue, ownerOrganisation: "Org A", ownerName: "Owner 2" }),
    ];

    const config = makeConfig();
    const signals = buildScenarioSignals(events, [pattern({ group: { issueDetail: issue } })], config, defaultFilters);

    const recurrenceDim = signals[0]!.dimensions.find((d) => d.dimension === "Recurrence");
    expect(recurrenceDim!.label).not.toBe("Cross-organisation");
    expect(signals[0]!.contextLine).toMatch(/Concentrated in.*across [0-9]+ owners?/);
  });

  it("whyAttention is a single sentence ending with a period and mentions high-severity count when present", () => {
    resetCounter();
    const issue = "Test why attention high severity";
    const events = [
      makeEvent({ issueDetail: issue, severity: "High" }),
      makeEvent({ issueDetail: issue, severity: "High" }),
      makeEvent({ issueDetail: issue, severity: "Low" }),
    ];

    const config = makeConfig();
    const signals = buildScenarioSignals(events, [pattern({ group: { issueDetail: issue } })], config, defaultFilters);

    const whyAttention = signals[0]!.whyAttention;
    expect(whyAttention.endsWith(".")).toBe(true);
    expect(whyAttention).toContain("2 high-severity events");
  });

  it("whyAttention for low-severity all-closed single-org scenario still returns non-empty sentence", () => {
    resetCounter();
    const issue = "Test why attention no signals";
    const events = [
      makeEvent({ issueDetail: issue, severity: "Low", status: "Closed" }),
      makeEvent({ issueDetail: issue, severity: "Low", status: "Closed" }),
    ];

    const config = makeConfig();
    const signals = buildScenarioSignals(events, [pattern({ group: { issueDetail: issue } })], config, defaultFilters);

    const whyAttention = signals[0]!.whyAttention;
    expect(whyAttention.length).toBeGreaterThan(0);
    expect(whyAttention.endsWith(".")).toBe(true);
    expect(whyAttention).toContain("no threshold-level");
  });
});

describe("ScenarioService - People Guardrail", () => {
  it("analytics.recurrence.interpretation for multi-owner scenario contains 'shared process or control pattern' and avoids blame language", () => {
    resetCounter();
    const issue = "Test people guardrail";
    const events = [
      makeEvent({ issueDetail: issue, ownerName: "Owner A" }),
      makeEvent({ issueDetail: issue, ownerName: "Owner B" }),
      makeEvent({ issueDetail: issue, ownerName: "Owner C" }),
    ];

    const config = makeConfig();
    const signals = buildScenarioSignals(events, [pattern({ group: { issueDetail: issue } })], config, defaultFilters);

    const interpretation = signals[0]!.analytics.recurrence.interpretation;
    expect(interpretation).toContain("shared process or control pattern");

    const blameLangage = ["caused", "responsible", "fault", "blame"];
    for (const word of blameLangage) {
      expect(interpretation.toLowerCase()).not.toContain(word.toLowerCase());
    }
  });
});

describe("ScenarioService - Ranking", () => {
  it("rankScenarioSignals puts higher high-severity count ahead, deterministically, with stable tie-breaking", () => {
    resetCounter();
    const issue1 = "Few high severity";
    const issue2 = "Many high severity";

    const events1 = [
      makeEvent({ issueDetail: issue1, severity: "High" }),
      makeEvent({ issueDetail: issue1, severity: "Low" }),
    ];

    resetCounter();
    const events2 = [
      makeEvent({ issueDetail: issue2, severity: "High" }),
      makeEvent({ issueDetail: issue2, severity: "High" }),
      makeEvent({ issueDetail: issue2, severity: "High" }),
      makeEvent({ issueDetail: issue2, severity: "Low" }),
    ];

    const config = makeConfig();
    const signals1 = buildScenarioSignals(events1, [pattern({ patternId: "pat1", group: { issueDetail: issue1 } })], config, defaultFilters);
    const signals2 = buildScenarioSignals(events2, [pattern({ patternId: "pat2", group: { issueDetail: issue2 } })], config, defaultFilters);

    const allSignals = [...signals1, ...signals2];
    const ranked = rankScenarioSignals(allSignals);

    expect(ranked[0]!.issueDetail).toBe(issue2);
    expect(ranked[1]!.issueDetail).toBe(issue1);

    const rankedAgain = rankScenarioSignals(allSignals);
    expect(rankedAgain.map((s) => s.issueDetail)).toEqual(ranked.map((s) => s.issueDetail));
  });

  it("rankScenarioSignals deterministically breaks ties by scenarioId", () => {
    resetCounter();
    const issue1 = "Tie scenario A";
    const issue2 = "Tie scenario B";

    const events1 = [makeEvent({ issueDetail: issue1 })];
    resetCounter();
    const events2 = [makeEvent({ issueDetail: issue2 })];

    const config = makeConfig();
    const signals1 = buildScenarioSignals(events1, [pattern({ patternId: "z_pattern", group: { issueDetail: issue1 } })], config, defaultFilters);
    const signals2 = buildScenarioSignals(events2, [pattern({ patternId: "a_pattern", group: { issueDetail: issue2 } })], config, defaultFilters);

    const allSignals = [...signals1, ...signals2];
    const ranked = rankScenarioSignals(allSignals);

    const scenarioIds = ranked.map((s) => s.scenarioId);
    expect(scenarioIds).toEqual([...scenarioIds].sort());
  });
});
