import type { BrainDataModel, BrainNode, EventToNodesEntry, NodeType } from "./types";
import { matchingEventIdsForNode } from "./scope";
import { calculateMetrics } from "./metrics";
import type { Metrics } from "./metrics";

export interface RelatedEntity {
  nodeId: string;
  label: string;
  type: NodeType;
  count: number;
}

export interface RoleBreakdownEntry {
  role: string;
  eventIds: string[];
  advanced: boolean;
}

/** The roles of `event_to_nodes` surfaced as "what else is connected", in display order. */
const RELATED_ROLES: ReadonlyArray<{ key: keyof EventToNodesEntry; label: string }> = [
  { key: "owner_organisation", label: "Owner organisations" },
  { key: "discovery_organisation", label: "Discovery organisations" },
  { key: "owner", label: "Event owners" },
  { key: "assignee", label: "Current assignees" },
  { key: "issue", label: "Issues" },
  { key: "root_cause", label: "Root causes" },
  { key: "risk_theme", label: "Risk themes" },
  { key: "or_category", label: "OR categories" },
];

export interface RelatedGroup {
  key: string;
  label: string;
  entities: RelatedEntity[];
}

export interface NodeDetail {
  node: BrainNode;
  eventIds: string[];
  metrics: Metrics;
  /** How this node participates in its events — roles live on edges, never on duplicated nodes. */
  roleBreakdown: RoleBreakdownEntry[];
  related: RelatedGroup[];
}

function buildRoleBreakdown(data: BrainDataModel, nodeId: string, scope: Set<string>): RoleBreakdownEntry[] {
  const byRole = new Map<string, RoleBreakdownEntry>();

  for (const edgeId of data.nodeToEdges.get(nodeId) ?? []) {
    const edge = data.edgesById.get(edgeId);
    if (!edge?.event_id || !scope.has(edge.event_id)) continue;

    let entry = byRole.get(edge.role);
    if (!entry) {
      entry = { role: edge.role, eventIds: [], advanced: edge.advanced };
      byRole.set(edge.role, entry);
    }
    entry.eventIds.push(edge.event_id);
  }

  return Array.from(byRole.values()).sort((a, b) => b.eventIds.length - a.eventIds.length);
}

function buildRelatedGroups(data: BrainDataModel, nodeId: string, eventIds: string[]): RelatedGroup[] {
  const groups: RelatedGroup[] = [];

  for (const { key, label } of RELATED_ROLES) {
    const counts = new Map<string, number>();
    for (const eventId of eventIds) {
      const roleMap = data.eventToNodes.get(eventId);
      const relatedId = roleMap?.[key];
      if (!relatedId || relatedId === nodeId) continue;
      counts.set(relatedId, (counts.get(relatedId) ?? 0) + 1);
    }
    if (counts.size === 0) continue;

    const entities: RelatedEntity[] = [];
    for (const [relatedId, count] of counts) {
      const node = data.nodesById.get(relatedId);
      if (!node) continue;
      entities.push({ nodeId: relatedId, label: node.label, type: node.type, count });
    }
    entities.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    groups.push({ key: String(key), label, entities });
  }

  return groups;
}

/**
 * Everything the inspector shows for a node, computed strictly from the
 * node's events intersected with the current filtered scope — so the graph,
 * the inspector, the evidence table and the AI context can never disagree.
 */
export function buildNodeDetail(data: BrainDataModel, nodeId: string, filteredEventIds: Set<string>): NodeDetail | null {
  const node = data.nodesById.get(nodeId);
  if (!node) return null;

  const eventIds = matchingEventIdsForNode(data, nodeId, filteredEventIds);

  return {
    node,
    eventIds,
    metrics: calculateMetrics(data, eventIds),
    roleBreakdown: buildRoleBreakdown(data, nodeId, filteredEventIds),
    related: buildRelatedGroups(data, nodeId, eventIds),
  };
}
