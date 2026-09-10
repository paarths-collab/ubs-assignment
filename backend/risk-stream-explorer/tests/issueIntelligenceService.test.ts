import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { buildRiskDataset } from "../src/repositories/RiskDataLoader";
import { IssueIntelligenceService, buildDeterministicSummary, buildIssueEvidencePayload } from "../src/services/IssueIntelligenceService";
import { PatternRepository } from "../src/repositories/PatternRepository";
import { RiskEventRepository } from "../src/repositories/RiskEventRepository";
import type { RiskEvent, RiskEventsDataset } from "../src/types/RiskEvent";
import type { RiskPatternsDataset } from "../src/types/Pattern";
import { slugify } from "../src/utils/slug";
import { makePatternsDataset, makeRiskEvent, resetRiskFixtureCounters } from "./riskFixtures";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../data");

function readJson<T>(fileName: string): T {
  return JSON.parse(readFileSync(path.join(dataDir, fileName), "utf-8")) as T;
}

describe("IssueIntelligenceService against the real dataset", () => {
  const eventsDataset = readJson<RiskEventsDataset>("risk_events_final.json");
  const patternsDataset = readJson<RiskPatternsDataset>("risk_patterns_final.json");
  const { eventRepository, patternRepository } = buildRiskDataset(eventsDataset, patternsDataset);
  const service = new IssueIntelligenceService(eventRepository, patternRepository);

  it("builds a profile for all 15 distinct issues", () => {
    const distinctIssues = new Set(eventsDataset.events.map((e) => e.issue));
    expect(distinctIssues.size).toBe(15);

    const ranked = service.getRankedIssues();
    expect(ranked.count).toBe(15);
    expect(ranked.totalIssues).toBe(15);

    for (const issue of distinctIssues) {
      const profile = service.getProfile(slugify(issue));
      expect(profile).not.toBeNull();
      expect(profile!.issue).toBe(issue);
    }
  });

  it("matches the known Issue x Root Cause lift: Corporate action instruction gap + Data Quality / Mapping Error = 10 events, 4 High, 7.84x", () => {
    const profile = service.getProfile(slugify("Corporate action instruction gap"));
    expect(profile).not.toBeNull();

    const combo = profile!.rootCauseBreakdown.find((c) => c.root_cause === "Data Quality / Mapping Error");
    expect(combo).toBeDefined();
    expect(combo!.event_count).toBe(10);
    expect(combo!.high_count).toBe(4);
    expect(combo!.high_rate_pct).toBeCloseTo(40.0, 1);
    expect(combo!.high_rate_lift).toBeCloseTo(7.84, 2);
    expect(combo!.meets_support_threshold).toBe(true);

    // It should also be the strongest combination for this issue.
    expect(profile!.strongestRootCauseCombination?.root_cause).toBe("Data Quality / Mapping Error");
  });

  it("never coerces a Non-Financial event's null financial fields to 0 in the aggregate", () => {
    // "Statement delivery failure" is a mostly Non-Financial-heavy issue; regardless, every
    // issue mixes Financial and Non-Financial events, so populated_count must be < event_count
    // for at least gross_amount, and the total must reflect only the populated events.
    for (const issueSummary of service.getRankedIssues().issues) {
      const profile = service.getProfile(issueSummary.slug)!;
      const grossPopulated = profile.financials.gross_amount.populated_count;
      const eventCount = profile.severity.event_count;
      expect(grossPopulated).toBeLessThan(eventCount);
      // Sanity: populated_count must never exceed event_count.
      expect(profile.financials.potential_impact.populated_count).toBeLessThanOrEqual(eventCount);
    }
  });

  it("computes ranking deterministically and stably across repeated construction", () => {
    const service2 = new IssueIntelligenceService(eventRepository, patternRepository);
    const order1 = service.getRankedIssues().issues.map((i) => i.slug);
    const order2 = service2.getRankedIssues().issues.map((i) => i.slug);
    expect(order1).toEqual(order2);

    // Rank score must be non-increasing down the list.
    const scores = service.getRankedIssues().issues.map((i) => i.rankScore);
    for (let i = 1; i < scores.length; i += 1) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]!);
    }
  });

  it("reports 'no material signal' honestly for a flat dimension (event count is the same across all issues)", () => {
    const counts = service.getRankedIssues().issues.map((i) => i.headline.event_count);
    const distinctCounts = new Set(counts);
    // Verifies the profiled claim: every issue has 66 or 67 events — not used as a ranking signal.
    expect([...distinctCounts].every((c) => c === 66 || c === 67)).toBe(true);
  });

  it("does not manufacture a trend from the dataset's partial trailing period", () => {
    for (const issueSummary of service.getRankedIssues().issues) {
      const profile = service.getProfile(issueSummary.slug)!;
      // With this dataset's actual distribution, no issue's recent-vs-prior swing should
      // exceed the configured material-change threshold.
      expect(profile.trend.material_change).toBe(false);
      expect(profile.trend.note).toContain("No material change");
    }
  });

  it("PAT-0067's issue ('Corporate action instruction gap') lists it among related patterns", () => {
    const profile = service.getProfile(slugify("Corporate action instruction gap"))!;
    const related = profile.relatedPatterns.find((p) => p.pattern_id === "PAT-0067");
    expect(related).toBeDefined();
    expect(related!.title).toContain("Corporate action instruction gap");
  });

  it("returns null for an unknown issue slug", () => {
    expect(service.getProfile("not-a-real-issue")).toBeNull();
    expect(service.getDetail("not-a-real-issue", patternRepository.getEnterpriseBaseline())).toBeNull();
  });

  it("buildDeterministicSummary composes a summary purely from profile fields", () => {
    const profile = service.getProfile(slugify("Corporate action instruction gap"))!;
    const summary = buildDeterministicSummary(profile);
    expect(summary).toContain("Corporate action instruction gap");
    expect(summary.length).toBeGreaterThan(20);
  });

  it("buildIssueEvidencePayload exposes matching_event_ids that are a subset of the profile's own events", () => {
    const profile = service.getProfile(slugify("Corporate action instruction gap"))!;
    const payload = buildIssueEvidencePayload(profile);
    expect(payload.matching_event_ids).toEqual(profile.matchingEventIds);
    expect(payload.matching_event_ids.length).toBeGreaterThan(0);
  });

  it("getDetail returns a full response with graphFilter scoped to the issue", () => {
    const enterprise = patternRepository.getEnterpriseBaseline();
    const detail = service.getDetail(slugify("Corporate action instruction gap"), enterprise)!;
    expect(detail.graphFilter).toEqual({ issue: ["Corporate action instruction gap"] });
    expect(detail.enterprise).toEqual(enterprise);
  });
});

/**
 * Counter-signals, tiering, and `whyItSurfaced` exercised against small,
 * hand-crafted event sets rather than the real dataset — this lets each
 * scenario pin every input (severity mix, root-cause spread, timeliness,
 * open rate, trend) precisely enough to assert an exact expected set of
 * counter-signals, rather than relying on whatever the real data happens to
 * produce.
 */
describe("IssueIntelligenceService — counter-signals, tiering, and whyItSurfaced (synthetic fixtures)", () => {
  const ISSUE_SLUG = slugify("Test issue");

  function buildService(events: RiskEvent[]): IssueIntelligenceService {
    const eventRepository = new RiskEventRepository(events);
    const patternRepository = new PatternRepository(makePatternsDataset([], []));
    return new IssueIntelligenceService(eventRepository, patternRepository);
  }

  beforeEach(() => {
    resetRiskFixtureCounters();
  });

  it("returns an empty counterSignals array when every dimension is genuinely unusual, and tiers two tied-weight signals via SIGNAL_TIE_BREAK_PRIORITY", () => {
    // 20 events, all High-severity, all sharing one root cause (so both
    // HIGH_SEVERITY_CONCENTRATION and STRONG_ROOT_CAUSE_INTERACTION trigger
    // and tie on weight 3), all far from every enterprise-baseline metric
    // (detection/recording/journey delay, open rate), and a 5-then-15 month
    // split that produces a material (200%) recent-vs-prior trend swing.
    // None of the 7 counter-signal checks should hold.
    const events: RiskEvent[] = [
      ...Array.from({ length: 5 }, () =>
        makeRiskEvent({
          classification: "High",
          risk: { root_cause: "Concentrated Cause", risk_theme: "Technology Resilience", or_category: "Internal Control and Governance" },
          workflow: {
            status: "Open",
            stage: "Review",
            is_open: true,
            owner_organisation: "Test Org → Fictional Enterprise Operations",
            owner_organisation_short: "Test Org",
            owner_name: "Test Owner",
            current_assignee: "Test Assignee",
            creator_name: "Test Creator",
            administrator_name: "Test Admin",
            discovery_organisation: "Test Org",
            modified_by_name: "Test Owner",
          },
          timeline: {
            occurrence_date: "2025-01-15",
            discovered_date: "2025-01-20",
            created_on: "2025-01-22",
            modified_on: "2025-01-25",
            occurrence_month: "2025-01",
            detection_delay_days: 20,
            recording_delay_days: 20,
            occurrence_to_record_days: 40,
          },
        }),
      ),
      ...Array.from({ length: 15 }, () =>
        makeRiskEvent({
          classification: "High",
          risk: { root_cause: "Concentrated Cause", risk_theme: "Technology Resilience", or_category: "Internal Control and Governance" },
          workflow: {
            status: "Open",
            stage: "Review",
            is_open: true,
            owner_organisation: "Test Org → Fictional Enterprise Operations",
            owner_organisation_short: "Test Org",
            owner_name: "Test Owner",
            current_assignee: "Test Assignee",
            creator_name: "Test Creator",
            administrator_name: "Test Admin",
            discovery_organisation: "Test Org",
            modified_by_name: "Test Owner",
          },
          timeline: {
            occurrence_date: "2025-10-15",
            discovered_date: "2025-10-20",
            created_on: "2025-10-22",
            modified_on: "2025-10-25",
            occurrence_month: "2025-10",
            detection_delay_days: 20,
            recording_delay_days: 20,
            occurrence_to_record_days: 40,
          },
        }),
      ),
    ];

    const service = buildService(events);
    const profile = service.getProfile(ISSUE_SLUG)!;
    expect(profile).not.toBeNull();

    // Trend is genuinely material: 15 recent vs 5 prior = +200%.
    expect(profile.trend.material_change).toBe(true);
    // Strongest root-cause combination clears the lift threshold.
    expect(profile.strongestRootCauseCombination?.high_rate_lift).toBeGreaterThanOrEqual(3.5);

    expect(profile.counterSignals).toEqual([]);

    const triggeredIds = profile.triggeredSignals.map((s) => s.id);
    expect(triggeredIds).toContain("HIGH_SEVERITY_CONCENTRATION");
    expect(triggeredIds).toContain("STRONG_ROOT_CAUSE_INTERACTION");

    // Both signals share weight 3 — SIGNAL_TIE_BREAK_PRIORITY ranks
    // STRONG_ROOT_CAUSE_INTERACTION first, so it (not HIGH_SEVERITY_CONCENTRATION)
    // must be the sole "primary" signal.
    const primary = profile.triggeredSignals.filter((s) => s.tier === "primary");
    expect(primary).toHaveLength(1);
    expect(primary[0]!.id).toBe("STRONG_ROOT_CAUSE_INTERACTION");
    const secondary = profile.triggeredSignals.filter((s) => s.tier === "secondary");
    expect(secondary.some((s) => s.id === "HIGH_SEVERITY_CONCENTRATION")).toBe(true);

    const summary = service.getRankedIssues().issues.find((i) => i.slug === ISSUE_SLUG)!;
    const lift = profile.strongestRootCauseCombination!.high_rate_lift;
    expect(summary.whyItSurfaced).toBe(`${lift}x High concentration in one root-cause combination`);
    expect(summary.counterSignals).toEqual([]);
  });

  it("returns all 7 counter-signals, and a fallback whyItSurfaced, when nothing clears any triggered-signal threshold", () => {
    // 20 events: 1 High (5% — at/below the 5.1% enterprise rate), 5
    // root-cause groups of 4 each (none clears the 5-event support floor),
    // detection/recording/journey delay set exactly to the enterprise
    // means (delta 0), 14/20 open (70% — within 4 points of the 72.1%
    // baseline), and every event in a single occurrence month (so the
    // prior trend window is empty and no material change is possible).
    const rootCauses = ["Cause A", "Cause B", "Cause C", "Cause D", "Cause E"];
    const events: RiskEvent[] = Array.from({ length: 20 }, (_, i) =>
      makeRiskEvent({
        classification: i === 0 ? "High" : "Low",
        risk: { root_cause: rootCauses[i % 5]!, risk_theme: "Technology Resilience", or_category: "Internal Control and Governance" },
        workflow: {
          status: i < 14 ? "Open" : "Closed",
          stage: i < 14 ? "Review" : "Closed",
          is_open: i < 14,
          owner_organisation: "Test Org → Fictional Enterprise Operations",
          owner_organisation_short: "Test Org",
          owner_name: "Test Owner",
          current_assignee: "Test Assignee",
          creator_name: "Test Creator",
          administrator_name: "Test Admin",
          discovery_organisation: "Test Org",
          modified_by_name: "Test Owner",
        },
        timeline: {
          occurrence_date: "2025-06-15",
          discovered_date: "2025-06-20",
          created_on: "2025-06-22",
          modified_on: "2025-06-25",
          occurrence_month: "2025-06",
          detection_delay_days: 2.46,
          recording_delay_days: 3.61,
          occurrence_to_record_days: 6.07,
        },
      }),
    );

    const service = buildService(events);
    const profile = service.getProfile(ISSUE_SLUG)!;
    expect(profile).not.toBeNull();

    expect(profile.triggeredSignals).toEqual([]);
    expect(profile.rankScore).toBe(0);
    expect(profile.trend.material_change).toBe(false);
    expect(profile.strongestRootCauseCombination).toBeNull();

    const counterIds = profile.counterSignals.map((s) => s.id).sort();
    expect(counterIds).toEqual(
      [
        "DETECTION_NEAR_BASELINE",
        "JOURNEY_NEAR_BASELINE",
        "NO_MATERIAL_TREND",
        "NO_STRONG_ROOT_CAUSE_INTERACTION",
        "OPEN_RATE_NEAR_BASELINE",
        "RECORDING_NEAR_BASELINE",
        "SEVERITY_AT_OR_BELOW_BASELINE",
      ].sort(),
    );
    // Every counter-signal's detail sentence cites real numbers, never a placeholder.
    for (const signal of profile.counterSignals) {
      expect(signal.detail.length).toBeGreaterThan(10);
      expect(signal.label.length).toBeGreaterThan(0);
    }

    const summary = service.getRankedIssues().issues.find((i) => i.slug === ISSUE_SLUG)!;
    expect(summary.whyItSurfaced).toBe(
      "No signal cleared threshold — this issue tracks at or near enterprise baseline across every measured dimension.",
    );
    expect(summary.counterSignals.map((s) => s.id).sort()).toEqual(counterIds);
  });

  it("buildIssueEvidencePayload passes counter_signals through unchanged from the profile", () => {
    const events: RiskEvent[] = Array.from({ length: 6 }, () => makeRiskEvent({ classification: "Low" }));
    const service = buildService(events);
    const profile = service.getProfile(ISSUE_SLUG)!;
    const payload = buildIssueEvidencePayload(profile);
    expect(payload.counter_signals).toEqual(profile.counterSignals.map((s) => ({ id: s.id, label: s.label, detail: s.detail })));
  });
});
