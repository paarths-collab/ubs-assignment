import type { Color as VisColor } from "vis-network/standalone/esm/vis-network.js";
import type { NodeType } from "./types";

export interface NodeVisualStyle {
  shape: string;
  color: VisColor;
  font: { color: string; size?: number; strokeWidth?: number; strokeColor?: string };
}

/** Labels sit below the node, so every shape here is one vis-network draws the label outside of. */
const LABEL_BELOW: { color: string; size: number; strokeWidth: number; strokeColor: string } = {
  color: "#c8ccd4",
  size: 11,
  strokeWidth: 3,
  strokeColor: "#000000",
};

/**
 * Node types are distinguishable by shape first, colour second — never
 * colour alone. Colours are drawn from the shared design tokens so the two
 * components in the suite read as one product.
 *
 * Shapes are deliberately limited to the label-outside family (dot, square,
 * triangle, star, diamond, hexagon). `box` and `ellipse` draw the label
 * *inside*, which turns every node into a text slab and destroys the
 * readability of a dense network.
 */
export const NODE_TYPE_STYLE: Record<NodeType, NodeVisualStyle> = {
  enterprise: {
    shape: "diamond",
    color: { background: "#e5b53c", border: "#f5cd63", highlight: { background: "#f5cd63", border: "#ffffff" } },
    font: { ...LABEL_BELOW, color: "#f0d68a", size: 14 },
  },
  organisation: {
    shape: "dot",
    color: { background: "#3772ff", border: "#7aa2ff", highlight: { background: "#5b8cff", border: "#ffffff" } },
    font: LABEL_BELOW,
  },
  event: {
    shape: "dot",
    color: { background: "#7c8794", border: "#9aa4b0", highlight: { background: "#9aa4b0", border: "#ffffff" } },
    font: { ...LABEL_BELOW, color: "#8f96a1", size: 9 },
  },
  person: {
    shape: "triangleDown",
    color: { background: "#22c55e", border: "#6ee7a0", highlight: { background: "#4ade80", border: "#ffffff" } },
    font: LABEL_BELOW,
  },
  issue: {
    shape: "square",
    color: { background: "#f5a623", border: "#ffcb70", highlight: { background: "#ffbe52", border: "#ffffff" } },
    font: LABEL_BELOW,
  },
  root_cause: {
    shape: "triangle",
    color: { background: "#ef4444", border: "#ff8585", highlight: { background: "#f87171", border: "#ffffff" } },
    font: LABEL_BELOW,
  },
  risk_theme: {
    shape: "star",
    color: { background: "#a855f7", border: "#d0a2ff", highlight: { background: "#c084fc", border: "#ffffff" } },
    font: LABEL_BELOW,
  },
  or_category: {
    shape: "hexagon",
    color: { background: "#06b6d4", border: "#67e8f9", highlight: { background: "#22d3ee", border: "#ffffff" } },
    font: LABEL_BELOW,
  },
};

/**
 * Organisations split into two populations that never overlap in this
 * dataset: 12 that own events and 12 that discover them. Same entity type,
 * so the same circle — but the colour says which population it belongs to,
 * which is information the shape alone cannot carry.
 */
export const ORGANISATION_ROLE_COLOR = {
  owner: { background: "#3772ff", border: "#7aa2ff", highlight: { background: "#5b8cff", border: "#ffffff" } },
  discovery: { background: "#ec4899", border: "#f9a8d4", highlight: { background: "#f472b6", border: "#ffffff" } },
} as const;

export const ORGANISATION_ROLE_LABEL = {
  owner: "Organisation (owner)",
  discovery: "Organisation (discovery)",
} as const;

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

const DEFAULT_EDGE_STYLE: EdgeVisualStyle = { color: "rgba(150,160,175,0.20)", dashes: false, width: 0.6 };

/**
 * Roles are distinguished on the edge, not by duplicating the
 * person/organisation node: solid for a primary role, dashed for a
 * secondary one, finely dotted for administrative roles.
 *
 * Colours are heavily transparent on purpose. In a network this dense the
 * edges are texture that shows where the mass is; the nodes carry the
 * meaning. Selecting an edge or node lifts it out of the wash.
 */
export const EDGE_ROLE_STYLE: Record<string, EdgeVisualStyle> = {
  ORG_OWNS_EVENT: { color: "rgba(55,114,255,0.40)", dashes: false, width: 0.9 },
  ORG_DISCOVERED_EVENT: { color: "rgba(55,114,255,0.24)", dashes: [4, 3], width: 0.7 },
  PERSON_OWNS_EVENT: { color: "rgba(34,197,94,0.42)", dashes: false, width: 0.9 },
  PERSON_ASSIGNED_EVENT: { color: "rgba(34,197,94,0.26)", dashes: [2, 2], width: 0.7 },
  PERSON_ADMINISTERS_EVENT: { color: "rgba(140,146,158,0.22)", dashes: [1, 3], width: 0.5 },
  PERSON_CREATED_EVENT: { color: "rgba(140,146,158,0.22)", dashes: [1, 3], width: 0.5 },
  PERSON_MODIFIED_EVENT: { color: "rgba(140,146,158,0.22)", dashes: [1, 3], width: 0.5 },
  EVENT_HAS_ISSUE: { color: "rgba(245,166,35,0.38)", dashes: false, width: 0.8 },
  EVENT_HAS_ROOT_CAUSE: { color: "rgba(239,68,68,0.38)", dashes: false, width: 0.8 },
  EVENT_HAS_RISK_THEME: { color: "rgba(168,85,247,0.38)", dashes: false, width: 0.8 },
  EVENT_HAS_OR_CATEGORY: { color: "rgba(6,182,212,0.38)", dashes: false, width: 0.8 },
  ENTERPRISE_CONTAINS_ORGANISATION: { color: "rgba(229,181,60,0.30)", dashes: false, width: 0.7 },
  DERIVED_AGGREGATE: { color: "rgba(150,160,175,0.22)", dashes: [6, 4], width: 0.6 },
};

export function edgeStyleFor(relation: string): EdgeVisualStyle {
  return EDGE_ROLE_STYLE[relation] ?? DEFAULT_EDGE_STYLE;
}
