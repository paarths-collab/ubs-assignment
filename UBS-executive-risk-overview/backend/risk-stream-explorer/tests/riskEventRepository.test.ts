import { beforeEach, describe, expect, it } from "vitest";
import { RiskEventRepository } from "../src/repositories/RiskEventRepository";
import { makeRiskEvent, resetRiskFixtureCounters } from "./riskFixtures";

describe("RiskEventRepository", () => {
  beforeEach(() => resetRiskFixtureCounters());

  it("looks up an event by id, null for unknown", () => {
    const e1 = makeRiskEvent();
    const e2 = makeRiskEvent();
    const repo = new RiskEventRepository([e1, e2]);

    expect(repo.getById(e1.event_id)?.event_id).toBe(e1.event_id);
    expect(repo.getById("UNKNOWN")).toBeNull();
  });

  it("resolves a list of ids, silently dropping ones that don't exist", () => {
    const e1 = makeRiskEvent();
    const e2 = makeRiskEvent();
    const repo = new RiskEventRepository([e1, e2]);

    const resolved = repo.getByIds([e1.event_id, "GHOST", e2.event_id]);
    expect(resolved.map((e) => e.event_id)).toEqual([e1.event_id, e2.event_id]);
  });

  it("counts and lists all events", () => {
    const events = [makeRiskEvent(), makeRiskEvent(), makeRiskEvent()];
    const repo = new RiskEventRepository(events);
    expect(repo.count()).toBe(3);
    expect(repo.getAll()).toHaveLength(3);
  });
});
