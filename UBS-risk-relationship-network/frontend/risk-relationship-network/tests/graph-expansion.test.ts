import { describe, expect, it } from "vitest";

import eventsFile from "../data/events_brain.json";
import nodesFile from "../data/nodes_brain.json";
import edgesFile from "../data/edges_brain.json";
import indexesFile from "../data/indexes_brain.json";

import { buildBrainData } from "../src/data-loader";
import { computeFilteredEventIds } from "../src/filter-engine";
import { createEmptyFilterState, createInitialExpansionState } from "../src/app-state";
import type { ExpansionState } from "../src/app-state";
import { buildGraph } from "../src/graph-builder";
import { MAX_EVENT_NODES_PER_EXPANSION, MAX_VISIBLE_NODES } from "../src/graph-config";
import type { EdgesBrainFile, EventsBrainFile, IndexesBrainFile, NodesBrainFile } from "../src/types";

const data = buildBrainData(
  eventsFile as EventsBrainFile,
  nodesFile as NodesBrainFile,
  edgesFile as EdgesBrainFile,
  indexesFile as IndexesBrainFile,
);

const allEvents = computeFilteredEventIds(data, createEmptyFilterState());

function expansionWith(overrides: Partial<ExpansionState>): ExpansionState {
  return { ...createInitialExpansionState(), ...overrides };
}

const BUSY_ORG = "organisation::48ca590c08f7";

describe("buildGraph — graph state safety under repeated exploration", () => {
  it("the Enterprise node is always present", () => {
    const graph = buildGraph(data, allEvents, createInitialExpansionState());
    expect(graph.nodes.some((node) => node.id === data.enterpriseId)).toBe(true);
  });

  it("expanding the same node repeatedly cannot duplicate nodes or edges", () => {
    const expansion = expansionWith({ eventsExpanded: new Set([BUSY_ORG]) });
    const first = buildGraph(data, allEvents, expansion);
    const second = buildGraph(data, allEvents, expansion);
    const third = buildGraph(data, allEvents, expansion);

    for (const graph of [first, second, third]) {
      expect(new Set(graph.nodes.map((node) => node.id)).size).toBe(graph.nodes.length);
      expect(new Set(graph.edges.map((edge) => edge.id)).size).toBe(graph.edges.length);
    }
    expect(second.nodes.length).toBe(first.nodes.length);
    expect(third.nodes.length).toBe(first.nodes.length);
  });

  it("expanding events makes the expanded node's events visible and traceable", () => {
    const graph = buildGraph(data, allEvents, expansionWith({ eventsExpanded: new Set([BUSY_ORG]) }));
    const eventNodes = graph.nodes.filter((node) => node.id.startsWith("event::"));

    expect(eventNodes.length).toBeGreaterThan(0);
    for (const node of eventNodes) {
      expect(data.eventsById.has(node.id.slice("event::".length))).toBe(true);
    }
  });

  it("collapsing removes only the collapsed branch, restoring the prior view exactly", () => {
    const base = buildGraph(data, allEvents, createInitialExpansionState());
    const expanded = buildGraph(data, allEvents, expansionWith({ eventsExpanded: new Set([BUSY_ORG]) }));
    const collapsed = buildGraph(data, allEvents, createInitialExpansionState());

    expect(expanded.nodes.length).toBeGreaterThan(base.nodes.length);
    expect(collapsed.nodes.map((node) => node.id).sort()).toEqual(base.nodes.map((node) => node.id).sort());
  });

  it("collapsing one of two expanded nodes leaves the other expanded", () => {
    // Verified against the dataset: this organisation's 84 events are
    // disjoint from BUSY_ORG's (48ca…/83eb… are an owner/discovery pair
    // over the same events, so they would not exercise this case).
    const otherOrg = "organisation::31ec043ac068";
    const both = buildGraph(data, allEvents, expansionWith({ eventsExpanded: new Set([BUSY_ORG, otherOrg]) }));
    const onlyOther = buildGraph(data, allEvents, expansionWith({ eventsExpanded: new Set([otherOrg]) }));

    expect(both.nodes.length).toBeGreaterThan(onlyOther.nodes.length);
    const otherOrgEvents = new Set(data.nodeToEvents.get(otherOrg) ?? []);
    const stillVisible = onlyOther.nodes.filter(
      (node) => node.id.startsWith("event::") && otherOrgEvents.has(node.id.slice("event::".length)),
    );
    expect(stillVisible.length).toBeGreaterThan(0);
  });

  it("a single expansion never injects more than the per-expansion event cap", () => {
    const graph = buildGraph(data, allEvents, expansionWith({ eventsExpanded: new Set([BUSY_ORG]) }));
    const eventNodes = graph.nodes.filter((node) => node.id.startsWith("event::"));
    expect(eventNodes.length).toBeLessThanOrEqual(MAX_EVENT_NODES_PER_EXPANSION);
  });

  it("never exceeds the global node budget, and says so when it truncates", () => {
    const everyOrg = new Set(data.nodesByType.get("organisation") ?? []);
    const graph = buildGraph(data, allEvents, expansionWith({ eventsExpanded: everyOrg }));

    expect(graph.nodes.length).toBeLessThanOrEqual(MAX_VISIBLE_NODES);
    expect(graph.nodeBudgetReached).toBe(true);
    expect(graph.notices.some((notice) => notice.includes("Refine filters"))).toBe(true);
  });

  it("a filter change drops nodes the new scope no longer supports", () => {
    const highOnly = computeFilteredEventIds(data, { ...createEmptyFilterState(), severity: ["High"] });
    const expansion = expansionWith({ eventsExpanded: new Set([BUSY_ORG]) });

    const wide = buildGraph(data, allEvents, expansion);
    const narrow = buildGraph(data, highOnly, expansion);

    expect(narrow.nodes.length).toBeLessThan(wide.nodes.length);
    for (const node of narrow.nodes.filter((candidate) => candidate.id.startsWith("event::"))) {
      expect(highOnly.has(node.id.slice("event::".length))).toBe(true);
    }
  });

  it("keeps administrative role edges hidden until they are explicitly enabled", () => {
    // Advanced edges run Person -> Event, so both endpoints must be on
    // screen: expanding this person brings in the person and their events.
    const adminPerson = "person::2090b6cbc625";
    const withoutAdvanced = buildGraph(data, allEvents, expansionWith({ neighbourExpanded: new Set([adminPerson]) }));
    const withAdvanced = buildGraph(
      data,
      allEvents,
      expansionWith({ neighbourExpanded: new Set([adminPerson]), showAdvancedRoles: true }),
    );

    const advancedEdgeIds = new Set(
      Array.from(data.edgesById.values())
        .filter((edge) => edge.advanced)
        .map((edge) => edge.id),
    );
    expect(withoutAdvanced.edges.some((edge) => advancedEdgeIds.has(edge.id))).toBe(false);
    expect(withAdvanced.edges.some((edge) => advancedEdgeIds.has(edge.id))).toBe(true);
  });

  it("every rendered edge connects two rendered nodes (no dangling references)", () => {
    const graph = buildGraph(
      data,
      allEvents,
      expansionWith({ eventsExpanded: new Set([BUSY_ORG]), neighbourExpanded: new Set([BUSY_ORG]) }),
    );
    const nodeIds = new Set(graph.nodes.map((node) => node.id));
    for (const edge of graph.edges) {
      expect(nodeIds.has(edge.from)).toBe(true);
      expect(nodeIds.has(edge.to)).toBe(true);
    }
  });

  it("pulls a searched Person into the view when expanded, even though the overview omits people", () => {
    const personId = (data.nodesByType.get("person") ?? [])[0]!;
    const overview = buildGraph(data, allEvents, createInitialExpansionState());
    const expanded = buildGraph(data, allEvents, expansionWith({ neighbourExpanded: new Set([personId]) }));

    expect(overview.nodes.some((node) => node.id === personId)).toBe(false);
    expect(expanded.nodes.some((node) => node.id === personId)).toBe(true);
  });
});
