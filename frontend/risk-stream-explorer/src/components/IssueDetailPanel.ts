import type { IssueDetailResponse, OrganisationBreakdownEntry, RootCauseBreakdownEntry, WorkflowConcentrationEntry } from "../types/issue";
import { el } from "./dom";
import { formatDays, formatMoney, formatPct, formatSignedDays } from "./issueFormat";

function signalRow(signal: IssueDetailResponse["profile"]["triggeredSignals"][number]): HTMLElement {
  return el("li", { className: "signal-row" }, [
    el("span", { className: "signal-chip signal-chip--detail" }, [signal.label]),
    el("span", { className: "signal-row__detail" }, [signal.detail]),
  ]);
}

function comparisonRow(label: string, selected: string, enterprise: string, deltaLabel: string): HTMLElement {
  return el("tr", {}, [
    el("td", {}, [label]),
    el("td", {}, [selected]),
    el("td", {}, [enterprise]),
    el("td", { style: "color:var(--accent-amber)" }, [deltaLabel]),
  ]);
}

function rootCauseTable(entries: RootCauseBreakdownEntry[], strongest: RootCauseBreakdownEntry | null): HTMLElement {
  if (entries.length === 0) return el("div", { className: "empty-state" }, ["No root-cause data."]);
  return el("div", { className: "scroll-x" }, [
    el("table", { className: "comparison-table root-cause-table" }, [
      el("thead", {}, [
        el("tr", {}, [
          el("th", {}, ["Root cause"]),
          el("th", {}, ["Events"]),
          el("th", {}, ["High"]),
          el("th", {}, ["High rate"]),
          el("th", {}, ["Lift vs enterprise"]),
        ]),
      ]),
      el(
        "tbody",
        {},
        entries.map((entry) => {
          const isStrongest = strongest !== null && entry.root_cause === strongest.root_cause;
          return el("tr", { className: isStrongest ? "root-cause-table__row--strongest" : undefined }, [
            el("td", {}, [isStrongest ? `${entry.root_cause} ★` : entry.root_cause]),
            el("td", {}, [String(entry.event_count)]),
            el("td", {}, [String(entry.high_count)]),
            el("td", {}, [formatPct(entry.high_rate_pct)]),
            el("td", {}, [
              entry.meets_support_threshold
                ? `${entry.high_rate_lift.toFixed(2)}x`
                : el("span", { className: "small-sample-note", title: "Fewer than 5 events — lift is not treated as meaningful." }, [
                    `${entry.high_rate_lift.toFixed(2)}x (low support)`,
                  ]),
            ]),
          ]);
        }),
      ),
    ]),
  ]);
}

function organisationTable(entries: OrganisationBreakdownEntry[]): HTMLElement {
  if (entries.length === 0) return el("div", { className: "empty-state" }, ["No organisation data."]);
  return el("div", { className: "scroll-x" }, [
    el("table", { className: "comparison-table" }, [
      el("thead", {}, [
        el("tr", {}, [el("th", {}, ["Organisation"]), el("th", {}, ["Events"]), el("th", {}, ["High"]), el("th", {}, ["High rate"])]),
      ]),
      el(
        "tbody",
        {},
        entries.map((entry) =>
          el("tr", {}, [
            el("td", {}, [entry.organisation]),
            el("td", {}, [String(entry.event_count)]),
            el("td", {}, [String(entry.high_count)]),
            el("td", {}, [
              formatPct(entry.high_rate_pct),
              entry.small_sample
                ? el("span", { className: "small-sample-note", title: `Only ${entry.high_count} High-classified events — rate may swing sharply with one more or fewer.` }, [
                    " (small sample)",
                  ])
                : null,
            ]),
          ]),
        ),
      ),
    ]),
  ]);
}

function workflowConcentrationList(title: string, entries: WorkflowConcentrationEntry[]): HTMLElement {
  return el("div", {}, [
    el("div", { className: "panel-subsection__subtitle" }, [title]),
    entries.length === 0
      ? el("div", { className: "empty-state" }, ["No data."])
      : el(
          "ul",
          { className: "breakdown-list" },
          entries.map((entry) =>
            el("li", { className: "breakdown-list__row" }, [
              el("span", { className: "breakdown-list__label", title: entry.name }, [entry.name]),
              el("span", { className: "breakdown-list__value" }, [`${entry.event_count} · ${formatPct(entry.share_pct)}`]),
            ]),
          ),
        ),
  ]);
}

/**
 * Renders the full deterministic analysis for one issue: overview, enterprise
 * comparison, failure pattern (root-cause distribution with the strongest
 * combination highlighted), organisation analysis (rates with small-sample
 * caveats), workflow concentration (never framed as individual blame),
 * financial exposure kept separate from severity, timeliness, trend (or an
 * explicit "no material change"), related precomputed patterns, and matching
 * Event IDs. Every number here comes straight from the API response —
 * nothing depends on the AI panel loading successfully.
 */
export function renderIssueDetailPanel(
  container: HTMLElement,
  detail: IssueDetailResponse,
  onOpenEvent: (eventId: string) => void,
  onRunAi?: () => void,
): void {
  const { profile } = detail;

  container.innerHTML = "";
  container.append(
    el("div", { className: "panel__header" }, [
      el("span", { className: "panel__title" }, [profile.issue]),
      el("div", { className: "panel__header-actions" }, [
        el("span", { className: "pattern-card__id" }, [`${profile.rankScore} signal${profile.rankScore === 1 ? "" : "s"}`]),
        ...(onRunAi ? [el("button", { type: "button", className: "btn-ai-corner", title: "Ask Groq to interpret this evidence", onclick: onRunAi }, ["◈ AI"])] : []),
      ]),
    ]),
  );

  const body = el("div", { className: "panel__body" }, [
    el("div", { className: "investigation-summary" }, [detail.deterministicSummary]),
  ]);

  // Why am I seeing this — the named, individually-explainable signals.
  body.append(
    el("div", { className: "panel-subsection" }, [
      el("div", { className: "panel-subsection__title" }, ["Why this issue was surfaced"]),
      profile.triggeredSignals.length > 0
        ? el("ul", { className: "signal-list" }, profile.triggeredSignals.map(signalRow))
        : el("div", { className: "empty-state" }, ["No signal cleared its configured threshold for this issue."]),
    ]),
  );

  // Enterprise comparison
  body.append(
    el("div", { className: "panel-subsection" }, [
      el("div", { className: "panel-subsection__title" }, ["This issue vs. enterprise baseline"]),
      el("div", { className: "scroll-x" }, [
        el("table", { className: "comparison-table" }, [
          el("thead", {}, [
            el("tr", {}, [el("th", {}, ["Metric"]), el("th", {}, ["Issue"]), el("th", {}, ["Enterprise"]), el("th", {}, ["Delta"])]),
          ]),
          el("tbody", {}, [
            comparisonRow(
              "High-severity rate",
              formatPct(profile.severity.high_rate_pct),
              formatPct(profile.severity.enterprise_high_rate_pct),
              `${profile.severity.high_rate_lift.toFixed(2)}x`,
            ),
            comparisonRow(
              "Open rate",
              formatPct(profile.openWorkload.open_rate_pct),
              formatPct(profile.openWorkload.enterprise_open_rate_pct),
              formatSignedPctPoints(profile.openWorkload.open_rate_pct - profile.openWorkload.enterprise_open_rate_pct),
            ),
            comparisonRow(
              "Detection delay (mean)",
              formatDays(profile.timeliness.detection_delay.mean_days),
              formatDays(profile.timeliness.detection_delay.enterprise_mean_days),
              formatSignedDays(profile.timeliness.detection_delay.delta_days),
            ),
            comparisonRow(
              "Recording delay (mean)",
              formatDays(profile.timeliness.recording_delay.mean_days),
              formatDays(profile.timeliness.recording_delay.enterprise_mean_days),
              formatSignedDays(profile.timeliness.recording_delay.delta_days),
            ),
            comparisonRow(
              "Occurrence-to-record (mean)",
              formatDays(profile.timeliness.occurrence_to_record.mean_days),
              formatDays(profile.timeliness.occurrence_to_record.enterprise_mean_days),
              formatSignedDays(profile.timeliness.occurrence_to_record.delta_days),
            ),
          ]),
        ]),
      ]),
    ]),
  );

  // Failure pattern — which combination is problematic, not which is biggest.
  body.append(
    el("div", { className: "panel-subsection" }, [
      el("div", { className: "panel-subsection__title" }, ["Failure pattern — root cause distribution"]),
      profile.strongestRootCauseCombination
        ? el("div", { className: "callout callout--strong" }, [
            `★ Strongest interaction: "${profile.strongestRootCauseCombination.root_cause}" — ${profile.strongestRootCauseCombination.event_count} events, ${profile.strongestRootCauseCombination.high_count} High, ${formatPct(profile.strongestRootCauseCombination.high_rate_pct)} High rate, ${profile.strongestRootCauseCombination.high_rate_lift.toFixed(2)}x the enterprise baseline.`,
          ])
        : el("div", { className: "callout" }, ["No root-cause combination for this issue clears the minimum support threshold (5 events) for a reliable lift estimate."]),
      rootCauseTable(profile.rootCauseBreakdown, profile.strongestRootCauseCombination),
    ]),
  );

  // Organisation analysis — rates, not volume shares (volume share is flat by construction).
  body.append(
    el("div", { className: "panel-subsection" }, [
      el("div", { className: "panel-subsection__title" }, ["Organisation analysis — High rate by organisation"]),
      el("div", { className: "panel-subsection__note" }, [
        "Organisation event volume is uniform by construction (always 4 organisations, ~25% share each) and is not shown as a signal. High rate per organisation is the only part of this breakdown that varies.",
      ]),
      organisationTable(profile.organisationBreakdown),
    ]),
  );

  // Workflow concentration — never individual blame.
  body.append(
    el("div", { className: "panel-subsection" }, [
      el("div", { className: "panel-subsection__title" }, ["Workflow concentration (owner / assignee)"]),
      el("div", { className: "panel-subsection__note" }, [
        "Repeated names reflect how handling clusters within this issue's workflow — not an assessment of individual performance or wrongdoing.",
      ]),
      el("div", { className: "section-grid", style: "grid-template-columns:1fr 1fr;gap:var(--space-3)" }, [
        workflowConcentrationList("Owner", profile.ownerConcentration),
        workflowConcentrationList("Current assignee", profile.assigneeConcentration),
      ]),
    ]),
  );

  // Financial exposure — kept separate from severity, so counts never dominate.
  body.append(
    el("div", { className: "panel-subsection" }, [
      el("div", { className: "panel-subsection__title" }, ["Financial exposure"]),
      el("div", { className: "metric-grid" }, [
        el("div", { className: "metric-card" }, [
          el("div", { className: "metric-card__label" }, ["Gross amount"]),
          el("div", { className: "metric-card__value" }, [formatMoney(profile.financials.gross_amount.total)]),
          el("div", { className: "metric-card__sub" }, [`${profile.financials.gross_amount.populated_count} of ${profile.financials.gross_amount.event_count} events`]),
        ]),
        el("div", { className: "metric-card" }, [
          el("div", { className: "metric-card__label" }, ["Net amount"]),
          el("div", { className: "metric-card__value" }, [formatMoney(profile.financials.net_amount.total)]),
          el("div", { className: "metric-card__sub" }, [`${profile.financials.net_amount.populated_count} of ${profile.financials.net_amount.event_count} events`]),
        ]),
        el("div", { className: "metric-card" }, [
          el("div", { className: "metric-card__label" }, ["Recovery amount"]),
          el("div", { className: "metric-card__value" }, [formatMoney(profile.financials.recovery_amount.total)]),
          el("div", { className: "metric-card__sub" }, [`${profile.financials.recovery_amount.populated_count} of ${profile.financials.recovery_amount.event_count} events`]),
        ]),
        el("div", { className: "metric-card" }, [
          el("div", { className: "metric-card__label" }, ["Potential impact"]),
          el("div", { className: "metric-card__value" }, [formatMoney(profile.financials.potential_impact.total)]),
          el("div", { className: "metric-card__sub" }, [`${profile.financials.potential_impact.populated_count} of ${profile.financials.potential_impact.event_count} events`]),
        ]),
      ]),
      el("div", { className: "panel-subsection__subtitle", style: "margin-top:var(--space-2)" }, ["Net exposure concentration"]),
      profile.netExposureConcentration.top_share_pct !== null
        ? el("div", { className: "callout" }, [
            `The top ${profile.netExposureConcentration.top_n} events by net amount account for ${formatPct(profile.netExposureConcentration.top_share_pct)} of this issue's total net exposure (${formatMoney(profile.netExposureConcentration.total_net_amount)} across ${profile.netExposureConcentration.populated_count} events with a populated net amount).`,
          ])
        : el("div", { className: "empty-state" }, ["No events in this issue have a populated net amount."]),
      profile.netExposureConcentration.top_event_ids.length > 0
        ? el(
            "div",
            { className: "event-id-chip-list", style: "margin-top:var(--space-2)" },
            profile.netExposureConcentration.top_event_ids.map((eventId) =>
              el("button", { type: "button", className: "event-id-chip", onclick: () => onOpenEvent(eventId) }, [eventId]),
            ),
          )
        : null,
    ]),
  );

  // Trend — or an explicit "no material change".
  body.append(
    el("div", { className: "panel-subsection" }, [
      el("div", { className: "panel-subsection__title" }, ["Trend"]),
      el("div", { className: `callout ${profile.trend.material_change ? "callout--strong" : ""}` }, [profile.trend.note]),
    ]),
  );

  // Related precomputed patterns — reused as evidence, not recomputed.
  body.append(
    el("div", { className: "panel-subsection" }, [
      el("div", { className: "panel-subsection__title" }, [`Related patterns (${profile.relatedPatterns.length})`]),
      profile.relatedPatterns.length === 0
        ? el("div", { className: "empty-state" }, ["No precomputed pattern matches this issue."])
        : el(
            "ul",
            { className: "related-pattern-list" },
            profile.relatedPatterns.map((p) =>
              el("li", { className: "related-pattern-list__row" }, [
                el("span", { className: "pattern-card__id" }, [p.pattern_id]),
                el("span", { className: "related-pattern-list__title" }, [p.title]),
                el("span", { className: `priority-pill priority-pill--${p.priority_level.toLowerCase() === "high" ? "high" : "medium"}` }, [p.priority_level]),
                el("span", { className: "related-pattern-list__lift" }, [`${p.high_rate_lift.toFixed(2)}x`]),
              ]),
            ),
          ),
      profile.relatedPatterns.length > 0
        ? el("div", { className: "panel-subsection__note", style: "margin-top:var(--space-2)" }, ["Open the full pattern library from the Pattern Intelligence view for each pattern's own deterministic evidence and AI interpretation."])
        : null,
    ]),
  );

  // Matching event IDs
  body.append(
    el("div", { className: "panel-subsection" }, [
      el("div", { className: "panel-subsection__title" }, [`Matching events (${profile.matchingEventIds.length})`]),
      el(
        "div",
        { className: "event-id-chip-list" },
        profile.matchingEventIds.map((eventId) => el("button", { type: "button", className: "event-id-chip", onclick: () => onOpenEvent(eventId) }, [eventId])),
      ),
    ]),
  );

  container.append(body);
}

function formatSignedPctPoints(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded >= 0 ? "+" : ""}${rounded.toFixed(1)}pp`;
}
