import type { AppContext } from "../state/AppContext";
import type { EventTypeFilter, Metadata, SeverityFilter } from "../types";
import { el } from "./dom";
import { shortOrgName } from "../services/format";

const EVENT_TYPES: EventTypeFilter[] = ["All", "Financial", "Non-Financial"];
const SEVERITIES: SeverityFilter[] = ["All", "Low", "Moderate", "High"];

function selectField(
  label: string,
  options: { value: string; label: string }[],
  onChange: (value: string) => void,
): { field: HTMLElement; select: HTMLSelectElement } {
  const select = el("select", {
    "aria-label": label,
    onchange: (e: Event) => onChange((e.target as HTMLSelectElement).value),
  }) as HTMLSelectElement;
  for (const opt of options) {
    select.append(el("option", { value: opt.value }, [opt.label]));
  }
  const field = el("div", { className: "filter-field" }, [el("label", {}, [label]), select]);
  return { field, select };
}

export function renderFilterBar(ctx: AppContext, host: HTMLElement): void {
  // Metadata arrives asynchronously, after this component is first rendered.
  // The organisation options and the date bounds therefore have to be filled
  // in when it lands, not read once at construction time.
  const org = selectField("Organisation", [], (v) => ctx.setFilter("organisation", v));
  const eventType = selectField("Event Type", EVENT_TYPES.map((t) => ({ value: t, label: t })), (v) =>
    ctx.setFilter("eventType", v as EventTypeFilter),
  );
  const severity = selectField("Severity", SEVERITIES.map((s) => ({ value: s, label: s })), (v) =>
    ctx.setFilter("severity", v as SeverityFilter),
  );

  const dateStart = el("input", {
    type: "date",
    "aria-label": "Date from",
    onchange: (e: Event) => ctx.setFilter("dateFrom", (e.target as HTMLInputElement).value || null),
  }) as HTMLInputElement;
  const dateEnd = el("input", {
    type: "date",
    "aria-label": "Date to",
    onchange: (e: Event) => ctx.setFilter("dateTo", (e.target as HTMLInputElement).value || null),
  }) as HTMLInputElement;

  const activeCount = el("span", { className: "filter-bar__active-count" });
  const resetBtn = el("button", { type: "button", className: "btn-reset", onclick: () => ctx.resetFilters() }, [
    "Reset filters",
  ]);

  org.field.classList.add("filter-field--wide");

  host.replaceChildren(
    el("div", { className: "filter-bar" }, [
      org.field,
      eventType.field,
      severity.field,
      el("div", { className: "filter-field" }, [el("label", {}, ["From"]), dateStart]),
      el("div", { className: "filter-field" }, [el("label", {}, ["To"]), dateEnd]),
      el("div", { className: "filter-bar__actions" }, [activeCount, resetBtn]),
    ]),
  );

  let populatedFrom: Metadata | null = null;

  function populateFromMetadata(metadata: Metadata): void {
    if (populatedFrom === metadata) return;
    populatedFrom = metadata;

    org.select.replaceChildren(
      ...metadata.organisations.map((organisation) =>
        el("option", { value: organisation }, [
          organisation === "Enterprise-wide" ? organisation : shortOrgName(organisation),
        ]),
      ),
    );

    for (const input of [dateStart, dateEnd]) {
      input.min = metadata.dateRange.min;
      input.max = metadata.dateRange.max;
    }
  }

  function sync(): void {
    const { filters, metadata } = ctx.getState();
    if (metadata) populateFromMetadata(metadata);

    org.select.value = filters.organisation;
    eventType.select.value = filters.eventType;
    severity.select.value = filters.severity;
    dateStart.value = filters.dateFrom ?? "";
    dateEnd.value = filters.dateTo ?? "";

    const active = [
      filters.organisation !== "Enterprise-wide",
      filters.eventType !== "All",
      filters.severity !== "All",
      filters.dateFrom != null,
      filters.dateTo != null,
    ].filter(Boolean).length;
    activeCount.textContent = active > 0 ? `${active} active` : "";
  }

  ctx.subscribe(sync);
  sync();
}
