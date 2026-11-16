import { beforeEach, describe, expect, it } from "vitest";
import { PatternRepository } from "../src/repositories/PatternRepository";
import { makePattern, makePatternsDataset, resetRiskFixtureCounters } from "./riskFixtures";

describe("PatternRepository", () => {
  beforeEach(() => resetRiskFixtureCounters());

  it("looks up a pattern by id in O(1), null for unknown", () => {
    const p1 = makePattern();
    const p2 = makePattern();
    const repo = new PatternRepository(makePatternsDataset([p1, p2], [p1.pattern_id]));

    expect(repo.getById(p1.pattern_id)?.pattern_id).toBe(p1.pattern_id);
    expect(repo.getById("UNKNOWN")).toBeNull();
  });

  it("resolves the priority queue in queue order, dropping any dangling reference", () => {
    const p1 = makePattern();
    const p2 = makePattern();
    const p3 = makePattern();
    // Priority queue lists p3 before p1, and references one id that doesn't exist in `patterns`.
    const repo = new PatternRepository(makePatternsDataset([p1, p2, p3], [p3.pattern_id, p1.pattern_id, "PAT-GHOST"]));

    const resolved = repo.getPriorityQueue();
    expect(resolved.map((p) => p.pattern_id)).toEqual([p3.pattern_id, p1.pattern_id]);
  });

  it("reports the dataset's declared pattern_count and enterprise baseline", () => {
    const p1 = makePattern();
    const repo = new PatternRepository(makePatternsDataset([p1], [p1.pattern_id], { pattern_count: 137 }));

    expect(repo.count()).toBe(137);
    expect(repo.getEnterpriseBaseline().event_count).toBe(1000);
  });

  it("getAll returns every pattern", () => {
    const p1 = makePattern();
    const p2 = makePattern();
    const repo = new PatternRepository(makePatternsDataset([p1, p2], []));
    expect(repo.getAll()).toHaveLength(2);
  });
});
