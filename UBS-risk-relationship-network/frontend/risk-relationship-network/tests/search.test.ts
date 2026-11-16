import { describe, expect, it } from "vitest";

import eventsFile from "../data/events_brain.json";
import nodesFile from "../data/nodes_brain.json";
import edgesFile from "../data/edges_brain.json";
import indexesFile from "../data/indexes_brain.json";

import { buildBrainData } from "../src/data-loader";
import { searchEntities } from "../src/search";
import { computeFilteredEventIds } from "../src/filter-engine";
import { createEmptyFilterState } from "../src/app-state";
import type { EdgesBrainFile, EventsBrainFile, IndexesBrainFile, NodesBrainFile } from "../src/types";

const data = buildBrainData(
  eventsFile as EventsBrainFile,
  nodesFile as NodesBrainFile,
  edgesFile as EdgesBrainFile,
  indexesFile as IndexesBrainFile,
);

describe("searchEntities — global search across all entity types", () => {
  it("finds an event by exact ID", () => {
    const results = searchEntities(data, data.allEventIds, "SIM-0000001");
    expect(results[0]?.entry.id).toBe("event::SIM-0000001");
    expect(results[0]?.entry.type).toBe("event");
  });

  it("finds an organisation by partial name", () => {
    const results = searchEntities(data, data.allEventIds, "northstar");
    expect(results.some((result) => result.entry.type === "organisation")).toBe(true);
  });

  it("ranks an exact match above a substring match", () => {
    const results = searchEntities(data, data.allEventIds, "ubs synthetic enterprise");
    expect(results[0]?.entry.id).toBe("enterprise::ubs");
  });

  it("returns no results for a query that matches nothing", () => {
    expect(searchEntities(data, data.allEventIds, "zzz-not-a-real-entity-zzz")).toHaveLength(0);
  });

  it("flags an entity with zero events in the current filtered scope", () => {
    const highOnly = computeFilteredEventIds(data, { ...createEmptyFilterState(), severity: ["High"] });
    const lowSeverityEventId = data.eventsById.get(
      Array.from(data.allEventIds).find((id) => data.eventsById.get(id)?.severity === "Low")!,
    )!.event_id;

    const results = searchEntities(data, highOnly, lowSeverityEventId);
    expect(results[0]?.activeInScope).toBe(false);
  });

  it("respects the search result limit", () => {
    const results = searchEntities(data, data.allEventIds, "e", 5);
    expect(results.length).toBeLessThanOrEqual(5);
  });
});
