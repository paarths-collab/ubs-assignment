import { describe, expect, it } from "vitest";
import { loadBrainData } from "../src/graph/data-loader";
import { computeFilteredEventIds } from "../src/graph/filter-engine";
import { createEmptyFilterState } from "../src/graph/app-state";

describe("risk relationship filter engine", () => {
  const data = loadBrainData();

  it("reproduces the validated single-dimension counts", () => {
    expect(computeFilteredEventIds(data, createEmptyFilterState())).toHaveLength(1000);
    expect(computeFilteredEventIds(data, { ...createEmptyFilterState(), eventType: ["Financial"] })).toHaveLength(239);
    expect(computeFilteredEventIds(data, { ...createEmptyFilterState(), severity: ["High"] })).toHaveLength(51);
  });

  it("ORs values within a dimension and ANDs across dimensions", () => {
    const filters = {
      ...createEmptyFilterState(),
      eventType: ["Financial"],
      severity: ["High", "Low"],
      ownerOrganisation: ["Meridian Client Operations → Fictional Enterprise Operations"],
    };
    expect(computeFilteredEventIds(data, filters)).toHaveLength(23);
  });

  it("applies inclusive date ranges", () => {
    const filters = { ...createEmptyFilterState(), occurrenceDate: { from: "2026-01-01", to: null } };
    expect(computeFilteredEventIds(data, filters)).toHaveLength(327);
  });

  it("does not treat null financial fields as zero", () => {
    const filters = { ...createEmptyFilterState(), grossAmount: { min: 0, max: 0 } };
    expect(computeFilteredEventIds(data, filters)).toHaveLength(0);
  });
});
