import type { AppContext } from "../state/AppContext";
import { el } from "./dom";
import { formatUsd, shortOrgName } from "../services/format";

function countRow(label: string, value: number, total: number, tone = ""): HTMLElement {
  const share = total === 0 ? 0 : value / total;
  return el("li", { className: "count-row" }, [
    el("span", { className: "count-row__label" }, [label]),
    el("span", { className: `count-row__value${tone ? ` ${tone}` : ""}` }, [value.toLocaleString()]),
    el("div", { className: "count-row__track" }, [
      el("div", { className: `count-row__fill${tone ? ` ${tone}` : ""}`, style: `width:${(share * 100).toFixed(1)}%` }),
    ]),
  ]);
}

function block(title: string, rows: HTMLElement[]): HTMLElement {
  return el("section", { className: "composition-block" }, [
    el("h4", { className: "composition-block__title" }, [title]),
    el("ul", { className: "count-list" }, rows),
  ]);
}

export function renderRiskComposition(ctx: AppContext, host: HTMLElement): void {
  function sync(): void {
    const { overview } = ctx.getState();
    if (!overview) {
      host.replaceChildren(el("div", { className: "empty-state" }, ["No composition data yet."]));
      return;
    }

    const { composition, eventCount } = overview;
    const { severity, eventType, workflow, organisations } = composition;

    const topOrganisations = organisations.slice(0, 5);
    const orgMax = topOrganisations[0]?.eventCount ?? 0;

    host.replaceChildren(
      el("div", { className: "composition-grid" }, [
        block("Severity", [
          countRow("Low", severity.Low ?? 0, eventCount, "is-low"),
          countRow("Moderate", severity.Moderate ?? 0, eventCount, "is-moderate"),
          countRow("High", severity.High ?? 0, eventCount, "is-high"),
        ]),

        block("Event Type", [
          countRow("Financial", eventType.Financial ?? 0, eventCount),
          countRow("Non-Financial", eventType["Non-Financial"] ?? 0, eventCount),
        ]),

        block("Workflow", [
          countRow("Open", workflow.open, eventCount, "is-moderate"),
          countRow("Closed", workflow.closed, eventCount, "is-low"),
          countRow("Cancelled", workflow.cancelled, eventCount),
          countRow("High still open", workflow.highStillOpen, eventCount, "is-high"),
        ]),

        block(
          "Organisations",
          topOrganisations.map((row) =>
            el("li", { className: "count-row count-row--org" }, [
              el("span", { className: "count-row__label" }, [shortOrgName(row.key)]),
              el("span", { className: "count-row__value" }, [String(row.eventCount)]),
              el("div", { className: "count-row__track" }, [
                el("div", {
                  className: "count-row__fill",
                  style: `width:${orgMax === 0 ? 0 : ((row.eventCount / orgMax) * 100).toFixed(1)}%`,
                }),
              ]),
              el("span", { className: "count-row__meta" }, [
                `${row.highSeverityCount} High · ${row.potentialImpactUsd == null ? "—" : formatUsd(row.potentialImpactUsd)} potential`,
              ]),
            ]),
          ),
        ),
      ]),
    );
  }

  ctx.subscribe(sync);
  sync();
}
