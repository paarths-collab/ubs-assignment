import type { Investigation } from "../types/pattern";
import { el } from "./dom";

function formatMoney(value: number | null): string {
  if (value === null) return "N/A";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function formatDays(value: number): string {
  return `${value.toFixed(1)}d`;
}

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

function comparisonRow(label: string, selected: string, enterprise: string, deltaLabel: string): HTMLElement {
  return el("tr", {}, [
    el("td", {}, [label]),
    el("td", {}, [selected]),
    el("td", {}, [enterprise]),
    el("td", { style: "color:var(--accent-amber)" }, [deltaLabel]),
  ]);
}

/** Deterministic top-N breakdown of a field across matching events — no AI involved, just counting. */
function topBreakdown(values: string[], limit = 3): { key: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function breakdownRows(items: { key: string; count: number }[], total: number): HTMLElement {
  if (items.length === 0) return el("div", { className: "empty-state" }, ["No data."]);
  return el(
    "ul",
    { className: "breakdown-list" },
    items.map((item) =>
      el("li", { className: "breakdown-list__row" }, [
        el("span", { className: "breakdown-list__label", title: item.key }, [item.key]),
        el("span", { className: "breakdown-list__value" }, [`${item.count} · ${((item.count / total) * 100).toFixed(0)}%`]),
      ]),
    ),
  );
}

/**
 * Renders the deterministic investigation view for one pattern: narrative,
 * enterprise comparison, a workflow-concentration summary (counted directly
 * from matching events — "workflow concentration", never personal blame),
 * financial exposure, and the clickable list of matching Event IDs. Every
 * number here comes straight from the API response — nothing here depends
 * on the AI panel loading successfully.
 */
export function renderInvestigationPanel(container: HTMLElement, investigation: Investigation, onOpenEvent: (eventId: string) => void): void {
  const { pattern, matchingEvents } = investigation;
  const o = pattern.observed;
  const c = pattern.compared_with_enterprise;

  container.innerHTML = "";
  container.append(
    el("div", { className: "panel__header" }, [
      el("span", { className: "panel__title" }, ["Investigation — Deterministic Evidence"]),
      el("span", { className: "pattern-card__id" }, [pattern.pattern_id]),
    ]),
  );

  const body = el("div", { className: "panel__body" }, [
    el("div", { className: "investigation-summary" }, [investigation.deterministicSummary]),
  ]);

  // Narrative context (verbatim source-data text, not AI-generated)
  if (pattern.narrative_context.issue_details.length > 0 || pattern.narrative_context.root_cause_details.length > 0) {
    body.append(
      el("div", { className: "panel-subsection" }, [
        el("div", { className: "panel-subsection__title" }, ["Narrative context"]),
        ...pattern.narrative_context.issue_details.map((t) => el("div", { className: "detail-field__value" }, [t])),
        ...pattern.narrative_context.root_cause_details.map((t) => el("div", { className: "detail-field__value" }, [t])),
      ]),
    );
  }

  // Enterprise comparison table
  body.append(
    el("div", { className: "panel-subsection" }, [
      el("div", { className: "panel-subsection__title" }, ["This pattern vs. enterprise baseline"]),
      el("div", { className: "scroll-x" }, [
        el("table", { className: "comparison-table" }, [
          el("thead", {}, [
            el("tr", {}, [el("th", {}, ["Metric"]), el("th", {}, ["Pattern"]), el("th", {}, ["Enterprise"]), el("th", {}, ["Delta"])]),
          ]),
          el("tbody", {}, [
            comparisonRow("High-severity rate", formatPct(o.high_rate_pct), formatPct(o.enterprise_high_rate_pct), `${c.high_rate_delta_pct_points >= 0 ? "+" : ""}${c.high_rate_delta_pct_points.toFixed(1)}pp (${c.high_rate_lift.toFixed(2)}x)`),
            comparisonRow("Detection delay (mean)", formatDays(o.detection_delay_mean_days), formatDays(o.detection_delay_mean_days - c.detection_delay_delta_days), `${c.detection_delay_delta_days >= 0 ? "+" : ""}${c.detection_delay_delta_days.toFixed(2)}d`),
            comparisonRow("Recording delay (mean)", formatDays(o.recording_delay_mean_days), formatDays(o.recording_delay_mean_days - c.recording_delay_delta_days), `${c.recording_delay_delta_days >= 0 ? "+" : ""}${c.recording_delay_delta_days.toFixed(2)}d`),
            comparisonRow("Occurrence-to-record (mean)", formatDays(o.occurrence_to_record_mean_days), formatDays(o.occurrence_to_record_mean_days - c.occurrence_to_record_delta_days), `${c.occurrence_to_record_delta_days >= 0 ? "+" : ""}${c.occurrence_to_record_delta_days.toFixed(2)}d`),
          ]),
        ]),
      ]),
    ]),
  );

  // Workflow / open-count + financial exposure
  body.append(
    el("div", { className: "panel-subsection" }, [
      el("div", { className: "panel-subsection__title" }, ["Workflow & financial exposure"]),
      el("div", { className: "metric-grid" }, [
        el("div", { className: "metric-card" }, [
          el("div", { className: "metric-card__label" }, ["Open events"]),
          el("div", { className: "metric-card__value" }, [`${o.open_events} / ${o.event_count}`]),
          el("div", { className: "metric-card__sub" }, [formatPct(o.open_rate * 100)]),
        ]),
        el("div", { className: "metric-card" }, [
          el("div", { className: "metric-card__label" }, ["Gross amount"]),
          el("div", { className: "metric-card__value" }, [formatMoney(o.gross_amount)]),
        ]),
        el("div", { className: "metric-card" }, [
          el("div", { className: "metric-card__label" }, ["Net amount"]),
          el("div", { className: "metric-card__value" }, [formatMoney(o.net_amount)]),
        ]),
        el("div", { className: "metric-card" }, [
          el("div", { className: "metric-card__label" }, ["Recovery amount"]),
          el("div", { className: "metric-card__value" }, [formatMoney(o.recovery_amount)]),
        ]),
        el("div", { className: "metric-card" }, [
          el("div", { className: "metric-card__label" }, ["Potential impact"]),
          el("div", { className: "metric-card__value" }, [formatMoney(o.potential_impact)]),
        ]),
      ]),
    ]),
  );

  // Organisation/people summary — counted directly from matching events, described as workflow concentration only.
  const orgCounts = topBreakdown(matchingEvents.map((e) => e.workflow.owner_organisation_short));
  const assigneeCounts = topBreakdown(matchingEvents.map((e) => e.workflow.current_assignee));
  body.append(
    el("div", { className: "panel-subsection" }, [
      el("div", { className: "panel-subsection__title" }, ["Workflow concentration (owning org / assignee)"]),
      el("div", { className: "section-grid", style: "grid-template-columns:1fr 1fr;gap:var(--space-3)" }, [
        breakdownRows(orgCounts, matchingEvents.length),
        breakdownRows(assigneeCounts, matchingEvents.length),
      ]),
    ]),
  );

  // Matching event IDs
  body.append(
    el("div", { className: "panel-subsection" }, [
      el("div", { className: "panel-subsection__title" }, [`Matching events (${pattern.matching_event_ids.length})`]),
      el(
        "div",
        { className: "event-id-chip-list" },
        pattern.matching_event_ids.map((eventId) =>
          el("button", { type: "button", className: "event-id-chip", onclick: () => onOpenEvent(eventId) }, [eventId]),
        ),
      ),
    ]),
  );

  container.append(body);
}
