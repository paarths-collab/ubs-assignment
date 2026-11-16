import type { AppContext } from "../state/AppContext";
import { el } from "./dom";

/** Visual summaries use the same returned population as the KPI cards. */
export function renderPopulationSnapshot(ctx: AppContext, host: HTMLElement): void {
  host.className = "population-snapshot";
  let lastOverview = ctx.getState().overview;

  function sync(): void {
    const { overview } = ctx.getState();
    if (!overview) { host.replaceChildren(); return; }
    const total = overview.eventCount;
    const percent = (count: number): string => total ? `${(count / total * 100).toFixed(1)}%` : "0.0%";
    const levels = [
      { name: "Low", count: overview.composition.severity.Low ?? 0, tone: "low" },
      { name: "Moderate", count: overview.composition.severity.Moderate ?? 0, tone: "moderate" },
      { name: "High", count: overview.composition.severity.High ?? 0, tone: "high" },
    ];
    const workflow = overview.composition.workflow;
    const openAngle = total ? Math.min(360, Math.max(0, workflow.open / total * 360)) : 0;
    const closedAngle = total ? Math.min(360, Math.max(openAngle, (workflow.open + workflow.closed) / total * 360)) : 0;
    const workflowSummary = `${workflow.open} open, ${workflow.closed} closed, ${workflow.cancelled} cancelled events`;

    host.replaceChildren(
      el("section", { className: "snapshot-card snapshot-card--severity" }, [
        el("div", { className: "snapshot-card__heading" }, [
          el("div", {}, [el("p", { className: "dashboard-eyebrow" }, ["POPULATION MIX"]), el("h2", {}, ["Severity distribution"])]),
          el("span", { className: "snapshot-card__tag" }, ["Current selection"]),
        ]),
        el("div", { className: "snapshot-total" }, [el("strong", {}, [total.toLocaleString()]), el("span", {}, ["events in view"])]),
        el("div", { className: "severity-stack", role: "img", "aria-label": levels.map(l => `${l.count} ${l.name.toLowerCase()} severity events`).join(", ") }, levels.map(level =>
          el("span", { className: `severity-stack__segment is-${level.tone}`, style: `width:${percent(level.count)}`, title: `${level.name}: ${level.count}` }),
        )),
        el("div", { className: "snapshot-legend" }, levels.map(level => el("div", { className: "snapshot-legend__item" }, [
          el("span", { className: `snapshot-dot is-${level.tone}`, "aria-hidden": "true" }),
          el("span", {}, [level.name]),
          el("strong", {}, [level.count.toLocaleString()]),
          el("small", {}, [percent(level.count)]),
        ]))),
      ]),
      el("section", { className: "snapshot-card snapshot-card--workflow" }, [
        el("div", { className: "snapshot-card__heading" }, [
          el("div", {}, [el("p", { className: "dashboard-eyebrow" }, ["WORKFLOW HEALTH"]), el("h2", {}, ["Resolution status"])]),
          el("a", { className: "snapshot-card__link", href: "#priority-signals" }, ["View priorities ↗"]),
        ]),
        el("div", { className: "workflow-visual" }, [
          el("div", { className: "workflow-ring", role: "img", "aria-label": workflowSummary, style: `--open-angle:${openAngle}deg;--closed-angle:${closedAngle}deg` }, [
            el("div", { className: "workflow-ring__center" }, [el("strong", {}, [percent(workflow.closed)]), el("span", {}, ["closed"])]),
          ]),
          el("div", { className: "workflow-legend" }, [
            ...[{ label: "Open", count: workflow.open, tone: "moderate" }, { label: "Closed", count: workflow.closed, tone: "low" }, { label: "Cancelled", count: workflow.cancelled, tone: "neutral" }].map(item => el("div", { className: "workflow-legend__row" }, [
              el("span", { className: `snapshot-dot is-${item.tone}`, "aria-hidden": "true" }), el("span", {}, [item.label]), el("strong", {}, [item.count.toLocaleString()]),
            ])),
            el("p", { className: "workflow-legend__note" }, [el("strong", {}, [String(workflow.highStillOpen)]), " high-severity events remain open"]),
          ]),
        ]),
      ]),
    );
  }
  ctx.subscribe((state) => { if (state.overview !== lastOverview) { lastOverview = state.overview; sync(); } });
  sync();
}
