import "./styles/main.css";

import { AppContext } from "./state/AppContext";
import { el } from "./components/dom";
import { renderFilterBar } from "./components/FilterBar";
import { renderPopulationSnapshot } from "./components/PopulationSnapshot";
import { renderKpiGrid } from "./components/KpiGrid";
import { renderPortfolioAnalysisPanel } from "./components/PortfolioAnalysisPanel";
import { renderAttentionCards } from "./components/AttentionCards";
import { renderRiskComposition } from "./components/RiskComposition";
import { renderExposureImpact } from "./components/ExposureImpact";
import { renderOrganisationTable } from "./components/OrganisationTable";
import { renderRecurringIssues } from "./components/RecurringIssues";
import { renderRiskBrief } from "./components/RiskBrief";
import { mainAppHref, normalizeUrl } from "./router";
import { shortOrgName } from "./services/format";

function monthYear(isoDate: string): string {
  const [year, month] = isoDate.split("-");
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[Number(month) - 1] ?? month} ${year}`;
}

function renderHeader(ctx: AppContext): HTMLElement {
  const subtitle = el("div", { className: "app-header__breadcrumb" }, ["Loading…"]);

  ctx.subscribe((state) => {
    if (!state.overview || !state.metadata) return;
    const { filters, eventCount } = state.overview;
    const scope = filters.organisation === "Enterprise-wide" ? "Enterprise-wide" : shortOrgName(filters.organisation);
    subtitle.textContent = `${eventCount.toLocaleString()} synthetic risk events · ${monthYear(filters.dateFrom)}–${monthYear(filters.dateTo)} · ${scope}`;
  });

  const backHref = mainAppHref();
  const navigation = el("nav", { className: "workspace-nav", "aria-label": "Workspace" });
  if (backHref !== null) {
    for (const [label, href] of [["Overview", "/"], ["Dashboard", "/kpi"], ["Timeline", "/streamgraph"], ["Network", "/graph"], ["Issues", "/issues"], ["Patterns", "/patterns"]]) {
      navigation.append(el("a", { href, className: href === "/kpi" ? "workspace-nav__link is-active" : "workspace-nav__link", "aria-current": href === "/kpi" ? "page" : undefined }, [label]));
    }
  } else {
    navigation.append(el("a", { href: "#main-content", className: "workspace-nav__link is-active", "aria-current": "page" }, ["Dashboard"]));
  }

  return el("header", { className: "app-header" }, [
    el("a", { className: "signal-brand", href: backHref ?? "#main-content", "aria-label": "Signal Data Analysis home" }, [
      el("span", { className: "signal-brand__mark", "aria-hidden": "true" }, [el("i"), el("i"), el("i")]),
      el("span", {}, [el("strong", {}, ["Signal"]), el("span", { className: "signal-brand__label" }, ["Data Analysis"])]),
    ]),
    navigation,
    el("span", { className: "workspace-status" }, [el("span", { className: "workspace-status__dot", "aria-hidden": "true" }), "Demo workspace"]),
    el("div", { className: "app-header__context" }, [subtitle]),
  ]);
}

/** A titled page section. `id` lets other sections scroll the manager here. */
function section(title: string, caption: string, body: HTMLElement, id?: string): HTMLElement {
  return el("section", { className: "page-section", id }, [
    el("div", { className: "page-section__head" }, [
      el("h2", { className: "page-section__title" }, [title]),
      el("span", { className: "page-section__caption" }, [caption]),
    ]),
    el("div", { className: "panel" }, [body]),
  ]);
}

function boot(): void {
  const root = document.querySelector<HTMLDivElement>("#app");
  if (!root) return;

  normalizeUrl();
  const ctx = new AppContext();

  root.append(el("a", { href: "#main-content", className: "skip-link" }, ["Skip to main content"]));
  root.append(renderHeader(ctx));

  const main = el("main", { className: "app-main", id: "main-content" });
  root.append(main);

  const refreshStatus = el("span", { className: "dashboard-intro__status", role: "status", "aria-live": "polite" }, ["Loading dataset…"]);
  main.append(el("div", { className: "dashboard-intro" }, [
    el("div", {}, [
      el("p", { className: "dashboard-eyebrow" }, ["WORKSPACE / ANALYTICS"]),
      el("h1", {}, ["Analysis overview"]),
      el("p", { className: "dashboard-intro__description" }, ["Explore patterns, exposure, and the evidence behind every insight."]),
    ]),
    el("div", { className: "dashboard-intro__actions" }, [refreshStatus, el("a", { className: "dashboard-primary-action", href: "#ai-analysis" }, ["Explore with AI", el("span", { "aria-hidden": "true" }, ["↗"])])]),
  ]));
  ctx.subscribe((state) => {
    main.setAttribute("aria-busy", String(state.loading));
    refreshStatus.textContent = state.loading ? "Updating selection…" : state.loadError ? "Selection could not be updated" : state.overview ? `${state.overview.eventCount.toLocaleString()} events in view` : "Dataset unavailable";
  });

  const errorHost = el("div", { role: "alert" });
  main.append(errorHost);
  ctx.subscribe((state) => {
    errorHost.replaceChildren(state.loadError ? el("div", { className: "error-state" }, [state.loadError]) : "");
  });

  const filterHost = el("div", {});
  main.append(el("div", { className: "panel panel--filters" }, [filterHost]));
  renderFilterBar(ctx, filterHost);

  const hosts = {
    kpi: el("div", {}),
    portfolioAi: el("div", {}),
    snapshot: el("div", {}),
    attention: el("div", {}),
    composition: el("div", {}),
    exposure: el("div", {}),
    organisations: el("div", {}),
    issues: el("div", {}),
    brief: el("div", {}),
  };

  main.append(
    section("Key metrics", "Select a metric to inspect its source events", hosts.kpi),
    hosts.snapshot,
    section("Priority signals", "Where the current selection needs attention", hosts.attention, "priority-signals"),
    section("AI analysis", "Interpret the evidence in your current selection", hosts.portfolioAi, "ai-analysis"),
    section("Population breakdown", "Severity, workflow, and organisation", hosts.composition),
    section("Exposure & impact", "Financial exposure and operational effort", hosts.exposure),
    section("Organisation concentration", "Compare the business units behind the data", hosts.organisations),
    section("Recurring issues", "Select an issue to explore its evidence", hosts.issues),
    section("Selected issue brief", "Analysis, ownership, and supporting evidence", hosts.brief, "risk-brief"),
  );

  renderKpiGrid(ctx, hosts.kpi);
  renderPopulationSnapshot(ctx, hosts.snapshot);
  renderPortfolioAnalysisPanel(ctx, hosts.portfolioAi);
  renderAttentionCards(ctx, hosts.attention);
  renderRiskComposition(ctx, hosts.composition);
  renderExposureImpact(ctx, hosts.exposure);
  renderOrganisationTable(ctx, hosts.organisations);
  renderRecurringIssues(ctx, hosts.issues);
  renderRiskBrief(ctx, hosts.brief);

  void ctx.init();
}

boot();
