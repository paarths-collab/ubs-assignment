import { describe, expect, it } from "vitest";
import { applyFilters, filterByDateRange } from "../src/services/FilterService";
import { EMPTY_FILTER_STATE } from "../src/types/Filters";
import { makeEvent } from "./fixtures";

describe("applyFilters", () => {
  const events = [
    makeEvent({ eventId: "A", severity: "High", eventType: "Financial", riskTheme: "Financial Reporting", ownerOrganisation: "Org A", occurrenceDate: "2026-01-05" }),
    makeEvent({ eventId: "B", severity: "Low", eventType: "Non-Financial", riskTheme: "Technology Resilience", ownerOrganisation: "Org B", occurrenceDate: "2026-02-10" }),
    makeEvent({ eventId: "C", severity: "High", eventType: "Non-Financial", riskTheme: "Financial Reporting", ownerOrganisation: "Org A", occurrenceDate: "2026-03-01" }),
  ];

  it("returns all events when no filters are active", () => {
    expect(applyFilters(events, EMPTY_FILTER_STATE)).toHaveLength(3);
  });

  it("filters by a single dimension", () => {
    const result = applyFilters(events, { ...EMPTY_FILTER_STATE, severity: "High" });
    expect(result.map((e) => e.eventId)).toEqual(["A", "C"]);
  });

  it("combines multiple filter dimensions with AND semantics", () => {
    const result = applyFilters(events, { ...EMPTY_FILTER_STATE, severity: "High", eventType: "Non-Financial" });
    expect(result.map((e) => e.eventId)).toEqual(["C"]);
  });

  it("filters by organisation and risk theme together", () => {
    const result = applyFilters(events, { ...EMPTY_FILTER_STATE, organisation: "Org A", riskTheme: "Financial Reporting" });
    expect(result.map((e) => e.eventId)).toEqual(["A", "C"]);
  });

  it("filters by an inclusive date range", () => {
    const result = applyFilters(events, { ...EMPTY_FILTER_STATE, dateStart: "2026-01-06", dateEnd: "2026-02-28" });
    expect(result.map((e) => e.eventId)).toEqual(["B"]);
  });

  it("returns an empty array when no events match", () => {
    const result = applyFilters(events, { ...EMPTY_FILTER_STATE, severity: "Moderate" });
    expect(result).toHaveLength(0);
  });
});

describe("filterByDateRange", () => {
  it("is inclusive of both boundary dates", () => {
    const events = [
      makeEvent({ eventId: "A", occurrenceDate: "2026-01-01" }),
      makeEvent({ eventId: "B", occurrenceDate: "2026-01-15" }),
      makeEvent({ eventId: "C", occurrenceDate: "2026-01-31" }),
    ];
    const result = filterByDateRange(events, "2026-01-01", "2026-01-31");
    expect(result).toHaveLength(3);
  });
});
