import type { BrainDataModel, BrainEvent } from "./types";
import { el } from "./dom";
import { formatDate, formatMoney, formatNumber } from "./formatters";

const PAGE_SIZE = 25;

type SortKey =
  | "event_id"
  | "occurrence_date"
  | "severity"
  | "event_type"
  | "owner_organisation"
  | "status"
  | "net_amount_usd"
  | "potential_impact_amount_usd"
  | "occurrence_to_record_days";

interface ColumnDefinition {
  key: SortKey;
  label: string;
  numeric?: boolean;
  render: (event: BrainEvent) => string;
  /** Extra class on the cell, e.g. to carry the shared severity colour. */
  cellClass?: (event: BrainEvent) => string;
}

const COLUMNS: ColumnDefinition[] = [
  { key: "event_id", label: "Event ID", render: (event) => event.event_id },
  { key: "occurrence_date", label: "Occurred", render: (event) => formatDate(event.occurrence_date) },
  {
    key: "severity",
    label: "Severity",
    render: (event) => event.severity,
    cellClass: (event) => `severity-${event.severity}`,
  },
  { key: "event_type", label: "Type", render: (event) => event.event_type },
  { key: "owner_organisation", label: "Owner organisation", render: (event) => event.owner_organisation },
  { key: "status", label: "Status", render: (event) => event.status },
  { key: "net_amount_usd", label: "Net", numeric: true, render: (event) => formatMoney(event.net_amount_usd) },
  {
    key: "potential_impact_amount_usd",
    label: "Potential impact",
    numeric: true,
    render: (event) => formatMoney(event.potential_impact_amount_usd),
  },
  {
    key: "occurrence_to_record_days",
    label: "Occ→record",
    numeric: true,
    render: (event) => formatNumber(event.occurrence_to_record_days),
  },
];

const SEVERITY_ORDER: Record<string, number> = { Low: 0, Moderate: 1, High: 2 };

export interface EventTableState {
  sortKey: SortKey;
  sortAscending: boolean;
  page: number;
}

export function createInitialTableState(): EventTableState {
  return { sortKey: "occurrence_date", sortAscending: false, page: 0 };
}

function compareEvents(a: BrainEvent, b: BrainEvent, key: SortKey): number {
  if (key === "severity") return (SEVERITY_ORDER[a.severity] ?? 0) - (SEVERITY_ORDER[b.severity] ?? 0);

  const left = a[key];
  const right = b[key];

  // Nulls (structurally absent amounts) always sort last, never as zero.
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;

  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right));
}

export interface EventTableCallbacks {
  onOpenEvent: (eventId: string) => void;
  onStateChange: (state: EventTableState) => void;
}

/**
 * Renders the evidence table for whatever event scope it is handed — the
 * global filtered set, or the selected node's events. It never derives its
 * own scope, so it cannot drift from the graph or the inspector.
 */
export function renderEventTable(
  container: HTMLElement,
  data: BrainDataModel,
  eventIds: string[],
  state: EventTableState,
  callbacks: EventTableCallbacks,
): void {
  container.replaceChildren();

  if (eventIds.length === 0) {
    container.appendChild(el("p", { className: "empty-state", text: "No risk events match the current filters." }));
    return;
  }

  const events: BrainEvent[] = [];
  for (const eventId of eventIds) {
    const event = data.eventsById.get(eventId);
    if (event) events.push(event);
  }

  events.sort((a, b) => {
    const comparison = compareEvents(a, b, state.sortKey);
    return state.sortAscending ? comparison : -comparison;
  });

  const pageCount = Math.max(1, Math.ceil(events.length / PAGE_SIZE));
  const page = Math.min(state.page, pageCount - 1);
  const visible = events.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const headRow = el("tr");
  for (const column of COLUMNS) {
    const isSorted = state.sortKey === column.key;
    const button = el("button", {
      className: `table-sort${isSorted ? " sorted" : ""}`,
      text: `${column.label}${isSorted ? (state.sortAscending ? " ▲" : " ▼") : ""}`,
      attrs: { type: "button" },
    });
    button.addEventListener("click", () => {
      callbacks.onStateChange({
        sortKey: column.key,
        sortAscending: isSorted ? !state.sortAscending : true,
        page: 0,
      });
    });
    const th = el("th", { attrs: { scope: "col", "aria-sort": isSorted ? (state.sortAscending ? "ascending" : "descending") : "none" } }, [button]);
    headRow.appendChild(th);
  }

  const body = el("tbody");
  for (const event of visible) {
    const row = el("tr", { className: "event-row", attrs: { tabindex: "0", role: "button" } });
    for (const column of COLUMNS) {
      const classes = [column.numeric ? "numeric" : "", column.cellClass?.(event) ?? ""].filter(Boolean).join(" ");
      row.appendChild(el("td", { className: classes, text: column.render(event) }));
    }
    row.addEventListener("click", () => callbacks.onOpenEvent(event.event_id));
    row.addEventListener("keydown", (keyEvent) => {
      if (keyEvent.key === "Enter" || keyEvent.key === " ") {
        keyEvent.preventDefault();
        callbacks.onOpenEvent(event.event_id);
      }
    });
    body.appendChild(row);
  }

  const table = el("table", { className: "event-table" }, [el("thead", {}, [headRow]), body]);
  const scroller = el("div", { className: "table-scroll" }, [table]);

  const previous = el("button", {
    text: "Previous",
    attrs: { type: "button", ...(page === 0 ? { disabled: "true" } : {}) },
  });
  previous.addEventListener("click", () => callbacks.onStateChange({ ...state, page: Math.max(0, page - 1) }));

  const next = el("button", {
    text: "Next",
    attrs: { type: "button", ...(page >= pageCount - 1 ? { disabled: "true" } : {}) },
  });
  next.addEventListener("click", () => callbacks.onStateChange({ ...state, page: Math.min(pageCount - 1, page + 1) }));

  const pager = el("div", { className: "table-pager" }, [
    el("span", {
      className: "table-count",
      text: `${events.length} event${events.length === 1 ? "" : "s"} · page ${page + 1} of ${pageCount}`,
    }),
    previous,
    next,
  ]);

  container.append(scroller, pager);
}
