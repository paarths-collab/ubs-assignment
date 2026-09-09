import { EVENT_TYPE_VALUES, SEVERITY_VALUES, isFilterActive } from "@backend/index";
import type { AppContext } from "../state/AppContext";
import { el } from "./dom";

function selectField(
  label: string,
  options: { value: string; label: string }[],
  onChange: (value: string) => void,
): { field: HTMLElement; select: HTMLSelectElement } {
  const select = el("select", {
    "aria-label": label,
    onchange: (e: Event) => onChange((e.target as HTMLSelectElement).value),
  }) as HTMLSelectElement;
  select.append(el("option", { value: "" }, ["All"]));
  for (const opt of options) {
    select.append(el("option", { value: opt.value }, [opt.label]));
  }
  const field = el("div", { className: "filter-field" }, [el("label", {}, [label]), select]);
  return { field, select };
}

export function renderFilterBar(ctx: AppContext): HTMLElement {
  const organisations = ctx.repository.getDistinctOrganisations();
  const riskThemes = ctx.repository.getDistinctRiskThemes();

  const org = selectField(
    "Organisation",
    organisations.map((o) => ({ value: o, label: o.split(" → ")[0] ?? o })),
    (v) => ctx.setFilter("organisation", v || null),
  );
  const severity = selectField(
    "Severity",
    SEVERITY_VALUES.map((s) => ({ value: s, label: s })),
    (v) => ctx.setFilter("severity", (v || null) as never),
  );
  const eventType = selectField(
    "Event Type",
    EVENT_TYPE_VALUES.map((t) => ({ value: t, label: t })),
    (v) => ctx.setFilter("eventType", (v || null) as never),
  );
  const theme = selectField(
    "Risk Theme",
    riskThemes.map((t) => ({ value: t, label: t })),
    (v) => ctx.setFilter("riskTheme", v || null),
  );

  const dateStart = el("input", {
    type: "date",
    "aria-label": "Date range start",
    min: ctx.repository.getEarliestOccurrenceDate() ?? undefined,
    max: ctx.repository.getLatestOccurrenceDate() ?? undefined,
    onchange: (e: Event) => ctx.setFilter("dateStart", (e.target as HTMLInputElement).value || null),
  }) as HTMLInputElement;
  const dateEnd = el("input", {
    type: "date",
    "aria-label": "Date range end",
    min: ctx.repository.getEarliestOccurrenceDate() ?? undefined,
    max: ctx.repository.getLatestOccurrenceDate() ?? undefined,
    onchange: (e: Event) => ctx.setFilter("dateEnd", (e.target as HTMLInputElement).value || null),
  }) as HTMLInputElement;

  const granularityButtons: Record<string, HTMLButtonElement> = {};
  const granularitySegment = el(
    "div",
    { className: "segmented", role: "group", "aria-label": "Timeline granularity" },
    ["month", "week"].map((g) => {
      const btn = el(
        "button",
        {
          type: "button",
          "aria-pressed": "false",
          onclick: () => ctx.setGranularity(g as "month" | "week"),
        },
        [g === "month" ? "Monthly" : "Weekly"],
      ) as HTMLButtonElement;
      granularityButtons[g] = btn;
      return btn;
    }),
  );

  const groupByButtons: Record<string, HTMLButtonElement> = {};
  const groupByOptions: { key: string; label: string }[] = [
    { key: "riskTheme", label: "Risk Theme" },
    { key: "severity", label: "Severity" },
    { key: "organisation", label: "Organisation" },
    { key: "eventType", label: "Event Type" },
  ];
  const groupBySegment = el(
    "div",
    { className: "segmented", role: "group", "aria-label": "Group timeline by" },
    groupByOptions.map((opt) => {
      const btn = el(
        "button",
        { type: "button", "aria-pressed": "false", onclick: () => ctx.setGroupBy(opt.key as never) },
        [opt.label],
      ) as HTMLButtonElement;
      groupByButtons[opt.key] = btn;
      return btn;
    }),
  );

  const activeCount = el("span", { className: "filter-bar__active-count", hidden: true });
  const resetBtn = el(
    "button",
    { type: "button", className: "btn-reset", onclick: () => ctx.resetFilters() },
    ["Reset filters"],
  );

  const container = el("div", { className: "filter-bar" }, [
    org.field,
    severity.field,
    eventType.field,
    theme.field,
    el("div", { className: "filter-field" }, [el("label", {}, ["From"]), dateStart]),
    el("div", { className: "filter-field" }, [el("label", {}, ["To"]), dateEnd]),
    el("div", { className: "filter-field" }, [el("label", {}, ["Granularity"]), granularitySegment]),
    el("div", { className: "filter-field filter-field--wide" }, [el("label", {}, ["Group stream by"]), groupBySegment]),
    el("div", { className: "filter-bar__actions" }, [activeCount, resetBtn]),
  ]);

  function sync(): void {
    const state = ctx.getState();
    org.select.value = state.filters.organisation ?? "";
    severity.select.value = state.filters.severity ?? "";
    eventType.select.value = state.filters.eventType ?? "";
    theme.select.value = state.filters.riskTheme ?? "";
    dateStart.value = state.filters.dateStart ?? "";
    dateEnd.value = state.filters.dateEnd ?? "";

    for (const [key, btn] of Object.entries(granularityButtons)) {
      btn.setAttribute("aria-pressed", String(key === state.granularity));
    }
    for (const [key, btn] of Object.entries(groupByButtons)) {
      btn.setAttribute("aria-pressed", String(key === state.groupBy));
    }

    const activeFilterCount = [
      state.filters.organisation,
      state.filters.severity,
      state.filters.eventType,
      state.filters.riskTheme,
      state.filters.dateStart,
      state.filters.dateEnd,
    ].filter((v) => v !== null).length;
    activeCount.hidden = !isFilterActive(state.filters);
    activeCount.textContent = `${activeFilterCount} active`;
  }

  ctx.subscribe(sync);
  sync();

  return container;
}
