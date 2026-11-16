import type { BrainDataModel, BrainNode, NodeType, Severity } from "./types";
import type { ExpansionState } from "./app-state";
import { matchingEventIdsForNode } from "./scope";
import { NODE_TYPE_STYLE, edgeStyleFor } from "./graph-styles";
import { buildDerivedAggregateEdges } from "./derived-graph";
import { MAX_EVENT_NODES_PER_EXPANSION, MAX_VISIBLE_NODES } from "./graph-config";
import type { GraphData, VisEdgeInput, VisNodeInput } from "./graph-types";

const MIN_NODE_SIZE = 10;
const MAX_NODE_SIZE = 26;
const EVENT_NODE_SIZE = 8;

export interface GraphBuildResult extends GraphData {
  /** Human-readable notices about anything deliberately withheld from the view. */
  notices: string[];
  nodeBudgetReached: boolean;
}

function sizeForCount(count: number, maxCount: number): number {
  if (maxCount <= 0) return MIN_NODE_SIZE;
  const ratio = Math.sqrt(count / maxCount);
  return Math.round(MIN_NODE_SIZE + ratio * (MAX_NODE_SIZE - MIN_NODE_SIZE));
}

function formatSeverityBreakdown(severityCounts: Record<Severity, number>): string {
  return (["High", "Moderate", "Low"] as const)
    .filter((severity) => severityCounts[severity] > 0)
    .map((severity) => `${severityCounts[severity]} ${severity}`)
    .join(", ");
}

function pluralEvents(count: number): string {
  return `${count} matching event${count === 1 ? "" : "s"}`;
}

/** Accumulates nodes/edges while enforcing ID uniqueness and the node budget. */
class GraphAccumulator {
  readonly nodes = new Map<string, VisNodeInput>();
  readonly edges = new Map<string, VisEdgeInput>();
  readonly notices: string[] = [];
  nodeBudgetReached = false;

  hasNode(id: string): boolean {
    return this.nodes.has(id);
  }

  /** Returns false when the node was rejected because the budget is full. */
  addNode(node: VisNodeInput): boolean {
    if (this.nodes.has(node.id)) return true;
    if (this.nodes.size >= MAX_VISIBLE_NODES) {
      this.nodeBudgetReached = true;
      return false;
    }
    this.nodes.set(node.id, node);
    return true;
  }

  addEdge(edge: VisEdgeInput): void {
    if (!this.nodes.has(edge.from) || !this.nodes.has(edge.to)) return;
    this.edges.set(edge.id, edge);
  }
}

const MAX_LABEL_CHARS = 42;

/**
 * Node labels are for orientation, not for reading the record. Issue
 * scenarios are full sentences and organisation names carry a repeated
 * "→ Fictional Enterprise Operations" suffix; rendering either verbatim
 * buries the graph in overlapping text. The full value stays in the
 * tooltip and in the inspector.
 */
function displayLabel(node: BrainNode): string {
  let label = node.label;
  let limit = MAX_LABEL_CHARS;

  if (node.type === "organisation") {
    // Every organisation carries the same "→ Fictional Enterprise
    // Operations" suffix; the distinguishing part is what precedes it.
    const [primary] = label.split("→");
    label = (primary ?? label).trim();
  }

  if (node.type === "issue") {
    // Issue scenarios are full sentences — the opening clause identifies
    // them well enough for a graph label.
    const [firstSentence] = label.split(". ");
    label = (firstSentence ?? label).trim();
    limit = 30;
  }

  if (label.length <= limit) return label;
  return `${label.slice(0, limit - 1).trimEnd()}…`;
}

function buildEntityNode(
  data: BrainDataModel,
  nodeId: string,
  count: number,
  maxCountForType: number,
): VisNodeInput | null {
  const node = data.nodesById.get(nodeId);
  if (!node) return null;
  const style = NODE_TYPE_STYLE[node.type];
  return {
    id: nodeId,
    label: displayLabel(node),
    shape: style.shape,
    color: style.color,
    font: style.font,
    size: sizeForCount(count, maxCountForType),
    title: `${node.label}\n${pluralEvents(count)}`,
    group: node.type,
    widthConstraint: { maximum: 150 },
  };
}

function buildEventNode(data: BrainDataModel, node: BrainNode): VisNodeInput {
  const style = NODE_TYPE_STYLE.event;
  const event = data.eventsById.get(node.label);
  const detail = event ? `${event.severity} · ${event.event_type} · ${event.occurrence_date}` : "";
  return {
    id: node.id,
    label: node.label,
    shape: style.shape,
    color: style.color,
    font: style.font,
    size: EVENT_NODE_SIZE,
    title: `${node.label}${detail ? `\n${detail}` : ""}${node.subtitle ? `\n${node.subtitle}` : ""}`,
    group: "event",
  };
}

function enterpriseNode(data: BrainDataModel, eventCount: number): VisNodeInput {
  const style = NODE_TYPE_STYLE.enterprise;
  return {
    id: data.enterpriseId,
    label: data.enterpriseName,
    shape: style.shape,
    color: style.color,
    font: style.font,
    size: 36,
    title: `${data.enterpriseName}\n${eventCount} events in current scope`,
    group: "enterprise",
  };
}

/** The always-present high-level backbone: Enterprise -> Organisation, plus the derived risk chain. */
function addOverviewLayer(data: BrainDataModel, filteredEventIds: Set<string>, acc: GraphAccumulator): void {
  acc.addNode(enterpriseNode(data, filteredEventIds.size));

  const orgCounts = new Map<string, number>();
  for (const orgId of data.nodesByType.get("organisation") ?? []) {
    const count = matchingEventIdsForNode(data, orgId, filteredEventIds).length;
    if (count > 0) orgCounts.set(orgId, count);
  }
  const maxOrgCount = Math.max(0, ...orgCounts.values());

  const structuralEdgeIdByOrg = new Map<string, string>();
  for (const edgeId of data.edgesByRelation.get("ENTERPRISE_CONTAINS_ORGANISATION") ?? []) {
    const edge = data.edgesById.get(edgeId);
    if (edge) structuralEdgeIdByOrg.set(edge.to, edge.id);
  }

  const containsStyle = edgeStyleFor("ENTERPRISE_CONTAINS_ORGANISATION");
  for (const [orgId, count] of orgCounts) {
    const node = buildEntityNode(data, orgId, count, maxOrgCount);
    if (!node || !acc.addNode(node)) continue;
    acc.addEdge({
      id: structuralEdgeIdByOrg.get(orgId) ?? `overview::${orgId}`,
      from: data.enterpriseId,
      to: orgId,
      color: containsStyle.color,
      dashes: containsStyle.dashes,
      width: containsStyle.width,
      arrows: "to",
      title: pluralEvents(count),
      eventIds: matchingEventIdsForNode(data, orgId, filteredEventIds),
    });
  }
}

/** Adds Issue / Root Cause / Risk Theme / OR Category nodes and the derived edges linking them. */
function addDerivedLayer(
  data: BrainDataModel,
  filteredEventIds: Set<string>,
  acc: GraphAccumulator,
  visibleEventNodeIds: Set<string>,
): void {
  const derivedEdges = buildDerivedAggregateEdges(data, filteredEventIds);

  const countByNodeId = new Map<string, number>();
  const maxCountByType = new Map<NodeType, number>();
  for (const edge of derivedEdges) {
    for (const nodeId of [edge.from, edge.to]) {
      if (countByNodeId.has(nodeId)) continue;
      const count = matchingEventIdsForNode(data, nodeId, filteredEventIds).length;
      countByNodeId.set(nodeId, count);
      const type = data.nodesById.get(nodeId)?.type;
      if (type) maxCountByType.set(type, Math.max(maxCountByType.get(type) ?? 0, count));
    }
  }

  for (const [nodeId, count] of countByNodeId) {
    if (acc.hasNode(nodeId)) continue;
    const type = data.nodesById.get(nodeId)?.type;
    if (!type) continue;
    const node = buildEntityNode(data, nodeId, count, maxCountByType.get(type) ?? 0);
    if (node) acc.addNode(node);
  }

  const derivedStyle = edgeStyleFor("DERIVED_AGGREGATE");
  for (const derived of derivedEdges) {
    // Once every event an aggregate stands for is individually visible, the
    // aggregate edge is redundant noise — drop it in favour of the real path.
    const fullySuperseded =
      visibleEventNodeIds.size > 0 && derived.eventIds.every((id) => visibleEventNodeIds.has(`event::${id}`));
    if (fullySuperseded) continue;

    const breakdown = formatSeverityBreakdown(derived.severityCounts);
    acc.addEdge({
      id: derived.id,
      from: derived.from,
      to: derived.to,
      color: derivedStyle.color,
      dashes: derivedStyle.dashes,
      width: derivedStyle.width,
      arrows: "to",
      derived: true,
      title: `${pluralEvents(derived.eventIds.length)}${breakdown ? ` (${breakdown})` : ""}`,
      eventIds: derived.eventIds,
    });
  }
}

/** Event nodes the analyst explicitly asked to see, capped so one click can never flood the view. */
function collectExpandedEventNodeIds(
  data: BrainDataModel,
  filteredEventIds: Set<string>,
  expansion: ExpansionState,
  notices: string[],
): Set<string> {
  const eventNodeIds = new Set<string>();

  for (const nodeId of expansion.eventsExpanded) {
    const matching = matchingEventIdsForNode(data, nodeId, filteredEventIds);
    const shown = matching.slice(0, MAX_EVENT_NODES_PER_EXPANSION);
    for (const eventId of shown) eventNodeIds.add(`event::${eventId}`);
    if (matching.length > shown.length) {
      const label = data.nodesById.get(nodeId)?.label ?? nodeId;
      notices.push(
        `${label}: ${matching.length} matching events, showing first ${shown.length}. Refine filters to explore the full set.`,
      );
    }
  }

  // Neighbour expansion of an entity node naturally reaches its events.
  for (const nodeId of expansion.neighbourExpanded) {
    for (const neighbourId of data.nodeToNeighbors.get(nodeId) ?? []) {
      if (!neighbourId.startsWith("event::")) continue;
      const eventId = neighbourId.slice("event::".length);
      if (filteredEventIds.has(eventId)) eventNodeIds.add(neighbourId);
    }
  }

  return eventNodeIds;
}

/** Non-event neighbours reached by neighbour expansion (e.g. the people and issue behind an Event). */
function collectExpandedEntityNodeIds(
  data: BrainDataModel,
  filteredEventIds: Set<string>,
  expansion: ExpansionState,
): Set<string> {
  const entityNodeIds = new Set<string>();
  for (const nodeId of expansion.neighbourExpanded) {
    for (const neighbourId of data.nodeToNeighbors.get(nodeId) ?? []) {
      if (neighbourId.startsWith("event::")) continue;
      if (matchingEventIdsForNode(data, neighbourId, filteredEventIds).length > 0) {
        entityNodeIds.add(neighbourId);
      }
    }
  }
  return entityNodeIds;
}

/** Real source-data edges between visible nodes, scoped to the filtered events. */
function addSourceEdges(
  data: BrainDataModel,
  filteredEventIds: Set<string>,
  expansion: ExpansionState,
  acc: GraphAccumulator,
): void {
  const seenEdgeIds = new Set<string>();

  for (const nodeId of acc.nodes.keys()) {
    for (const edgeId of data.nodeToEdges.get(nodeId) ?? []) {
      if (seenEdgeIds.has(edgeId)) continue;
      seenEdgeIds.add(edgeId);
      // Never overwrite a richer edge already contributed by the overview
      // layer (which carries aggregate counts and evidence event IDs).
      if (acc.edges.has(edgeId)) continue;

      const edge = data.edgesById.get(edgeId);
      if (!edge) continue;
      if (edge.advanced && !expansion.showAdvancedRoles) continue;
      if (edge.event_id !== null && !filteredEventIds.has(edge.event_id)) continue;
      if (!acc.hasNode(edge.from) || !acc.hasNode(edge.to)) continue;

      const style = edgeStyleFor(edge.relation);
      acc.addEdge({
        id: edge.id,
        from: edge.from,
        to: edge.to,
        color: style.color,
        dashes: style.dashes,
        width: style.width,
        arrows: "to",
        title: `${edge.role}${edge.event_id ? ` · ${edge.event_id}` : ""}`,
        eventIds: edge.event_id ? [edge.event_id] : [],
      });
    }
  }
}

/**
 * Builds the entire visible graph from scratch as a pure function of the
 * filtered scope and the analyst's expansion state. Rebuilding rather than
 * mutating is what makes repeated expand/collapse/filter cycles safe:
 * nodes are keyed by ID in a Map, so duplication is impossible, and nodes
 * no longer supported by the current scope simply stop being produced.
 */
export function buildGraph(
  data: BrainDataModel,
  filteredEventIds: Set<string>,
  expansion: ExpansionState,
): GraphBuildResult {
  const acc = new GraphAccumulator();

  addOverviewLayer(data, filteredEventIds, acc);

  const eventNodeIds = collectExpandedEventNodeIds(data, filteredEventIds, expansion, acc.notices);
  const entityNodeIds = collectExpandedEntityNodeIds(data, filteredEventIds, expansion);

  // An explicitly expanded node is always part of the view itself — this is
  // what lets a searched Person or Event that is absent from the high-level
  // overview be pulled into the graph and focused.
  for (const nodeId of [...expansion.neighbourExpanded, ...expansion.eventsExpanded]) {
    if (nodeId.startsWith("event::")) {
      if (filteredEventIds.has(nodeId.slice("event::".length))) eventNodeIds.add(nodeId);
    } else if (matchingEventIdsForNode(data, nodeId, filteredEventIds).length > 0) {
      entityNodeIds.add(nodeId);
    }
  }

  addDerivedLayer(data, filteredEventIds, acc, eventNodeIds);

  const entityCounts = new Map<string, number>();
  for (const nodeId of entityNodeIds) {
    if (acc.hasNode(nodeId)) continue;
    entityCounts.set(nodeId, matchingEventIdsForNode(data, nodeId, filteredEventIds).length);
  }
  const maxEntityCount = Math.max(0, ...entityCounts.values());
  for (const [nodeId, count] of entityCounts) {
    const node = buildEntityNode(data, nodeId, count, maxEntityCount);
    if (node) acc.addNode(node);
  }

  for (const eventNodeId of eventNodeIds) {
    const node = data.nodesById.get(eventNodeId);
    if (!node) continue;
    if (!acc.addNode(buildEventNode(data, node))) break;
  }

  addSourceEdges(data, filteredEventIds, expansion, acc);

  if (acc.nodeBudgetReached) {
    acc.notices.push(
      `Too many detailed relationships to display clearly (limit ${MAX_VISIBLE_NODES} nodes). Refine filters or expand a narrower branch.`,
    );
  }

  return {
    nodes: Array.from(acc.nodes.values()),
    edges: Array.from(acc.edges.values()),
    notices: acc.notices,
    nodeBudgetReached: acc.nodeBudgetReached,
  };
}

/** Convenience wrapper for the unexpanded high-level view. */
export function buildOverviewGraph(data: BrainDataModel, filteredEventIds: Set<string>): GraphBuildResult {
  return buildGraph(data, filteredEventIds, {
    neighbourExpanded: new Set(),
    eventsExpanded: new Set(),
    showAdvancedRoles: false,
  });
}
