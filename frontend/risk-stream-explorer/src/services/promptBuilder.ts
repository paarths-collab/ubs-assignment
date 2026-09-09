import type {
  EventInsightIntent,
  PeriodComparison,
  PeriodInsightIntent,
  RawFullEventDetail,
  SimilarEventMatch,
  StreamEvent,
  TrendFact,
} from "@backend/index";
import {
  formatDays,
  formatMoney,
  formatPercent,
  formatPercentagePoints,
  formatSignedPercent,
  shortOrganisationName,
} from "@backend/index";
import type { ChatMessage } from "./LLMClient";

const SYSTEM_PROMPT = `You are an AI Risk Analyst embedded in an operational risk timeline tool for a Senior Risk Manager at a financial institution.

You will be given a block of VERIFIED DATA that was computed deterministically from the underlying event dataset — every number in it is already correct and audited. You are not allowed to invent, estimate, or restate any number that is not present in that data block. If the data provided is insufficient to answer the question, say exactly: "The available verified data does not support that conclusion." — do not guess.

Structure your answer with these labeled sections, using only the ones that are relevant to the question asked (omit a section entirely if it has nothing to say — do not write "N/A"):
Observed:
Why it matters:
Drivers:
Investigate:
Control considerations:

Keep it concise and executive-facing. Use plain text (no markdown tables). Bullet points for lists are fine using "- ".`;

const PERIOD_QUESTIONS: Record<PeriodInsightIntent, string> = {
  explain_period: "Explain this period as a whole: what happened, and why it matters.",
  what_changed: "What changed in this period compared to the previous comparable period?",
  what_is_driving_change: "What is driving the change in this period? Identify the single largest driver and explain it.",
  what_to_investigate: "What should we investigate first in this period, and why?",
  control_considerations: "What control considerations follow from this period's data?",
};

const EVENT_QUESTIONS: Record<EventInsightIntent, string> = {
  summarise_event: "Summarise this event for a risk manager who has not seen it before.",
  why_it_matters: "Why does this event matter?",
  what_to_investigate: "What should I investigate about this event?",
  suggest_controls: "Suggest controls that address this event's root cause.",
  find_similar_events: "Given the list of similar events provided, explain what pattern (if any) they suggest.",
  explain_reporting_delay: "Explain this event's reporting delay (detection and recording).",
};

function trendFactLine(fact: TrendFact): string {
  const parts = [`${fact.metric} / ${fact.category}`, `direction=${fact.direction}`];
  if (fact.deltaPercentagePoints !== null) parts.push(`change=${formatPercentagePoints(fact.deltaPercentagePoints)}`);
  if (fact.absoluteChange !== null) parts.push(`absoluteChange=${fact.absoluteChange}`);
  if (fact.current !== null) parts.push(`current=${fact.current}`);
  if (fact.previous !== null) parts.push(`previous=${fact.previous}`);
  return `- ${parts.join(", ")}`;
}

export function buildPeriodMessages(
  intent: PeriodInsightIntent,
  scopeDescription: string,
  comparison: PeriodComparison,
  rankedTrendFacts: TrendFact[],
): ChatMessage[] {
  const c = comparison.current;
  const p = comparison.previous;

  const lines: string[] = [
    `VERIFIED DATA — ${scopeDescription}, period "${c.label}" (${c.startDate} to ${c.endDate})`,
    "",
    `Event count: ${c.eventCount} (previous period: ${p?.eventCount ?? "no prior baseline"}, change: ${comparison.eventCountDelta.isNew ? "new, no comparable baseline" : formatSignedPercent(comparison.eventCountDelta.percentChange)})`,
    `Severity: High=${c.severityCounts.High} (${formatPercent(c.severityShares.High)}), Moderate=${c.severityCounts.Moderate} (${formatPercent(c.severityShares.Moderate)}), Low=${c.severityCounts.Low} (${formatPercent(c.severityShares.Low)})`,
    `High severity share change vs previous: ${formatPercentagePoints(comparison.severityShareDeltas.High.deltaPercentagePoints)}`,
    `Event type: Financial=${c.eventTypeCounts.Financial} (${formatPercent(c.eventTypeShares.Financial)}), Non-Financial=${c.eventTypeCounts["Non-Financial"]} (${formatPercent(c.eventTypeShares["Non-Financial"])})`,
    `Net exposure: ${formatMoney(c.financial.netAmount.populatedCount > 0 ? c.financial.netAmount.total : null)} (${c.financial.netAmount.populatedCount}/${c.financial.netAmount.totalEventCount} events populated), change vs previous: ${comparison.netAmountDelta.isNew ? "new, no comparable baseline" : formatMoney(comparison.netAmountDelta.absoluteChange)}`,
    `Potential impact: ${formatMoney(c.financial.potentialImpact.populatedCount > 0 ? c.financial.potentialImpact.total : null)} (${c.financial.potentialImpact.populatedCount}/${c.financial.potentialImpact.totalEventCount} events populated), change vs previous: ${comparison.potentialImpactDelta.isNew ? "new, no comparable baseline" : formatMoney(comparison.potentialImpactDelta.absoluteChange)}`,
    `Recovery rate: ${c.financial.recoveryRate !== null ? formatPercent(c.financial.recoveryRate) : "not available"}`,
    `Average occurrence-to-record delay: ${formatDays(c.delays.averageOccurrenceToRecordDays)} (median ${formatDays(c.delays.medianOccurrenceToRecordDays)})`,
    "",
    "Top risk themes (count, share):",
    ...c.riskThemeBreakdown.slice(0, 5).map((b) => `- ${b.key}: ${b.count} (${formatPercent(b.share)})`),
    "",
    "Top organisations (count, share):",
    ...c.organisationBreakdown.slice(0, 5).map((b) => `- ${b.key}: ${b.count} (${formatPercent(b.share)})`),
    "",
    "Top root causes (count, share):",
    ...c.rootCauseBreakdown.slice(0, 5).map((b) => `- ${b.key}: ${b.count} (${formatPercent(b.share)})`),
    "",
    "Top recurring issues (count, share):",
    ...c.issueDetailBreakdown.slice(0, 5).map((b) => `- ${b.key}: ${b.count} (${formatPercent(b.share)})`),
    "",
    "Ranked trend facts (largest movement first, vs previous comparable period):",
    ...rankedTrendFacts.map(trendFactLine),
  ];

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `${lines.join("\n")}\n\nQuestion: ${PERIOD_QUESTIONS[intent]}` },
  ];
}

export function buildEventMessages(
  intent: EventInsightIntent,
  event: StreamEvent,
  detail: RawFullEventDetail | null,
  similarEvents: SimilarEventMatch[],
  themeShareInDataset: number | null,
  rootCauseShareInDataset: number | null,
): ChatMessage[] {
  const lines: string[] = [
    `VERIFIED DATA — Event ${event.eventId}`,
    "",
    `Title: ${event.eventTitle}`,
    `Severity: ${event.severity}`,
    `Event type: ${event.eventType}`,
    `Owner organisation: ${shortOrganisationName(event.ownerOrganisation)}`,
    `Discovery organisation: ${shortOrganisationName(event.discoveryOrganisation)}`,
    `Risk theme: ${event.riskTheme}${themeShareInDataset !== null ? ` (${formatPercent(themeShareInDataset)} of events in current scope)` : ""}`,
    `Root cause: ${event.rootCause}${rootCauseShareInDataset !== null ? ` (${formatPercent(rootCauseShareInDataset)} of events in current scope)` : ""}`,
    `OR category: ${event.orCategory}`,
    `Event status / stage: ${event.eventStatus} / ${event.eventStage}`,
    `Occurrence date: ${event.occurrenceDate}`,
    `Discovered date: ${event.discoveredDate ?? "not available"}`,
    `Gross amount: ${formatMoney(event.grossAmount)}`,
    `Net amount: ${formatMoney(event.netAmount)}`,
    `Recovery amount: ${formatMoney(event.recoveryAmount)}`,
    `Potential impact: ${formatMoney(event.potentialImpact)}`,
    `Detection delay: ${formatDays(event.detectionDelayDays)}`,
    `Recording delay: ${formatDays(event.recordingDelayDays)}`,
    `Occurrence to record: ${formatDays(event.occurrenceToRecordDays)}`,
    `Issue detail: ${event.issueDetail}`,
  ];

  if (detail) {
    lines.push(
      "",
      `Background: ${detail["Background Detail"] ?? "not available"}`,
      `Root cause detail: ${detail["Root Cause Detail"] ?? "not available"}`,
      `Impact detail: ${detail["Impact Detail"] ?? "not available"}`,
      `Opportunity: ${detail["Opportunity"] ?? "not available"}`,
    );
  }

  if (similarEvents.length > 0) {
    lines.push(
      "",
      "Similar events (matched deterministically on issue detail / root cause / risk theme / event type / organisation):",
      ...similarEvents.map((m) => `- ${m.eventId} — ${m.eventTitle} (matched on: ${m.matchedOn.join(", ")}, score ${m.score})`),
    );
  } else {
    lines.push("", "Similar events: none found.");
  }

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `${lines.join("\n")}\n\nQuestion: ${EVENT_QUESTIONS[intent]}` },
  ];
}
