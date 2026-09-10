import type { Edge as VisEdge, Node as VisNode } from "vis-network/standalone/esm/vis-network.js";

export interface VisNodeInput extends VisNode {
  id: string;
  label: string;
  shape: string;
  /**
   * The real underlying entity id this node re-roots the flow to when
   * clicked. Null for synthetic nodes — a role bucket or a "+more"
   * placeholder — that don't correspond to a selectable entity.
   */
  flowEntityId?: string | null;
  /** True for a "+N more" placeholder: clicking it reveals the rest of its column instead of re-rooting. */
  flowMore?: boolean;
  eventIds?: string[];
}

export interface VisEdgeInput extends VisEdge {
  id: string;
  from: string;
  to: string;
  /** True for edges aggregated across multiple events rather than a single source row. */
  derived?: boolean;
  /** The real event IDs this edge is evidenced by — required for traceability. */
  eventIds: string[];
}

export interface GraphData {
  nodes: VisNodeInput[];
  edges: VisEdgeInput[];
}
