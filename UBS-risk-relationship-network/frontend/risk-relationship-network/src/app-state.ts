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

export interface Selection {
  nodeId: string | null;
  eventId: string | null;
}

/**
 * What the analyst has explicitly opened up, on top of the always-present
 * high-level overview. The rendered graph is a pure function of the
 * filtered scope plus this state, so repeated expand/collapse cycles can
 * never duplicate nodes or leave orphaned ones behind.
 */
export interface ExpansionState {
  /** Nodes whose direct graph neighbours are shown. */
  neighbourExpanded: Set<string>;
  /** Nodes whose related Event nodes are shown. */
  eventsExpanded: Set<string>;
  /** Administrator/Creator/Modifier edges are hidden unless this is on. */
  showAdvancedRoles: boolean;
}

export function createInitialExpansionState(): ExpansionState {
  return { neighbourExpanded: new Set(), eventsExpanded: new Set(), showAdvancedRoles: false };
}

export interface GraphState {
  focusNodeId: string | null;
  expansion: ExpansionState;
  physicsEnabled: boolean;
}

export function createInitialGraphState(): GraphState {
  return { focusNodeId: null, expansion: createInitialExpansionState(), physicsEnabled: true };
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

export interface AppState {
  dataReady: boolean;
  filters: FilterState;
  filteredEventIds: Set<string>;
  selection: Selection;
  graph: GraphState;
  ai: AiState;
}

export function createInitialAppState(filteredEventIds: Set<string>): AppState {
  return {
    dataReady: true,
    filters: createEmptyFilterState(),
    filteredEventIds,
    selection: { nodeId: null, eventId: null },
    graph: createInitialGraphState(),
    ai: createInitialAiState(),
  };
}
