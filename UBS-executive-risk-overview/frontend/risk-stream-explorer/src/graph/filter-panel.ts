import type { BrainDataModel, FilterDimension, RangeBoundDimension } from "./types";
import type { FilterState, NumericRangeFilter } from "./app-state";
import { el } from "./dom";

type CategoricalKey = Exclude<
  {
    [K in keyof FilterState]: FilterState[K] extends string[] ? K : never;
  }[keyof FilterState],
  undefined
>;

type AdvancedKey = keyof FilterState["advanced"];

interface CategoricalField {
  key: CategoricalKey;
  dimension: FilterDimension;
  label: string;
}

interface AdvancedField {
  key: AdvancedKey;
  dimension: FilterDimension;
  label: string;
}

type NumericKey = {
  [K in keyof FilterState]: FilterState[K] extends NumericRangeFilter ? K : never;
}[keyof FilterState];

interface NumericField {
  key: NonNullable<NumericKey>;
  dimension: RangeBoundDimension;
  label: string;
  money?: boolean;
}

interface FilterGroup {
  title: string;
  categorical?: CategoricalField[];
  numeric?: NumericField[];
  advanced?: AdvancedField[];
  dateRange?: boolean;
  openByDefault?: boolean;
}

const GROUPS: FilterGroup[] = [
  { title: "Occurrence date", dateRange: true, openByDefault: true },
  {
    title: "Classification",
    openByDefault: true,
    categorical: [
      { key: "eventType", dimension: "event_type", label: "Event type" },
      { key: "severity", dimension: "severity", label: "Severity" },
    ],
  },
  {
    title: "Workflow",
    categorical: [
      { key: "status", dimension: "status", label: "Status" },
      { key: "stage", dimension: "stage", label: "Stage" },
    ],
  },
  {
    title: "Ownership & detection",
    categorical: [
      { key: "ownerOrganisation", dimension: "owner_organisation", label: "Owner organisation" },
      { key: "discoveryOrganisation", dimension: "discovery_organisation", label: "Discovery organisation" },
    ],
  },
  {
    title: "People",
    categorical: [
      { key: "owner", dimension: "owner_name", label: "Event owner" },
      { key: "assignee", dimension: "current_assignee", label: "Current assignee" },
    ],
  },
  {
    title: "Risk",
    categorical: [
      { key: "issue", dimension: "issue_detail", label: "Issue" },
      { key: "rootCause", dimension: "root_cause", label: "Root cause" },
      { key: "riskTheme", dimension: "risk_theme", label: "Risk theme" },
      { key: "orCategory", dimension: "or_category", label: "OR category" },
    ],
  },
  {
    title: "Finance",
    numeric: [
      { key: "grossAmount", dimension: "gross_amount_usd", label: "Gross amount", money: true },
      { key: "netAmount", dimension: "net_amount_usd", label: "Net amount", money: true },
      { key: "potentialImpact", dimension: "potential_impact_amount_usd", label: "Potential impact", money: true },
    ],
  },
  {
    title: "Timeliness",
    numeric: [
      { key: "detectionDelay", dimension: "detection_delay_days", label: "Detection delay (days)" },
      { key: "recordingDelay", dimension: "recording_delay_days", label: "Recording delay (days)" },
      { key: "occurrenceToRecord", dimension: "occurrence_to_record_days", label: "Occurrence to record (days)" },
    ],
  },
  {
    title: "Operational impact",
    numeric: [
      { key: "affectedRecords", dimension: "affected_records", label: "Affected records" },
      { key: "remediationHours", dimension: "remediation_hours", label: "Remediation hours" },
    ],
  },
  {
    title: "Advanced",
    advanced: [
      { key: "creator", dimension: "creator_name", label: "Creator" },
      { key: "administrator", dimension: "administrator_name", label: "Administrator" },
      { key: "modifiedBy", dimension: "modified_by_name", label: "Modified by" },
      { key: "provisionStatus", dimension: "provision_status", label: "Provision status" },
    ],
  },
];

const LONG_LABEL_LIMIT = 60;

function truncate(text: string): string {
  return text.length > LONG_LABEL_LIMIT ? `${text.slice(0, LONG_LABEL_LIMIT)}…` : text;
}

/** Count of individually-applied filter constraints, for the "N active" badge. */
export function countActiveFilters(filters: FilterState): number {
  let count = 0;
  for (const value of Object.values(filters)) {
    if (Array.isArray(value)) {
      count += value.length;
    } else if (value && typeof value === "object") {
      if ("from" in value) {
        if (value.from) count += 1;
        if (value.to) count += 1;
      } else if ("min" in value) {
        if (value.min !== null) count += 1;
        if (value.max !== null) count += 1;
      } else {
        for (const advancedValue of Object.values(value as Record<string, string[]>)) {
          count += advancedValue.length;
        }
      }
    }
  }
  return count;
}

function checkboxList(
  values: string[],
  selected: string[],
  onToggle: (value: string, checked: boolean) => void,
): HTMLElement {
  const list = el("div", { className: "checkbox-list" });
  const selectedSet = new Set(selected);

  for (const value of values) {
    const input = el("input", { attrs: { type: "checkbox" } }) as HTMLInputElement;
    input.checked = selectedSet.has(value);
    input.addEventListener("change", () => onToggle(value, input.checked));

    const label = el("label", { className: "checkbox-item", attrs: { title: value } }, [
      input,
      el("span", { text: truncate(value) }),
    ]);
    list.appendChild(label);
  }
  return list;
}

function numericRange(
  field: NumericField,
  bounds: { min: number; max: number } | undefined,
  current: NumericRangeFilter,
  // Reports only the bound that changed. Emitting a whole range rebuilt
  // from the render-time snapshot would wipe the other bound, since the
  // panel is not re-rendered between edits.
  onBoundChange: (which: "min" | "max", value: number | null) => void,
): HTMLElement {
  const makeInput = (which: "min" | "max"): HTMLInputElement => {
    const input = el("input", {
      className: "range-input",
      attrs: {
        type: "number",
        placeholder: bounds ? String(Math.round(bounds[which])) : which,
        "aria-label": `${field.label} ${which}`,
      },
    }) as HTMLInputElement;
    input.value = current[which] === null ? "" : String(current[which]);
    input.addEventListener("change", () => {
      const raw = input.value.trim();
      const parsed = raw === "" ? null : Number(raw);
      onBoundChange(which, parsed === null || Number.isNaN(parsed) ? null : parsed);
    });
    return input;
  };

  return el("div", { className: "filter-field" }, [
    el("span", { className: "filter-label", text: field.label }),
    el("div", { className: "range-row" }, [makeInput("min"), el("span", { text: "–" }), makeInput("max")]),
  ]);
}

export interface FilterPanelCallbacks {
  onChange: (next: FilterState) => void;
}

/**
 * Renders every filter dimension into the shared FilterState. The panel
 * never computes a scope of its own — it only produces a new FilterState,
 * which the single filter engine turns into the one filtered event set.
 */
export function renderFilterPanel(
  container: HTMLElement,
  data: BrainDataModel,
  getFilters: () => FilterState,
  callbacks: FilterPanelCallbacks,
): void {
  container.replaceChildren();

  // Read the live state at render time for initial control values, but
  // always re-read it when emitting: the panel is not rebuilt on every
  // change, so a captured snapshot would go stale and the second selection
  // would silently discard the first.
  const filters = getFilters();

  const emit = (mutate: (draft: FilterState) => void): void => {
    const current = getFilters();
    const draft: FilterState = {
      ...current,
      occurrenceDate: { ...current.occurrenceDate },
      advanced: { ...current.advanced },
    };
    mutate(draft);
    callbacks.onChange(draft);
  };

  const toggleIn = (list: string[], value: string, checked: boolean): string[] =>
    checked ? [...list, value] : list.filter((entry) => entry !== value);

  for (const group of GROUPS) {
    const details = el("details", { className: "filter-group" });
    if (group.openByDefault) details.setAttribute("open", "");
    details.appendChild(el("summary", { text: group.title }));

    if (group.dateRange) {
      const bounds = data.dateBounds.occurrence_date;
      const makeDateInput = (which: "from" | "to"): HTMLInputElement => {
        const input = el("input", {
          className: "range-input",
          attrs: { type: "date", min: bounds.min, max: bounds.max, "aria-label": `Occurrence date ${which}` },
        }) as HTMLInputElement;
        input.value = filters.occurrenceDate[which] ?? "";
        input.addEventListener("change", () => {
          emit((draft) => {
            draft.occurrenceDate = { ...draft.occurrenceDate, [which]: input.value || null };
          });
        });
        return input;
      };
      details.appendChild(
        el("div", { className: "range-row" }, [makeDateInput("from"), el("span", { text: "–" }), makeDateInput("to")]),
      );
    }

    for (const field of group.categorical ?? []) {
      const values = data.filterValues[field.dimension] ?? [];
      details.appendChild(
        el("div", { className: "filter-field" }, [
          el("span", { className: "filter-label", text: field.label }),
          checkboxList(values, filters[field.key], (value, checked) => {
            emit((draft) => {
              draft[field.key] = toggleIn(draft[field.key], value, checked);
            });
          }),
        ]),
      );
    }

    for (const field of group.advanced ?? []) {
      const values = data.filterValues[field.dimension] ?? [];
      details.appendChild(
        el("div", { className: "filter-field" }, [
          el("span", { className: "filter-label", text: field.label }),
          checkboxList(values, filters.advanced[field.key], (value, checked) => {
            emit((draft) => {
              draft.advanced = { ...draft.advanced, [field.key]: toggleIn(draft.advanced[field.key], value, checked) };
            });
          }),
        ]),
      );
    }

    for (const field of group.numeric ?? []) {
      details.appendChild(
        numericRange(field, data.rangeBounds[field.dimension], filters[field.key], (which, value) => {
          emit((draft) => {
            draft[field.key] = { ...draft[field.key], [which]: value };
          });
        }),
      );
    }

    container.appendChild(details);
  }
}
