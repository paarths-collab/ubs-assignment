import { readFileSync } from "node:fs";
import path from "node:path";

import { getBrainDataDir } from "../config";
import type {
  BrainEdge,
  BrainEvent,
  BrainNode,
  CanonicalBrainData,
  EdgesBrainFile,
  EventsBrainFile,
  IndexesBrainFile,
  NodesBrainFile,
} from "../types/brain";

export class BrainDataIntegrityError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Canonical brain dataset failed integrity validation:\n${issues.join("\n")}`);
    this.name = "BrainDataIntegrityError";
  }
}

function readJson<T>(dir: string, fileName: string): T {
  return JSON.parse(readFileSync(path.join(dir, fileName), "utf-8")) as T;
}

/**
 * Loads and validates the canonical brain datasets from disk. This is the
 * server's read-only source of truth: it never trusts client-submitted
 * metrics, only client-submitted IDs, which are cross-checked against this
 * data before any AI context is built.
 */
export function loadCanonicalBrainData(dir: string = getBrainDataDir()): CanonicalBrainData {
  const events = readJson<EventsBrainFile>(dir, "events_brain.json");
  const nodes = readJson<NodesBrainFile>(dir, "nodes_brain.json");
  const edges = readJson<EdgesBrainFile>(dir, "edges_brain.json");
  const indexes = readJson<IndexesBrainFile>(dir, "indexes_brain.json");

  const issues: string[] = [];

  if (events.events.length !== events.meta.event_count) {
    issues.push(`events.length (${events.events.length}) does not match meta.event_count (${events.meta.event_count})`);
  }
  if (nodes.nodes.length !== nodes.meta.node_count) {
    issues.push(`nodes.length (${nodes.nodes.length}) does not match meta.node_count (${nodes.meta.node_count})`);
  }
  if (edges.edges.length !== edges.meta.edge_count) {
    issues.push(`edges.length (${edges.edges.length}) does not match meta.edge_count (${edges.meta.edge_count})`);
  }

  const nodesById = new Map<string, BrainNode>(nodes.nodes.map((node) => [node.id, node]));
  const eventsById = new Map<string, BrainEvent>(events.events.map((event) => [event.event_id, event]));
  const edgesById = new Map<string, BrainEdge>(edges.edges.map((edge) => [edge.id, edge]));

  for (const edge of edges.edges) {
    if (!nodesById.has(edge.from)) issues.push(`edge ${edge.id} references unknown "from" node ${edge.from}`);
    if (!nodesById.has(edge.to)) issues.push(`edge ${edge.id} references unknown "to" node ${edge.to}`);
  }

  for (const [nodeId, eventIds] of Object.entries(indexes.node_to_events)) {
    if (!nodesById.has(nodeId)) {
      issues.push(`node_to_events references unknown node ${nodeId}`);
      continue;
    }
    for (const eventId of eventIds) {
      if (!eventsById.has(eventId)) issues.push(`node_to_events[${nodeId}] references unknown event ${eventId}`);
    }
  }

  if (issues.length > 0) {
    throw new BrainDataIntegrityError(issues);
  }

  return {
    eventsById,
    nodesById,
    edgesById,
    eventToNodes: new Map(Object.entries(indexes.event_to_nodes)),
    nodeToEvents: new Map(Object.entries(indexes.node_to_events)),
    allEventIds: new Set(eventsById.keys()),
  };
}

let cached: CanonicalBrainData | null = null;

/** Loads (once per process) the canonical brain data used to verify and enrich every AI request. */
export function getBrainData(): CanonicalBrainData {
  if (!cached) {
    cached = loadCanonicalBrainData();
  }
  return cached;
}
