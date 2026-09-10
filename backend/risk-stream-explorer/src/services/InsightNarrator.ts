import type { RawFullEventDetail, StreamEvent } from "../types/Event.js";
import type {
  EventInsightIntent,
  InsightPayload,
  PeriodInsightIntent,
  SimilarEventMatch,
  SupportingMetric,
} from "../types/AIInsight.js";
import { INSUFFICIENT_EVIDENCE_TEXT } from "../types/AIInsight.js";
import type { PeriodComparison, TrendFact } from "../types/Metrics.js";
import { getControlGuidance } from "../config/controlPlaybook.js";
import { shortOrganisationName } from "../config/constants.js";
import {
  formatDays,
  formatMoney,
  formatPercent,
  formatPercentagePoints,
  formatSignedPercent,
} from "../utils/formatUtils.js";

/**
 * Deterministic, template-driven AI narration layer. Every sentence here is
 * assembled from numbers already computed by MetricService/ComparisonService/
 * TrendService — nothing is invented, and nothing here performs its own
 * calculation. Because generation is instant and purely a function of
 * verified facts, it works identically for any filter combination, any
 * period, and any event — there is no precomputed-scope coverage gap to
 * manage (see event_ai_streamgraph.json's metadata for the design note).
 */

function insufficientEvidence(
  intent: PeriodInsightIntent | EventInsightIntent,
  scope: "period" | "event",
  scopeId: string,
  nowIso: string,
): InsightPayload {
  return {
    intent,
    scope,
    scopeId,
    observed: INSUFFICIENT_EVIDENCE_TEXT,
    whyItMatters: INSUFFICIENT_EVIDENCE_TEXT,
    drivers: [],
    investigate: [],
    controlConsiderations: [],
    supportingEvidence: [],
    source: "verified-narrative",
    generatedAt: nowIso,
  };
}

function trendFactSentence(fact: TrendFact): string {
  const categoryLabel = fact.category;
  const metricLabel =
    fact.metric === "severity_share"
      ? `${categoryLabel}-severity share`
      : fact.metric === "risk_theme_share"
        ? `"${categoryLabel}" risk theme's share`
        : fact.metric === "organisation_share"
          ? `${categoryLabel}'s share of events`
          : fact.metric === "root_cause_share"
            ? `"${categoryLabel}" root cause's share`
            : fact.metric === "net_amount"
              ? "net exposure"
              : fact.metric === "potential_impact"
                ? "potential impact"
                : "average recording delay";

  if (fact.direction === "new") {
    return `${metricLabel} appeared in this period with no comparable prior-period baseline.`;
  }
  if (fact.deltaPercentagePoints !== null) {
    return `${metricLabel} moved ${formatPercentagePoints(fact.deltaPercentagePoints)} (from ${formatPercent(fact.previous)} to ${formatPercent(fact.current)}).`;
  }
  if (fact.absoluteChange !== null) {
    const isMoney = fact.metric === "net_amount" || fact.metric === "potential_impact";
    const from = isMoney ? formatMoney(fact.previous) : formatDays(fact.previous);
    const to = isMoney ? formatMoney(fact.current) : formatDays(fact.current);
    return `${metricLabel} moved from ${from} to ${to}.`;
  }
  return `${metricLabel} was unchanged.`;
}

function buildPeriodSupportingEvidence(comparison: PeriodComparison, topFacts: TrendFact[]): SupportingMetric[] {
  const c = comparison.current;
  const evidence: SupportingMetric[] = [
    { label: "Event count", value: `${c.eventCount} (${formatSignedPercent(comparison.eventCountDelta.percentChange)} vs previous period)` },
    { label: "High severity share", value: formatPercent(c.severityShares.High) },
    { label: "Net exposure", value: `${formatMoney(c.financial.netAmount.populatedCount > 0 ? c.financial.netAmount.total : null)} (${c.financial.netAmount.populatedCount}/${c.financial.netAmount.totalEventCount} events populated)` },
    { label: "Potential impact", value: `${formatMoney(c.financial.potentialImpact.populatedCount > 0 ? c.financial.potentialImpact.total : null)} (${c.financial.potentialImpact.populatedCount}/${c.financial.potentialImpact.totalEventCount} events populated)` },
    { label: "Avg occurrence-to-record", value: formatDays(c.delays.averageOccurrenceToRecordDays) },
  ];
  for (const fact of topFacts.slice(0, 3)) {
    evidence.push({ label: `Trend: ${fact.category}`, value: trendFactSentence(fact) });
  }
  return evidence;
}

export interface PeriodInsightContext {
  scopeId: string;
  scopeDescription: string;
  comparison: PeriodComparison;
  rankedTrendFacts: TrendFact[];
}

export function generatePeriodInsight(
  intent: PeriodInsightIntent,
  ctx: PeriodInsightContext,
  nowIso: string = new Date().toISOString(),
): InsightPayload {
  const { comparison, rankedTrendFacts: facts } = ctx;
  const c = comparison.current;

  if (c.eventCount === 0) {
    return insufficientEvidence(intent, "period", ctx.scopeId, nowIso);
  }

  const highShareText = formatPercent(c.severityShares.High);
  const topRiskTheme = c.riskThemeBreakdown[0];
  const topOrg = c.organisationBreakdown[0];
  const topRootCause = c.rootCauseBreakdown[0];
  const meaningfulFacts = facts.filter((f) => f.direction === "increase" || f.direction === "new");
  const decliningFacts = facts.filter((f) => f.direction === "decrease");

  const base = {
    intent,
    scope: "period" as const,
    scopeId: ctx.scopeId,
    source: "verified-narrative" as const,
    generatedAt: nowIso,
    supportingEvidence: buildPeriodSupportingEvidence(comparison, facts),
  };

  switch (intent) {
    case "explain_period": {
      const observed = `${ctx.scopeDescription} recorded ${c.eventCount} risk event${c.eventCount === 1 ? "" : "s"} for ${c.label} (${formatSignedPercent(comparison.eventCountDelta.percentChange)} vs the previous comparable period). ${c.severityCounts.High} were High severity (${highShareText} of the period), ${c.severityCounts.Moderate} Moderate, and ${c.severityCounts.Low} Low.${topRiskTheme ? ` The largest risk theme was "${topRiskTheme.key}" at ${formatPercent(topRiskTheme.share)} of events.` : ""}`;
      const whyItMatters = `Net exposure for the period stands at ${formatMoney(c.financial.netAmount.populatedCount > 0 ? c.financial.netAmount.total : null)}${c.financial.netAmount.populatedCount > 0 ? ` across ${c.financial.netAmount.populatedCount} events with a populated net amount` : ""}, with potential impact of ${formatMoney(c.financial.potentialImpact.populatedCount > 0 ? c.financial.potentialImpact.total : null)}. Average time from occurrence to record was ${formatDays(c.delays.averageOccurrenceToRecordDays)}.`;
      return {
        ...base,
        observed,
        whyItMatters,
        drivers: meaningfulFacts.slice(0, 3).map(trendFactSentence),
        investigate: [
          topOrg ? `${topOrg.key} accounted for ${topOrg.count} event${topOrg.count === 1 ? "" : "s"} (${formatPercent(topOrg.share)}) — review whether this concentration reflects a systemic issue.` : "No organisation concentration to review.",
          topRootCause ? getControlGuidance(topRootCause.key)?.investigate ?? `Review the prevalence of "${topRootCause.key}" as a root cause.` : "No dominant root cause to review.",
        ],
        controlConsiderations: [topRootCause, c.rootCauseBreakdown[1]]
          .filter((rc): rc is NonNullable<typeof rc> => rc !== undefined)
          .map((rc) => getControlGuidance(rc.key)?.consideration)
          .filter((s): s is string => Boolean(s)),
      };
    }

    case "what_changed": {
      const observed = `Event count moved from ${comparison.previous?.eventCount ?? "no prior baseline"} to ${c.eventCount} (${comparison.eventCountDelta.isNew ? "new" : formatSignedPercent(comparison.eventCountDelta.percentChange)}). High severity share moved ${formatPercentagePoints(comparison.severityShareDeltas.High.deltaPercentagePoints)}; Non-Financial share moved ${formatPercentagePoints(comparison.eventTypeShareDeltas["Non-Financial"].deltaPercentagePoints)}.`;
      const whyItMatters = `Net exposure changed by ${comparison.netAmountDelta.absoluteChange !== null ? formatMoney(comparison.netAmountDelta.absoluteChange) : "an amount that cannot be compared (no populated baseline)"}; potential impact changed by ${comparison.potentialImpactDelta.absoluteChange !== null ? formatMoney(comparison.potentialImpactDelta.absoluteChange) : "an amount that cannot be compared"}.`;
      return {
        ...base,
        observed,
        whyItMatters,
        drivers: facts.slice(0, 5).map(trendFactSentence),
        investigate: [],
        controlConsiderations: [],
      };
    }

    case "what_is_driving_change": {
      if (meaningfulFacts.length === 0) {
        return { ...base, observed: INSUFFICIENT_EVIDENCE_TEXT, whyItMatters: INSUFFICIENT_EVIDENCE_TEXT, drivers: [], investigate: [], controlConsiderations: [] };
      }
      const top = meaningfulFacts[0]!;
      const observed = `The largest movement in this period is ${trendFactSentence(top)}`;
      const whyItMatters = `This is the single largest driver of change across severity mix, theme mix, organisation concentration, root-cause concentration, net exposure, potential impact, and recording delay for the selected scope.`;
      return {
        ...base,
        observed,
        whyItMatters,
        drivers: meaningfulFacts.slice(0, 5).map(trendFactSentence),
        investigate: topOrg ? [`Examine events from ${topOrg.key}, which contributed ${topOrg.count} of the ${c.eventCount} events in this period.`] : [],
        controlConsiderations: [],
      };
    }

    case "what_to_investigate": {
      const items: string[] = [];
      if (topOrg) items.push(`${topOrg.key}: ${topOrg.count} events (${formatPercent(topOrg.share)}) — the largest organisational concentration this period.`);
      if (topRootCause) items.push(`"${topRootCause.key}": ${topRootCause.count} events (${formatPercent(topRootCause.share)}) — the most common root cause this period.`);
      const topIssue = c.issueDetailBreakdown[0];
      if (topIssue && topIssue.count > 1) items.push(`Recurring issue (${topIssue.count} events): "${topIssue.key}"`);
      if (c.severityCounts.High > 0) items.push(`${c.severityCounts.High} High-severity event${c.severityCounts.High === 1 ? "" : "s"} warrant direct review.`);
      return {
        ...base,
        observed: items.length > 0 ? `${items.length} concentration point${items.length === 1 ? "" : "s"} stand out in this period.` : INSUFFICIENT_EVIDENCE_TEXT,
        whyItMatters: "Concentration in a single organisation, root cause, or recurring issue narrative is a stronger signal of a systemic control gap than an isolated event.",
        drivers: [],
        investigate: items,
        controlConsiderations: [],
      };
    }

    case "control_considerations": {
      const considerations = c.rootCauseBreakdown
        .slice(0, 3)
        .map((rc) => getControlGuidance(rc.key)?.consideration)
        .filter((s): s is string => Boolean(s));
      return {
        ...base,
        observed: considerations.length > 0 ? `Control guidance below is linked to the ${Math.min(3, c.rootCauseBreakdown.length)} most common root cause(s) observed in this period.` : INSUFFICIENT_EVIDENCE_TEXT,
        whyItMatters: "Targeting controls at the observed root causes, rather than generic hardening, addresses the mechanism actually producing these events.",
        drivers: [],
        investigate: decliningFacts.length > 0 ? [] : [],
        controlConsiderations: considerations,
      };
    }
  }
}

export interface EventInsightContext {
  event: StreamEvent;
  detail: RawFullEventDetail | null;
  similarEvents: SimilarEventMatch[];
  themeShareInDataset: number | null;
  rootCauseShareInDataset: number | null;
}

export function generateEventInsight(
  intent: EventInsightIntent,
  ctx: EventInsightContext,
  nowIso: string = new Date().toISOString(),
): InsightPayload {
  const { event, detail, similarEvents } = ctx;
  const base = {
    intent,
    scope: "event" as const,
    scopeId: event.eventId,
    source: "verified-narrative" as const,
    generatedAt: nowIso,
  };

  const orgShort = shortOrganisationName(event.ownerOrganisation);
  const controlGuidance = getControlGuidance(event.rootCause);

  const coreEvidence: SupportingMetric[] = [
    { label: "Event ID", value: event.eventId },
    { label: "Severity", value: event.severity },
    { label: "Event type", value: event.eventType },
    { label: "Risk theme", value: event.riskTheme },
    { label: "Root cause", value: event.rootCause },
    { label: "Owner organisation", value: orgShort },
    { label: "Occurrence to record", value: formatDays(event.occurrenceToRecordDays) },
  ];

  switch (intent) {
    case "summarise_event": {
      return {
        ...base,
        observed: `${event.severity}-severity ${event.eventType.toLowerCase()} event at ${orgShort}, occurred ${event.occurrenceDate}. ${event.issueDetail}`,
        whyItMatters: `Classified under "${event.riskTheme}" with root cause "${event.rootCause}".${event.netAmount !== null ? ` Net amount: ${formatMoney(event.netAmount)}.` : ""}${event.potentialImpact !== null ? ` Potential impact: ${formatMoney(event.potentialImpact)}.` : ""}`,
        drivers: [],
        investigate: [],
        controlConsiderations: [],
        supportingEvidence: coreEvidence,
      };
    }

    case "why_it_matters": {
      const themeText = ctx.themeShareInDataset !== null ? ` This risk theme represents ${formatPercent(ctx.themeShareInDataset)} of all events in the current scope.` : "";
      const rootCauseText = ctx.rootCauseShareInDataset !== null ? ` This root cause represents ${formatPercent(ctx.rootCauseShareInDataset)} of all events in the current scope.` : "";
      return {
        ...base,
        observed: `This is a ${event.severity}-severity event${event.netAmount !== null ? ` with a net amount of ${formatMoney(event.netAmount)}` : ""}${event.potentialImpact !== null ? `, potential impact ${formatMoney(event.potentialImpact)}` : ""}.`,
        whyItMatters: `${event.severity === "High" ? "High-severity events carry the greatest direct exposure and typically require the fastest escalation." : event.severity === "Moderate" ? "Moderate-severity events warrant tracking for recurrence or escalation." : "Low-severity events are individually contained but worth tracking for concentration patterns."}${themeText}${rootCauseText}`,
        drivers: [],
        investigate: [],
        controlConsiderations: [],
        supportingEvidence: coreEvidence,
      };
    }

    case "what_to_investigate": {
      const items: string[] = [];
      if (controlGuidance) items.push(controlGuidance.investigate);
      if (event.detectionDelayDays !== null && event.recordingDelayDays !== null) {
        items.push(`Detection took ${formatDays(event.detectionDelayDays)} and recording a further ${formatDays(event.recordingDelayDays)} — confirm whether either stage exceeded the expected turnaround for this event type.`);
      }
      if (similarEvents.length > 0) {
        items.push(`${similarEvents.length} similar event(s) were found — check whether they share a common trigger (see "Find similar events").`);
      }
      return {
        ...base,
        observed: items.length > 0 ? `${items.length} investigation point(s) are supported by the verified data for this event.` : INSUFFICIENT_EVIDENCE_TEXT,
        whyItMatters: "Investigation should follow the specific mechanism recorded for this event, not a generic checklist.",
        drivers: [],
        investigate: items,
        controlConsiderations: [],
        supportingEvidence: coreEvidence,
      };
    }

    case "suggest_controls": {
      return {
        ...base,
        observed: controlGuidance ? `Control guidance for this event is linked to its recorded root cause: "${event.rootCause}".` : INSUFFICIENT_EVIDENCE_TEXT,
        whyItMatters: "Controls targeted at the recorded root cause address the mechanism that actually produced this event.",
        drivers: [],
        investigate: [],
        controlConsiderations: controlGuidance ? [controlGuidance.consideration] : [],
        supportingEvidence: coreEvidence,
      };
    }

    case "find_similar_events": {
      return {
        ...base,
        observed: similarEvents.length > 0 ? `${similarEvents.length} similar event(s) identified by matching issue detail, root cause, risk theme, event type, and organisation.` : "No similar events were found in the current scope.",
        whyItMatters: "Similar events can indicate a recurring control gap rather than an isolated incident.",
        drivers: [],
        investigate: similarEvents.map((m) => `${m.eventId} — ${m.eventTitle} (matched on: ${m.matchedOn.join(", ")})`),
        controlConsiderations: [],
        supportingEvidence: coreEvidence,
      };
    }

    case "explain_reporting_delay": {
      if (event.detectionDelayDays === null && event.recordingDelayDays === null) {
        return { ...base, observed: INSUFFICIENT_EVIDENCE_TEXT, whyItMatters: INSUFFICIENT_EVIDENCE_TEXT, drivers: [], investigate: [], controlConsiderations: [], supportingEvidence: coreEvidence };
      }
      return {
        ...base,
        observed: `Detection delay: ${formatDays(event.detectionDelayDays)}. Recording delay: ${formatDays(event.recordingDelayDays)}. Total occurrence-to-record: ${formatDays(event.occurrenceToRecordDays)}.`,
        whyItMatters: "Longer delays between occurrence and recording reduce the window for timely containment and increase the risk of compounding impact.",
        drivers: [],
        investigate: [`Compare this event's occurrence-to-record time against the period average to determine whether the delay was typical or an outlier.`],
        controlConsiderations: [],
        supportingEvidence: [
          ...coreEvidence,
          { label: "Detection delay", value: formatDays(event.detectionDelayDays) },
          { label: "Recording delay", value: formatDays(event.recordingDelayDays) },
        ],
      };
    }
  }
}
