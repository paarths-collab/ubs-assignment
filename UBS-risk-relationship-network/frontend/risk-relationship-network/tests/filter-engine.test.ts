import { describe, expect, it } from "vitest";

import eventsFile from "../data/events_brain.json";
import nodesFile from "../data/nodes_brain.json";
import edgesFile from "../data/edges_brain.json";
import indexesFile from "../data/indexes_brain.json";

import { buildBrainData } from "../src/data-loader";
import { computeFilteredEventIds } from "../src/filter-engine";
import { createEmptyFilterState } from "../src/app-state";
import type { EdgesBrainFile, EventsBrainFile, IndexesBrainFile, NodesBrainFile } from "../src/types";

const data = buildBrainData(
  eventsFile as EventsBrainFile,
  nodesFile as NodesBrainFile,
  edgesFile as EdgesBrainFile,
  indexesFile as IndexesBrainFile,
);

describe("computeFilteredEventIds — single source of truth for the filtered scope", () => {
  it("with no filters active, returns all 1000 events", () => {
    const filters = createEmptyFilterState();
    expect(computeFilteredEventIds(data, filters).size).toBe(1000);
  });

  it("single-dimension filter reproduces the known severity distribution", () => {
    const high = createEmptyFilterState();
    high.severity = ["High"];
    expect(computeFilteredEventIds(data, high).size).toBe(51);

    const moderate = createEmptyFilterState();
    moderate.severity = ["Moderate"];
    expect(computeFilteredEventIds(data, moderate).size).toBe(244);

    const low = createEmptyFilterState();
    low.severity = ["Low"];
    expect(computeFilteredEventIds(data, low).size).toBe(705);
  });

  it("multi-select within one dimension is OR'd", () => {
    const filters = createEmptyFilterState();
    filters.severity = ["High", "Moderate"];
    expect(computeFilteredEventIds(data, filters).size).toBe(295);
  });

  it("event type filter reproduces the known Financial/Non-Financial split", () => {
    const financial = createEmptyFilterState();
    financial.eventType = ["Financial"];
    expect(computeFilteredEventIds(data, financial).size).toBe(239);

    const nonFinancial = createEmptyFilterState();
    nonFinancial.eventType = ["Non-Financial"];
    expect(computeFilteredEventIds(data, nonFinancial).size).toBe(761);
  });

  it("cross-dimension filters are AND'd — reproduces an independently computed fixture exactly", () => {
    // Cross-checked directly against events_brain.json with a Python script:
    // severity=High AND event_type=Financial AND owner_organisation=<most common org> AND occurrence_date in 2026
    // yields exactly one event: SIM-0000637.
    const filters = createEmptyFilterState();
    filters.severity = ["High"];
    filters.eventType = ["Financial"];
    filters.ownerOrganisation = ["Northstar Advisory Services → Fictional Enterprise Operations"];
    filters.occurrenceDate = { from: "2026-01-01", to: "2026-12-31" };

    const result = computeFilteredEventIds(data, filters);
    expect(Array.from(result)).toEqual(["SIM-0000637"]);
  });

  it("date range filter reproduces an independently computed fixture (June 2025)", () => {
    const filters = createEmptyFilterState();
    filters.occurrenceDate = { from: "2025-06-01", to: "2025-06-30" };
    expect(computeFilteredEventIds(data, filters).size).toBe(41);
  });

  it("numeric range filter excludes nulls rather than coercing them to zero", () => {
    // Non-Financial events have gross_amount_usd = null; a wide gross-amount
    // range must therefore match only the 239 Financial events, never a
    // Non-Financial "zero-loss" event.
    const filters = createEmptyFilterState();
    filters.grossAmount = { min: 0, max: 2_000_000 };
    expect(computeFilteredEventIds(data, filters).size).toBe(239);
  });

  it("a filter combination with zero matches returns an empty set, not all events", () => {
    const filters = createEmptyFilterState();
    filters.severity = ["High"];
    filters.eventType = ["Non-Financial"];
    filters.ownerOrganisation = ["a-fictional-organisation-that-does-not-exist"];
    expect(computeFilteredEventIds(data, filters).size).toBe(0);
  });
});
