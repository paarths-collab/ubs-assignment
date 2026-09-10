import type { IssueSummary } from "../types/issue";
import { el } from "./dom";
import { formatMoney, formatPct } from "./issueFormat";

/** Top-of-list cards show at most this many by default; the rest are reachable via "Show all N issues". */
const DEFAULT_VISIBLE_COUNT = 8;

function signalChip(signal: IssueSummary["triggeredSignals"][number]): HTMLElement {
  return el("span", { className: "signal-chip", title: signal.detail }, [signal.label]);
}

function issueCard(summary: IssueSummary, isSelected: boolean, onSelect: (slug: string) => void): HTMLElement {
  const cardCls = summary.rankScore > 0 ? "issue-card issue-card--flagged" : "issue-card issue-card--quiet";
  const combo = summary.headline.strongestRootCauseCombination;

  return el(
    "button",
    {
      type: "button",
      className: cardCls,
      "aria-pressed": String(isSelected),
      onclick: () => onSelect(summary.slug),
    },
    [
      el("div", { className: "issue-card__top" }, [
        el("span", { className: "issue-card__rank" }, [`#${summary.rank}`]),
        el("span", { className: "issue-card__score" }, [`${summary.rankScore} signal${summary.rankScore === 1 ? "" : "s"}`]),
      ]),
      el("div", { className: "issue-card__title" }, [summary.issue]),
      summary.whyItSurfaced
        ? el("div", { className: "issue-card__why" }, [summary.whyItSurfaced])
        : null,
      el("div", { className: "issue-card__supporting-line" }, [
        ...(summary.counterSignals && summary.counterSignals.length > 0 ? [summary.counterSignals[0]?.label, " · "] : []),
        String(summary.headline.open_events),
        " open · ",
        formatMoney(summary.headline.potential_impact),
      ]),
      combo
        ? el("div", { className: "issue-card__combo" }, [
            el("span", { className: "issue-card__combo-label" }, ["Root-cause interaction: "]),
            `${combo.root_cause} — ${combo.high_rate_lift.toFixed(2)}x High concentration`,
          ])
        : null,
    ],
  );
}

/**
 * Renders "Issues Requiring Attention" — the top-ranked issues, each card
 * showing its triggered signals (named, individually explainable) and the
 * real differentiating numbers. Event count is deliberately NOT shown here
 * as a headline stat: every issue has ~66-67 events by construction, so it
 * carries no information about which issue matters more.
 */
export function renderIssueAttentionList(
  container: HTMLElement,
  issues: IssueSummary[],
  selectedSlug: string | null,
  onSelect: (slug: string) => void,
  showAll: boolean,
  onToggleShowAll: () => void,
): void {
  container.innerHTML = "";
  if (issues.length === 0) {
    container.append(el("div", { className: "empty-state" }, ["No issues available."]));
    return;
  }

  const visible = showAll ? issues : issues.slice(0, DEFAULT_VISIBLE_COUNT);

  container.append(
    el(
      "div",
      { className: "issue-grid" },
      visible.map((summary) => issueCard(summary, summary.slug === selectedSlug, onSelect)),
    ),
  );

  if (issues.length > DEFAULT_VISIBLE_COUNT) {
    container.append(
      el(
        "button",
        { type: "button", className: "btn-reset issue-list__toggle", onclick: onToggleShowAll },
        [showAll ? "Show top issues only" : `Show all ${issues.length} issues (including those with no material signal)`],
      ),
    );
  }
}
