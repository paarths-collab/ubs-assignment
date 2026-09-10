import "vis-network/styles/vis-network.css";
import "./styles/app.css";
import "./styles/flow.css";

import { loadBrainData } from "./data-loader";
import { computeFilteredEventIds } from "./filter-engine";
import { createEmptyFilterState, createInitialAppState } from "./app-state";
import type { AppState, BreadcrumbEntry, FilterState } from "./app-state";
import { Store } from "./store";
import { searchEntities, shortOrgName } from "./search";
import type { SearchResult } from "./search";
import { buildFlow, createInitialFlowState, SEVERITY_COLOR } from "./flow-builder";
import type { FlowBuildResult, FlowUIState } from "./flow-builder";
import { FLOW_TOP_N, flowTemplate } from "./flow-model";
import type { FlowStepKind, FlowTemplateId } from "./flow-model";
import { renderBreadcrumb } from "./flow-breadcrumb";
import { renderFlowControls } from "./flow-controls";
import type { FlowViewMode } from "./flow-controls";
import { GraphEngine } from "./graph-engine";
import { matchingEventIdsForNode } from "./scope";
import { NODE_TYPE_LABEL, NODE_TYPE_STYLE } from "./graph-styles";
import { legendGlyph } from "./legend-glyph";
import { renderInspector } from "./inspector";
import { createInitialTableState, renderEventTable } from "./event-table";
import type { EventTableState } from "./event-table";
import { countActiveFilters, renderFilterPanel } from "./filter-panel";
import { FILTER_DEBOUNCE_MS, SEARCH_DEBOUNCE_MS } from "./graph-config";
import { AiRequestError, requestAnalysis } from "./ai-client";
import { renderAiMessage, renderAiResult } from "./ai-panel";
import { renderScopeAnalytics } from "./analytics-panel";
import { createInitialDirectoryState, renderEntityDirectory } from "./entity-directory";
import type { EntityDirectoryState } from "./entity-directory";
import type { NodeType, Severity } from "./types";
import { computePriorityFlows } from "./priority-flows";
import type { PriorityFlow, PriorityFlowId } from "./priority-flows";

/** Singular noun for the "showing top N ___ connections" phrase — the column labels themselves are plural headers. */
const SINGULAR_STEP_LABEL: Record<FlowStepKind, string> = {
  organisation: "organisation",
  issue: "issue",
  root_cause: "root cause",
  risk_theme: "risk theme",
  or_category: "OR category",
  role: "role",
  person: "person",
  event: "event",
};

const AI_WHY_QUESTION =
  "Explain why this priority flow needs attention. What stands out, which entities are involved, and where should investigation start?";

/**
 * Renders the Risk Relationship Network page into the given host element.
 * The whole component lives inside a single `.graph-page` container so its
 * styles stay scoped and cannot leak into the rest of the workbench.
 */
export function renderGraphPage(host: HTMLElement, onNavigateHome: () => void, homeHref: string): void {
  const appRoot = document.createElement("div");
  appRoot.className = "graph-page";
  host.innerHTML = "";
  host.append(appRoot);

  const data = loadBrainData();
  // Deterministic, filter-independent — computed once per page load.
  const priorityFlows = computePriorityFlows(data);
  const priorityFlowsById = new Map(priorityFlows.map((flow) => [flow.id, flow]));

  const store = new Store<AppState>(createInitialAppState(computeFilteredEventIds(data, createEmptyFilterState())));
  let tableState: EventTableState = createInitialTableState();

  appRoot.innerHTML = `
  <header class="app-header">
    <a class="graph-back" href="${homeHref}" id="graph-back">← Workbench</a>
    <h1>Risk Relationship Network</h1>
    <span class="synthetic-badge">Synthetic / Training Data</span>
    <div class="search-box">
      <input type="text" id="search-input" placeholder="Search event, person, organisation, issue, root cause…" aria-label="Search risk entities" autocomplete="off" />
      <div class="search-results" id="search-results" hidden></div>
    </div>
    <span class="scope-badge" id="scope-badge"></span>
    <button type="button" id="btn-clear-filters" class="ghost-button">Clear filters</button>
  </header>
  <nav class="priority-chip-strip" id="priority-chip-strip" aria-label="Priority investigations"></nav>
  <div class="app-body">
    <aside class="entity-directory-panel" aria-label="Entity directory">
      <div class="entity-directory" id="entity-directory"></div>
      <details class="directory-more-filters" id="directory-more-filters">
        <summary>More filters</summary>
        <div class="filter-panel-body" id="filter-panel-body">
          <div id="filter-groups"></div>
        </div>
      </details>
    </aside>
    <section class="graph-panel">
      <nav class="flow-breadcrumb" id="flow-breadcrumb" aria-label="Investigation path"></nav>
      <div class="flow-context" id="flow-context" aria-live="polite"></div>
      <div class="flow-controls" id="flow-controls-host"></div>
      <div class="graph-canvas" id="graph-canvas" role="img" aria-label="Risk relationship flow"></div>
      <div class="floating-legend" id="floating-legend" aria-label="Graph legend">
        <h3>Graph legend</h3>
        <div id="legend-nodes"></div>
      </div>
      <div class="graph-notices" id="graph-notices" role="status" aria-live="polite" hidden></div>
    </section>
    <aside class="analytics-panel" aria-label="Scope analytics">
      <section class="analytics-section" id="analytics-orgs-section">
        <h2>Top organisations</h2>
        <div class="bar-chart" id="analytics-orgs"></div>
      </section>
      <section class="analytics-section" id="analytics-issues-section">
        <h2>Top issues</h2>
        <div class="bar-chart" id="analytics-issues"></div>
      </section>
      <section class="analytics-section" id="analytics-people-section">
        <h2>Top people</h2>
        <div class="bar-chart" id="analytics-people"></div>
      </section>
      <section class="analytics-section" id="inspector-section">
        <h2 id="inspector-heading">Inspector</h2>
        <div id="inspector-content" class="empty-state">Select a node to inspect it.</div>
      </section>
      <section class="analytics-section ai-section">
        <h2>AI investigation</h2>
        <div class="ai-controls">
          <button type="button" id="btn-ai-preset-why" class="ghost-button" hidden>Why does this matter?</button>
          <input type="text" id="ai-question" placeholder="Ask anything about the current filtered scope…" aria-label="Question for AI analysis" maxlength="500" hidden />
          <button type="button" id="btn-ai-toggle" class="ai-toggle" aria-pressed="false">Ask a question</button>
          <button type="button" id="btn-analyse">Analyse this scope</button>
        </div>
        <div id="ai-result" class="ai-result" role="status" aria-live="polite">
          <p class="empty-state">Analysis runs on request, over the current scope.</p>
        </div>
      </section>
    </aside>
  </div>
  <section class="evidence-panel collapsed" id="evidence-panel" aria-label="Matching events">
    <div class="evidence-header">
      <h2 id="evidence-title">Matching events</h2>
      <button type="button" id="btn-clear-node-scope" class="ghost-button" hidden>Show all filtered events</button>
      <button type="button" id="btn-toggle-evidence" class="ghost-button">View evidence</button>
    </div>
    <div id="event-table" hidden></div>
  </section>
`;

  // --- Legend ----------------------------------------------------------------
  const legendContainer = appRoot.querySelector<HTMLDivElement>("#legend-nodes")!;
  const addLegendRow = (shape: string, fill: string, stroke: string, label: string, scale = 1): void => {
    const row = document.createElement("div");
    row.className = "legend-item";
    row.append(legendGlyph(shape, fill, stroke, scale), document.createTextNode(label));
    legendContainer.appendChild(row);
  };
  /** A small inline colour key under a row — same shape, small dot per colour, so the same swatch's different shades are spelled out without one full row per role. */
  const addLegendColorKey = (shape: string, entries: Array<{ color: string; label: string }>): void => {
    const key = document.createElement("div");
    key.className = "legend-color-key";
    for (const entry of entries) {
      const chip = document.createElement("span");
      chip.className = "legend-color-chip";
      chip.append(legendGlyph(shape, entry.color, entry.color, 0.55), document.createTextNode(entry.label));
      key.appendChild(chip);
    }
    legendContainer.appendChild(key);
  };
  /**
   * Kept deliberately short — this now lives in a floating box over the
   * graph canvas (max-width ~220px), not a full sidebar section, so it's
   * one row per entity type actually reachable from the current view plus
   * a row showing the selection ring. Risk Theme and OR Category only ever
   * appear on screen in "Full Flow" mode, so they're only listed here then.
   * The per-role colour breakdown for Organisation/Person nodes no longer
   * gets its own sublist here (it doesn't fit the floating box's width) —
   * it still lives in each node's hover tooltip.
   */
  function renderLegend(viewMode: FlowViewMode): void {
    legendContainer.replaceChildren();
    const types: NodeType[] = ["enterprise", "organisation", "person", "issue", "root_cause"];
    if (viewMode === "full") types.push("risk_theme", "or_category");
    types.push("event");

    for (const type of types) {
      const style = NODE_TYPE_STYLE[type];
      addLegendRow(
        style.shape,
        String(style.color.background),
        String(style.color.border),
        NODE_TYPE_LABEL[type],
        type === "event" ? 0.5 : 1,
      );
      if (type === "event") {
        addLegendColorKey(
          style.shape,
          (["High", "Moderate", "Low"] as Severity[]).map((severity) => ({
            color: SEVERITY_COLOR[severity].background,
            label: severity,
          })),
        );
      }
    }
    addLegendRow("dot", "#7c8794", "#ffffff", "Selected / current node");
  }
  renderLegend(store.getState().flow.viewMode);

  // --- Graph engine ------------------------------------------------------------
  const graphEngine = new GraphEngine();
  const graphCanvasEl = appRoot.querySelector<HTMLDivElement>("#graph-canvas")!;
  graphEngine.mount(graphCanvasEl);

  const scopeBadge = appRoot.querySelector<HTMLSpanElement>("#scope-badge")!;
  const noticesEl = appRoot.querySelector<HTMLDivElement>("#graph-notices")!;
  const inspectorEl = appRoot.querySelector<HTMLDivElement>("#inspector-content")!;
  const filterGroupsEl = appRoot.querySelector<HTMLDivElement>("#filter-groups")!;
  const eventTableEl = appRoot.querySelector<HTMLDivElement>("#event-table")!;
  const evidenceTitle = appRoot.querySelector<HTMLHeadingElement>("#evidence-title")!;
  const btnClearNodeScope = appRoot.querySelector<HTMLButtonElement>("#btn-clear-node-scope")!;
  const btnToggleEvidence = appRoot.querySelector<HTMLButtonElement>("#btn-toggle-evidence")!;
  const evidencePanelEl = appRoot.querySelector<HTMLElement>("#evidence-panel")!;
  const searchInput = appRoot.querySelector<HTMLInputElement>("#search-input")!;
  const searchResultsEl = appRoot.querySelector<HTMLDivElement>("#search-results")!;
  const breadcrumbEl = appRoot.querySelector<HTMLElement>("#flow-breadcrumb")!;
  const contextHeaderEl = appRoot.querySelector<HTMLDivElement>("#flow-context")!;
  const controlsEl = appRoot.querySelector<HTMLDivElement>("#flow-controls-host")!;
  const btnClearFilters = appRoot.querySelector<HTMLButtonElement>("#btn-clear-filters")!;
  const btnFilterToggle = appRoot.querySelector<HTMLButtonElement>("#btn-filter-toggle")!;
  const filterPanelBodyEl = appRoot.querySelector<HTMLDivElement>("#filter-panel-body")!;
  const priorityChipStripEl = appRoot.querySelector<HTMLElement>("#priority-chip-strip")!;
  const analyticsOrgsEl = appRoot.querySelector<HTMLDivElement>("#analytics-orgs")!;
  const analyticsIssuesEl = appRoot.querySelector<HTMLDivElement>("#analytics-issues")!;
  const analyticsPeopleEl = appRoot.querySelector<HTMLDivElement>("#analytics-people")!;
  const btnAiPresetWhy = appRoot.querySelector<HTMLButtonElement>("#btn-ai-preset-why")!;

  /** The filtered event set further narrowed to the active priority flow's scope, if any. */
  function computeEffectiveEventIds(filters: FilterState, priorityFlowId: PriorityFlowId | null): Set<string> {
    const computed = computeFilteredEventIds(data, filters);
    if (!priorityFlowId) return computed;
    const flow = priorityFlowsById.get(priorityFlowId);
    if (!flow) return computed;
    const scope = new Set(flow.eventIds);
    const result = new Set<string>();
    for (const id of computed) if (scope.has(id)) result.add(id);
    return result;
  }

  /** The exact event set the evidence table shows: the root's events, else the whole filtered scope. */
  function currentTableEventIds(state: AppState): string[] {
    if (state.flow.rootId) return matchingEventIdsForNode(data, state.flow.rootId, state.filteredEventIds);
    return Array.from(state.filteredEventIds);
  }

  function renderScopeBadge(): void {
    const state = store.getState();
    const activeCount = countActiveFilters(state.filters);
    scopeBadge.textContent = `${state.filteredEventIds.size} of ${data.eventsById.size} events · ${activeCount} filter${activeCount === 1 ? "" : "s"} active`;
  }

  /**
   * The priority-chip strip: "All events" plus one chip per pre-computed
   * priority flow. This is the entry point into a priority investigation —
   * clicking a chip narrows scope to it, clicking "All events" widens back
   * out. Chip counts are fixed per flow (not scope-dependent), so this only
   * needs to re-render when `priorityFlow` itself changes.
   */
  function renderPriorityChipStrip(): void {
    const state = store.getState();
    priorityChipStripEl.replaceChildren();

    const allChip = document.createElement("button");
    allChip.type = "button";
    allChip.className = state.priorityFlow === null ? "priority-chip active" : "priority-chip";
    allChip.dataset.flow = "";
    const allLabel = document.createElement("span");
    allLabel.className = "priority-chip-label";
    allLabel.textContent = "All events";
    const allCount = document.createElement("span");
    allCount.className = "priority-chip-count";
    allCount.textContent = String(data.eventsById.size);
    allChip.append(allLabel, allCount);
    priorityChipStripEl.appendChild(allChip);

    for (const flow of priorityFlows) {
      const isEmpty = flow.eventIds.length === 0;
      const isActive = state.priorityFlow === flow.id;
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = ["priority-chip", isEmpty ? "is-empty" : "", isActive ? "active" : ""].filter(Boolean).join(" ");
      chip.dataset.flow = flow.id;
      if (isEmpty) chip.disabled = true;

      const label = document.createElement("span");
      label.className = "priority-chip-label";
      label.textContent = flow.title;
      const count = document.createElement("span");
      count.className = "priority-chip-count";
      count.textContent = String(flow.eventIds.length);
      chip.append(label, count);
      priorityChipStripEl.appendChild(chip);
    }

    // "Why does this matter?" only makes sense once a priority investigation is active.
    btnAiPresetWhy.hidden = state.priorityFlow === null;
  }

  priorityChipStripEl.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-flow]");
    if (!button || button.disabled) return;
    const flowId = button.dataset.flow;
    if (!flowId) {
      clearPriorityFlow();
      return;
    }
    const flow = priorityFlowsById.get(flowId as PriorityFlowId);
    if (flow) selectPriorityFlow(flow);
  });

  /** Node id -> full flow node, from the most recent build — used to resolve clicks without re-querying vis-network. */
  let lastFlowNodes = new Map<string, { level?: number; flowEntityId?: string | null; flowMore?: boolean }>();

  function renderFlow(options: { fit?: boolean } = {}): void {
    const state = store.getState();
    const result = buildFlow(data, state.filteredEventIds, state.flow);
    graphEngine.setGraph(result, options);
    lastFlowNodes = new Map(result.nodes.map((node) => [node.id, node]));

    noticesEl.hidden = result.notices.length === 0;
    noticesEl.textContent = result.notices.join("  ·  ");
    renderContextHeader(result);
  }

  /**
   * The "you are here" line above the flow: what's selected and which
   * relationship the columns to its right are showing, so the analyst never
   * has to reconstruct that from the graph shape alone. At the top of an
   * active priority flow (no drill yet), this instead summarises the flow
   * itself — the priority's own headline/signal — since there is no single
   * "root node" driving the columns yet.
   */
  function renderContextHeader(result: FlowBuildResult): void {
    const state = store.getState();
    if (state.priorityFlow && state.flow.rootId === null) {
      const flow = priorityFlowsById.get(state.priorityFlow);
      if (flow) {
        const title = document.createElement("div");
        title.className = "flow-context-title";
        title.textContent = `${flow.title} → Organisations`;
        const detail = document.createElement("div");
        detail.className = "flow-context-detail";
        detail.textContent = `${flow.headline} · ${flow.signal}`;
        contextHeaderEl.replaceChildren(title, detail);
        return;
      }
    }

    const rootNode = result.nodes.find((node) => node.id === result.rootNodeId);
    if (!rootNode) {
      contextHeaderEl.replaceChildren();
      return;
    }
    const firstColumn = result.columns[0];
    const eventCount = rootNode.eventIds?.length ?? 0;
    const eventsPhrase = `${eventCount} matching event${eventCount === 1 ? "" : "s"}`;

    const title = document.createElement("div");
    title.className = "flow-context-title";
    title.textContent = firstColumn ? `${rootNode.label} → ${firstColumn.label}` : rootNode.label;

    // A single event's "Direct links" is a fixed set of siblings (owner org,
    // discovery org, issue, root cause, theme, category) — not a top-N
    // truncated aggregate, so the "showing top N ... connections" phrasing
    // used for every other root doesn't apply here.
    const isEventRoot = rootNode.flowEntityId?.startsWith("event::") ?? false;

    const detail = document.createElement("div");
    detail.className = "flow-context-detail";
    detail.textContent = isEventRoot
      ? "Direct links: organisations, issue, root cause, risk theme, OR category"
      : firstColumn
        ? `${eventsPhrase} · showing top ${FLOW_TOP_N} ${SINGULAR_STEP_LABEL[firstColumn.kind]} connections`
        : eventsPhrase;

    contextHeaderEl.replaceChildren(title, detail);
  }

  /**
   * The breadcrumb trail. When a priority flow is active, a synthetic first
   * entry names the flow — clicking it (when it isn't also the current/last
   * entry) clears the flow (but keeps any drill-down) and returns scope to
   * all filtered events.
   */
  function renderBreadcrumbUI(): void {
    const state = store.getState();
    const activeFlow = state.priorityFlow ? priorityFlowsById.get(state.priorityFlow) : undefined;
    const trail: BreadcrumbEntry[] = activeFlow
      ? [{ id: "__priority__", label: activeFlow.title }, ...state.breadcrumb]
      : state.breadcrumb;

    if (trail.length === 0) {
      // renderBreadcrumb always clears its container first, so the empty
      // hint has to be (re)written here rather than relying on a static
      // placeholder surviving the first render. The detailed "you are here"
      // text lives in the context header above; this is just the trail.
      breadcrumbEl.replaceChildren(document.createTextNode("Full ecosystem"));
      return;
    }
    renderBreadcrumb(breadcrumbEl, trail, (index) => {
      if (activeFlow && index === 0) {
        clearPriorityFlow();
        return;
      }
      navigateBreadcrumb(activeFlow ? index - 1 : index);
    });
  }

  function renderControls(): void {
    const state = store.getState();
    renderFlowControls(
      controlsEl,
      { templateId: state.flow.templateId, viewMode: state.flow.viewMode, showEvents: state.flow.showEvents, hasRoot: state.flow.rootId !== null },
      {
        onViewModeChange: (mode: FlowViewMode) =>
          updateFlow((flow) => {
            flow.viewMode = mode;
            flow.revealedLevels = new Set();
          }),
        onTemplateChange: (templateId: FlowTemplateId) =>
          updateFlow((flow) => {
            flow.templateId = templateId;
            flow.viewMode = flowTemplate(templateId).viewMode;
            flow.revealedLevels = new Set();
          }),
        onToggleEvents: (show: boolean) => updateFlow((flow) => (flow.showEvents = show)),
        onReset: () => selectRoot(null),
      },
    );
  }

  function renderTable(): void {
    const state = store.getState();
    const eventIds = currentTableEventIds(state);
    const rootNode = state.flow.rootId ? data.nodesById.get(state.flow.rootId) : null;

    evidenceTitle.textContent = rootNode ? `Matching events · ${rootNode.label}` : "Matching events";
    btnClearNodeScope.hidden = rootNode === null;

    renderEventTable(eventTableEl, data, eventIds, tableState, {
      onOpenEvent: (eventId) => selectRoot(`event::${eventId}`),
      onStateChange: (next) => {
        tableState = next;
        renderTable();
      },
    });
  }

  function renderInspectorPanel(): void {
    const state = store.getState();
    renderInspector(inspectorEl, data, state.flow.rootId, state.filteredEventIds, {
      onSelectNode: selectRoot,
      onOpenEvent: (eventId) => selectRoot(`event::${eventId}`),
    });
  }

  /** The top-organisations/top-issues/top-people bar charts — always over the same event scope as the evidence table. */
  function renderAnalyticsPanel(): void {
    const state = store.getState();
    renderScopeAnalytics(
      data,
      currentTableEventIds(state),
      { orgs: analyticsOrgsEl, issues: analyticsIssuesEl, people: analyticsPeopleEl },
      { onSelectEntity: (nodeId) => selectRoot(nodeId) },
    );
  }

  /** Applies a mutation to the flow's view options (view mode / show events / revealed columns) without touching the root or breadcrumb. */
  function updateFlow(mutate: (flow: FlowUIState) => void): void {
    store.setState((state) => {
      const flow: FlowUIState = { ...state.flow, revealedLevels: new Set(state.flow.revealedLevels) };
      mutate(flow);
      return { ...state, flow };
    });
    renderFlow();
    renderControls();
    renderLegend(store.getState().flow.viewMode);
  }

  /** Sets the flow's root and breadcrumb together — the one place root changes happen, so every dependent view re-renders in lockstep. */
  function applyRoot(nodeId: string | null, breadcrumb: BreadcrumbEntry[]): void {
    store.setState((state) => ({
      ...state,
      flow: { ...state.flow, rootId: nodeId, revealedLevels: new Set() },
      breadcrumb,
    }));
    tableState = createInitialTableState();
    renderFlow();
    renderBreadcrumbUI();
    renderControls();
    renderInspectorPanel();
    renderTable();
    renderAnalyticsPanel();
    invalidateAnalysis();
  }

  /** Entering an investigation from a priority chip: sets the priority flow and narrows scope to it, with no drill yet. */
  function selectPriorityFlow(flow: PriorityFlow): void {
    if (flow.eventIds.length === 0) return;
    store.setState((state) => ({
      ...state,
      priorityFlow: flow.id,
      filteredEventIds: computeEffectiveEventIds(state.filters, flow.id),
      flow: { ...state.flow, rootId: null, revealedLevels: new Set() },
      breadcrumb: [],
    }));
    tableState = createInitialTableState();
    renderScopeBadge();
    renderPriorityChipStrip();
    renderFlow({ fit: true });
    renderBreadcrumbUI();
    renderControls();
    renderInspectorPanel();
    renderTable();
    renderAnalyticsPanel();
    invalidateAnalysis();
  }

  /**
   * Clears the active priority flow, widening scope back to all filtered
   * events. Unlike selecting a flow, this deliberately leaves the current
   * root/breadcrumb alone — an analyst who was drilled into an entity stays
   * there. Used by the "All events" chip and the synthetic breadcrumb entry.
   */
  function clearPriorityFlow(): void {
    store.setState((state) => ({
      ...state,
      priorityFlow: null,
      filteredEventIds: computeFilteredEventIds(data, state.filters),
    }));
    tableState = createInitialTableState();
    renderScopeBadge();
    renderPriorityChipStrip();
    renderFlow({ fit: true });
    renderBreadcrumbUI();
    renderControls();
    renderInspectorPanel();
    renderTable();
    renderAnalyticsPanel();
    invalidateAnalysis();
  }

  /** Drilling into a new entity — appends to the breadcrumb. Used by search, node clicks, and table/AI evidence links. */
  function selectRoot(nodeId: string | null): void {
    const state = store.getState();
    if (nodeId === state.flow.rootId) return;
    if (nodeId === null) {
      applyRoot(null, []);
      return;
    }
    const label = data.nodesById.get(nodeId)?.label ?? nodeId;
    applyRoot(nodeId, [...state.breadcrumb, { id: nodeId, label }]);
  }

  /** Clicking an earlier breadcrumb entry re-roots there and truncates the trail — it does not push a new entry. */
  function navigateBreadcrumb(index: number): void {
    const state = store.getState();
    const entry = state.breadcrumb[index];
    if (!entry) return;
    applyRoot(entry.id, state.breadcrumb.slice(0, index + 1));
  }

  graphEngine.onSelectNode((visNodeId) => {
    if (visNodeId === "flow::root") return;
    const node = lastFlowNodes.get(visNodeId);
    if (!node) return;
    if (node.flowMore) {
      updateFlow((flow) => flow.revealedLevels.add(node.level ?? 0));
      return;
    }
    if (node.flowEntityId) selectRoot(node.flowEntityId);
  });

  /**
   * @param rerenderPanel Rebuild the filter controls too. Only needed when
   *   the change came from outside the panel (e.g. "Clear filters"). When the
   *   panel itself raised the change its DOM is already correct, and
   *   rebuilding it would collapse the group the analyst is working in and
   *   throw away their focus mid-selection.
   */
  function applyFilters(next: FilterState, rerenderPanel = false): void {
    store.setState((state) => ({ ...state, filters: next, filteredEventIds: computeEffectiveEventIds(next, state.priorityFlow) }));

    // A root the new scope no longer supports must not linger.
    const state = store.getState();
    let rootWasCleared = false;
    if (state.flow.rootId && matchingEventIdsForNode(data, state.flow.rootId, state.filteredEventIds).length === 0) {
      rootWasCleared = true;
      store.setState((current) => ({ ...current, flow: { ...current.flow, rootId: null }, breadcrumb: [] }));
    }

    tableState = createInitialTableState();
    renderScopeBadge();
    if (rerenderPanel) renderFilters();
    // Narrowing/widening the same investigation shouldn't reset whatever
    // pan/zoom the analyst already set up — only reframe the camera when
    // the root itself just got cleared out from under them (a genuine
    // change of what's being looked at, not just a filter tweak).
    renderFlow({ fit: rootWasCleared });
    renderBreadcrumbUI();
    renderControls();
    renderInspectorPanel();
    renderTable();
    renderAnalyticsPanel();
    invalidateAnalysis();
  }

  let filterDebounce: ReturnType<typeof setTimeout> | undefined;
  function renderFilters(): void {
    renderFilterPanel(filterGroupsEl, data, () => store.getState().filters, {
      onChange: (next) => {
        // Record the selection immediately so rapid successive ticks each
        // build on the previous one; only the expensive recompute and
        // re-render are debounced.
        store.setState((state) => ({ ...state, filters: next }));
        clearTimeout(filterDebounce);
        filterDebounce = setTimeout(() => applyFilters(store.getState().filters), FILTER_DEBOUNCE_MS);
      },
    });
  }

  btnClearFilters.addEventListener("click", () => applyFilters(createEmptyFilterState(), true));
  btnClearNodeScope.addEventListener("click", () => selectRoot(null));

  btnFilterToggle.addEventListener("click", () => {
    const expanded = btnFilterToggle.getAttribute("aria-expanded") === "true";
    const next = !expanded;
    btnFilterToggle.setAttribute("aria-expanded", String(next));
    filterPanelBodyEl.hidden = !next;
  });

  // The full event table is heavy evidence, not something the analyst needs
  // open by default — it stays collapsed until explicitly requested.
  btnToggleEvidence.addEventListener("click", () => {
    eventTableEl.hidden = !eventTableEl.hidden;
    evidencePanelEl.classList.toggle("collapsed", eventTableEl.hidden);
    btnToggleEvidence.textContent = eventTableEl.hidden ? "View evidence" : "Hide evidence";
  });

  // --- AI investigation ------------------------------------------------------
  const aiResultEl = appRoot.querySelector<HTMLDivElement>("#ai-result")!;
  const aiQuestionEl = appRoot.querySelector<HTMLInputElement>("#ai-question")!;
  const btnAnalyse = appRoot.querySelector<HTMLButtonElement>("#btn-analyse")!;
  const btnAiToggle = appRoot.querySelector<HTMLButtonElement>("#btn-ai-toggle")!;

  btnAiToggle.addEventListener("click", () => {
    const open = btnAiToggle.getAttribute("aria-pressed") !== "true";
    btnAiToggle.setAttribute("aria-pressed", String(open));
    btnAiToggle.textContent = open ? "Hide question" : "Ask a question";
    aiQuestionEl.hidden = !open;
    if (open) aiQuestionEl.focus();
  });

  // Preset for an active priority flow: prefills the question and runs the
  // analysis immediately, so the analyst doesn't have to formulate the
  // question themselves for the common "why does this matter" case.
  btnAiPresetWhy.addEventListener("click", () => {
    btnAiToggle.setAttribute("aria-pressed", "true");
    btnAiToggle.textContent = "Hide question";
    aiQuestionEl.hidden = false;
    aiQuestionEl.value = AI_WHY_QUESTION;
    btnAnalyse.click();
  });

  let aiController: AbortController | null = null;
  /** Monotonic sequence so a response for a superseded scope can never render. */
  let aiRequestSequence = 0;
  let aiHasContent = false;

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
        { selectedNodeId: state.flow.rootId, eventIds, question: aiQuestionEl.value.trim() || undefined },
        aiController.signal,
      );

      if (sequence !== aiRequestSequence) return; // scope moved on; discard
      renderAiResult(aiResultEl, result, (eventId) => selectRoot(`event::${eventId}`));
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
        btnAnalyse.textContent = "Analyse this scope";
      }
    }
  }

  btnAnalyse.addEventListener("click", () => void runAnalysis());

  /** Any scope change invalidates an in-flight analysis and the result on screen. */
  function invalidateAnalysis(): void {
    const wasInFlight = aiController !== null;
    if (aiController) {
      aiController.abort();
      aiController = null;
    }
    aiRequestSequence += 1;
    btnAnalyse.disabled = false;
    btnAnalyse.textContent = "Analyse this scope";

    if (aiHasContent || wasInFlight) {
      renderAiMessage(aiResultEl, "Scope changed — run the analysis again for this view.", "info");
      aiHasContent = false;
    }
  }

  // --- Search ------------------------------------------------------------------
  /**
   * Builds the display parts for one result, joined with " — " in the UI:
   * Person -> "Name — Person — Org"; Organisation/Issue/etc -> "Name — Type";
   * Event -> "EventId — Severity · EventType" (severity+type replaces the
   * generic "Event" type word, since that's the more useful second line for
   * an event result).
   */
  function searchResultParts(result: SearchResult): string[] {
    const { entry } = result;
    if (entry.type === "event") {
      const rawId = entry.id.startsWith("event::") ? entry.id.slice("event::".length) : entry.id;
      const event = data.eventsById.get(rawId);
      return [entry.label, event ? `${event.severity} · ${event.event_type}` : NODE_TYPE_LABEL.event];
    }
    if (entry.type === "person") {
      const parts = [entry.label, NODE_TYPE_LABEL.person];
      if (result.contextLabel) parts.push(result.contextLabel);
      return parts;
    }
    if (entry.type === "organisation") {
      return [shortOrgName(entry.label), NODE_TYPE_LABEL.organisation];
    }
    return [entry.label, NODE_TYPE_LABEL[entry.type]];
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

      const main = document.createElement("span");
      main.className = "search-result-main";
      const parts = searchResultParts(result);
      parts.forEach((part, index) => {
        const span = document.createElement("span");
        span.className = index === 0 ? "search-result-label" : "search-result-context";
        span.textContent = index === 0 ? part : ` — ${part}`;
        main.appendChild(span);
      });

      button.appendChild(main);
      if (!result.activeInScope) {
        const tag = document.createElement("span");
        tag.className = "type-tag";
        tag.textContent = "outside filters";
        button.appendChild(tag);
      }
      searchResultsEl.appendChild(button);
    }
  }

  let searchDebounce: ReturnType<typeof setTimeout> | undefined;
  searchInput.addEventListener("input", () => {
    clearTimeout(searchDebounce);
    const value = searchInput.value;
    searchDebounce = setTimeout(() => renderSearchResults(value), SEARCH_DEBOUNCE_MS);
  });

  searchResultsEl.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-node-id]");
    if (!button?.dataset.nodeId) return;
    selectRoot(button.dataset.nodeId);
    searchResultsEl.hidden = true;
    searchInput.value = "";
  });

  // Dismiss the search dropdown on any outside click. Scoped to the page
  // container so it stops firing once the route unmounts.
  appRoot.addEventListener("click", (event) => {
    if (!(event.target instanceof Node)) return;
    if (!searchResultsEl.contains(event.target) && event.target !== searchInput) {
      searchResultsEl.hidden = true;
    }
  });

  appRoot.querySelector<HTMLAnchorElement>("#graph-back")!.addEventListener("click", (event) => {
    event.preventDefault();
    onNavigateHome();
  });

  renderScopeBadge();
  renderPriorityChipStrip();
  renderFilters();
  // Open on the first priority investigation rather than the unbounded
  // enterprise graph. The chip strip still lets the analyst switch flows or
  // return to All events explicitly.
  const firstPriorityFlow = priorityFlows.find((flow) => flow.eventIds.length > 0);
  if (firstPriorityFlow) selectPriorityFlow(firstPriorityFlow);
}
