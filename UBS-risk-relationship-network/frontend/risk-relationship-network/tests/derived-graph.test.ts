import { describe, expect, it } from "vitest";

import eventsFile from "../data/events_brain.json";
import nodesFile from "../data/nodes_brain.json";
import edgesFile from "../data/edges_brain.json";
import indexesFile from "../data/indexes_brain.json";

import { buildBrainData } from "../src/data-loader";
import { computeFilteredEventIds } from "../src/filter-engine";
import { createEmptyFilterState } from "../src/app-state";
import { buildDerivedAggregateEdges } from "../src/derived-graph";
import { buildOverviewGraph } from "../src/graph-builder";
import { matchingEventIdsForNode } from "../src/scope";
import type { EdgesBrainFile, EventsBrainFile, IndexesBrainFile, NodesBrainFile } from "../src/types";

const data = buildBrainData(
  eventsFile as EventsBrainFile,
  nodesFile as NodesBrainFile,
  edgesFile as EdgesBrainFile,
  indexesFile as IndexesBrainFile,
);

describe("buildDerivedAggregateEdges — Organisation -> Issue -> Root Cause -> Theme -> Category", () => {
  it("aggregates an Organisation->Issue pair to an independently-computed fixture exactly", () => {
    // Cross-checked directly against events_brain.json: within the High
    // severity scope, organisation::31ec043ac068 (Meridian Client
    // Operations) paired with issue::eccf5ce4de3a produces exactly
    // SIM-0000026, SIM-0000386, SIM-0000866.
    const filters = createEmptyFilterState();
    filters.severity = ["High"];
    const filteredEventIds = computeFilteredEventIds(data, filters);

    const derived = buildDerivedAggregateEdges(data, filteredEventIds);
    const match = derived.find((edge) => edge.from === "organisation::31ec043ac068" && edge.to === "issue::eccf5ce4de3a");

    expect(match).toBeDefined();
    expect(new Set(match!.eventIds)).toEqual(new Set(["SIM-0000026", "SIM-0000386", "SIM-0000866"]));
    expect(match!.severityCounts).toEqual({ Low: 0, Moderate: 0, High: 3 });
  });

  it("every derived edge's eventIds are a subset of the filtered scope and share the claimed from/to roles", () => {
    const filteredEventIds = computeFilteredEventIds(data, createEmptyFilterState());
    const derived = buildDerivedAggregateEdges(data, filteredEventIds);

    for (const edge of derived) {
      for (const eventId of edge.eventIds) {
        expect(filteredEventIds.has(eventId)).toBe(true);
        const roleMap = data.eventToNodes.get(eventId)!;
        const isOrgToIssue = roleMap.owner_organisation === edge.from && roleMap.issue === edge.to;
        const isIssueToRootCause = roleMap.issue === edge.from && roleMap.root_cause === edge.to;
        const isRootCauseToTheme = roleMap.root_cause === edge.from && roleMap.risk_theme === edge.to;
        const isThemeToCategory = roleMap.risk_theme === edge.from && roleMap.or_category === edge.to;
        expect(isOrgToIssue || isIssueToRootCause || isRootCauseToTheme || isThemeToCategory).toBe(true);
      }
    }
  });

  it("produces no edges when the filtered scope is empty", () => {
    expect(buildDerivedAggregateEdges(data, new Set())).toHaveLength(0);
  });

  it("severity counts on each edge sum to its eventIds length", () => {
    const filteredEventIds = computeFilteredEventIds(data, createEmptyFilterState());
    const derived = buildDerivedAggregateEdges(data, filteredEventIds);
    for (const edge of derived) {
      const sum = edge.severityCounts.Low + edge.severityCounts.Moderate + edge.severityCounts.High;
      expect(sum).toBe(edge.eventIds.length);
    }
  });
});

describe("buildOverviewGraph — full Enterprise -> Org -> Issue -> RootCause -> Theme -> Category chain", () => {
  it("stays within a safe node/edge budget for the full unfiltered dataset", () => {
    const graph = buildOverviewGraph(data, data.allEventIds);
    // 1 enterprise + <=24 organisations + <=15 issues + <=7 root causes + <=3 themes + <=6 categories
    expect(graph.nodes.length).toBeLessThanOrEqual(1 + 24 + 15 + 7 + 3 + 6);
    expect(graph.edges.length).toBeLessThan(300);
  });

  it("every non-structural edge carries real, traceable event IDs", () => {
    const graph = buildOverviewGraph(data, data.allEventIds);
    for (const edge of graph.edges) {
      expect(edge.eventIds.length).toBeGreaterThan(0);
      for (const eventId of edge.eventIds) {
        expect(data.eventsById.has(eventId)).toBe(true);
      }
    }
  });

  it("never includes an Event or Person node directly", () => {
    const graph = buildOverviewGraph(data, data.allEventIds);
    for (const node of graph.nodes) {
      expect(node.id.startsWith("event::")).toBe(false);
      expect(node.id.startsWith("person::")).toBe(false);
    }
  });

  it("shrinks to only the relevant chain when filtered to a narrow scope", () => {
    const filters = createEmptyFilterState();
    filters.severity = ["High"];
    filters.ownerOrganisation = ["Meridian Client Operations → Fictional Enterprise Operations"];
    const filteredEventIds = computeFilteredEventIds(data, filters);

    const graph = buildOverviewGraph(data, filteredEventIds);
    expect(graph.nodes.some((node) => node.id === "organisation::31ec043ac068")).toBe(true);
    // Every organisation node present (owner or discovery role) must
    // genuinely have at least one event in this narrow scope — the overview
    // reflects any involvement, not ownership alone.
    const orgNodes = graph.nodes.filter((node) => node.id.startsWith("organisation::"));
    expect(orgNodes.length).toBeGreaterThan(0);
    for (const orgNode of orgNodes) {
      expect(matchingEventIdsForNode(data, orgNode.id, filteredEventIds).length).toBeGreaterThan(0);
    }
    // Total organisation count must still be small relative to the full 24.
    expect(orgNodes.length).toBeLessThan(24);
  });
});
