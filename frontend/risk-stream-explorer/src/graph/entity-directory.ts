import type { BrainDataModel, BrainNode, NodeType } from "./types";
import { shortOrgName } from "./search";

/**
 * Left-sidebar entity directory: three tabs (People, Organisations, Issues),
 * a filter input, and a scrollable list. Clicking a name re-roots the graph
 * on that entity via `callbacks.onSelectEntity`. Ordering is by event count
 * within the current filtered scope — busiest first — so the top of the
 * list always reflects where the current investigation's mass sits.
 */
export type EntityDirectoryTab = "people" | "orgs" | "issues";

export interface EntityDirectoryCallbacks {
  onSelectEntity: (nodeId: string) => void;
}

export interface EntityDirectoryState {
  tab: EntityDirectoryTab;
  query: string;
}

export function createInitialDirectoryState(): EntityDirectoryState {
  return { tab: "people", query: "" };
}

interface Row {
  nodeId: string;
  label: string;
  count: number;
}

function countEventsPerNode(
  data: BrainDataModel,
  eventIds: Set<string>,
  nodeIds: readonly string[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const nodeId of nodeIds) {
    const events = data.nodeToEvents.get(nodeId) ?? [];
    let n = 0;
    for (const eventId of events) if (eventIds.has(eventId)) n += 1;
    if (n > 0) counts.set(nodeId, n);
  }
  return counts;
}

function displayLabel(node: BrainNode | undefined, fallback: string): string {
  if (!node) return fallback;
  if (node.type === "organisation") return shortOrgName(node.label);
  return node.label;
}

function rowsFor(
  data: BrainDataModel,
  eventIds: Set<string>,
  type: NodeType,
): Row[] {
  const ids = data.nodesByType.get(type) ?? [];
  const counts = countEventsPerNode(data, eventIds, ids);
  const rows: Row[] = [];
  for (const [nodeId, count] of counts) {
    const node = data.nodesById.get(nodeId);
    rows.push({ nodeId, label: displayLabel(node, nodeId), count });
  }
  rows.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return rows;
}

export function renderEntityDirectory(
  container: HTMLElement,
  data: BrainDataModel,
  eventIds: Set<string>,
  state: EntityDirectoryState,
  callbacks: EntityDirectoryCallbacks,
): void {
  container.replaceChildren();

  // Tab strip
  const tabs = document.createElement("div");
  tabs.className = "directory-tabs";
  const tabDefs: Array<{ id: EntityDirectoryTab; label: string }> = [
    { id: "people", label: "People" },
    { id: "orgs", label: "Organisations" },
    { id: "issues", label: "Issues" },
  ];
  for (const def of tabDefs) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "directory-tab" + (state.tab === def.id ? " active" : "");
    btn.textContent = def.label;
    btn.dataset.tab = def.id;
    tabs.appendChild(btn);
  }
  container.appendChild(tabs);

  // Filter input
  const filter = document.createElement("input");
  filter.type = "search";
  filter.className = "directory-filter";
  filter.placeholder = "Filter…";
  filter.value = state.query;
  filter.setAttribute("aria-label", "Filter directory");
  container.appendChild(filter);

  // The list itself
  const list = document.createElement("div");
  list.className = "directory-list";
  container.appendChild(list);

  const nodeType: NodeType =
    state.tab === "people" ? "person" : state.tab === "orgs" ? "organisation" : "issue";
  const rows = rowsFor(data, eventIds, nodeType);
  const query = state.query.trim().toLowerCase();
  const filtered = query.length === 0 ? rows : rows.filter((r) => r.label.toLowerCase().includes(query));

  if (filtered.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No entries in the current scope.";
    list.appendChild(empty);
    return;
  }

  for (const row of filtered) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "directory-item";
    btn.dataset.nodeId = row.nodeId;
    const label = document.createElement("span");
    label.className = "directory-item-label";
    label.textContent = row.label;
    label.title = row.label;
    const count = document.createElement("span");
    count.className = "directory-item-count";
    count.textContent = String(row.count);
    btn.append(label, count);
    list.appendChild(btn);
  }

  // Delegated handlers — one listener per rerender, tearing down cleanly.
  tabs.addEventListener("click", (event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>("button.directory-tab");
    const next = btn?.dataset.tab as EntityDirectoryTab | undefined;
    if (!next || next === state.tab) return;
    renderEntityDirectory(container, data, eventIds, { ...state, tab: next }, callbacks);
  });

  filter.addEventListener("input", () => {
    renderEntityDirectory(container, data, eventIds, { ...state, query: filter.value }, callbacks);
    const refocus = container.querySelector<HTMLInputElement>(".directory-filter");
    if (refocus) {
      refocus.focus();
      refocus.setSelectionRange(refocus.value.length, refocus.value.length);
    }
  });

  list.addEventListener("click", (event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>("button.directory-item");
    if (!btn?.dataset.nodeId) return;
    callbacks.onSelectEntity(btn.dataset.nodeId);
  });
}
