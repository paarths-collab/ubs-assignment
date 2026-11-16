import type { NodeType } from "./types";
import type { FlowViewMode } from "./flow-controls";

/** Saved, intentionally small flow shapes that AI can choose from. */
export type FlowTemplateId = "issue-investigation" | "organisation-concentration" | "workflow-people" | "full-risk-chain";
export interface FlowTemplate {
  id: FlowTemplateId;
  label: string;
  description: string;
  viewMode: FlowViewMode;
}

/** AI selects one of these existing deterministic graph shapes. */
export const FLOW_TEMPLATES: FlowTemplate[] = [
  { id: "issue-investigation", label: "Issue → Root Cause", description: "A short path from the current scope to causes.", viewMode: "causes" },
  { id: "organisation-concentration", label: "Organisation → Issues", description: "Where the current event scope is concentrated.", viewMode: "issues" },
  { id: "workflow-people", label: "People workflow", description: "The roles and people connected to this scope.", viewMode: "people" },
  { id: "full-risk-chain", label: "Full risk chain", description: "The complete saved relationship path.", viewMode: "full" },
];

export function flowTemplate(id: FlowTemplateId): FlowTemplate {
  return FLOW_TEMPLATES.find((template) => template.id === id) ?? FLOW_TEMPLATES[0]!;
}

/** How many nodes a column shows before collapsing the rest into a "+N more" node. */
export const FLOW_TOP_N = 5;

/**
 * How many individual events a single parent fans out to when the Events
 * column is on. Kept small: the events column exists to point at concrete
 * evidence, not to re-render the whole table as tiny dots — the table
 * below the graph is already the right place to browse every event.
 */
export const FLOW_MAX_EVENTS_PER_PARENT = 5;

/**
 * One column of the flow. `issue` / `root_cause` / `risk_theme` /
 * `or_category` pivot on the identically-named field of `EventToNodesEntry`
 * for every event in the parent's scope. `organisation` and `role` don't
 * map to a single field (an event carries two organisation roles and five
 * person roles) and are aggregated by dedicated functions in flow-builder.
 */
export type FlowStepKind =
  | "organisation"
  | "issue"
  | "root_cause"
  | "risk_theme"
  | "or_category"
  | "role"
  | "person"
  | "event";

export interface FlowStep {
  kind: FlowStepKind;
  /** Column header, e.g. "ORGANISATIONS". */
  label: string;
}

const STEP = {
  organisation: { kind: "organisation", label: "Organisations" } as FlowStep,
  issue: { kind: "issue", label: "Issues" } as FlowStep,
  rootCause: { kind: "root_cause", label: "Root Causes" } as FlowStep,
  riskTheme: { kind: "risk_theme", label: "Risk Themes" } as FlowStep,
  orCategory: { kind: "or_category", label: "OR Categories" } as FlowStep,
  role: { kind: "role", label: "Roles" } as FlowStep,
};

/**
 * The full downstream/upstream chain for each entity type, radiating out
 * from wherever that type sits in the canonical
 * Enterprise -> Organisation -> Issue -> Root Cause -> Risk Theme -> OR
 * Category pipeline. A root's chain always includes the pipeline neighbours
 * on both sides, so the flow never dead-ends at a node with nothing to show
 * — e.g. selecting a Root Cause looks both up toward its Issues and further
 * up toward Organisations, not only downstream toward Risk Theme.
 */
const FULL_CHAIN: Record<NodeType, FlowStep[]> = {
  // Priority investigations intentionally start with the useful relationship
  // path rather than stopping at the enterprise node: Organisation → Issue →
  // Root Cause. Top-N collapsing keeps this readable even for All events.
  enterprise: [STEP.organisation, STEP.issue, STEP.rootCause],
  organisation: [STEP.issue, STEP.rootCause, STEP.riskTheme, STEP.orCategory],
  person: [STEP.role, STEP.issue, STEP.rootCause],
  issue: [STEP.organisation, STEP.rootCause, STEP.riskTheme, STEP.orCategory],
  root_cause: [STEP.issue, STEP.organisation, STEP.riskTheme, STEP.orCategory],
  risk_theme: [STEP.rootCause, STEP.issue, STEP.organisation],
  or_category: [STEP.riskTheme, STEP.rootCause, STEP.issue, STEP.organisation],
  // Events are single records, not aggregates — flow-builder special-cases
  // this into a flat "siblings" view instead of using this chain.
  event: [],
};

export function fullChainFor(rootType: NodeType): FlowStep[] {
  return FULL_CHAIN[rootType];
}

/**
 * Slices a root type's full chain down to what a view mode should show.
 * "full" is everything; "issues" and "causes" are prefixes ending at the
 * first Issue / Root Cause step in that chain. Neither concept always
 * exists in every chain (e.g. an Issue root has no further "issue" step,
 * since it *is* the issue) — when the target step is absent the nearest
 * sensible prefix is used instead, so every view mode always shows
 * *something* rather than an empty column.
 */
export function chainForViewMode(rootType: NodeType, viewMode: FlowViewMode): FlowStep[] {
  const full = fullChainFor(rootType);
  if (viewMode === "full" || full.length === 0) return full;

  if (viewMode === "issues") {
    const index = full.findIndex((step) => step.kind === "issue");
    return full.slice(0, index >= 0 ? index + 1 : 1);
  }

  if (viewMode === "causes") {
    const index = full.findIndex((step) => step.kind === "root_cause");
    return full.slice(0, index >= 0 ? index + 1 : Math.min(2, full.length));
  }

  // "people" is not a slice of FULL_CHAIN — it swaps in the any-role person
  // aggregation instead, handled directly by flow-builder.
  return full;
}
