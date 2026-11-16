import type { BrainDataModel, EventToNodesEntry, NodeType, Severity } from "./types";
import { matchingEventIdsForNode } from "./scope";
import { NODE_TYPE_STYLE, ORGANISATION_ROLE_COLOR, ORGANISATION_ROLE_LABEL } from "./graph-styles";
import { FLOW_MAX_EVENTS_PER_PARENT, FLOW_TOP_N, chainForViewMode } from "./flow-model";
import type { FlowStep, FlowStepKind, FlowTemplateId } from "./flow-model";
import type { FlowViewMode } from "./flow-controls";
import type { GraphData, VisEdgeInput, VisNodeInput } from "./graph-types";
import { evidenceBadge } from "./ai-guidance";

export interface FlowColumn {
  level: number;
  label: string;
  kind: FlowStepKind;
}

export interface FlowBuildResult extends GraphData {
  columns: FlowColumn[];
  notices: string[];
  /** The id of the single root node, so the caller can focus/fit around it. */
  rootNodeId: string;
}

export interface FlowUIState {
  /** The selected entity's real node id, or null for the unrooted default (whole enterprise). */
  rootId: string | null;
  templateId: FlowTemplateId;
  viewMode: FlowViewMode;
  showEvents: boolean;
  /** Columns (by level index) the analyst has expanded past the top-N cutoff. */
  revealedLevels: Set<number>;
}

export function createInitialFlowState(): FlowUIState {
  return { rootId: null, templateId: "issue-investigation", viewMode: "causes", showEvents: false, revealedLevels: new Set() };
}

const ROOT_NODE_ID = "flow::root";
const MIN_NODE_SIZE = 10;
const MAX_NODE_SIZE = 30;
const ROOT_NODE_SIZE = 34;
const EVENT_NODE_SIZE = 8;
const MIN_EDGE_WIDTH = 1;
const MAX_EDGE_WIDTH = 7;

export const ROLE_FIELDS = ["owner", "assignee", "administrator", "creator", "modifier"] as const;
export type RoleField = (typeof ROLE_FIELDS)[number];

export const ROLE_FIELD_LABEL: Record<RoleField, string> = {
  owner: "Event Owner",
  assignee: "Current Assignee",
  administrator: "Administrator",
  creator: "Creator",
  modifier: "Modified By",
};

/**
 * Every role gets its own distinct colour. A person is never merged across
 * roles into one node — the same person shows up as a separate, purely
 * coloured occurrence in each branch where they hold a role (e.g. green as
 * Event Owner in one branch, cyan as Current Assignee in another), rather
 * than one node blended or picked to a "dominant" shade.
 */
export const ROLE_COLOR: Record<RoleField, { background: string; border: string; highlight: { background: string; border: string } }> = {
  owner: { background: "#22c55e", border: "#6ee7a0", highlight: { background: "#4ade80", border: "#ffffff" } },
  assignee: { background: "#22d3ee", border: "#67e8f9", highlight: { background: "#67e8f9", border: "#ffffff" } },
  administrator: { background: "#a855f7", border: "#d0a2ff", highlight: { background: "#c084fc", border: "#ffffff" } },
  creator: { background: "#f97316", border: "#fdba74", highlight: { background: "#fb923c", border: "#ffffff" } },
  modifier: { background: "#9aa4b0", border: "#c7ccd3", highlight: { background: "#b4bac2", border: "#ffffff" } },
};

const ROLE_STYLE_BASE = { shape: "diamond", font: NODE_TYPE_STYLE.issue.font };

const MORE_STYLE = {
  shape: "dot",
  color: { background: "#33363c", border: "#5c6066", highlight: { background: "#4a4e56", border: "#ffffff" } },
  font: { color: "#8f96a1", size: 10 },
};

export const SEVERITY_COLOR: Record<Severity, { background: string; border: string; highlight: { background: string; border: string } }> = {
  High: { background: "#ef4444", border: "#ff8585", highlight: { background: "#f87171", border: "#ffffff" } },
  Moderate: { background: "#f5a623", border: "#ffcb70", highlight: { background: "#ffbe52", border: "#ffffff" } },
  Low: { background: "#22c55e", border: "#6ee7a0", highlight: { background: "#4ade80", border: "#ffffff" } },
};

function sizeForCount(count: number, maxCount: number): number {
  if (maxCount <= 0) return MIN_NODE_SIZE;
  const ratio = Math.sqrt(count / maxCount);
  return Math.round(MIN_NODE_SIZE + ratio * (MAX_NODE_SIZE - MIN_NODE_SIZE));
}

function widthForCount(count: number, maxCount: number): number {
  if (maxCount <= 0) return MIN_EDGE_WIDTH;
  const ratio = Math.sqrt(count / maxCount);
  return Math.round((MIN_EDGE_WIDTH + ratio * (MAX_EDGE_WIDTH - MIN_EDGE_WIDTH)) * 10) / 10;
}

function pluralEvents(count: number): string {
  return `${count} matching event${count === 1 ? "" : "s"}`;
}

/**
 * A child entity aggregated across some subset of a parent's events. Colour
 * is resolved purely from which branch/relationship produced this specific
 * bucket — `orgRole` for organisations (owner vs discovery) and `roleField`
 * for people — never from a global lookup across the whole dataset. The
 * same real-world entity can legitimately appear as two separate buckets
 * (and therefore two separate, differently-coloured nodes) when it plays
 * more than one role within the events being counted.
 */
interface ChildBucket {
  entityId: string | null;
  label: string;
  eventIds: string[];
  /** Set when this bucket is an organisation occurrence — which relation produced it. */
  orgRole?: "owner" | "discovery";
  /** Set when this bucket is a person occurrence (role-root or any-role) — which role produced it. */
  roleField?: RoleField;
  /** All roles held by one real person in this scope. Keeps one entity node while preserving role context. */
  roleFields?: RoleField[];
}

/** Issue / Root Cause / Risk Theme / OR Category all pivot on one identically-named EventToNodesEntry field. */
function aggregateByField(
  data: BrainDataModel,
  eventIds: string[],
  field: keyof EventToNodesEntry,
): Map<string, ChildBucket> {
  const buckets = new Map<string, ChildBucket>();
  for (const eventId of eventIds) {
    const roleMap = data.eventToNodes.get(eventId);
    const nodeId = roleMap?.[field];
    if (!nodeId) continue;
    let bucket = buckets.get(nodeId);
    if (!bucket) {
      bucket = { entityId: nodeId, label: data.nodesById.get(nodeId)?.label ?? nodeId, eventIds: [] };
      buckets.set(nodeId, bucket);
    }
    bucket.eventIds.push(eventId);
  }
  return buckets;
}

/**
 * An event carries two organisation roles (owner, discovery). The same
 * organisation can hold both roles across a scope of events, but each role
 * is kept as its own bucket — never merged — so the org can appear as two
 * separate, purely-coloured nodes: full blue where it's the Owner
 * Organisation, full pink where it's the Discovery Organisation.
 */
function aggregateOrganisations(data: BrainDataModel, eventIds: string[]): Map<string, ChildBucket> {
  const buckets = new Map<string, ChildBucket>();
  const roles: Array<{ field: "owner_organisation" | "discovery_organisation"; orgRole: "owner" | "discovery" }> = [
    { field: "owner_organisation", orgRole: "owner" },
    { field: "discovery_organisation", orgRole: "discovery" },
  ];
  for (const { field, orgRole } of roles) {
    for (const [orgId, bucket] of aggregateByField(data, eventIds, field)) {
      buckets.set(`${orgId}::${orgRole}`, { ...bucket, orgRole });
    }
  }
  return buckets;
}

/** For a person root: their own events broken down by which role(s) they hold on each. */
function aggregateRolesForPerson(data: BrainDataModel, eventIds: string[], personId: string): Map<string, ChildBucket> {
  const buckets = new Map<string, ChildBucket>();
  for (const eventId of eventIds) {
    const roleMap = data.eventToNodes.get(eventId);
    if (!roleMap) continue;
    for (const field of ROLE_FIELDS) {
      if (roleMap[field] !== personId) continue;
      let bucket = buckets.get(field);
      if (!bucket) bucket = { entityId: null, label: ROLE_FIELD_LABEL[field]!, eventIds: [], roleField: field };
      bucket.eventIds.push(eventId);
      buckets.set(field, bucket);
    }
  }
  return buckets;
}

/**
 * Any-role person popularity across a scope of events. A person who holds
 * more than one role in this scope produces one bucket per role — each its
 * own separate, purely-coloured node (e.g. green as Event Owner, cyan as
 * Current Assignee) — rather than one node merged or picked to a dominant
 * shade.
 */
function aggregatePeopleAnyRole(data: BrainDataModel, eventIds: string[]): Map<string, ChildBucket> {
  const buckets = new Map<string, ChildBucket>();

  for (const eventId of eventIds) {
    const roleMap = data.eventToNodes.get(eventId);
    if (!roleMap) continue;
    for (const field of ROLE_FIELDS) {
      const personId = roleMap[field];
      if (!personId) continue;

      // A person is one graph entity even when they appear in several
      // workflow roles. Store the role list on that entity instead of
      // creating person::role duplicates.
      const key = personId;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { entityId: personId, label: data.nodesById.get(personId)?.label ?? personId, eventIds: [], roleFields: [] };
        buckets.set(key, bucket);
      }
      if (!bucket.eventIds.includes(eventId)) bucket.eventIds.push(eventId);
      if (!bucket.roleFields!.includes(field)) bucket.roleFields!.push(field);
    }
  }
  return buckets;
}

function childrenForStep(
  data: BrainDataModel,
  step: FlowStep,
  eventIds: string[],
  personRootId: string | null,
): Map<string, ChildBucket> {
  switch (step.kind) {
    case "organisation":
      return aggregateOrganisations(data, eventIds);
    case "role":
      return personRootId ? aggregateRolesForPerson(data, eventIds, personRootId) : new Map();
    case "person":
      return aggregatePeopleAnyRole(data, eventIds);
    default:
      return aggregateByField(data, eventIds, step.kind);
  }
}

/**
 * Resolves a node's shape/colour/font purely from the bucket's own tag —
 * which branch/relationship produced this specific occurrence — never from
 * a global lookup across the dataset. A bucket with no role tag (the root
 * node itself, or an event-sibling link with an unqualified organisation)
 * falls back to the entity type's flat base colour.
 */
function styleFor(
  kind: FlowStepKind,
  bucket: Pick<ChildBucket, "entityId" | "roleField" | "roleFields" | "orgRole">,
): { shape: string; color: unknown; font: unknown } {
  if (kind === "role") {
    const color = bucket.roleField ? ROLE_COLOR[bucket.roleField] : NODE_TYPE_STYLE.issue.color;
    return { ...ROLE_STYLE_BASE, color };
  }
  if (kind === "person") {
    const singleRole = bucket.roleField ?? (bucket.roleFields?.length === 1 ? bucket.roleFields[0] : undefined);
    const color = singleRole ? ROLE_COLOR[singleRole] : NODE_TYPE_STYLE.person.color;
    return { shape: NODE_TYPE_STYLE.person.shape, color, font: NODE_TYPE_STYLE.person.font };
  }
  if (kind === "organisation") {
    const color = bucket.orgRole ? ORGANISATION_ROLE_COLOR[bucket.orgRole] : NODE_TYPE_STYLE.organisation.color;
    return { shape: NODE_TYPE_STYLE.organisation.shape, color, font: NODE_TYPE_STYLE.organisation.font };
  }
  const style = NODE_TYPE_STYLE[kind as NodeType];
  return style ?? NODE_TYPE_STYLE.issue;
}

/**
 * The role a bucket's colour encodes, for the hover tooltip — the legend no
 * longer spells out every role as its own row, so this is where an analyst
 * learns what a given shade means.
 */
function roleLabelFor(kind: FlowStepKind, bucket: Pick<ChildBucket, "orgRole" | "roleField" | "roleFields">): string | null {
  if (kind === "organisation" && bucket.orgRole) return ORGANISATION_ROLE_LABEL[bucket.orgRole];
  if ((kind === "person" || kind === "role") && bucket.roleField) return ROLE_FIELD_LABEL[bucket.roleField];
  if (kind === "person" && bucket.roleFields && bucket.roleFields.length > 0) {
    return bucket.roleFields.map((field) => ROLE_FIELD_LABEL[field]).join(" · ");
  }
  return null;
}

const MAX_LABEL_CHARS = 34;

function truncateLabel(label: string): string {
  if (label.length <= MAX_LABEL_CHARS) return label;
  return `${label.slice(0, MAX_LABEL_CHARS - 1).trimEnd()}…`;
}

/** Organisation names repeat the same "→ Fictional Enterprise Operations" suffix; the prefix is what identifies them. */
function displayLabel(kind: FlowStepKind, rawLabel: string): string {
  let label = rawLabel;
  if (kind === "organisation" || kind === "person") {
    const [primary] = label.split("→");
    label = (primary ?? label).trim();
  }
  if (kind === "issue") {
    const [firstSentence] = label.split(". ");
    label = (firstSentence ?? label).trim();
  }
  return truncateLabel(label);
}

interface ActiveNode {
  id: string;
  entityId: string | null;
  eventIds: string[];
}

/**
 * Builds one flow rooted at `rootId` (or the whole enterprise when null),
 * as a strict left-to-right tree: each column is aggregated only from its
 * own parent's event set, so a node two columns apart from the root is
 * only ever reached through the exact events that connect them — the
 * defining property that keeps every edge traceable back to real Event
 * IDs. Top-N-per-column plus revealable "+more" keeps the default view
 * legible; explicit `level` on every node drives vis-network's
 * hierarchical layout deterministically.
 */
export function buildFlow(data: BrainDataModel, filteredEventIds: Set<string>, flow: FlowUIState): FlowBuildResult {
  const nodes: VisNodeInput[] = [];
  const edges: VisEdgeInput[] = [];
  const notices: string[] = [];
  const columns: FlowColumn[] = [];

  const rootNode = resolveRoot(data, flow.rootId, filteredEventIds);

  if (rootNode.kind === "event") {
    return buildEventSiblingFlow(data, rootNode.entityId!, rootNode.label);
  }

  // The root is a selected entity, not a branch occurrence, so it has no
  // owner/discovery or role tag — styleFor falls back to the flat base
  // colour for its type.
  const rootStyle =
    rootNode.type === "enterprise"
      ? NODE_TYPE_STYLE.enterprise
      : styleFor(rootNode.flowKind, { entityId: rootNode.entityId });

  nodes.push({
    id: ROOT_NODE_ID,
    label: displayLabel(rootNode.flowKind, rootNode.label),
    shape: rootStyle.shape as string,
    color: rootStyle.color as VisNodeInput["color"],
    font: rootStyle.font as VisNodeInput["font"],
    size: ROOT_NODE_SIZE,
    level: 0,
    flowEntityId: rootNode.entityId,
    eventIds: rootNode.eventIds,
    title: `${rootNode.label}\n${pluralEvents(rootNode.eventIds.length)}`,
    widthConstraint: { maximum: 170 },
  });

  if (rootNode.eventIds.length === 0) {
    notices.push("No events for this entity within the current filters.");
    return { nodes, edges, columns, notices, rootNodeId: ROOT_NODE_ID };
  }

  const personRootId = rootNode.type === "person" ? rootNode.entityId : null;
  const chain: FlowStep[] =
    flow.viewMode === "people" && rootNode.type !== "event"
      ? [{ kind: "person", label: "People" }]
      : chainForViewMode(rootNode.type, flow.viewMode);

  let currentLevelParents: ActiveNode[] = [{ id: ROOT_NODE_ID, entityId: rootNode.entityId, eventIds: rootNode.eventIds }];

  chain.forEach((step, stepIndex) => {
    const level = stepIndex + 1;
    columns.push({ level, label: step.label, kind: step.kind });
    const nextLevelParents: ActiveNode[] = [];
    let levelHasMore = false;

    for (const parent of currentLevelParents) {
      const children = childrenForStep(data, step, parent.eventIds, personRootId);
      const ranked = Array.from(children.entries()).sort((a, b) => b[1].eventIds.length - a[1].eventIds.length);
      const revealed = flow.revealedLevels.has(level);
      const visible = revealed ? ranked : ranked.slice(0, FLOW_TOP_N);
      const hidden = revealed ? [] : ranked.slice(FLOW_TOP_N);

      const maxCountThisParent = visible.length > 0 ? visible[0]![1].eventIds.length : 0;

      for (const [childKey, bucket] of visible) {
        const nodeId = `flow::L${level}::${parent.id}::${childKey}`;
        const style = styleFor(step.kind, bucket);
        const roleLabelRaw = roleLabelFor(step.kind, bucket);
        // A person-root's own role buckets are already labelled by role name
        // (e.g. "Event Owner") — only append the role line when it says
        // something the label doesn't already.
        const roleLabel = roleLabelRaw && roleLabelRaw !== bucket.label ? roleLabelRaw : null;
        const badge = bucket.entityId ? evidenceBadge(data, bucket.eventIds, data.nodesById.get(bucket.entityId)?.type ?? "issue") : null;
        nodes.push({
          id: nodeId,
          label: `${displayLabel(step.kind, bucket.label)}${badge ? `\n✦ ${badge}` : ""}`,
          shape: style.shape,
          color: style.color as VisNodeInput["color"],
          font: style.font as VisNodeInput["font"],
          size: sizeForCount(bucket.eventIds.length, maxCountThisParent),
          level,
          flowEntityId: bucket.entityId,
          eventIds: bucket.eventIds,
          title: `${bucket.label}${roleLabel ? `\n${roleLabel}` : ""}${badge ? `\n${badge}` : ""}\n${pluralEvents(bucket.eventIds.length)}`,
          widthConstraint: { maximum: 170 },
        });
        edges.push({
          id: `${nodeId}::edge`,
          from: parent.id,
          to: nodeId,
          width: widthForCount(bucket.eventIds.length, maxCountThisParent),
          color: (style.color as { background: string }).background,
          title: pluralEvents(bucket.eventIds.length),
          eventIds: bucket.eventIds,
        });
        nextLevelParents.push({ id: nodeId, entityId: bucket.entityId, eventIds: bucket.eventIds });
      }

      if (hidden.length > 0) {
        levelHasMore = true;
        const moreCount = hidden.reduce((sum, [, bucket]) => sum + bucket.eventIds.length, 0);
        const moreId = `flow::L${level}::${parent.id}::more`;
        nodes.push({
          id: moreId,
          label: `+${hidden.length} more`,
          shape: MORE_STYLE.shape,
          color: MORE_STYLE.color as VisNodeInput["color"],
          font: MORE_STYLE.font as VisNodeInput["font"],
          size: MIN_NODE_SIZE,
          level,
          flowMore: true,
          eventIds: [],
          title: `${hidden.length} more, ${pluralEvents(moreCount)} in total`,
        });
        edges.push({
          id: `${moreId}::edge`,
          from: parent.id,
          to: moreId,
          width: MIN_EDGE_WIDTH,
          color: "rgba(150,160,175,0.35)",
          dashes: [3, 3],
          eventIds: [],
        });
      }
    }

    if (levelHasMore) {
      notices.push(`${step.label}: top ${FLOW_TOP_N} per branch shown — click "+more" for the rest`);
    }
    currentLevelParents = nextLevelParents;
  });

  if (flow.showEvents && currentLevelParents.length > 0) {
    const level = chain.length + 1;
    columns.push({ level, label: "Events", kind: "event" });
    let anyTruncated = false;

    for (const parent of currentLevelParents) {
      // The most decision-relevant events survive truncation: highest
      // severity first, so a branch with one High event among fifty Lows
      // always shows that High rather than an arbitrary slice.
      const bySeverity = [...parent.eventIds].sort((a, b) => {
        const rank = { High: 0, Moderate: 1, Low: 2 } as const;
        const eventA = data.eventsById.get(a);
        const eventB = data.eventsById.get(b);
        return (rank[eventA?.severity ?? "Low"] ?? 2) - (rank[eventB?.severity ?? "Low"] ?? 2);
      });
      const shown = bySeverity.slice(0, FLOW_MAX_EVENTS_PER_PARENT);
      const hiddenCount = bySeverity.length - shown.length;

      for (const eventId of shown) {
        const nodeId = `flow::L${level}::${parent.id}::${eventId}`;
        const event = data.eventsById.get(eventId);
        const severity = event?.severity ?? "Low";
        // A short, always-visible label: severity initial plus the last 4
        // digits of the ID — enough to spot a High at a glance and to
        // cross-reference the evidence table, without a wall of full IDs.
        const compactLabel = `${severity[0]}·${eventId.slice(-4)}`;
        nodes.push({
          id: nodeId,
          label: compactLabel,
          shape: NODE_TYPE_STYLE.event.shape,
          color: SEVERITY_COLOR[severity],
          font: { color: "#0a0a0a", size: 9 },
          size: EVENT_NODE_SIZE,
          level,
          flowEntityId: `event::${eventId}`,
          eventIds: [eventId],
          title: `${eventId}${event ? `\n${event.severity} · ${event.event_type} · ${event.occurrence_date}` : ""}`,
        });
        edges.push({
          id: `${nodeId}::edge`,
          from: parent.id,
          to: nodeId,
          width: MIN_EDGE_WIDTH,
          color: SEVERITY_COLOR[severity].background,
          eventIds: [eventId],
        });
      }
      if (hiddenCount > 0) {
        anyTruncated = true;
        const moreId = `flow::L${level}::${parent.id}::more`;
        nodes.push({
          id: moreId,
          label: `+${hiddenCount} more`,
          shape: MORE_STYLE.shape,
          color: MORE_STYLE.color as VisNodeInput["color"],
          font: MORE_STYLE.font as VisNodeInput["font"],
          size: MIN_NODE_SIZE,
          level,
          flowMore: true,
          eventIds: [],
          title: `${hiddenCount} more matching events`,
        });
        edges.push({
          id: `${moreId}::edge`,
          from: parent.id,
          to: moreId,
          width: MIN_EDGE_WIDTH,
          color: "rgba(150,160,175,0.35)",
          dashes: [3, 3],
          eventIds: [],
        });
      }
    }
    if (anyTruncated) {
      notices.push(`Events: highest severity ${FLOW_MAX_EVENTS_PER_PARENT} per branch shown — click "+more" for the rest`);
    }
  }

  return { nodes, edges, columns, notices, rootNodeId: ROOT_NODE_ID };
}

interface ResolvedRoot {
  kind: "entity" | "event";
  type: NodeType;
  flowKind: FlowStepKind;
  entityId: string | null;
  label: string;
  eventIds: string[];
}

function resolveRoot(data: BrainDataModel, rootId: string | null, filteredEventIds: Set<string>): ResolvedRoot {
  if (rootId === null) {
    return {
      kind: "entity",
      type: "enterprise",
      flowKind: "organisation",
      entityId: data.enterpriseId,
      label: data.enterpriseName,
      eventIds: Array.from(filteredEventIds),
    };
  }
  const node = data.nodesById.get(rootId);
  if (!node) {
    return { kind: "entity", type: "enterprise", flowKind: "organisation", entityId: null, label: "Unknown", eventIds: [] };
  }
  if (node.type === "event") {
    return { kind: "event", type: "event", flowKind: "organisation", entityId: rootId, label: node.label, eventIds: [] };
  }
  return {
    kind: "entity",
    type: node.type,
    flowKind: node.type as FlowStepKind,
    entityId: rootId,
    label: node.label,
    eventIds: matchingEventIdsForNode(data, rootId, filteredEventIds),
  };
}

/**
 * An Event is a single record, not an aggregate — there is nothing to
 * rank or truncate. Its flow is simply the record's own direct links,
 * shown as siblings, each with count 1. Full detail lives in the
 * inspector; this view exists only to orient the analyst spatially.
 */
function buildEventSiblingFlow(data: BrainDataModel, eventNodeId: string, label: string): FlowBuildResult {
  const rawEventId = eventNodeId.startsWith("event::") ? eventNodeId.slice("event::".length) : eventNodeId;
  const nodes: VisNodeInput[] = [
    {
      id: ROOT_NODE_ID,
      label: truncateLabel(rawEventId),
      shape: NODE_TYPE_STYLE.event.shape,
      color: NODE_TYPE_STYLE.event.color,
      font: NODE_TYPE_STYLE.event.font,
      size: ROOT_NODE_SIZE,
      level: 0,
      flowEntityId: eventNodeId,
      eventIds: [rawEventId],
      title: label,
    },
  ];
  const edges: VisEdgeInput[] = [];
  const roleMap = data.eventToNodes.get(rawEventId);

  if (roleMap) {
    const links: Array<{ field: keyof EventToNodesEntry; kind: FlowStepKind; suffix: string; orgRole?: "owner" | "discovery" }> = [
      { field: "owner_organisation", kind: "organisation", suffix: "owner", orgRole: "owner" },
      { field: "discovery_organisation", kind: "organisation", suffix: "discovery", orgRole: "discovery" },
      { field: "issue", kind: "issue", suffix: "issue" },
      { field: "root_cause", kind: "root_cause", suffix: "rootcause" },
      { field: "risk_theme", kind: "risk_theme", suffix: "theme" },
      { field: "or_category", kind: "or_category", suffix: "category" },
    ];
    for (const link of links) {
      const targetId = roleMap[link.field];
      if (!targetId) continue;
      const targetNode = data.nodesById.get(targetId);
      const style = styleFor(link.kind, { entityId: targetId, orgRole: link.orgRole });
      const roleLabel = link.orgRole ? ORGANISATION_ROLE_LABEL[link.orgRole] : null;
      const nodeId = `flow::L1::${link.suffix}`;
      nodes.push({
        id: nodeId,
        label: displayLabel(link.kind, targetNode?.label ?? targetId),
        shape: style.shape,
        color: style.color as VisNodeInput["color"],
        font: style.font as VisNodeInput["font"],
        size: MAX_NODE_SIZE,
        level: 1,
        flowEntityId: targetId,
        eventIds: [rawEventId],
        title: `${targetNode?.label ?? targetId}${roleLabel ? `\n${roleLabel}` : ""}`,
        widthConstraint: { maximum: 170 },
      });
      edges.push({
        id: `${nodeId}::edge`,
        from: ROOT_NODE_ID,
        to: nodeId,
        width: 2,
        color: (style.color as { background: string }).background,
        eventIds: [rawEventId],
      });
    }
  }

  return {
    nodes,
    edges,
    columns: [{ level: 1, label: "Direct links", kind: "organisation" }],
    notices: [],
    rootNodeId: ROOT_NODE_ID,
  };
}
