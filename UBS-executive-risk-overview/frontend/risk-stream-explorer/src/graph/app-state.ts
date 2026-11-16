import type { FlowUIState } from "./flow-builder";
import { createInitialFlowState } from "./flow-builder";
import type { BreadcrumbEntry } from "./flow-breadcrumb";
import type { PriorityFlowId } from "./priority-flows";

export type { BreadcrumbEntry };

export interface NumericRangeFilter {
  min: number | null;
  max: number | null;
}

export interface DateRangeFilter {
  from: string | null;
  to: string | null;
}

export interface AdvancedFilters {
  creator: string[];
  administrator: string[];
  modifiedBy: string[];
  provisionStatus: string[];
}

/**
 * The single filter shape that drives every widget (graph, metrics,
 * inspector, event table, AI context). Array fields are OR'd within the
 * dimension; non-empty dimensions are AND'd against each other.
 */
export interface FilterState {
  occurrenceDate: DateRangeFilter;
  eventType: string[];
  severity: string[];
  status: string[];
  stage: string[];
  ownerOrganisation: string[];
  discoveryOrganisation: string[];
  owner: string[];
  assignee: string[];
  issue: string[];
  rootCause: string[];
  riskTheme: string[];
  orCategory: string[];
  grossAmount: NumericRangeFilter;
  netAmount: NumericRangeFilter;
  potentialImpact: NumericRangeFilter;
  detectionDelay: NumericRangeFilter;
  recordingDelay: NumericRangeFilter;
  occurrenceToRecord: NumericRangeFilter;
  affectedRecords: NumericRangeFilter;
  remediationHours: NumericRangeFilter;
  advanced: AdvancedFilters;
}

export function createEmptyFilterState(): FilterState {
  const emptyNumeric = (): NumericRangeFilter => ({ min: null, max: null });
  return {
    occurrenceDate: { from: null, to: null },
    eventType: [],
    severity: [],
    status: [],
    stage: [],
    ownerOrganisation: [],
    discoveryOrganisation: [],
    owner: [],
    assignee: [],
    issue: [],
    rootCause: [],
    riskTheme: [],
    orCategory: [],
    grossAmount: emptyNumeric(),
    netAmount: emptyNumeric(),
    potentialImpact: emptyNumeric(),
    detectionDelay: emptyNumeric(),
    recordingDelay: emptyNumeric(),
    occurrenceToRecord: emptyNumeric(),
    affectedRecords: emptyNumeric(),
    remediationHours: emptyNumeric(),
    advanced: { creator: [], administrator: [], modifiedBy: [], provisionStatus: [] },
  };
}

export type AiStatus = "idle" | "loading" | "success" | "error";

export interface AiState {
  status: AiStatus;
  requestId: string | null;
  result: unknown | null;
  error: string | null;
}

export function createInitialAiState(): AiState {
  return { status: "idle", requestId: null, result: null, error: null };
}

/**
 * There is exactly one notion of "what the analyst is looking at": the
 * flow's root entity. Selecting a search result, clicking a flow node, and
 * opening a table row all do the same thing — set `flow.rootId` — so the
 * graph, inspector, evidence table and AI panel can never point at
 * different things at once.
 */
export interface AppState {
  dataReady: boolean;
  filters: FilterState;
  filteredEventIds: Set<string>;
  /**
   * The selected deterministic priority flow, if the analyst entered from
   * the priority landing. Null AND flow.rootId === null together mean
   * "landing" — show the priority cards instead of the graph.
   */
  priorityFlow: PriorityFlowId | null;
  flow: FlowUIState;
  /** The trail of entities drilled into, for the breadcrumb. Truncated, not cleared, when navigating back into it. */
  breadcrumb: BreadcrumbEntry[];
  ai: AiState;
}

export function createInitialAppState(filteredEventIds: Set<string>): AppState {
  return {
    dataReady: true,
    filters: createEmptyFilterState(),
    filteredEventIds,
    priorityFlow: null,
    flow: createInitialFlowState(),
    breadcrumb: [],
    ai: createInitialAiState(),
  };
}
