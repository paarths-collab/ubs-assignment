import type { IssueDetailResponse, OrganisationBreakdownEntry, RootCauseBreakdownEntry, WorkflowConcentrationEntry } from "../types/issue";
import { el } from "./dom";
import { formatDays, formatMoney, formatPct, formatSignedDays } from "./issueFormat";

function signalRow(signal: IssueDetailResponse["profile"]["triggeredSignals"][number]): HTMLElement {
  return el("li", { className: "signal-row" }, [
    el("div", { className: "signal-card__top" }, [
      el("span", { className: "signal-chip signal-chip--detail" }, [signal.label]),
      el("span", { className: "signal-card__status" }, ["ACTION SIGNAL"]),
    ]),
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

function comparisonCards(rows: { label: string; selected: string; enterprise: string; delta: string; tone?: "positive" | "negative" | "neutral" }[]): HTMLElement {
  return el("div", { className: "comparison-card-grid" }, rows.map((row) => el("div", { className: "comparison-card" }, [
    el("div", { className: "comparison-card__label" }, [row.label]),
    el("div", { className: "comparison-card__values" }, [
      el("div", { className: "comparison-card__metric" }, [
        el("span", { className: "comparison-card__value" }, [row.selected]),
        el("span", { className: "comparison-card__caption" }, ["Issue"]),
      ]),
      el("div", { className: "comparison-card__vs" }, ["vs"]),
      el("div", { className: "comparison-card__metric comparison-card__metric--enterprise" }, [
        el("span", { className: "comparison-card__value" }, [row.enterprise]),
        el("span", { className: "comparison-card__caption" }, ["Enterprise"]),
      ]),
    ]),
    el("div", { className: `comparison-card__delta comparison-card__delta--${row.tone ?? "neutral"}` }, [row.delta]),
  ])));
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
      ]),
    ]),
  );

  const body = el("div", { className: "panel__body" });

  // AI Investigation Brief bar — collapsed by default, only fetches on click
  if (onRunAi) {
    body.append(
      el("div", { className: "ai-brief-bar" }, [
        el("div", { className: "ai-brief-bar__label" }, ["AI Investigation Brief"]),
        el("button", { type: "button", className: "ai-brief-bar__button", onclick: onRunAi }, ["Generate"]),
      ]),
    );
  }

  body.append(el("div", { className: "investigation-summary" }, [detail.deterministicSummary]));

  // Headline facts are deliberately prominent: these are the first numbers an
  // analyst needs to orient themselves, and every value is deterministic.
  body.append(
    el("div", { className: "issue-headline-metrics" }, [
      el("div", { className: "issue-headline-metric issue-headline-metric--blue" }, [
        el("div", { className: "issue-headline-metric__label" }, ["Events"]),
        el("div", { className: "issue-headline-metric__value" }, [String(profile.severity.event_count)]),
        el("div", { className: "issue-headline-metric__sub" }, ["matching issue events"]),
      ]),
      el("div", { className: "issue-headline-metric issue-headline-metric--red" }, [
        el("div", { className: "issue-headline-metric__label" }, ["High rate"]),
        el("div", { className: "issue-headline-metric__value" }, [formatPct(profile.severity.high_rate_pct)]),
        el("div", { className: "issue-headline-metric__sub" }, [`${profile.severity.high_count} High · ${profile.severity.high_rate_lift.toFixed(2)}× enterprise`]),
      ]),
      el("div", { className: "issue-headline-metric issue-headline-metric--green" }, [
        el("div", { className: "issue-headline-metric__label" }, ["Open events"]),
        el("div", { className: "issue-headline-metric__value" }, [String(profile.openWorkload.open_events)]),
        el("div", { className: "issue-headline-metric__sub" }, [formatPct(profile.openWorkload.open_rate_pct), " of issue events"]),
      ]),
      el("div", { className: "issue-headline-metric issue-headline-metric--blue" }, [
        el("div", { className: "issue-headline-metric__label" }, ["Potential impact"]),
        el("div", { className: "issue-headline-metric__value issue-headline-metric__value--money" }, [formatMoney(profile.financials.potential_impact.total)]),
        el("div", { className: "issue-headline-metric__sub" }, [`${profile.financials.potential_impact.populated_count} events with a value`]),
      ]),
    ]),
  );

  // Why am I seeing this — the named, individually-explainable signals with triage.
  const primarySignals = profile.triggeredSignals.filter(s => s.tier === "primary");
  const secondarySignals = profile.triggeredSignals.filter(s => s.tier === "secondary");
  const hasCounterSignals = profile.counterSignals && profile.counterSignals.length > 0;

  const signalContent: (HTMLElement | string)[] = [];

  if (primarySignals.length > 0) {
    signalContent.push(
      el("div", { className: "signal-tier" }, [
        el("div", { className: "signal-tier__label" }, ["PRIMARY SIGNAL"]),
        el("ul", { className: "signal-list" }, primarySignals.slice(0, 2).map(signalRow)),
      ]),
    );
  }

  if (secondarySignals.length > 0) {
    signalContent.push(
      el("div", { className: "signal-tier" }, [
        el("div", { className: "signal-tier__label" }, ["SECONDARY SIGNAL"]),
        el("ul", { className: "signal-list" }, secondarySignals.slice(0, 2).map(signalRow)),
      ]),
    );
  }

  if (hasCounterSignals) {
    signalContent.push(
      el("div", { className: "signal-tier signal-tier--counter" }, [
        el("div", { className: "signal-tier__label signal-tier__label--counter" }, ["COUNTER-SIGNAL"]),
        el(
          "ul",
          { className: "signal-list" },
          profile.counterSignals.slice(0, 2).map((signal) =>
            el("li", { className: "signal-row signal-row--counter" }, [
              el("span", { className: "signal-chip signal-chip--counter signal-chip--detail" }, [signal.label]),
              el("span", { className: "signal-row__detail" }, [signal.detail]),
            ]),
          ),
        ),
      ]),
    );
  }

  const signalSection = el("div", { className: "panel-subsection" }, [
    el("div", { className: "panel-subsection__title" }, ["Signal triage"]),
  ]);
  if (signalContent.length > 0) {
    signalContent.forEach((item) => signalSection.append(item));
  } else {
    signalSection.append(el("div", { className: "empty-state" }, ["No signal cleared its configured threshold for this issue."]));
  }
  body.append(signalSection);

  // Evidence sections — all collapsed by default using <details>
  const evidenceContainer = el("div", { className: "evidence-sections" });

  // Severity & enterprise comparison
  evidenceContainer.append(
    el("details", { className: "evidence-detail" }, [
      el("summary", {}, ["Severity & enterprise comparison"]),
      el("div", { className: "evidence-detail-content" }, [
        comparisonCards([
              {
                label: "High-severity rate",
                selected: formatPct(profile.severity.high_rate_pct),
                enterprise: formatPct(profile.severity.enterprise_high_rate_pct),
                delta: `${profile.severity.high_rate_lift.toFixed(2)}x concentration`,
                tone: "negative",
              },
              {
                label: "Open rate",
                selected: formatPct(profile.openWorkload.open_rate_pct),
                enterprise: formatPct(profile.openWorkload.enterprise_open_rate_pct),
                delta: formatSignedPctPoints(profile.openWorkload.open_rate_pct - profile.openWorkload.enterprise_open_rate_pct),
                tone: profile.openWorkload.open_rate_pct >= profile.openWorkload.enterprise_open_rate_pct ? "negative" : "positive",
              },
              {
                label: "Detection delay (mean)",
                selected: formatDays(profile.timeliness.detection_delay.mean_days),
                enterprise: formatDays(profile.timeliness.detection_delay.enterprise_mean_days),
                delta: formatSignedDays(profile.timeliness.detection_delay.delta_days),
                tone: (profile.timeliness.detection_delay.delta_days ?? 0) > 0 ? "negative" : "positive",
              },
              {
                label: "Recording delay (mean)",
                selected: formatDays(profile.timeliness.recording_delay.mean_days),
                enterprise: formatDays(profile.timeliness.recording_delay.enterprise_mean_days),
                delta: formatSignedDays(profile.timeliness.recording_delay.delta_days),
                tone: (profile.timeliness.recording_delay.delta_days ?? 0) > 0 ? "negative" : "positive",
              },
              {
                label: "Occurrence-to-record (mean)",
                selected: formatDays(profile.timeliness.occurrence_to_record.mean_days),
                enterprise: formatDays(profile.timeliness.occurrence_to_record.enterprise_mean_days),
                delta: formatSignedDays(profile.timeliness.occurrence_to_record.delta_days),
                tone: (profile.timeliness.occurrence_to_record.delta_days ?? 0) > 0 ? "negative" : "positive",
              },
            ]),
      ]),
    ]),
  );

  // Failure pattern — root cause distribution
  evidenceContainer.append(
    el("details", { className: "evidence-detail" }, [
      el("summary", {}, ["Root-cause relationships"]),
      el("div", { className: "evidence-detail-content" }, [
        profile.strongestRootCauseCombination
          ? el("div", { className: "callout callout--strong" }, [
              `★ Strongest interaction: "${profile.strongestRootCauseCombination.root_cause}" — ${profile.strongestRootCauseCombination.event_count} events, ${profile.strongestRootCauseCombination.high_count} High, ${formatPct(profile.strongestRootCauseCombination.high_rate_pct)} High rate, ${profile.strongestRootCauseCombination.high_rate_lift.toFixed(2)}x the enterprise baseline.`,
            ])
          : el("div", { className: "callout" }, ["No root-cause combination for this issue clears the minimum support threshold (5 events) for a reliable lift estimate."]),
        rootCauseTable(profile.rootCauseBreakdown, profile.strongestRootCauseCombination),
      ]),
    ]),
  );

  // Organisation analysis — rates, not volume shares
  evidenceContainer.append(
    el("details", { className: "evidence-detail" }, [
      el("summary", {}, ["Organisation spread"]),
      el("div", { className: "evidence-detail-content" }, [
        el("div", { className: "panel-subsection__note" }, [
          "Organisation event volume is uniform by construction (always 4 organisations, ~25% share each) and is not shown as a signal. High rate per organisation is the only part of this breakdown that varies.",
        ]),
        organisationTable(profile.organisationBreakdown),
      ]),
    ]),
  );

  // Workflow concentration — never individual blame.
  evidenceContainer.append(
    el("details", { className: "evidence-detail" }, [
      el("summary", {}, ["Workflow / people concentration"]),
      el("div", { className: "evidence-detail-content" }, [
        el("div", { className: "panel-subsection__note" }, [
          "Repeated names reflect how handling clusters within this issue's workflow — not an assessment of individual performance or wrongdoing.",
        ]),
        el("div", { className: "section-grid", style: "grid-template-columns:1fr 1fr;gap:var(--space-3)" }, [
          workflowConcentrationList("Owner", profile.ownerConcentration),
          workflowConcentrationList("Current assignee", profile.assigneeConcentration),
        ]),
      ]),
    ]),
  );

  // Financial exposure
  evidenceContainer.append(
    el("details", { className: "evidence-detail" }, [
      el("summary", {}, ["Financial exposure"]),
      el("div", { className: "evidence-detail-content" }, [
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
    ]),
  );

  // Trend
  evidenceContainer.append(
    el("details", { className: "evidence-detail" }, [
      el("summary", {}, ["Timeliness"]),
      el("div", { className: "evidence-detail-content" }, [
        el("div", { className: `callout ${profile.trend.material_change ? "callout--strong" : ""}` }, [profile.trend.note]),
      ]),
    ]),
  );

  // Add all evidence sections
  body.append(
    el("div", { className: "panel-subsection" }, [
      el("div", { className: "panel-subsection__title" }, ["EVIDENCE"]),
      evidenceContainer,
    ]),
  );

  // Related precomputed patterns — trim to top 4-5
  const topPatterns = profile.relatedPatterns.slice(0, 5);
  const hasMorePatterns = profile.relatedPatterns.length > 5;

  body.append(
    el("div", { className: "panel-subsection" }, [
      el("div", { className: "panel-subsection__title" }, ["Related patterns"]),
      profile.relatedPatterns.length === 0
        ? el("div", { className: "empty-state" }, ["No precomputed pattern matches this issue."])
        : el(
            "ul",
            { className: "related-pattern-list" },
            topPatterns.map((p) =>
              el("li", { className: "related-pattern-list__row" }, [
                el("span", { className: "related-pattern-list__lift" }, [`${p.high_rate_lift.toFixed(2)}x`]),
                el("span", { className: "related-pattern-list__title" }, [p.title]),
              ]),
            ),
          ),
      hasMorePatterns
        ? el("button", { type: "button", className: "btn-reset panel-subsection__note", style: "text-align:left;margin-top:var(--space-2)" }, [
            `View all ${profile.relatedPatterns.length} analytical relationships →`,
          ])
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
