import type { AppContext } from "../state/AppContext";
import type { OverviewResponse } from "../types";
import { el } from "./dom";
import { formatKpi, formatPercent } from "../services/format";

/**
 * The eight headline KPIs. Each carries one supporting line giving the
 * figure its context — a bare "$2.51M" invites the reader to assume it
 * covers the whole population when it only ever covers Financial events.
 */
function supportingLine(key: string, overview: OverviewResponse): string {
  const { kpis, eventCount, datasetEventCount, exposure, composition } = overview;

  switch (key) {
    case "totalEvents":
      return `of ${datasetEventCount.toLocaleString()} in dataset`;
    case "highSeverityEvents": {
      const value = kpis.highSeverityEvents.value ?? 0;
      return eventCount === 0 ? "no events in selection" : `${formatPercent(value / eventCount)} of filtered events`;
    }
    case "openBacklog": {
      const value = kpis.openBacklog.value ?? 0;
      return `${composition.workflow.highStillOpen} High still open`;
    }
    case "grossExposure":
      return "Financial events only";
    case "netExposure":
      return "after recovery, Financial only";
    case "recoveryRate":
      return "recovery ÷ gross";
    case "potentialImpact":
      return exposure.potential.fromNonFinancialUsd == null
        ? "Financial + Non-Financial"
        : `${formatPercent((exposure.potential.fromNonFinancialUsd ?? 0) / (exposure.potential.totalUsd || 1))} from Non-Financial`;
    case "remediationHours":
      return `${exposure.operational.averagePerEvent} hrs average per event`;
    default:
      return "";
  }
}

const KPI_DEFS: Array<{ key: keyof OverviewResponse["kpis"]; label: string; accent?: string }> = [
  { key: "totalEvents", label: "Total Events" },
  { key: "highSeverityEvents", label: "High Severity", accent: "accent-red" },
  { key: "openBacklog", label: "Open Backlog", accent: "accent-amber" },
  { key: "grossExposure", label: "Gross Exposure" },
  { key: "netExposure", label: "Net Exposure" },
  { key: "recoveryRate", label: "Recovery Rate", accent: "accent-green" },
  { key: "potentialImpact", label: "Potential Impact" },
  { key: "remediationHours", label: "Remediation Effort" },
];

/** The events behind a headline figure, shown inline rather than in a modal. */
function renderKpiDetail(ctx: AppContext): HTMLElement | null {
  const { selectedKpiId, kpiDetail, loadingKpiDetail } = ctx.getState();
  if (!selectedKpiId) return null;

  const label = KPI_DEFS.find((def) => def.key === selectedKpiId)?.label ?? selectedKpiId;

  if (loadingKpiDetail || !kpiDetail) {
    return el("div", { className: "kpi-detail" }, [
      el("div", { className: "kpi-detail__title" }, [`${label} — loading events…`]),
    ]);
  }

  const { summary, severity, ownership, workflow, evidence } = kpiDetail;
  const stat = (labelText: string, value: string): HTMLElement =>
    el("div", { className: "kpi-detail__stat" }, [
      el("span", { className: "kpi-detail__stat-label" }, [labelText]),
      el("span", { className: "kpi-detail__stat-value" }, [value]),
    ]);

  return el("div", { className: "kpi-detail" }, [
    el("div", { className: "kpi-detail__head" }, [
      el("span", { className: "kpi-detail__title" }, [`${label} — ${summary.eventCount} events behind this figure`]),
      el(
        "button",
        { type: "button", className: "kpi-detail__close", onclick: () => void ctx.selectKpi(selectedKpiId) },
        ["Close"],
      ),
    ]),
    el("div", { className: "kpi-detail__stats" }, [
      stat("High", String(severity.High ?? 0)),
      stat("Moderate", String(severity.Moderate ?? 0)),
      stat("Low", String(severity.Low ?? 0)),
      stat("Open", String(workflow.openEventCount)),
      stat("Closed", String(workflow.closedEventCount)),
      stat("Organisations", String(ownership.organisationCount)),
      stat("Owners", String(ownership.ownerCount)),
      stat("Event IDs", String(evidence.eventIds.length)),
    ]),
    el(
      "div",
      { className: "evidence-ids" },
      evidence.eventIds.slice(0, 40).map((id) => el("span", {}, [id])),
    ),
  ]);
}

export function renderKpiGrid(ctx: AppContext, host: HTMLElement): void {
  function sync(): void {
    const { overview, loading } = ctx.getState();

    if (!overview) {
      host.replaceChildren(el("div", { className: loading ? "loading-state" : "empty-state" }, [
        loading ? "Loading KPIs…" : "No KPI data yet.",
      ]));
      return;
    }

    const { selectedKpiId } = ctx.getState();

    const cards = KPI_DEFS.map((def) => {
      const kpi = overview.kpis[def.key];
      const isEmpty = !kpi.applicable || kpi.value == null;
      const isSelected = selectedKpiId === def.key;

      return el(
        "button",
        {
          type: "button",
          className: `metric-card${def.accent ? ` metric-card--${def.accent}` : ""}${isSelected ? " is-selected" : ""}`,
          "data-clickable": "true",
          "aria-pressed": String(isSelected),
          onclick: () => void ctx.selectKpi(def.key),
        },
        [
          el("div", { className: "metric-card__label" }, [def.label]),
          el("div", { className: `metric-card__value${isEmpty ? " is-empty" : ""}` }, [
            isEmpty ? "Not applicable" : formatKpi(kpi),
          ]),
          el("div", { className: "metric-card__sub" }, [
            isEmpty ? "structurally not applicable to this selection" : supportingLine(def.key, overview),
          ]),
        ],
      );
    });

    const detail = renderKpiDetail(ctx);
    const children: HTMLElement[] = [el("div", { className: "metric-grid" }, cards)];
    if (detail) children.push(detail);
    host.replaceChildren(...children);
  }

  ctx.subscribe(sync);
  sync();
}
