import "./styles/main.css";

import rawEvents from "../../../backend/risk-stream-explorer/data/events_streamgraph.json";
import rawDetails from "../../../backend/risk-stream-explorer/data/event_details_streamgraph.json";
import rawAi from "../../../backend/risk-stream-explorer/data/event_ai_streamgraph.json";

import {
  loadDataset,
  EventRepository,
  DATASET_REGRESSION_TRUTHS,
  type RawFullEventDetailMap,
  type RawStreamEventList,
} from "@backend/index";
import { AppContext } from "./state/AppContext";
import { el } from "./components/dom";
import { renderFilterBar } from "./components/FilterBar";
import { renderStreamGraph } from "./components/StreamGraph";
import { renderPeriodInvestigation } from "./components/PeriodInvestigation";
import { renderEventDrawer } from "./components/EventDrawer";

function renderFatalError(root: HTMLElement, message: string): void {
  root.innerHTML = "";
  root.append(
    el("div", { className: "error-state", style: "padding:64px" }, [
      el("div", { style: "font-size:16px;margin-bottom:8px" }, ["Data could not be loaded"]),
      el("div", {}, [message]),
    ]),
  );
}

function boot(): void {
  const root = document.querySelector<HTMLDivElement>("#app");
  if (!root) return;

  root.innerHTML = "";
  root.append(el("div", { className: "loading-state", style: "padding:64px" }, ["Loading risk event data…"]));

  let loaded;
  try {
    loaded = loadDataset(
      rawEvents as unknown as RawStreamEventList,
      rawDetails as unknown as RawFullEventDetailMap,
      rawAi,
    );
  } catch (err) {
    renderFatalError(root, (err as Error).message);
    return;
  }

  const warnings = loaded.validation.issues.filter((i) => i.severity === "warning");
  if (warnings.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(`Risk Stream Explorer: ${warnings.length} data warning(s).`, warnings);
  }

  if (loaded.events.length !== DATASET_REGRESSION_TRUTHS.totalEvents) {
    // eslint-disable-next-line no-console
    console.warn(
      `Expected ${DATASET_REGRESSION_TRUTHS.totalEvents} events, loaded ${loaded.events.length}. Proceeding with the data as loaded.`,
    );
  }

  const repository = new EventRepository(loaded.events, loaded.detailsById);
  const ctx = new AppContext(repository, loaded.aiData);

  root.innerHTML = "";

  root.append(el("a", { href: "#main-content", className: "skip-link" }, ["Skip to main content"]));

  const highCount = loaded.events.filter((e) => e.severity === "High").length;
  const orgCount = repository.getDistinctOrganisations().length;

  root.append(
    el("header", { className: "app-header" }, [
      el("div", {}, [
        el("div", { className: "app-header__title" }, [el("span", { className: "glyph" }, ["◈"]), "Risk Stream / Timeline Explorer"]),
        el("div", { className: "app-header__breadcrumb" }, ["Enterprise Risk · Component 2"]),
      ]),
      el("div", { className: "app-header__stats" }, [
        el("div", { className: "app-header__stat" }, [el("div", { className: "value" }, [String(repository.count())]), el("div", { className: "label" }, ["Total Events"])]),
        el("div", { className: "app-header__stat" }, [el("div", { className: "value" }, [String(orgCount)]), el("div", { className: "label" }, ["Organisations"])]),
        el("div", { className: "app-header__stat" }, [el("div", { className: "value", style: "color:var(--accent-red)" }, [String(highCount)]), el("div", { className: "label" }, ["High Severity"])]),
      ]),
    ]),
  );

  const main = el("main", { className: "app-main", id: "main-content" });
  root.append(main);

  // The streamgraph is the visual centrepiece — it renders immediately
  // below the header, before the filter controls, so it's always the first
  // thing visible rather than being pushed below a tall filter form.
  const timelinePanel = el("div", { className: "panel panel--hero" }, [
    el("div", { className: "panel__header" }, [el("span", { className: "panel__title" }, ["Narrative Timeline"])]),
  ]);
  main.append(timelinePanel);
  renderStreamGraph(ctx, timelinePanel);

  const filterPanel = el("div", { className: "panel" }, [
    el("div", { className: "panel__header" }, [el("span", { className: "panel__title" }, ["Filters & Grouping"])]),
  ]);
  filterPanel.append(renderFilterBar(ctx));
  main.append(filterPanel);

  const investigationHost = el("div", {});
  main.append(investigationHost);
  renderPeriodInvestigation(ctx, investigationHost);

  const drawerHost = el("div", {});
  root.append(drawerHost);
  renderEventDrawer(ctx, drawerHost);
}

boot();
