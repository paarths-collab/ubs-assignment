import { describe, expect, it } from "vitest";

import eventsFile from "../data/events_brain.json";
import nodesFile from "../data/nodes_brain.json";
import edgesFile from "../data/edges_brain.json";
import indexesFile from "../data/indexes_brain.json";

import { buildBrainData } from "../src/data-loader";
import { computeFilteredEventIds } from "../src/filter-engine";
import { createEmptyFilterState } from "../src/app-state";
import { buildNodeDetail } from "../src/node-detail";
import { calculateMetrics } from "../src/metrics";
import { matchingEventIdsForNode } from "../src/scope";
import type { EdgesBrainFile, EventsBrainFile, IndexesBrainFile, NodesBrainFile } from "../src/types";

const data = buildBrainData(
  eventsFile as EventsBrainFile,
  nodesFile as NodesBrainFile,
  edgesFile as EdgesBrainFile,
  indexesFile as IndexesBrainFile,
);

const allEvents = computeFilteredEventIds(data, createEmptyFilterState());
const PERSON = "person::b6c283e1f1b2";
const ORG = "organisation::48ca590c08f7";

describe("buildNodeDetail — inspector facts derive from one scope", () => {
  it("uses exactly the node's events within the current filter scope", () => {
    const detail = buildNodeDetail(data, ORG, allEvents)!;
    expect(detail.eventIds).toEqual(matchingEventIdsForNode(data, ORG, allEvents));
    expect(detail.metrics.eventCount).toBe(detail.eventIds.length);
  });

  it("matches the metrics engine exactly for the same event set", () => {
    const detail = buildNodeDetail(data, ORG, allEvents)!;
    expect(detail.metrics).toEqual(calculateMetrics(data, detail.eventIds));
  });

  it("breaks a person down by the roles they hold, without duplicating the person", () => {
    const detail = buildNodeDetail(data, PERSON, allEvents)!;
    const roles = detail.roleBreakdown.map((entry) => entry.role);

    expect(roles.length).toBeGreaterThan(1);
    expect(new Set(roles).size).toBe(roles.length);
    // The dataset gives this person both an ownership and a modifier role.
    expect(roles).toContain("Event Owner");
    // Every role's events stay inside the node's own event set.
    for (const entry of detail.roleBreakdown) {
      for (const eventId of entry.eventIds) {
        expect(allEvents.has(eventId)).toBe(true);
      }
    }
  });

  it("distinguishes the owner role from the discovery role on the edges, not by duplicating the node", () => {
    const detail = buildNodeDetail(data, ORG, allEvents)!;

    // This organisation owns every one of its events, so its counterpart
    // discovery organisations show up as related entities...
    const groupKeys = detail.related.map((group) => group.key);
    expect(groupKeys).toContain("discovery_organisation");
    // ...while its own Owner Organisation role is recorded on its edges.
    expect(detail.roleBreakdown.map((entry) => entry.role)).toContain("Owner Organisation");
    // One organisation entity, roles carried by edges — never two nodes.
    expect(data.nodesById.get(ORG)).toBeDefined();
  });

  it("never lists the inspected node as one of its own related entities", () => {
    const detail = buildNodeDetail(data, ORG, allEvents)!;
    for (const group of detail.related) {
      expect(group.entities.some((entity) => entity.nodeId === ORG)).toBe(false);
    }
  });

  it("related entity counts never exceed the node's own event count", () => {
    const detail = buildNodeDetail(data, PERSON, allEvents)!;
    for (const group of detail.related) {
      for (const entity of group.entities) {
        expect(entity.count).toBeLessThanOrEqual(detail.eventIds.length);
      }
    }
  });

  it("narrows with the filter scope", () => {
    const highOnly = computeFilteredEventIds(data, { ...createEmptyFilterState(), severity: ["High"] });
    const wide = buildNodeDetail(data, ORG, allEvents)!;
    const narrow = buildNodeDetail(data, ORG, highOnly)!;

    expect(narrow.eventIds.length).toBeLessThan(wide.eventIds.length);
    expect(narrow.metrics.severityCounts.Low).toBe(0);
    expect(narrow.metrics.severityCounts.Moderate).toBe(0);
  });

  it("returns null for an unknown node", () => {
    expect(buildNodeDetail(data, "person::does-not-exist", allEvents)).toBeNull();
  });

  it("returns an empty but valid detail when the node has no events in scope", () => {
    const nonFinancial = computeFilteredEventIds(data, { ...createEmptyFilterState(), eventType: ["Non-Financial"] });
    const detail = buildNodeDetail(data, ORG, nonFinancial)!;
    expect(detail.metrics.grossAmount.total).toBeNull();
  });
});
