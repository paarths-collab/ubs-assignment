import type { BrainDataModel } from "./types";

/**
 * The events connected to a node, narrowed to the current filtered scope.
 * Every node-detail calculation (inspector, derived edges, graph sizing)
 * must go through this so the graph, metrics, and evidence table can never
 * drift apart.
 */
export function matchingEventIdsForNode(data: BrainDataModel, nodeId: string, filteredEventIds: Set<string>): string[] {
  const events = data.nodeToEvents.get(nodeId);
  if (!events) return [];
  return events.filter((id) => filteredEventIds.has(id));
}

export function matchingEventCountForNode(data: BrainDataModel, nodeId: string, filteredEventIds: Set<string>): number {
  return matchingEventIdsForNode(data, nodeId, filteredEventIds).length;
}
