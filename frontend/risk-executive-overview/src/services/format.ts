import type { KpiValue, KpiDelta, KpiUnit } from "../types";

export function formatUsd(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatKpi(kpi: KpiValue): string {
  if (!kpi.applicable || kpi.value == null) return "N/A";
  switch (kpi.unit) {
    case "USD":
      return formatUsd(kpi.value);
    case "ratio":
      return formatPercent(kpi.value);
    case "hours":
      return `${Math.round(kpi.value).toLocaleString()}h`;
    case "events":
    default:
      return kpi.value.toLocaleString();
  }
}

/**
 * Formats a KPI's earlier-half-vs-recent-half delta. A ratio (Recovery Rate)
 * is shown in percentage points, since "+2.0%" on a rate that's itself a
 * percentage reads as ambiguous — percentage of what?
 */
export function formatKpiDelta(unit: KpiUnit, delta: KpiDelta): string {
  const sign = delta.deltaValue > 0 ? "+" : delta.deltaValue < 0 ? "−" : "";
  const abs = Math.abs(delta.deltaValue);

  if (unit === "ratio") {
    return `${sign}${(abs * 100).toFixed(1)}pp vs earlier period`;
  }

  const valueText =
    unit === "USD" ? formatUsd(abs) : unit === "hours" ? `${Math.round(abs).toLocaleString()}h` : Math.round(abs).toLocaleString();
  const pctText = delta.deltaPct != null ? ` (${sign}${Math.abs(delta.deltaPct * 100).toFixed(1)}%)` : "";

  return `${sign}${valueText}${pctText} vs earlier period`;
}

export function shortOrgName(organisation: string): string {
  return organisation.split(" → ")[0] ?? organisation;
}
