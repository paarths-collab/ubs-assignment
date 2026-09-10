import type { StreamEvent } from "../types/Event.js";
import type { EventInsightIntent, InsightPayload, PeriodInsightIntent } from "../types/AIInsight.js";
import type { FilterState, Granularity } from "../types/Filters.js";
import type { Period } from "../types/Timeline.js";
import type { EventRepository } from "../repositories/EventRepository.js";
import { shortOrganisationName } from "../config/constants.js";
import { applyFilters } from "./FilterService.js";
import { computePeriodMetrics } from "./MetricService.js";
import { comparePeriods } from "./ComparisonService.js";
import { detectTrendFacts, rankTrendFacts } from "./TrendService.js";
import { findSimilarEvents } from "./SimilarEventService.js";
import {
  generateEventInsight,
  generatePeriodInsight,
  type EventInsightContext,
  type PeriodInsightContext,
} from "./InsightNarrator.js";
import { getEventsInPeriod, getPreviousPeriod } from "./TimelineService.js";
import { compareIsoDate } from "../utils/dateUtils.js";

/**
 * Canonical scope key format matching the offline-precompute convention
 * described in the architecture ("month|2026-08|enterprise",
 * "week|2026-08-03|org:Meridian Client Operations", "event|SIM-0000123").
 * Kept purely so any future offline-generated content in
 * event_ai_streamgraph.json can be looked up by the same key this repository
 * would otherwise generate deterministically for.
 */
export function buildPeriodScopeKey(granularity: Granularity, period: Period, filters: FilterState): string {
  const scopePart = filters.organisation ? `org:${filters.organisation}` : "enterprise";
  return `${granularity}|${period.id.split(":")[1]}|${scopePart}`;
}

export function buildEventScopeKey(eventId: string): string {
  return `event|${eventId}`;
}

interface PrecomputedAiData {
  period_insights?: Record<string, Partial<InsightPayload>>;
  event_insights?: Record<string, Partial<InsightPayload>>;
}

function describeScope(filters: FilterState): string {
  return filters.organisation ? shortOrganisationName(filters.organisation) : "Enterprise-wide";
}

/**
 * The single entry point the UI calls for AI narration. Every answer is
 * either a precomputed entry from event_ai_streamgraph.json (if one exists
 * for this exact scope key + intent — currently none are shipped) or a
 * deterministic verified narrative assembled live from MetricService /
 * ComparisonService / TrendService output. Both paths are equally "real":
 * neither ever calls an external model, and neither can state a number that
 * wasn't independently computed by the analytics services.
 */
export class AIInsightRepository {
  constructor(
    private readonly repository: EventRepository,
    private readonly aiData: unknown,
  ) {}

  private precomputedPeriodInsight(scopeKey: string, intent: PeriodInsightIntent): InsightPayload | null {
    const data = this.aiData as PrecomputedAiData | null;
    const entry = data?.period_insights?.[scopeKey];
    if (entry && entry.intent === intent) return entry as InsightPayload;
    return null;
  }

  private precomputedEventInsight(eventId: string, intent: EventInsightIntent): InsightPayload | null {
    const data = this.aiData as PrecomputedAiData | null;
    const entry = data?.event_insights?.[buildEventScopeKey(eventId)];
    if (entry && entry.intent === intent) return entry as InsightPayload;
    return null;
  }

  getPeriodInsight(
    intent: PeriodInsightIntent,
    filters: FilterState,
    granularity: Granularity,
    period: Period,
  ): InsightPayload {
    const scopeKey = buildPeriodScopeKey(granularity, period, filters);

    const precomputed = this.precomputedPeriodInsight(scopeKey, intent);
    if (precomputed) return precomputed;

    const filteredEvents = applyFilters(this.repository.getAll(), filters);
    const periodEvents = getEventsInPeriod(filteredEvents, period);
    const currentMetrics = computePeriodMetrics(periodEvents, {
      periodId: period.id,
      label: period.label,
      startDate: period.startDate,
      endDate: period.endDate,
    });

    const previousPeriod = getPreviousPeriod(period);
    const earliestDate = this.repository.getEarliestOccurrenceDate();
    const latestDate = this.repository.getLatestOccurrenceDate();
    const previousWithinDataset =
      earliestDate !== null &&
      latestDate !== null &&
      compareIsoDate(previousPeriod.startDate, latestDate) <= 0 &&
      compareIsoDate(previousPeriod.endDate, earliestDate) >= 0;
    const previousMetrics = previousWithinDataset
      ? computePeriodMetrics(getEventsInPeriod(filteredEvents, previousPeriod), {
          periodId: previousPeriod.id,
          label: previousPeriod.label,
          startDate: previousPeriod.startDate,
          endDate: previousPeriod.endDate,
        })
      : null;

    const comparison = comparePeriods(currentMetrics, previousMetrics);
    const rankedTrendFacts = rankTrendFacts(detectTrendFacts(currentMetrics, previousMetrics));

    const ctx: PeriodInsightContext = {
      scopeId: scopeKey,
      scopeDescription: describeScope(filters),
      comparison,
      rankedTrendFacts,
    };
    return generatePeriodInsight(intent, ctx);
  }

  getEventInsight(intent: EventInsightIntent, eventId: string, filters: FilterState): InsightPayload {
    const precomputed = this.precomputedEventInsight(eventId, intent);
    if (precomputed) return precomputed;

    const event = this.repository.getById(eventId);
    if (!event) {
      throw new Error(`Unknown event id "${eventId}"`);
    }
    const detail = this.repository.getDetailById(eventId);

    const scopedEvents = applyFilters(this.repository.getAll(), filters);
    const themeShareInDataset = shareOf(scopedEvents, (e) => e.riskTheme === event.riskTheme);
    const rootCauseShareInDataset = shareOf(scopedEvents, (e) => e.rootCause === event.rootCause);

    const similarEvents = findSimilarEvents(event, this.repository.getAll());

    const ctx: EventInsightContext = {
      event,
      detail,
      similarEvents,
      themeShareInDataset,
      rootCauseShareInDataset,
    };
    return generateEventInsight(intent, ctx);
  }
}

function shareOf(events: StreamEvent[], predicate: (e: StreamEvent) => boolean): number | null {
  if (events.length === 0) return null;
  return events.filter(predicate).length / events.length;
}
