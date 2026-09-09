import type { KpiValue } from "../types";

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

export function shortOrgName(organisation: string): string {
  return organisation.split(" → ")[0] ?? organisation;
}
