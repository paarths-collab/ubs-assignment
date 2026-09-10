export type NodeType =
  | "enterprise"
  | "organisation"
  | "event"
  | "person"
  | "issue"
  | "root_cause"
  | "risk_theme"
  | "or_category";

export type EdgeRelation =
  | "ORG_OWNS_EVENT"
  | "ORG_DISCOVERED_EVENT"
  | "PERSON_OWNS_EVENT"
  | "PERSON_ASSIGNED_EVENT"
  | "PERSON_ADMINISTERS_EVENT"
  | "PERSON_CREATED_EVENT"
  | "PERSON_MODIFIED_EVENT"
  | "EVENT_HAS_ISSUE"
  | "EVENT_HAS_ROOT_CAUSE"
  | "EVENT_HAS_RISK_THEME"
  | "EVENT_HAS_OR_CATEGORY"
  | "ENTERPRISE_CONTAINS_ORGANISATION";

export type EventType = "Financial" | "Non-Financial";
export type Severity = "Low" | "Moderate" | "High";

/** Raw event record exactly as it appears in events_brain.json. */
export interface BrainEvent {
  event_id: string;
  event_title: string;
  event_description: string;
  event_type: EventType;
  severity: Severity;
  status: string;
  stage: string;
  provision_status: string;
  gross_amount_usd: number | null;
  net_amount_usd: number | null;
  recovery_amount_usd: number | null;
  potential_impact_amount_usd: number | null;
  occurrence_date: string;
  date_discovered: string;
  created_on: string;
  modified_on: string;
  owner_organisation: string;
  discovery_organisation: string;
  owner_name: string;
  current_assignee: string;
  administrator_name: string;
  creator_name: string;
  modified_by_name: string;
  issue_detail: string;
  root_cause: string;
  risk_theme: string;
  or_category: string;
  background_detail: string;
  root_cause_detail: string;
  impact_detail: string;
  opportunity: string;
  impacts: string;
  detection_delay_days: number;
  recording_delay_days: number;
  occurrence_to_record_days: number;
  affected_records: number;
  remediation_hours: number;
}

export interface EventsBrainFile {
  meta: {
    source: string;
    enterprise_id: string;
    enterprise_name: string;
    event_count: number;
    schema_version: number;
  };
  events: BrainEvent[];
}

export interface BrainNode {
  id: string;
  type: NodeType;
  label: string;
  subtitle?: string | null;
}

export interface NodesBrainFile {
  meta: EventsBrainFile["meta"] & { node_count: number };
  nodes: BrainNode[];
}

export interface BrainEdge {
  id: string;
  from: string;
  to: string;
  relation: EdgeRelation;
  role: string;
  event_id: string | null;
  advanced: boolean;
  structural: boolean;
}

export interface EdgesBrainFile {
  meta: EventsBrainFile["meta"] & {
    edge_count: number;
    structural_edge_count: number;
    event_edge_count: number;
  };
  edges: BrainEdge[];
}

export interface SearchEntry {
  id: string;
  type: NodeType;
  label: string;
  subtitle: string | null;
  search_text: string;
}

/** Per-event map from role -> node id, keyed by raw event id (e.g. "SIM-0000001"). */
export interface EventToNodesEntry {
  event: string;
  owner_organisation: string;
  discovery_organisation: string;
  owner: string;
  assignee: string;
  administrator: string;
  creator: string;
  modifier: string;
  issue: string;
  root_cause: string;
  risk_theme: string;
  or_category: string;
}

export type FilterDimension =
  | "event_type"
  | "severity"
  | "status"
  | "stage"
  | "owner_organisation"
  | "discovery_organisation"
  | "owner_name"
  | "current_assignee"
  | "issue_detail"
  | "root_cause"
  | "risk_theme"
  | "or_category"
  | "provision_status"
  | "creator_name"
  | "administrator_name"
  | "modified_by_name";

export type RangeBoundDimension =
  | "gross_amount_usd"
  | "net_amount_usd"
  | "recovery_amount_usd"
  | "potential_impact_amount_usd"
  | "detection_delay_days"
  | "recording_delay_days"
  | "occurrence_to_record_days"
  | "affected_records"
  | "remediation_hours";

export type DateBoundDimension = "occurrence_date" | "date_discovered" | "created_on" | "modified_on";

export interface IndexesBrainFile {
  meta: EventsBrainFile["meta"];
  search: SearchEntry[];
  event_to_nodes: Record<string, EventToNodesEntry>;
  node_to_events: Record<string, string[]>;
  node_to_edges: Record<string, string[]>;
  node_to_neighbors: Record<string, string[]>;
  nodes_by_type: Record<NodeType, string[]>;
  edges_by_relation: Record<EdgeRelation, string[]>;
  filter_values: Record<FilterDimension, string[]>;
  filter_event_ids: Record<FilterDimension, Record<string, string[]>>;
  range_bounds: Record<RangeBoundDimension, { min: number; max: number }>;
  date_bounds: Record<DateBoundDimension, { min: string; max: string }>;
}

/** Normalized, indexed, read-only view of the four brain datasets. */
export interface BrainDataModel {
  enterpriseId: string;
  enterpriseName: string;
  eventsById: Map<string, BrainEvent>;
  nodesById: Map<string, BrainNode>;
  edgesById: Map<string, BrainEdge>;
  eventToNodes: Map<string, EventToNodesEntry>;
  nodeToEvents: Map<string, string[]>;
  nodeToEdges: Map<string, string[]>;
  nodeToNeighbors: Map<string, string[]>;
  nodesByType: Map<NodeType, string[]>;
  edgesByRelation: Map<EdgeRelation, string[]>;
  filterValues: Record<FilterDimension, string[]>;
  filterEventIds: Record<FilterDimension, Record<string, string[]>>;
  rangeBounds: Record<RangeBoundDimension, { min: number; max: number }>;
  dateBounds: Record<DateBoundDimension, { min: string; max: string }>;
  searchIndex: SearchEntry[];
  allEventIds: Set<string>;
}
