import type { AppContext } from "../state/AppContext";
import { el } from "./dom";
import { formatUsd, shortOrgName } from "../services/format";

const INITIAL_ROWS = 5;

export function renderOrganisationTable(ctx: AppContext, host: HTMLElement): void {
  let showAll = false;

  function sync(): void {
    const { overview } = ctx.getState();
    if (!overview) {
      host.replaceChildren(el("div", { className: "empty-state" }, ["No organisation data yet."]));
      return;
    }

    const rows = overview.composition.organisations;
    const visible = showAll ? rows : rows.slice(0, INITIAL_ROWS);

    const table = el("table", { className: "org-table" }, [
      el("thead", {}, [
        el("tr", {}, [
          el("th", {}, ["Organisation"]),
          el("th", { className: "is-num" }, ["Events"]),
          el("th", { className: "is-num" }, ["High"]),
          el("th", { className: "is-num" }, ["Open"]),
          el("th", { className: "is-num" }, ["Net Exposure"]),
          el("th", { className: "is-num" }, ["Potential Impact"]),
        ]),
      ]),
      el(
        "tbody",
        {},
        visible.map((row) =>
          el("tr", {}, [
            el("td", {}, [shortOrgName(row.key)]),
            el("td", { className: "is-num" }, [String(row.eventCount)]),
            el("td", { className: `is-num${row.highSeverityCount > 0 ? " is-high" : ""}` }, [
              String(row.highSeverityCount),
            ]),
            el("td", { className: "is-num" }, [String(row.openEventCount)]),
            el("td", { className: "is-num" }, [row.netAmountUsd == null ? "—" : formatUsd(row.netAmountUsd)]),
            el("td", { className: "is-num" }, [
              row.potentialImpactUsd == null ? "—" : formatUsd(row.potentialImpactUsd),
            ]),
          ]),
        ),
      ),
    ]);

    const children: HTMLElement[] = [el("div", { className: "scroll-x" }, [table])];
    if (rows.length > INITIAL_ROWS) {
      children.push(
        el(
          "button",
          {
            type: "button",
            className: "org-table__more",
            onclick: () => {
              showAll = !showAll;
              sync();
            },
          },
          [showAll ? "Show top 5" : `View all ${rows.length} organisations →`],
        ),
      );
    }

    host.replaceChildren(el("div", { className: "org-table-wrap" }, children));
  }

  ctx.subscribe(sync);
  sync();
}
