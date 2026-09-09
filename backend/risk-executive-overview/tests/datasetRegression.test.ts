import { describe, expect, it } from "vitest";
import { RiskRepository } from "../src/repositories/RiskRepository";

describe("dataset regression anchors", () => {
  const repository = new RiskRepository();
  const events = repository.getEvents();

  it("loads exactly 1000 events", () => {
    expect(events.length).toBe(1000);
  });

  it("matches the known Financial/Non-Financial split", () => {
    const financial = events.filter((event) => event.eventType === "Financial").length;
    const nonFinancial = events.filter((event) => event.eventType === "Non-Financial").length;
    expect(financial).toBe(239);
    expect(nonFinancial).toBe(761);
  });

  it("matches the known severity split", () => {
    const low = events.filter((event) => event.severity === "Low").length;
    const moderate = events.filter((event) => event.severity === "Moderate").length;
    const high = events.filter((event) => event.severity === "High").length;
    expect(low).toBe(705);
    expect(moderate).toBe(244);
    expect(high).toBe(51);
  });

  it("has 12 owner organisations", () => {
    expect(new Set(events.map((event) => event.ownerOrganisation)).size).toBe(12);
  });

  it("spans the known occurrence date range", () => {
    const dates = events.map((event) => event.occurrenceDate).sort();
    expect(dates[0]).toBe("2024-09-01");
    expect(dates[dates.length - 1]).toBe("2026-08-31");
  });

  it("has all unique Event IDs", () => {
    expect(new Set(events.map((event) => event.eventId)).size).toBe(events.length);
  });

  it("never treats a missing Non-Financial amount as zero at the source level", () => {
    const nonFinancialWithAmount = events.filter(
      (event) => event.eventType === "Non-Financial" && event.grossAmountUsd !== null,
    );
    expect(nonFinancialWithAmount).toHaveLength(0);
  });

  it("loads config with the open-backlog business rule", () => {
    const config = repository.getConfig();
    expect(config.businessRules.openBacklog.excludedStatuses).toEqual(["Closed", "Cancelled"]);
  });

  it("resolves every pattern Event ID to a real event", () => {
    for (const pattern of repository.getPatterns()) {
      for (const eventId of pattern.eventIds) {
        expect(repository.getEventById(eventId)).toBeDefined();
      }
    }
  });
});
