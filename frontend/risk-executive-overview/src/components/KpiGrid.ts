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

export function renderKpiGrid(ctx: AppContext, host: HTMLElement): void {
  function sync(): void {
    const { overview, loading } = ctx.getState();

    if (!overview) {
      host.replaceChildren(el("div", { className: loading ? "loading-state" : "empty-state" }, [
        loading ? "Loading KPIs…" : "No KPI data yet.",
      ]));
      return;
    }

    const cards = KPI_DEFS.map((def) => {
      const kpi = overview.kpis[def.key];
      const isEmpty = !kpi.applicable || kpi.value == null;
      return el("div", { className: `metric-card${def.accent ? ` metric-card--${def.accent}` : ""}` }, [
        el("div", { className: "metric-card__label" }, [def.label]),
        el("div", { className: `metric-card__value${isEmpty ? " is-empty" : ""}` }, [
          isEmpty ? "Not applicable" : formatKpi(kpi),
        ]),
        el("div", { className: "metric-card__sub" }, [
          isEmpty ? "structurally not applicable to this selection" : supportingLine(def.key, overview),
        ]),
      ]);
    });

    host.replaceChildren(el("div", { className: "metric-grid" }, cards));
  }

  ctx.subscribe(sync);
  sync();
}
