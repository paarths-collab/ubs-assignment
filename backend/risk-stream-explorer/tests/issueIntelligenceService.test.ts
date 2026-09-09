import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildRiskDataset } from "../src/repositories/RiskDataLoader";
import { IssueIntelligenceService, buildDeterministicSummary, buildIssueEvidencePayload } from "../src/services/IssueIntelligenceService";
import type { RiskEventsDataset } from "../src/types/RiskEvent";
import type { RiskPatternsDataset } from "../src/types/Pattern";
import { slugify } from "../src/utils/slug";

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
