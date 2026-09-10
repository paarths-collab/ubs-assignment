import type { BrainDataModel } from "./types";
import { shortOrgName } from "./search";

export interface AnalyticsCallbacks {
  onSelectEntity: (nodeId: string) => void;
}

interface AnalyticsTargets {
  orgs: HTMLElement;
  issues: HTMLElement;
  people: HTMLElement;
}

interface BarDatum {
  nodeId: string;
  shortLabel: string;
  fullLabel: string;
  count: number;
}

const TOP_N = 8;
const MAX_LABEL_LENGTH = 28;

/** The five per-event role fields, in the order counted for the "top people" panel. */
const PEOPLE_ROLE_KEYS = ["owner", "assignee", "administrator", "creator", "modifier"] as const;
type PeopleRoleKey = (typeof PEOPLE_ROLE_KEYS)[number];

const PEOPLE_ROLE_SUFFIX: Record<PeopleRoleKey, string> = {
  owner: "owner",
  assignee: "assignee",
  administrator: "administrator",
  creator: "creator",
  modifier: "modified by",
};

function truncate(label: string, max = MAX_LABEL_LENGTH): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

function resolveEventIds(eventIds: Set<string> | string[]): string[] {
  return Array.isArray(eventIds) ? eventIds : Array.from(eventIds);
}

function topEntries(counts: Map<string, number>, n: number): Array<{ id: string; count: number }> {
  return [...counts.entries()]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))
    .slice(0, n);
}

function computeOrgCounts(data: BrainDataModel, eventIds: string[]): BarDatum[] {
  const counts = new Map<string, number>();
  for (const eventId of eventIds) {
    const nodeId = data.eventToNodes.get(eventId)?.owner_organisation;
    if (!nodeId) continue;
    counts.set(nodeId, (counts.get(nodeId) ?? 0) + 1);
  }
  return topEntries(counts, TOP_N).map(({ id, count }) => {
    const label = data.nodesById.get(id)?.label ?? id;
    const shortLabel = shortOrgName(label);
    return { nodeId: id, shortLabel: truncate(shortLabel), fullLabel: label, count };
  });
}

function computeIssueCounts(data: BrainDataModel, eventIds: string[]): BarDatum[] {
  const counts = new Map<string, number>();
  for (const eventId of eventIds) {
    const nodeId = data.eventToNodes.get(eventId)?.issue;
    if (!nodeId) continue;
    counts.set(nodeId, (counts.get(nodeId) ?? 0) + 1);
  }
  return topEntries(counts, TOP_N).map(({ id, count }) => {
    const label = data.nodesById.get(id)?.label ?? id;
    return { nodeId: id, shortLabel: truncate(label), fullLabel: label, count };
  });
}

/**
 * Counts each event once per person regardless of how many roles they hold
 * on it, across all five role fields. The label gets a "(role)" suffix
 * naming whichever role most often produced this person's appearances, so
 * similarly-named people stay distinguishable without opening each one.
 */
function computePeopleCounts(data: BrainDataModel, eventIds: string[]): BarDatum[] {
  const eventsByPerson = new Map<string, Set<string>>();
  const roleCountsByPerson = new Map<string, Map<PeopleRoleKey, number>>();

  for (const eventId of eventIds) {
    const entry = data.eventToNodes.get(eventId);
    if (!entry) continue;
    for (const roleKey of PEOPLE_ROLE_KEYS) {
      const nodeId = entry[roleKey];
      if (!nodeId) continue;

      let events = eventsByPerson.get(nodeId);
      if (!events) {
        events = new Set<string>();
        eventsByPerson.set(nodeId, events);
      }
      events.add(eventId);

      let roleCounts = roleCountsByPerson.get(nodeId);
      if (!roleCounts) {
        roleCounts = new Map<PeopleRoleKey, number>();
        roleCountsByPerson.set(nodeId, roleCounts);
      }
      roleCounts.set(roleKey, (roleCounts.get(roleKey) ?? 0) + 1);
    }
  }

  const counts = new Map<string, number>();
  for (const [nodeId, events] of eventsByPerson) counts.set(nodeId, events.size);

  return topEntries(counts, TOP_N).map(({ id, count }) => {
    const baseLabel = data.nodesById.get(id)?.label ?? id;
    const roleCounts = roleCountsByPerson.get(id);
    let topRole: PeopleRoleKey | null = null;
    let topRoleCount = 0;
    if (roleCounts) {
      for (const [role, roleCount] of roleCounts) {
        if (roleCount > topRoleCount) {
          topRole = role;
          topRoleCount = roleCount;
        }
      }
    }
    const fullLabel = topRole ? `${baseLabel} (${PEOPLE_ROLE_SUFFIX[topRole]})` : baseLabel;
    return { nodeId: id, shortLabel: truncate(fullLabel), fullLabel, count };
  });
}

function renderBarChart(container: HTMLElement, items: BarDatum[], onSelectEntity: (nodeId: string) => void): void {
  container.replaceChildren();

  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No data in the current scope.";
    container.appendChild(empty);
    return;
  }

  const maxCount = items.reduce((max, item) => Math.max(max, item.count), 0);

  for (const item of items) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "bar-row";
    row.dataset.nodeId = item.nodeId;

    const label = document.createElement("span");
    label.className = "bar-label";
    label.title = item.fullLabel;
    label.textContent = item.shortLabel;

    const track = document.createElement("div");
    track.className = "bar-track";
    const fill = document.createElement("div");
    fill.className = "bar-fill";
    fill.style.width = `${maxCount > 0 ? (item.count / maxCount) * 100 : 0}%`;
    track.appendChild(fill);

    const count = document.createElement("span");
    count.className = "bar-count";
    count.textContent = String(item.count);

    row.append(label, track, count);
    row.addEventListener("click", () => onSelectEntity(item.nodeId));
    container.appendChild(row);
  }
}

/**
 * Renders the three "top N" horizontal bar-chart panels (organisations,
 * issues, people) for the given event scope. Pure re-render — callers call
 * this again whenever the effective scope changes (filters, priority chip,
 * root selection); it always clears and rebuilds each target from scratch.
 */
export function renderScopeAnalytics(
  data: BrainDataModel,
  eventIds: Set<string> | string[],
  targets: AnalyticsTargets,
  callbacks: AnalyticsCallbacks,
): void {
  const ids = resolveEventIds(eventIds);
  renderBarChart(targets.orgs, computeOrgCounts(data, ids), callbacks.onSelectEntity);
  renderBarChart(targets.issues, computeIssueCounts(data, ids), callbacks.onSelectEntity);
  renderBarChart(targets.people, computePeopleCounts(data, ids), callbacks.onSelectEntity);
}
