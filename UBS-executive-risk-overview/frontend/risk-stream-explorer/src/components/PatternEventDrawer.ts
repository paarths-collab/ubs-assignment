import { fetchEvent, ApiError } from "../services/PatternApiClient";
import type { RiskEvent } from "../types/pattern";
import { el } from "./dom";

function formatMoney(value: number | null): string {
  if (value === null) return "N/A";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function field(label: string, value: string | number | null): HTMLElement {
  const display = value === null || value === "" ? null : String(value);
  return el("div", { className: "detail-field" }, [
    el("div", { className: "detail-field__label" }, [label]),
    display === null
      ? el("div", { className: "detail-field__value is-empty" }, ["Not available"])
      : el("div", { className: "detail-field__value" }, [display]),
  ]);
}

function severityBadge(classification: string): HTMLElement {
  return el("span", { className: `badge badge--severity-${classification.toLowerCase()}` }, [el("span", { className: "dot" }), classification]);
}

function eventTypeBadge(eventType: string): HTMLElement {
  const cls = eventType === "Financial" ? "badge badge--type-financial" : "badge badge--type-nonfinancial";
  return el("span", { className: cls }, [eventType]);
}

function section(title: string, fields: HTMLElement[], open: boolean): HTMLElement {
  const body = el("div", { className: "detail-section__body", style: open ? "display:grid" : "display:none" }, fields);
  const sectionEl = el("div", { className: "detail-section", "data-open": String(open) });
  const header = el(
    "button",
    {
      type: "button",
      className: "detail-section__header",
      "aria-expanded": String(open),
      onclick: () => {
        const nowOpen = sectionEl.getAttribute("data-open") !== "true";
        sectionEl.setAttribute("data-open", String(nowOpen));
        header.setAttribute("aria-expanded", String(nowOpen));
        body.style.display = nowOpen ? "grid" : "none";
      },
    },
    [title, el("span", { className: "detail-section__chevron" }, ["›"])],
  );
  sectionEl.append(header, body);
  return sectionEl;
}

function buildSections(event: RiskEvent): HTMLElement[] {
  const f = event.financial;
  const w = event.workflow;
  const r = event.risk;
  const t = event.timeline;
  const n = event.narrative;

  return [
    section(
      "Financials",
      [
        field("Event type", event.event_type),
        field("Classification", event.classification),
        field("Gross amount", formatMoney(f.gross_amount)),
        field("Net amount (reported)", formatMoney(f.net_amount_reported)),
        field("Recovery amount (reported)", formatMoney(f.recovery_amount_reported)),
        field("Net amount (for analysis)", formatMoney(f.net_amount_for_analysis)),
        field("Recovery amount (for analysis)", formatMoney(f.recovery_amount_for_analysis)),
        field("Potential impact", formatMoney(f.potential_impact)),
        field("Provision status", f.provision_status),
      ],
      true,
    ),
    section(
      "Workflow",
      [
        field("Status", w.status),
        field("Stage", w.stage),
        field("Open", w.is_open ? "Yes" : "No"),
        field("Owner organisation", w.owner_organisation_short),
        field("Owner", w.owner_name),
        field("Current assignee", w.current_assignee),
        field("Creator", w.creator_name),
        field("Administrator", w.administrator_name),
        field("Discovery organisation", w.discovery_organisation),
        field("Last modified by", w.modified_by_name),
      ],
      false,
    ),
    section(
      "Risk classification",
      [field("Root cause", r.root_cause), field("Risk theme", r.risk_theme), field("OR category", r.or_category)],
      false,
    ),
    section(
      "Timeline",
      [
        field("Occurrence date", t.occurrence_date),
        field("Discovered date", t.discovered_date),
        field("Created on", t.created_on),
        field("Modified on", t.modified_on),
        field("Detection delay", t.detection_delay_days === null ? null : `${t.detection_delay_days} days`),
        field("Recording delay", t.recording_delay_days === null ? null : `${t.recording_delay_days} days`),
        field("Occurrence to record", t.occurrence_to_record_days === null ? null : `${t.occurrence_to_record_days} days`),
      ],
      false,
    ),
    section(
      "Narrative",
      [
        field("Background", n.background_detail),
        field("Issue detail", n.issue_detail),
        field("Root cause detail", n.root_cause_detail),
        field("Impact detail", n.impact_detail),
        field("Opportunity", n.opportunity),
        field("Impacts (raw, unverified)", n.impacts_raw),
      ],
      false,
    ),
  ];
}

/**
 * A standalone event drilldown drawer for Component 4 — not a reuse of the
 * Component 2/3 `EventDrawer.ts`, whose props are tied to that component's
 * `AppContext`/`EventRepository`/`StreamEvent` shape (a different dataset).
 * Reuses the same drawer/detail-section CSS classes for visual consistency.
 */
export function renderPatternEventDrawer(container: HTMLElement, eventId: string, onCloseCallback: () => void): void {
  container.innerHTML = "";

  function handleKey(e: KeyboardEvent): void {
    if (e.key === "Escape") close();
  }
  document.addEventListener("keydown", handleKey);

  function close(): void {
    document.removeEventListener("keydown", handleKey);
    onCloseCallback();
  }

  const overlay = el("div", { className: "drawer-overlay is-open", onclick: close });
  const drawer = el("div", { className: "drawer is-open", role: "dialog", "aria-modal": "true", "aria-label": "Event investigation" });
  container.append(overlay, drawer);

  drawer.append(el("div", { className: "ai-loading" }, ["Loading event…"]));

  fetchEvent(eventId)
    .then((event) => {
      drawer.innerHTML = "";
      drawer.append(
        el("div", { className: "drawer__header" }, [
          el("div", {}, [
            el("div", { className: "drawer__header-badges" }, [severityBadge(event.classification), eventTypeBadge(event.event_type)]),
            el("div", { className: "drawer__title" }, [event.title]),
            el("div", { className: "drawer__subtitle" }, [`${event.event_id} · ${event.workflow.owner_organisation_short} · Occurred ${event.timeline.occurrence_date}`]),
          ]),
          el("button", { type: "button", className: "drawer__close", "aria-label": "Close event details", onclick: close }, ["×"]),
        ]),
      );
      const body = el("div", { className: "drawer__body" });
      const col = el("div", { className: "drawer__col drawer__col--detail", style: "flex:1" }, [
        el("div", { className: "drawer__col-title" }, ["Event Record"]),
        ...buildSections(event),
      ]);
      body.append(col);
      drawer.append(body);
    })
    .catch((err: unknown) => {
      const message = err instanceof ApiError ? err.message : "This event could not be loaded.";
      drawer.innerHTML = "";
      drawer.append(
        el("div", { className: "drawer__header" }, [
          el("div", {}, [el("div", { className: "drawer__title" }, ["Event not found"])]),
          el("button", { type: "button", className: "drawer__close", "aria-label": "Close", onclick: close }, ["×"]),
        ]),
        el("div", { className: "error-state" }, [message]),
      );
    });
}
