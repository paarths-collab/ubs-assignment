import { getPeriodDetail, type PeriodInsightIntent } from "@backend/index";
import { formatDays, formatMoney, formatPercent } from "@backend/index";
import type { AppContext } from "../state/AppContext";
import { el } from "./dom";
import { metricCard, deltaBadge } from "./metricCard";
import { breakdownList } from "./breakdownList";
import { renderAIPanel } from "./AIInsightPanel";
import { renderEventCard } from "./EventCard";
import { analysePeriod } from "../services/LLMClient";
import { followUpComposer } from "./FollowUpComposer";

const PERIOD_AI_ACTIONS: { intent: PeriodInsightIntent; label: string }[] = [
  { intent: "explain_period", label: "Explain this period" },
  { intent: "what_changed", label: "What changed?" },
  { intent: "what_is_driving_change", label: "What is driving the change?" },
  { intent: "what_to_investigate", label: "What should we investigate?" },
  { intent: "control_considerations", label: "Control considerations" },
];

export function renderPeriodInvestigation(ctx: AppContext, container: HTMLElement): void {
  function draw(): void {
    const state = ctx.getState();
    const period = ctx.getSelectedPeriod();

    container.innerHTML = "";

    if (!period) {
      container.append(
        el("div", { className: "empty-state" }, [
          "Select a month or week on the timeline above to see the period summary, day-by-day events, and AI analysis.",
        ]),
      );
      return;
    }

    const filteredEvents = ctx.getFilteredEvents();
    const datasetBounds = {
      earliestOccurrenceDate: ctx.repository.getEarliestOccurrenceDate() ?? period.startDate,
      latestOccurrenceDate: ctx.repository.getLatestOccurrenceDate() ?? period.endDate,
    };
    const detail = getPeriodDetail(filteredEvents, period, datasetBounds);
    const m = detail.comparison.current;

    const summaryCol = el("div", { className: "panel" }, [
      el("div", { className: "panel__header" }, [
        el("span", { className: "panel__title" }, [`${period.label} — Period Summary`]),
        el(
          "button",
          { type: "button", className: "btn-reset", onclick: () => ctx.selectPeriod(period.id) },
          ["Close"],
        ),
      ]),
      el("div", { className: "panel__body" }, [
        el("div", { className: "metric-grid" }, [
          metricCard("Events", String(m.eventCount), undefined, deltaBadge(detail.comparison.eventCountDelta)),
          metricCard(
            "Severity mix",
            `${m.severityCounts.High}H / ${m.severityCounts.Moderate}M / ${m.severityCounts.Low}L`,
            `High share ${formatPercent(m.severityShares.High)}`,
          ),
          metricCard(
            "Financial / Non-Financial",
            `${m.eventTypeCounts.Financial} / ${m.eventTypeCounts["Non-Financial"]}`,
            `Financial share ${formatPercent(m.eventTypeShares.Financial)}`,
          ),
          metricCard(
            "Net exposure",
            formatMoney(m.financial.netAmount.populatedCount > 0 ? m.financial.netAmount.total : null),
            `${m.financial.netAmount.populatedCount}/${m.financial.netAmount.totalEventCount} events populated`,
            deltaBadge(detail.comparison.netAmountDelta, true),
          ),
          metricCard(
            "Potential impact",
            formatMoney(m.financial.potentialImpact.populatedCount > 0 ? m.financial.potentialImpact.total : null),
            `${m.financial.potentialImpact.populatedCount}/${m.financial.potentialImpact.totalEventCount} events populated`,
            deltaBadge(detail.comparison.potentialImpactDelta, true),
          ),
          metricCard(
            "Recovery",
            m.financial.recoveryRate !== null ? formatPercent(m.financial.recoveryRate) : "Not available",
            `${m.financial.recoveryAmount.populatedCount} recovered observations`,
          ),
          metricCard(
            "Avg occurrence→record",
            formatDays(m.delays.averageOccurrenceToRecordDays),
            `Median ${formatDays(m.delays.medianOccurrenceToRecordDays)}`,
            deltaBadge(detail.comparison.avgOccurrenceToRecordDelta, true),
          ),
        ]),

        el("div", { className: "section-grid", style: "margin-top:20px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))" }, [
          el("div", {}, [el("div", { className: "panel__title", style: "margin-bottom:10px" }, ["Top organisations"]), breakdownList(m.organisationBreakdown), followUpComposer("Top organisations", (q, s) => analysePeriod("explain_period", state.granularity, period.id, state.filters, q, s))]),
          el("div", {}, [el("div", { className: "panel__title", style: "margin-bottom:10px" }, ["Top root causes"]), breakdownList(m.rootCauseBreakdown), followUpComposer("Top root causes", (q, s) => analysePeriod("what_is_driving_change", state.granularity, period.id, state.filters, q, s))]),
          el("div", {}, [el("div", { className: "panel__title", style: "margin-bottom:10px" }, ["Top issues"]), breakdownList(m.issueDetailBreakdown), followUpComposer("Top issues", (q, s) => analysePeriod("what_to_investigate", state.granularity, period.id, state.filters, q, s))]),
        ]),

        (() => {
          const aiHost = el("div", { className: "ai-panel", style: "margin-top:20px" });
          // Only the selection goes to the server; it recomputes the facts.
          renderAIPanel(
            aiHost,
            PERIOD_AI_ACTIONS,
            (intent, question, focusSection) => analysePeriod(intent, state.granularity, period.id, state.filters, question, focusSection),
            "AI Risk Analyst — Period",
          );
          return aiHost;
        })(),
      ]),
    ]);

    const daysCol = el("div", { className: "panel" }, [
      el("div", { className: "panel__header" }, [el("span", { className: "panel__title" }, ["Day-by-Day Events"])]),
      el(
        "div",
        { className: "panel__body day-sequence" },
        detail.days.length > 0
          ? detail.days.map((day) =>
              el("div", { className: "day-group" }, [
                el("div", { className: "day-group__header" }, [
                  day.date,
                  el("span", { className: "day-group__count" }, [`${day.events.length} event${day.events.length === 1 ? "" : "s"}`]),
                ]),
                followUpComposer(`Events on ${day.date}`, (q, s) => analysePeriod("explain_period", state.granularity, period.id, state.filters, q, s)),
                el("div", { className: "event-card-list" }, day.events.map((event) =>
                  el("div", { className: "event-card-with-followup" }, [
                    renderEventCard(event, () => ctx.selectEvent(event.eventId)),
                    followUpComposer(`event ${event.eventId}`, (q, s) => analysePeriod("explain_period", state.granularity, period.id, state.filters, q, `${s} (${event.eventId})`)),
                  ]),
                )),
              ]),
            )
          : [el("div", { className: "empty-state" }, ["No events in this period under the active filters."])],
      ),
    ]);

    container.append(el("div", { className: "section-grid section-grid--period" }, [summaryCol, daysCol]));
  }

  ctx.subscribe(draw);
  draw();
}
