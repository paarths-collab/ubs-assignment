import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { buildRiskDataset } from "../src/repositories/RiskDataLoader";
import { InvestigationService, buildDeterministicSummary, buildObservedFacts } from "../src/services/InvestigationService";
import { PatternRepository } from "../src/repositories/PatternRepository";
import { RiskEventRepository } from "../src/repositories/RiskEventRepository";
import type { RiskEventsDataset } from "../src/types/RiskEvent";
import type { RiskPatternsDataset } from "../src/types/Pattern";
import { makePattern, makePatternsDataset, makeRiskEvent, resetRiskFixtureCounters } from "./riskFixtures";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../data");

function readJson<T>(fileName: string): T {
  return JSON.parse(readFileSync(path.join(dataDir, fileName), "utf-8")) as T;
}

describe("InvestigationService against the real dataset", () => {
  const eventsDataset = readJson<RiskEventsDataset>("risk_events_final.json");
  const patternsDataset = readJson<RiskPatternsDataset>("risk_patterns_final.json");
  const { eventRepository, patternRepository } = buildRiskDataset(eventsDataset, patternsDataset);
  const service = new InvestigationService(patternRepository, eventRepository);

  it("resolves PAT-0067 to exactly its 10 known matching events", () => {
    const investigation = service.getInvestigation("PAT-0067");
    expect(investigation).not.toBeNull();
    expect(investigation!.matchingEvents.map((e) => e.event_id).sort()).toEqual(
      [
        "SIM-0000025",
        "SIM-0000130",
        "SIM-0000235",
        "SIM-0000340",
        "SIM-0000445",
        "SIM-0000550",
        "SIM-0000655",
        "SIM-0000760",
        "SIM-0000865",
        "SIM-0000970",
      ].sort(),
    );
  });

  it("passes enterprise comparison numbers through unchanged", () => {
    const investigation = service.getInvestigation("PAT-0067")!;
    const pattern = patternRepository.getById("PAT-0067")!;
    expect(investigation.enterpriseComparison).toEqual(pattern.compared_with_enterprise);
    expect(investigation.enterprise).toEqual(patternRepository.getEnterpriseBaseline());
  });

  it("returns null for an unknown pattern id", () => {
    expect(service.getInvestigation("PAT-DOES-NOT-EXIST")).toBeNull();
  });

  it("keeps Non-Financial matching events' financial fields null, not 0", () => {
    // PAT-0106 includes "Non-Financial" as one of its combination dimensions.
    const investigation = service.getInvestigation("PAT-0106");
    expect(investigation).not.toBeNull();
    const nonFinancialEvents = investigation!.matchingEvents.filter((e) => e.event_type === "Non-Financial");
    expect(nonFinancialEvents.length).toBeGreaterThan(0);
    for (const event of nonFinancialEvents) {
      expect(event.financial.gross_amount).toBeNull();
      expect(event.financial.net_amount_reported).not.toBe(0);
    }
  });
});

describe("InvestigationService with fixtures", () => {
  beforeEach(() => resetRiskFixtureCounters());

  it("composes a deterministic summary purely from observed/compared_with_enterprise fields", () => {
    const pattern = makePattern({
      observed: {
        ...makePattern().observed,
        event_count: 10,
        severity: { Low: 3, Moderate: 3, High: 4 },
        high_rate_pct: 40.0,
        enterprise_high_rate_pct: 5.1,
        high_rate_lift: 7.84,
        open_events: 9,
      },
    });
    const summary = buildDeterministicSummary(pattern);
    expect(summary).toContain("10 events match this pattern.");
    expect(summary).toContain("4 are High-classified.");
    expect(summary).toContain("40.0%");
    expect(summary).toContain("5.1%");
    expect(summary).toContain("7.84x");
    expect(summary).toContain("9 of 10 matching events are open.");
  });

  it("buildObservedFacts exposes only the fields the AI route is allowed to echo deterministically", () => {
    const pattern = makePattern();
    const observed = buildObservedFacts(pattern);
    expect(observed.patternId).toBe(pattern.pattern_id);
    expect(observed.observed).toEqual(pattern.observed);
    expect(observed.comparedWithEnterprise).toEqual(pattern.compared_with_enterprise);
  });

  it("getInvestigation resolves matching events through the event repository", () => {
    const e1 = makeRiskEvent();
    const e2 = makeRiskEvent();
    const pattern = makePattern({ matching_event_ids: [e1.event_id, e2.event_id] });
    const patternRepository = new PatternRepository(makePatternsDataset([pattern], [pattern.pattern_id]));
    const eventRepository = new RiskEventRepository([e1, e2]);
    const service = new InvestigationService(patternRepository, eventRepository);

    const investigation = service.getInvestigation(pattern.pattern_id);
    expect(investigation!.matchingEvents).toHaveLength(2);
    expect(investigation!.graphFilter).toEqual(pattern.graph_filter);
  });
});
