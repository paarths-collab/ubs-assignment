import "./styles/main.css";

import { AppContext } from "./state/AppContext";
import { el } from "./components/dom";
import { renderFilterBar } from "./components/FilterBar";
import { renderKpiGrid } from "./components/KpiGrid";
import { renderAttentionCards } from "./components/AttentionCards";
import { renderRiskComposition } from "./components/RiskComposition";
import { renderExposureImpact } from "./components/ExposureImpact";
import { renderOrganisationTable } from "./components/OrganisationTable";
import { renderRecurringIssues } from "./components/RecurringIssues";
import { renderRiskBrief } from "./components/RiskBrief";
import { normalizeUrl } from "./router";
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

  return el("header", { className: "app-header" }, [
    el("div", {}, [
      el("div", { className: "app-header__title" }, [el("span", { className: "glyph" }, ["◈"]), "Executive Risk Overview"]),
      subtitle,
    ]),
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

  const errorHost = el("div", {});
  main.append(errorHost);
  ctx.subscribe((state) => {
    errorHost.replaceChildren(state.loadError ? el("div", { className: "error-state" }, [state.loadError]) : "");
  });

  const filterHost = el("div", {});
  main.append(el("div", { className: "panel panel--filters" }, [filterHost]));
  renderFilterBar(ctx, filterHost);

  const hosts = {
    kpi: el("div", {}),
    attention: el("div", {}),
    composition: el("div", {}),
    exposure: el("div", {}),
    organisations: el("div", {}),
    issues: el("div", {}),
    brief: el("div", {}),
  };

  main.append(
    section("Current Risk Picture", "The filtered population at a glance", hosts.kpi),
    section("What Needs Attention", "Why should I care?", hosts.attention),
    section("Risk Composition", "What is this population made of?", hosts.composition),
    section("Exposure & Impact", "Realised money, potential money, operational burden", hosts.exposure),
    section("Where Is Risk Concentrated?", "Which business units carry it", hosts.organisations),
    section("Recurring Issues", "The scenarios behind the numbers — select one to inspect", hosts.issues),
    section("Selected Risk Brief", "Full analysis and management view", hosts.brief, "risk-brief"),
  );

  renderKpiGrid(ctx, hosts.kpi);
  renderAttentionCards(ctx, hosts.attention);
  renderRiskComposition(ctx, hosts.composition);
  renderExposureImpact(ctx, hosts.exposure);
  renderOrganisationTable(ctx, hosts.organisations);
  renderRecurringIssues(ctx, hosts.issues);
  renderRiskBrief(ctx, hosts.brief);

  void ctx.init();
}

boot();
