import type { Delta } from "@backend/index";
import { formatSignedPercent } from "@backend/index";
import { el } from "./dom";

export function deltaBadge(delta: Delta, invertGoodBad = false): HTMLElement | null {
  if (delta.isNew) {
    return el("span", { className: "metric-card__delta is-neutral" }, ["New in this period"]);
  }
  if (delta.percentChange === null || delta.absoluteChange === null) return null;
  const isIncrease = delta.absoluteChange > 0;
  const goodDirection = invertGoodBad ? !isIncrease : isIncrease;
  const cls = delta.absoluteChange === 0 ? "is-neutral" : goodDirection ? "is-positive" : "is-negative";
  const arrow = delta.absoluteChange > 0 ? "↑" : delta.absoluteChange < 0 ? "↓" : "→";
  return el("span", { className: `metric-card__delta ${cls}` }, [`${arrow} ${formatSignedPercent(delta.percentChange)} vs previous`]);
}

export function metricCard(label: string, value: string, sub?: string, delta?: HTMLElement | null): HTMLElement {
  return el("div", { className: "metric-card" }, [
    el("div", { className: "metric-card__label" }, [label]),
    el("div", { className: "metric-card__value" }, [value]),
    sub ? el("div", { className: "metric-card__sub" }, [sub]) : null,
    delta ?? null,
  ]);
}
