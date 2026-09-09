import type { CategoryBreakdown } from "@backend/index";
import { formatPercent } from "@backend/index";
import { el } from "./dom";

export function breakdownList(items: CategoryBreakdown[], limit = 5): HTMLElement {
  const top = items.slice(0, limit);
  const maxCount = Math.max(1, ...top.map((i) => i.count));
  if (top.length === 0) {
    return el("div", { className: "empty-state" }, ["No data for this selection."]);
  }
  return el(
    "ul",
    { className: "breakdown-list" },
    top.map((item) =>
      el("li", { className: "breakdown-list__row" }, [
        el("span", { className: "breakdown-list__label", title: item.key }, [item.key]),
        el("span", { className: "breakdown-list__value" }, [`${item.count} · ${formatPercent(item.share)}`]),
        el("span", { className: "breakdown-list__bar-track" }, [
          el("span", { className: "breakdown-list__bar-fill", style: `width:${(item.count / maxCount) * 100}%` }),
        ]),
      ]),
    ),
  );
}
