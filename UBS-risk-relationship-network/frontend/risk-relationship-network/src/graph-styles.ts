import type { Color as VisColor } from "vis-network/standalone/esm/vis-network.js";
import type { NodeType } from "./types";

export interface NodeVisualStyle {
  shape: string;
  color: VisColor;
  font: { color: string; size?: number; strokeWidth?: number; strokeColor?: string };
}

/**
 * Node types are distinguishable by shape first, colour second — never
 * colour alone. Colours are drawn from the shared design tokens so the two
 * components in the suite read as one product.
 */
export const NODE_TYPE_STYLE: Record<NodeType, NodeVisualStyle> = {
  enterprise: {
    shape: "diamond",
    color: { background: "#e5b53c", border: "#8a5f14", highlight: { background: "#f5cd63", border: "#8a5f14" } },
    font: { color: "#060607" },
  },
  organisation: {
    shape: "box",
    color: { background: "#3772ff", border: "#1f4099", highlight: { background: "#5b8cff", border: "#1f4099" } },
    font: { color: "#f2f3f5" },
  },
  event: {
    shape: "dot",
    color: { background: "#7c8794", border: "#4a525c", highlight: { background: "#9aa4b0", border: "#4a525c" } },
    font: { color: "#a7abb3" },
  },
  person: {
    shape: "ellipse",
    color: { background: "#22c55e", border: "#15743a", highlight: { background: "#4ade80", border: "#15743a" } },
    font: { color: "#060607" },
  },
  issue: {
    shape: "hexagon",
    color: { background: "#f5a623", border: "#8a5f14", highlight: { background: "#ffbe52", border: "#8a5f14" } },
    font: { color: "#060607" },
  },
  root_cause: {
    shape: "triangle",
    color: { background: "#ef4444", border: "#8a2222", highlight: { background: "#f87171", border: "#8a2222" } },
    font: { color: "#f2f3f5" },
  },
  risk_theme: {
    shape: "star",
    color: { background: "#a855f7", border: "#6b21a8", highlight: { background: "#c084fc", border: "#6b21a8" } },
    font: { color: "#f2f3f5" },
  },
  or_category: {
    shape: "square",
    color: { background: "#06b6d4", border: "#0e7490", highlight: { background: "#22d3ee", border: "#0e7490" } },
    font: { color: "#060607" },
  },
};

export const NODE_TYPE_LABEL: Record<NodeType, string> = {
  enterprise: "Enterprise",
  organisation: "Organisation",
  event: "Event",
  person: "Person",
  issue: "Issue",
  root_cause: "Root Cause",
  risk_theme: "Risk Theme",
  or_category: "OR Category",
};

export interface EdgeVisualStyle {
  color: string;
  dashes: boolean | [number, number];
  width: number;
}

const DEFAULT_EDGE_STYLE: EdgeVisualStyle = { color: "#4a525c", dashes: false, width: 1 };

/**
 * Roles are distinguished on the edge, not by duplicating the
 * person/organisation node: solid for a primary role, dashed for a
 * secondary one, finely dotted for administrative roles.
 */
export const EDGE_ROLE_STYLE: Record<string, EdgeVisualStyle> = {
  ORG_OWNS_EVENT: { color: "#3772ff", dashes: false, width: 2 },
  ORG_DISCOVERED_EVENT: { color: "#3772ff", dashes: [4, 3], width: 1.5 },
  PERSON_OWNS_EVENT: { color: "#22c55e", dashes: false, width: 2 },
  PERSON_ASSIGNED_EVENT: { color: "#22c55e", dashes: [2, 2], width: 1.5 },
  PERSON_ADMINISTERS_EVENT: { color: "#66696f", dashes: [1, 3], width: 1 },
  PERSON_CREATED_EVENT: { color: "#66696f", dashes: [1, 3], width: 1 },
  PERSON_MODIFIED_EVENT: { color: "#66696f", dashes: [1, 3], width: 1 },
  EVENT_HAS_ISSUE: { color: "#f5a623", dashes: false, width: 1.5 },
  EVENT_HAS_ROOT_CAUSE: { color: "#ef4444", dashes: false, width: 1.5 },
  EVENT_HAS_RISK_THEME: { color: "#a855f7", dashes: false, width: 1.5 },
  EVENT_HAS_OR_CATEGORY: { color: "#06b6d4", dashes: false, width: 1.5 },
  ENTERPRISE_CONTAINS_ORGANISATION: { color: "#e5b53c", dashes: false, width: 2 },
  DERIVED_AGGREGATE: { color: "#7c8794", dashes: [6, 4], width: 1 },
};

export function edgeStyleFor(relation: string): EdgeVisualStyle {
  return EDGE_ROLE_STYLE[relation] ?? DEFAULT_EDGE_STYLE;
}
