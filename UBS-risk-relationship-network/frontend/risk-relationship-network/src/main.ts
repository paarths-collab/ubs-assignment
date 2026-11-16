import "vis-network/styles/vis-network.css";
import "./styles/app.css";

import { loadBrainData } from "./data-loader";
import { computeFilteredEventIds } from "./filter-engine";
import { createEmptyFilterState, createInitialAppState, createInitialExpansionState } from "./app-state";
import type { AppState, ExpansionState, FilterState } from "./app-state";
import { Store } from "./store";
import { searchEntities } from "./search";
import { buildGraph } from "./graph-builder";
import { GraphEngine } from "./graph-engine";
import { matchingEventIdsForNode } from "./scope";
import { NODE_TYPE_LABEL, NODE_TYPE_STYLE } from "./graph-styles";
import { renderInspector } from "./inspector";
import { createInitialTableState, renderEventTable } from "./event-table";
import type { EventTableState } from "./event-table";
import { countActiveFilters, renderFilterPanel } from "./filter-panel";
import { FILTER_DEBOUNCE_MS } from "./graph-config";
import { AiRequestError, requestAnalysis } from "./ai-client";
import { renderAiMessage, renderAiResult } from "./ai-panel";
import type { NodeType } from "./types";

const appRoot = document.querySelector<HTMLDivElement>("#app");
if (!appRoot) throw new Error("Missing #app root element");

const data = loadBrainData();
const store = new Store<AppState>(createInitialAppState(computeFilteredEventIds(data, createEmptyFilterState())));
let tableState: EventTableState = createInitialTableState();

appRoot.innerHTML = `
  <header class="app-header">
    <h1>Risk Relationship Network</h1>
    <span class="synthetic-badge">Synthetic / Training Data</span>
    <div class="search-box">
      <input type="text" id="search-input" placeholder="Search event, person, organisation, issue, root cause…" aria-label="Search risk entities" autocomplete="off" />
      <div class="search-results" id="search-results" hidden></div>
    </div>
    <span class="scope-badge" id="scope-badge"></span>
    <button type="button" id="btn-clear-filters" class="ghost-button">Clear filters</button>
  </header>
  <div class="app-body">
    <aside class="filter-panel" aria-label="Filters">
      <h2>Filters</h2>
      <div id="filter-groups"></div>
      <h2>Legend</h2>
      <div id="legend-nodes"></div>
      <div class="legend-item"><span class="legend-line solid"></span>Direct role</div>
      <div class="legend-item"><span class="legend-line dashed"></span>Discovery organisation</div>
      <div class="legend-item"><span class="legend-line dotted"></span>Derived aggregate</div>
    </aside>
    <section class="graph-panel">
      <div class="graph-toolbar" role="toolbar" aria-label="Graph controls">
        <button id="btn-expand" type="button" disabled>Expand</button>
        <button id="btn-expand-events" type="button" disabled>Expand events</button>
        <button id="btn-collapse" type="button" disabled>Collapse</button>
        <button id="btn-reset" type="button">Reset</button>
        <button id="btn-fit" type="button">Fit</button>
        <button id="btn-physics" type="button" aria-pressed="false">Physics: off</button>
        <label class="toolbar-toggle"><input type="checkbox" id="chk-advanced" /> Admin roles</label>
      </div>
      <div class="graph-canvas" id="graph-canvas" role="img" aria-label="Risk relationship graph"></div>
      <div class="graph-notices" id="graph-notices" role="status" aria-live="polite" hidden></div>
    </section>
    <aside class="inspector-panel" aria-label="Selected entity inspector">
      <h2>Inspector</h2>
      <div id="inspector-content" class="empty-state">Select a node or search result to inspect it.</div>
      <h2>AI investigation</h2>
      <div class="ai-controls">
        <input type="text" id="ai-question" placeholder="Optional question for the analyst assistant…" aria-label="Question for AI analysis" maxlength="500" />
        <button type="button" id="btn-analyse">Analyse this investigation</button>
      </div>
      <div id="ai-result" class="ai-result" role="status" aria-live="polite">
        <p class="empty-state">Analysis runs on request, over the current investigation scope.</p>
      </div>
    </aside>
  </div>
  <section class="evidence-panel" aria-label="Matching events">
    <div class="evidence-header">
      <h2 id="evidence-title">Matching events</h2>
      <button type="button" id="btn-clear-node-scope" class="ghost-button" hidden>Show all filtered events</button>
    </div>
    <div id="event-table"></div>
  </section>
`;

const legendContainer = document.querySelector<HTMLDivElement>("#legend-nodes")!;
for (const type of Object.keys(NODE_TYPE_STYLE) as NodeType[]) {
  const swatch = document.createElement("span");
  swatch.className = "legend-swatch";
  swatch.style.background = String(NODE_TYPE_STYLE[type].color.background);
  const row = document.createElement("div");
  row.className = "legend-item";
  row.append(swatch, document.createTextNode(NODE_TYPE_LABEL[type]));
  legendContainer.appendChild(row);
}

const graphEngine = new GraphEngine();
graphEngine.mount(document.querySelector<HTMLDivElement>("#graph-canvas")!);

const scopeBadge = document.querySelector<HTMLSpanElement>("#scope-badge")!;
const noticesEl = document.querySelector<HTMLDivElement>("#graph-notices")!;
const inspectorEl = document.querySelector<HTMLDivElement>("#inspector-content")!;
const filterGroupsEl = document.querySelector<HTMLDivElement>("#filter-groups")!;
const eventTableEl = document.querySelector<HTMLDivElement>("#event-table")!;
const evidenceTitle = document.querySelector<HTMLHeadingElement>("#evidence-title")!;
const btnClearNodeScope = document.querySelector<HTMLButtonElement>("#btn-clear-node-scope")!;
const searchInput = document.querySelector<HTMLInputElement>("#search-input")!;
const searchResultsEl = document.querySelector<HTMLDivElement>("#search-results")!;

const btnExpand = document.querySelector<HTMLButtonElement>("#btn-expand")!;
const btnExpandEvents = document.querySelector<HTMLButtonElement>("#btn-expand-events")!;
const btnCollapse = document.querySelector<HTMLButtonElement>("#btn-collapse")!;
const btnReset = document.querySelector<HTMLButtonElement>("#btn-reset")!;
const btnFit = document.querySelector<HTMLButtonElement>("#btn-fit")!;
const btnPhysics = document.querySelector<HTMLButtonElement>("#btn-physics")!;
const chkAdvanced = document.querySelector<HTMLInputElement>("#chk-advanced")!;
const btnClearFilters = document.querySelector<HTMLButtonElement>("#btn-clear-filters")!;

/** The exact event set the evidence table shows: the selected node's events, else the whole filtered scope. */
function currentTableEventIds(state: AppState): string[] {
  if (state.selection.nodeId) {
    return matchingEventIdsForNode(data, state.selection.nodeId, state.filteredEventIds);
  }
  return Array.from(state.filteredEventIds);
}

function renderScopeBadge(): void {
  const state = store.getState();
  const activeCount = countActiveFilters(state.filters);
  scopeBadge.textContent = `${state.filteredEventIds.size} of ${data.eventsById.size} events · ${activeCount} filter${activeCount === 1 ? "" : "s"} active`;
}

function renderGraph(): void {
  const state = store.getState();
  const result = buildGraph(data, state.filteredEventIds, state.graph.expansion);
  graphEngine.setGraph(result);

  noticesEl.hidden = result.notices.length === 0;
  noticesEl.textContent = result.notices.join(" ");
}

function renderTable(): void {
  const state = store.getState();
  const eventIds = currentTableEventIds(state);
  const selectedNode = state.selection.nodeId ? data.nodesById.get(state.selection.nodeId) : null;

  evidenceTitle.textContent = selectedNode ? `Matching events · ${selectedNode.label}` : "Matching events";
  btnClearNodeScope.hidden = selectedNode === null;

  renderEventTable(eventTableEl, data, eventIds, tableState, {
    onOpenEvent: (eventId) => selectNode(`event::${eventId}`),
    onStateChange: (next) => {
      tableState = next;
      renderTable();
    },
  });
}

function renderInspectorPanel(): void {
  const state = store.getState();
  renderInspector(inspectorEl, data, state.selection.nodeId, state.filteredEventIds, {
    onSelectNode: selectNode,
    onOpenEvent: (eventId) => selectNode(`event::${eventId}`),
  });
}

function updateToolbarState(): void {
  const { selection, graph } = store.getState();
  const nodeId = selection.nodeId;
  btnExpand.disabled = nodeId === null;
  btnExpandEvents.disabled = nodeId === null;
  btnCollapse.disabled =
    nodeId === null || !(graph.expansion.neighbourExpanded.has(nodeId) || graph.expansion.eventsExpanded.has(nodeId));
}

function selectNode(nodeId: string | null): void {
  const previous = store.getState().selection.nodeId;
  store.setState((state) => ({ ...state, selection: { nodeId, eventId: null } }));
  if (nodeId !== previous) tableState = createInitialTableState();

  // A node reached from the table or the inspector may not be in the graph
  // yet; expanding it guarantees focus lands on a real node.
  if (nodeId && !graphEngine.hasNode(nodeId)) {
    applyExpansion((expansion) => expansion.neighbourExpanded.add(nodeId));
  }

  renderInspectorPanel();
  renderTable();
  updateToolbarState();
  if (nodeId !== previous) invalidateAnalysis();
  if (nodeId) graphEngine.focusNode(nodeId);
}

function applyExpansion(mutate: (expansion: ExpansionState) => void): void {
  store.setState((state) => {
    const expansion: ExpansionState = {
      neighbourExpanded: new Set(state.graph.expansion.neighbourExpanded),
      eventsExpanded: new Set(state.graph.expansion.eventsExpanded),
      showAdvancedRoles: state.graph.expansion.showAdvancedRoles,
    };
    mutate(expansion);
    return { ...state, graph: { ...state.graph, expansion } };
  });
  renderGraph();
  updateToolbarState();
}

function applyFilters(next: FilterState): void {
  store.setState((state) => ({ ...state, filters: next, filteredEventIds: computeFilteredEventIds(data, next) }));

  // A selection that the new scope no longer supports must not linger.
  const state = store.getState();
  if (state.selection.nodeId && matchingEventIdsForNode(data, state.selection.nodeId, state.filteredEventIds).length === 0) {
    store.setState((current) => ({ ...current, selection: { nodeId: null, eventId: null } }));
  }

  tableState = createInitialTableState();
  renderScopeBadge();
  renderFilters();
  renderGraph();
  renderInspectorPanel();
  renderTable();
  updateToolbarState();
  invalidateAnalysis();
}

let filterDebounce: ReturnType<typeof setTimeout> | undefined;
function renderFilters(): void {
  renderFilterPanel(filterGroupsEl, data, store.getState().filters, {
    onChange: (next) => {
      clearTimeout(filterDebounce);
      filterDebounce = setTimeout(() => applyFilters(next), FILTER_DEBOUNCE_MS);
    },
  });
}

graphEngine.onSelectNode(selectNode);
graphEngine.onDoubleClickNode((nodeId) => {
  selectNode(nodeId);
  applyExpansion((expansion) => expansion.eventsExpanded.add(nodeId));
});

btnExpand.addEventListener("click", () => {
  const nodeId = store.getState().selection.nodeId;
  if (nodeId) applyExpansion((expansion) => expansion.neighbourExpanded.add(nodeId));
});

btnExpandEvents.addEventListener("click", () => {
  const nodeId = store.getState().selection.nodeId;
  if (nodeId) applyExpansion((expansion) => expansion.eventsExpanded.add(nodeId));
});

btnCollapse.addEventListener("click", () => {
  const nodeId = store.getState().selection.nodeId;
  if (!nodeId) return;
  applyExpansion((expansion) => {
    expansion.neighbourExpanded.delete(nodeId);
    expansion.eventsExpanded.delete(nodeId);
  });
});

btnReset.addEventListener("click", () => {
  store.setState((state) => ({
    ...state,
    selection: { nodeId: null, eventId: null },
    graph: { ...state.graph, expansion: createInitialExpansionState() },
  }));
  chkAdvanced.checked = false;
  tableState = createInitialTableState();
  renderGraph();
  renderInspectorPanel();
  renderTable();
  updateToolbarState();
  graphEngine.fit();
});

btnFit.addEventListener("click", () => graphEngine.fit());

btnPhysics.addEventListener("click", () => {
  const enabled = !graphEngine.isPhysicsEnabled();
  graphEngine.setPhysicsEnabled(enabled);
  btnPhysics.textContent = `Physics: ${enabled ? "on" : "off"}`;
  btnPhysics.setAttribute("aria-pressed", String(enabled));
});

chkAdvanced.addEventListener("change", () => {
  applyExpansion((expansion) => {
    expansion.showAdvancedRoles = chkAdvanced.checked;
  });
});

btnClearFilters.addEventListener("click", () => applyFilters(createEmptyFilterState()));
btnClearNodeScope.addEventListener("click", () => selectNode(null));

// --- AI investigation ------------------------------------------------------
const aiResultEl = document.querySelector<HTMLDivElement>("#ai-result")!;
const aiQuestionEl = document.querySelector<HTMLInputElement>("#ai-question")!;
const btnAnalyse = document.querySelector<HTMLButtonElement>("#btn-analyse")!;

let aiController: AbortController | null = null;
/** Monotonic sequence so a response for a superseded scope can never render. */
let aiRequestSequence = 0;

async function runAnalysis(): Promise<void> {
  const state = store.getState();
  const eventIds = currentTableEventIds(state);

  if (eventIds.length === 0) {
    renderAiMessage(aiResultEl, "No events in the current scope to analyse.", "info");
    return;
  }

  aiController?.abort();
  aiController = new AbortController();
  const sequence = ++aiRequestSequence;

  btnAnalyse.disabled = true;
  btnAnalyse.textContent = "Analysing…";
  renderAiMessage(aiResultEl, "Analysing the current investigation scope…", "info");

  try {
    const result = await requestAnalysis(
      {
        selectedNodeId: state.selection.nodeId,
        eventIds,
        question: aiQuestionEl.value.trim() || undefined,
      },
      aiController.signal,
    );

    if (sequence !== aiRequestSequence) return; // scope moved on; discard
    renderAiResult(aiResultEl, result, (eventId) => selectNode(`event::${eventId}`));
    aiHasContent = true;
    aiController = null;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    if (sequence !== aiRequestSequence) return;

    const message =
      error instanceof AiRequestError
        ? error.message
        : "AI analysis is unavailable. Deterministic investigation tools remain available.";
    renderAiMessage(aiResultEl, message, "error");
  } finally {
    if (sequence === aiRequestSequence) {
      btnAnalyse.disabled = false;
      btnAnalyse.textContent = "Analyse this investigation";
    }
  }
}

btnAnalyse.addEventListener("click", () => void runAnalysis());

let aiHasContent = false;

/** Any scope change invalidates an in-flight analysis and the result on screen. */
function invalidateAnalysis(): void {
  const wasInFlight = aiController !== null;
  if (aiController) {
    aiController.abort();
    aiController = null;
  }
  aiRequestSequence += 1;
  btnAnalyse.disabled = false;
  btnAnalyse.textContent = "Analyse this investigation";

  if (aiHasContent || wasInFlight) {
    renderAiMessage(aiResultEl, "Scope changed — run the analysis again for this view.", "info");
    aiHasContent = false;
  }
}

function renderSearchResults(query: string): void {
  if (query.trim().length === 0) {
    searchResultsEl.hidden = true;
    searchResultsEl.replaceChildren();
    return;
  }
  const state = store.getState();
  const results = searchEntities(data, state.filteredEventIds, query);
  searchResultsEl.replaceChildren();
  searchResultsEl.hidden = false;

  if (results.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state search-empty";
    empty.textContent = "No matching entity found.";
    searchResultsEl.appendChild(empty);
    return;
  }

  for (const result of results) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `search-result${result.activeInScope ? "" : " out-of-scope"}`;
    button.dataset.nodeId = result.entry.id;

    const label = document.createElement("span");
    label.textContent = result.entry.label;
    const tag = document.createElement("span");
    tag.className = "type-tag";
    tag.textContent = result.activeInScope
      ? NODE_TYPE_LABEL[result.entry.type]
      : `${NODE_TYPE_LABEL[result.entry.type]} · outside filters`;

    button.append(label, tag);
    searchResultsEl.appendChild(button);
  }
}

let searchDebounce: ReturnType<typeof setTimeout> | undefined;
searchInput.addEventListener("input", () => {
  clearTimeout(searchDebounce);
  const value = searchInput.value;
  searchDebounce = setTimeout(() => renderSearchResults(value), FILTER_DEBOUNCE_MS);
});

searchResultsEl.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-node-id]");
  if (!button?.dataset.nodeId) return;
  selectNode(button.dataset.nodeId);
  searchResultsEl.hidden = true;
  searchInput.value = "";
});

document.addEventListener("click", (event) => {
  if (!(event.target instanceof Node)) return;
  if (!searchResultsEl.contains(event.target) && event.target !== searchInput) {
    searchResultsEl.hidden = true;
  }
});

renderScopeBadge();
renderFilters();
renderGraph();
renderInspectorPanel();
renderTable();
updateToolbarState();

// The graph container is sized by CSS grid after this script runs; wait for
// a completed layout pass before asking vis-network to fit the view.
requestAnimationFrame(() => requestAnimationFrame(() => graphEngine.fit()));
