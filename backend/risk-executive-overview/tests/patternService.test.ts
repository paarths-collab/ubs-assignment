import { describe, expect, it } from "vitest";
import { resolveAllFilteredPatterns, resolveFilteredPattern } from "../src/services/PatternService";
import { RiskRepository } from "../src/repositories/RiskRepository";
import type { RiskPattern } from "../src/types/Pattern";

class FakeRepository {
  constructor(private readonly eventsById: Map<string, unknown>) {}
  getEventsByIds(ids: readonly string[]) {
    return ids.map((id) => this.eventsById.get(id)).filter((event) => event != null);
  }
}

describe("PatternService", () => {
  it("intersects pattern membership with the currently filtered Event IDs, never the original unfiltered set", () => {
    const pattern: RiskPattern = {
      patternId: "issue_test",
      patternType: "issue",
      eventIds: ["A", "B", "C"],
      group: { issueDetail: "Test issue" },
    };
    const eventsById = new Map([
      ["A", { eventId: "A" }],
      ["B", { eventId: "B" }],
      ["C", { eventId: "C" }],
    ]);
    const repository = new FakeRepository(eventsById) as unknown as RiskRepository;

    const filteredIds = new Set(["A", "C"]);
    const result = resolveFilteredPattern(pattern, filteredIds, repository);

    expect(result.events.map((event) => (event as { eventId: string }).eventId)).toEqual(["A", "C"]);
  });

  it("drops patterns whose membership does not survive the current filters", () => {
    const patterns: RiskPattern[] = [
      { patternId: "p1", patternType: "issue", eventIds: ["A"], group: {} },
      { patternId: "p2", patternType: "issue", eventIds: ["B"], group: {} },
    ];
    const eventsById = new Map([["A", { eventId: "A" }]]);
    const repository = new FakeRepository(eventsById) as unknown as RiskRepository;

    const filteredIds = new Set(["A"]);
    const result = resolveAllFilteredPatterns(patterns, filteredIds, repository);

    expect(result).toHaveLength(1);
    expect(result[0]?.pattern.patternId).toBe("p1");
  });

  it("resolves real dataset patterns against the full event set without unknown Event IDs", () => {
    const repository = new RiskRepository();
    const allIds = new Set(repository.getEvents().map((event) => event.eventId));
    for (const pattern of repository.getPatterns().slice(0, 25)) {
      const resolved = resolveFilteredPattern(pattern, allIds, repository);
      expect(resolved.events).toHaveLength(pattern.eventIds.length);
    }
  });
});
