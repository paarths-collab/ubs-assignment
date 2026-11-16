import eventsFile from "./data/events_brain.json";
import nodesFile from "./data/nodes_brain.json";
import edgesFile from "./data/edges_brain.json";
import indexesFile from "./data/indexes_brain.json";

import type {
  BrainDataModel,
  EdgeRelation,
  EdgesBrainFile,
  EventsBrainFile,
  IndexesBrainFile,
  NodeType,
  NodesBrainFile,
} from "./types";

export class BrainDataIntegrityError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Brain dataset failed integrity validation:\n${issues.join("\n")}`);
    this.name = "BrainDataIntegrityError";
  }
}

/**
 * Builds the normalized, indexed runtime model from the four raw brain
 * datasets and validates cross-file referential integrity. Pure function
 * (no I/O) so it can run against fixtures in tests as well as the real
 * bundled JSON.
 */
export function buildBrainData(
  events: EventsBrainFile,
  nodes: NodesBrainFile,
  edges: EdgesBrainFile,
  indexes: IndexesBrainFile,
): BrainDataModel {
  const issues: string[] = [];

  if (events.events.length !== events.meta.event_count) {
    issues.push(
      `events.length (${events.events.length}) does not match meta.event_count (${events.meta.event_count})`,
    );
  }
  if (nodes.nodes.length !== nodes.meta.node_count) {
    issues.push(`nodes.length (${nodes.nodes.length}) does not match meta.node_count (${nodes.meta.node_count})`);
  }
  if (edges.edges.length !== edges.meta.edge_count) {
    issues.push(`edges.length (${edges.edges.length}) does not match meta.edge_count (${edges.meta.edge_count})`);
  }
  if (edges.meta.structural_edge_count + edges.meta.event_edge_count !== edges.meta.edge_count) {
    issues.push("structural_edge_count + event_edge_count does not equal edge_count");
  }

  const eventsById = new Map(events.events.map((event) => [event.event_id, event]));
  if (eventsById.size !== events.events.length) {
    issues.push("duplicate event_id values found in events_brain.json");
  }

  const nodesById = new Map(nodes.nodes.map((node) => [node.id, node]));
  if (nodesById.size !== nodes.nodes.length) {
    issues.push("duplicate node id values found in nodes_brain.json");
  }

  const edgesById = new Map(edges.edges.map((edge) => [edge.id, edge]));
  if (edgesById.size !== edges.edges.length) {
    issues.push("duplicate edge id values found in edges_brain.json");
  }

  for (const edge of edges.edges) {
    if (!nodesById.has(edge.from)) {
      issues.push(`edge ${edge.id} references unknown "from" node ${edge.from}`);
    }
    if (!nodesById.has(edge.to)) {
      issues.push(`edge ${edge.id} references unknown "to" node ${edge.to}`);
    }
  }

  for (const event of events.events) {
    const eventNodeId = `event::${event.event_id}`;
    const eventNode = nodesById.get(eventNodeId);
    if (!eventNode) {
      issues.push(`event ${event.event_id} has no matching node ${eventNodeId}`);
    } else if (eventNode.type !== "event") {
      issues.push(`node ${eventNodeId} for event ${event.event_id} has unexpected type ${eventNode.type}`);
    }
  }

  for (const [nodeId, eventIds] of Object.entries(indexes.node_to_events)) {
    if (!nodesById.has(nodeId)) {
      issues.push(`node_to_events references unknown node ${nodeId}`);
      continue;
    }
    for (const eventId of eventIds) {
      if (!eventsById.has(eventId)) {
        issues.push(`node_to_events[${nodeId}] references unknown event ${eventId}`);
      }
    }
  }

  for (const [eventId, roleMap] of Object.entries(indexes.event_to_nodes)) {
    if (!eventsById.has(eventId)) {
      issues.push(`event_to_nodes references unknown event ${eventId}`);
      continue;
    }
    for (const [role, nodeId] of Object.entries(roleMap)) {
      if (role === "event") continue;
      if (!nodesById.has(nodeId)) {
        issues.push(`event_to_nodes[${eventId}].${role} references unknown node ${nodeId}`);
      }
    }
  }

  if (issues.length > 0) {
    throw new BrainDataIntegrityError(issues);
  }

  const nodeToEvents = new Map(Object.entries(indexes.node_to_events));
  const nodeToEdges = new Map(Object.entries(indexes.node_to_edges));
  const nodeToNeighbors = new Map(Object.entries(indexes.node_to_neighbors));
  const nodesByType = new Map(Object.entries(indexes.nodes_by_type)) as Map<NodeType, string[]>;
  const edgesByRelation = new Map(Object.entries(indexes.edges_by_relation)) as Map<EdgeRelation, string[]>;
  const eventToNodesMap = new Map(Object.entries(indexes.event_to_nodes));

  Object.freeze(events.events);
  Object.freeze(nodes.nodes);
  Object.freeze(edges.edges);

  return {
    enterpriseId: events.meta.enterprise_id,
    enterpriseName: events.meta.enterprise_name,
    eventsById,
    nodesById,
    edgesById,
    eventToNodes: eventToNodesMap,
    nodeToEvents,
    nodeToEdges,
    nodeToNeighbors,
    nodesByType,
    edgesByRelation,
    filterValues: indexes.filter_values,
    filterEventIds: indexes.filter_event_ids,
    rangeBounds: indexes.range_bounds,
    dateBounds: indexes.date_bounds,
    searchIndex: indexes.search,
    allEventIds: new Set(eventsById.keys()),
  };
}

let cached: BrainDataModel | null = null;

/** Loads (once) the normalized runtime model from the bundled brain datasets. */
export function loadBrainData(): BrainDataModel {
  if (!cached) {
    cached = buildBrainData(
      eventsFile as EventsBrainFile,
      nodesFile as NodesBrainFile,
      edgesFile as EdgesBrainFile,
      indexesFile as IndexesBrainFile,
    );
  }
  return cached;
}
