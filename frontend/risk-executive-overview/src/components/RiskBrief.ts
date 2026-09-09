import type { AppContext } from "../state/AppContext";
import type { BreakdownRow, ScenarioSignal } from "../types";
import { el } from "./dom";
import { renderAIAnalysisPanel } from "./AIAnalysisPanel";
import { formatUsd, formatPercent, shortOrgName } from "../services/format";

const money = (value: number | null): string => (value == null ? "Not applicable" : formatUsd(value));
const share = (value: number | null): string => (value == null ? "—" : formatPercent(value));

function summaryFigure(label: string, value: string, tone = ""): HTMLElement {
  return el("div", { className: `brief-figure${tone ? ` brief-figure--${tone}` : ""}` }, [
    el("div", { className: "brief-figure__value" }, [value]),
    el("div", { className: "brief-figure__label" }, [label]),
  ]);
}

function field(label: string, value: string): HTMLElement {
  return el("div", { className: "brief-field" }, [
    el("span", { className: "brief-field__label" }, [label]),
    el("span", { className: "brief-field__value" }, [value]),
  ]);
}

/**
 * `stacked` lays children out in a column rather than the field grid — used
 * where a section mixes fields with a table, since nesting the field grid
 * inside itself stretches every tile to the table's height.
 */
function briefSection(
  title: string,
  children: HTMLElement[],
  options: { note?: string; stacked?: boolean } = {},
): HTMLElement {
  return el("section", { className: "brief-section" }, [
    el("h4", { className: "brief-section__title" }, [title]),
    options.note ? el("p", { className: "brief-section__note" }, [options.note]) : null,
    el("div", { className: options.stacked ? "brief-section__stack" : "brief-section__body" }, children),
  ]);
}

function miniTable(rows: BreakdownRow[], keyHeader: string, shorten = false, limit = 6): HTMLElement {
  return el("div", { className: "scroll-x" }, [
    el("table", { className: "brief-table" }, [
      el("thead", {}, [
        el("tr", {}, [
          el("th", {}, [keyHeader]),
          el("th", { className: "is-num" }, ["Events"]),
          el("th", { className: "is-num" }, ["High"]),
          el("th", { className: "is-num" }, ["Open"]),
          el("th", { className: "is-num" }, ["Potential"]),
        ]),
      ]),
      el(
        "tbody",
        {},
        rows.slice(0, limit).map((row) =>
          el("tr", {}, [
            el("td", {}, [shorten ? shortOrgName(row.key) : row.key]),
            el("td", { className: "is-num" }, [String(row.eventCount)]),
            el("td", { className: `is-num${row.highSeverityCount > 0 ? " is-high" : ""}` }, [
              String(row.highSeverityCount),
            ]),
            el("td", { className: "is-num" }, [String(row.openEventCount)]),
            el("td", { className: "is-num" }, [
              row.potentialImpactUsd == null ? "—" : formatUsd(row.potentialImpactUsd),
            ]),
          ]),
        ),
      ),
    ]),
  ]);
}

function repeatedCount(rows: BreakdownRow[]): number {
  return rows.filter((row) => row.eventCount > 1).length;
}

function renderBriefBody(signal: ScenarioSignal): HTMLElement {
  const a = signal.analytics;
  const sev = a.severity.counts;
  const timeliness = a.timeliness;

  return el("div", { className: "brief-body" }, [
    el("div", { className: "brief-headline" }, [
      el("h3", { className: "brief-headline__title" }, [signal.title]),
      el("p", { className: "brief-headline__issue" }, [signal.issueDetail]),
    ]),

    el("div", { className: "brief-figures" }, [
      summaryFigure("Events", String(signal.eventCount)),
      summaryFigure("High", String(signal.highSeverityCount), signal.highSeverityCount > 0 ? "high" : ""),
      summaryFigure("Open", String(signal.openEventCount)),
      summaryFigure("Organisations", String(a.recurrence.organisationCount)),
      summaryFigure("Net", money(a.exposure.netAmountUsd)),
      summaryFigure("Potential", money(a.exposure.potentialImpactUsd)),
    ]),

    el("div", { className: "brief-grid" }, [
      briefSection("Severity & workflow", [
        field("High", String(sev.High ?? 0)),
        field("Moderate", String(sev.Moderate ?? 0)),
        field("Low", String(sev.Low ?? 0)),
        field("Open", String(a.workflow.openEventCount)),
        field("Closed", String(a.workflow.closedEventCount)),
        field("Unresolved", share(a.workflow.openShare)),
      ]),

      briefSection("Exposure", [
        field("Gross", money(a.exposure.grossAmountUsd)),
        field("Recovery", money(a.exposure.recoveryAmountUsd)),
        field("Net", money(a.exposure.netAmountUsd)),
        field("Potential impact", money(a.exposure.potentialImpactUsd)),
        field("Share of filtered net", share(a.concentration.shareOfFilteredNetExposure)),
        field("Share of filtered High", share(a.concentration.shareOfFilteredHighSeverity)),
      ]),

      briefSection("Timeliness (days)", [
        field("Detection median", timeliness.detectionDelayDays ? String(timeliness.detectionDelayDays.median) : "—"),
        field("Recording median", timeliness.recordingDelayDays ? String(timeliness.recordingDelayDays.median) : "—"),
        field(
          "Occurrence → record max",
          timeliness.occurrenceToRecordDays ? String(timeliness.occurrenceToRecordDays.max) : "—",
        ),
        field("Remediation total", `${a.effort.totalRemediationHours.toLocaleString()} hrs`),
        field("Average per event", `${a.effort.averagePerEvent} hrs`),
        field("Max per event", `${a.effort.maxPerEvent} hrs`),
      ]),
    ]),

    briefSection("Organisation spread", [miniTable(a.organisations, "Organisation", true)], { stacked: true }),

    briefSection(
      "Workflow concentration",
      [
        el("div", { className: "brief-section__body" }, [
          field("Unique owners", String(a.recurrence.ownerCount)),
          field("Repeated owners", String(repeatedCount(a.owners))),
          field("Unique assignees", String(a.recurrence.assigneeCount)),
          field("Repeated assignees", String(repeatedCount(a.assignees))),
        ]),
        miniTable(a.owners, "Owner"),
      ],
      { stacked: true, note: "Workflow concentration — not individual fault attribution." },
    ),

    briefSection("Root cause", [miniTable(a.rootCauses, "Root cause")], { stacked: true }),

    briefSection(
      "Evidence",
      [
        el("div", { className: "brief-evidence" }, [
          el("div", { className: "brief-field__label" }, [`${signal.eventIds.length} matching Event IDs`]),
          el(
            "div",
            { className: "evidence-ids" },
            signal.eventIds.slice(0, 60).map((id) => el("span", {}, [id])),
          ),
        ]),
      ],
      { stacked: true },
    ),

    el("p", { className: "brief-interpretation" }, [a.recurrence.interpretation]),
  ]);
}

export function renderRiskBrief(ctx: AppContext, host: HTMLElement): void {
  const analysisHost = el("div", {});
  renderAIAnalysisPanel(ctx, analysisHost);
  let lastRenderedId: string | null = null;

  function sync(): void {
    const scenario = ctx.getSelectedScenario();

    if (!scenario) {
      lastRenderedId = null;
      host.replaceChildren(
        el("div", { className: "brief-empty" }, ["Select an issue above to inspect the risk in detail."]),
      );
      return;
    }

    if (scenario.scenarioId === lastRenderedId) return;
    lastRenderedId = scenario.scenarioId;

    host.replaceChildren(renderBriefBody(scenario), analysisHost);
  }

  ctx.subscribe(sync);
  sync();
}
