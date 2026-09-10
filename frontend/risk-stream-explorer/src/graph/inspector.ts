import type { BrainDataModel, BrainEvent } from "./types";
import { buildNodeDetail } from "./node-detail";
import type { NodeDetail } from "./node-detail";
import { NODE_TYPE_LABEL } from "./graph-styles";
import { el, sectionHeading, statRow } from "./dom";
import {
  formatAmountSummary,
  formatCountSummary,
  formatDate,
  formatDelaySummary,
  formatMoney,
  formatNumber,
  formatPercent,
  formatText,
} from "./formatters";

const TOP_RELATED_LIMIT = 6;

export interface InspectorCallbacks {
  onSelectNode: (nodeId: string) => void;
  onOpenEvent: (eventId: string) => void;
}

/** A single-line severity readout for the headline block — the full breakdown with percentages still lives in severitySection below. */
function severityHeadline(detail: NodeDetail): string {
  const { severityCounts } = detail.metrics;
  return `${severityCounts.High} High · ${severityCounts.Moderate} Moderate · ${severityCounts.Low} Low`;
}

function severityRow(label: "High" | "Moderate" | "Low", count: number, percent: number): HTMLElement {
  const row = statRow(label, `${count} (${formatPercent(percent)})`);
  row.querySelector(".stat-label")?.classList.add(`severity-${label}`);
  return row;
}

function severitySection(detail: NodeDetail): HTMLElement {
  const { severityCounts: counts, severityPercentages: percentages } = detail.metrics;
  return el("div", {}, [
    sectionHeading("Severity"),
    severityRow("High", counts.High, percentages.High),
    severityRow("Moderate", counts.Moderate, percentages.Moderate),
    severityRow("Low", counts.Low, percentages.Low),
  ]);
}

function exposureSection(detail: NodeDetail): HTMLElement {
  const { metrics } = detail;
  return el("div", {}, [
    sectionHeading("Exposure"),
    el("p", {
      className: "inspector-note",
      text: "Actual financial exposure and potential impact are distinct measures and are never combined.",
    }),
    statRow("Gross (actual)", formatAmountSummary(metrics.grossAmount)),
    statRow("Recovery", formatAmountSummary(metrics.recoveryAmount)),
    statRow("Net (actual)", formatAmountSummary(metrics.netAmount)),
    statRow("Potential impact", formatAmountSummary(metrics.potentialImpact)),
    statRow(
      "Financial / Non-Financial",
      `${metrics.financialCount} / ${metrics.nonFinancialCount}`,
    ),
  ]);
}

function timelinessSection(detail: NodeDetail): HTMLElement {
  const { metrics } = detail;
  return el("div", {}, [
    sectionHeading("Timeliness & impact"),
    statRow("Detection delay", formatDelaySummary(metrics.detectionDelay)),
    statRow("Recording delay", formatDelaySummary(metrics.recordingDelay)),
    statRow("Occurrence to record", formatDelaySummary(metrics.occurrenceToRecord)),
    statRow("Affected records", formatCountSummary(metrics.affectedRecords)),
    statRow("Remediation hours", formatCountSummary(metrics.remediationHours)),
  ]);
}

function workflowSection(detail: NodeDetail): HTMLElement | null {
  const entries = Object.entries(detail.metrics.statusCounts).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;
  return el(
    "div",
    {},
    [sectionHeading("Workflow status"), ...entries.map(([status, count]) => statRow(status, String(count)))],
  );
}

function roleSection(detail: NodeDetail): HTMLElement | null {
  if (detail.roleBreakdown.length === 0) return null;
  return el("div", {}, [
    sectionHeading("Roles held"),
    ...detail.roleBreakdown.map((entry) =>
      statRow(entry.advanced ? `${entry.role} (admin)` : entry.role, String(entry.eventIds.length)),
    ),
  ]);
}

function relatedSections(detail: NodeDetail, callbacks: InspectorCallbacks): HTMLElement[] {
  return detail.related.map((group) => {
    const list = el("div", { className: "related-list" });
    for (const entity of group.entities.slice(0, TOP_RELATED_LIMIT)) {
      const button = el("button", {
        className: "related-item",
        attrs: { type: "button", title: entity.label },
      }, [
        el("span", { className: "related-label", text: entity.label }),
        el("span", { className: "related-count", text: String(entity.count) }),
      ]);
      button.addEventListener("click", () => callbacks.onSelectNode(entity.nodeId));
      list.appendChild(button);
    }
    const heading = sectionHeading(
      group.entities.length > TOP_RELATED_LIMIT
        ? `${group.label} (top ${TOP_RELATED_LIMIT} of ${group.entities.length})`
        : group.label,
    );
    return el("div", {}, [heading, list]);
  });
}

function eventRecord(event: BrainEvent): HTMLElement {
  const field = (label: string, value: string): HTMLElement => statRow(label, value);

  return el("div", {}, [
    sectionHeading("Classification"),
    field("Type", event.event_type),
    field("Severity", event.severity),
    field("Status", event.status),
    field("Stage", event.stage),
    field("Provision status", formatText(event.provision_status)),

    sectionHeading("Dates"),
    field("Occurred", formatDate(event.occurrence_date)),
    field("Discovered", formatDate(event.date_discovered)),
    field("Created", formatDate(event.created_on)),
    field("Modified", formatDate(event.modified_on)),

    sectionHeading("Ownership & people"),
    field("Owner organisation", formatText(event.owner_organisation)),
    field("Discovery organisation", formatText(event.discovery_organisation)),
    field("Owner", formatText(event.owner_name)),
    field("Current assignee", formatText(event.current_assignee)),
    field("Administrator", formatText(event.administrator_name)),
    field("Creator", formatText(event.creator_name)),
    field("Modified by", formatText(event.modified_by_name)),

    sectionHeading("Risk classification"),
    field("Root cause", formatText(event.root_cause)),
    field("Risk theme", formatText(event.risk_theme)),
    field("OR category", formatText(event.or_category)),

    sectionHeading("Financial"),
    field("Gross", formatMoney(event.gross_amount_usd)),
    field("Recovery", formatMoney(event.recovery_amount_usd)),
    field("Net", formatMoney(event.net_amount_usd)),
    field("Potential impact", formatMoney(event.potential_impact_amount_usd)),

    sectionHeading("Timeliness & impact"),
    field("Detection delay", `${formatNumber(event.detection_delay_days)} days`),
    field("Recording delay", `${formatNumber(event.recording_delay_days)} days`),
    field("Occurrence to record", `${formatNumber(event.occurrence_to_record_days)} days`),
    field("Affected records", formatNumber(event.affected_records)),
    field("Remediation hours", formatNumber(event.remediation_hours)),

    sectionHeading("Issue"),
    el("p", { className: "narrative", text: formatText(event.issue_detail) }),
    sectionHeading("Root cause detail"),
    el("p", { className: "narrative", text: formatText(event.root_cause_detail) }),
    sectionHeading("Impact"),
    el("p", { className: "narrative", text: formatText(event.impact_detail) }),
    sectionHeading("Opportunity"),
    el("p", { className: "narrative", text: formatText(event.opportunity) }),
  ]);
}

/**
 * Renders the inspector for the selected node. Every figure comes from the
 * node's events intersected with the current filter scope; nothing here is
 * estimated, and person-level concentration is described as workflow
 * concentration rather than individual performance.
 */
export function renderInspector(
  container: HTMLElement,
  data: BrainDataModel,
  nodeId: string | null,
  filteredEventIds: Set<string>,
  callbacks: InspectorCallbacks,
): void {
  container.replaceChildren();

  if (!nodeId) {
    container.className = "empty-state";
    container.textContent = "Select a node or search result to inspect it.";
    return;
  }

  const detail = buildNodeDetail(data, nodeId, filteredEventIds);
  if (!detail) {
    container.className = "empty-state";
    container.textContent = "Unknown entity.";
    return;
  }

  container.className = "inspector-body";
  container.append(
    el("p", { className: "inspector-title", text: detail.node.label }),
    el("p", { className: "inspector-type", text: NODE_TYPE_LABEL[detail.node.type] }),
  );

  if (detail.eventIds.length === 0) {
    container.appendChild(
      el("p", { className: "empty-state", text: "No events for this entity within the current filters." }),
    );
    return;
  }

  // Headline: the handful of figures an analyst wants at a glance, always
  // visible. Everything else — role/severity/exposure detail, timeliness,
  // workflow, related entities — sits behind "More details" so a first
  // glance at the inspector doesn't require scrolling past a full report.
  container.appendChild(statRow("Events in scope", String(detail.eventIds.length)));

  if (detail.node.type === "event") {
    const event = data.eventsById.get(detail.node.label);
    if (event) {
      container.appendChild(statRow("Severity", event.severity));
      container.appendChild(statRow("Exposure", formatAmountSummary(detail.metrics.netAmount)));
      container.appendChild(el("p", { className: "narrative", text: event.event_title }));
      container.appendChild(eventRecord(event));
    }
    return;
  }

  container.appendChild(statRow("Severity mix", severityHeadline(detail)));
  container.appendChild(statRow("Net exposure", formatAmountSummary(detail.metrics.netAmount)));

  if (detail.node.type === "person") {
    container.appendChild(
      el("p", {
        className: "inspector-note",
        text: "Repeated appearances indicate workflow concentration — how work is routed — not individual performance.",
      }),
    );
  }

  const sections: (HTMLElement | null)[] = [
    roleSection(detail),
    severitySection(detail),
    exposureSection(detail),
    timelinessSection(detail),
    workflowSection(detail),
    ...relatedSections(detail, callbacks),
  ];
  const visibleSections = sections.filter((section): section is HTMLElement => section !== null);

  if (visibleSections.length > 0) {
    container.appendChild(
      el("details", { className: "inspector-more" }, [
        el("summary", { text: "More details" }),
        ...visibleSections,
      ]),
    );
  }
}
