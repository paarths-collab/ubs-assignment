import { describe, expect, it } from "vitest";

import eventsFile from "../data/events_brain.json";
import nodesFile from "../data/nodes_brain.json";
import edgesFile from "../data/edges_brain.json";
import indexesFile from "../data/indexes_brain.json";

import { BrainDataIntegrityError, buildBrainData } from "../src/data-loader";
import type { EdgesBrainFile, EventsBrainFile, IndexesBrainFile, NodesBrainFile } from "../src/types";

const events = eventsFile as EventsBrainFile;
const nodes = nodesFile as NodesBrainFile;
const edges = edgesFile as EdgesBrainFile;
const indexes = indexesFile as IndexesBrainFile;

describe("buildBrainData — dataset shape (Phase 1 acceptance criteria)", () => {
  it("loads exactly 1000 events, 1136 nodes, 11024 edges", () => {
    const data = buildBrainData(events, nodes, edges, indexes);
    expect(data.eventsById.size).toBe(1000);
    expect(data.nodesById.size).toBe(1136);
    expect(data.edgesById.size).toBe(11024);
    expect(data.allEventIds.size).toBe(1000);
  });

  it("has exactly 1 enterprise node and 24 organisation nodes", () => {
    const data = buildBrainData(events, nodes, edges, indexes);
    expect(data.nodesByType.get("enterprise")).toHaveLength(1);
    expect(data.nodesByType.get("organisation")).toHaveLength(24);
  });

  it("has zero broken graph references (buildBrainData does not throw)", () => {
    expect(() => buildBrainData(events, nodes, edges, indexes)).not.toThrow();
  });

  it("reproduces the known Financial/Non-Financial split", () => {
    const data = buildBrainData(events, nodes, edges, indexes);
    expect(data.filterEventIds.event_type.Financial).toHaveLength(239);
    expect(data.filterEventIds.event_type["Non-Financial"]).toHaveLength(761);
  });

  it("reproduces the known severity distribution", () => {
    const data = buildBrainData(events, nodes, edges, indexes);
    expect(data.filterEventIds.severity.Low).toHaveLength(705);
    expect(data.filterEventIds.severity.Moderate).toHaveLength(244);
    expect(data.filterEventIds.severity.High).toHaveLength(51);
  });

  it("carries a search index entry for every node", () => {
    const data = buildBrainData(events, nodes, edges, indexes);
    expect(data.searchIndex).toHaveLength(1136);
  });

  it("rejects a dataset with a dangling edge reference", () => {
    const corruptEdges: EdgesBrainFile = {
      ...edges,
      edges: [
        ...edges.edges,
        {
          id: "edge::999999",
          from: "organisation::does-not-exist",
          to: "event::SIM-0000001",
          relation: "ORG_OWNS_EVENT",
          role: "Owner Organisation",
          event_id: "SIM-0000001",
          advanced: false,
          structural: false,
        },
      ],
      meta: { ...edges.meta, edge_count: edges.meta.edge_count + 1 },
    };
    expect(() => buildBrainData(events, nodes, corruptEdges, indexes)).toThrow(BrainDataIntegrityError);
  });
});
