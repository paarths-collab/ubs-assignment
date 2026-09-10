import { readFileSync } from "node:fs";
import path from "node:path";

import {
  applyFilters,
  comparePeriods,
  computePeriodMetrics,
  detectTrendFacts,
  EventRepository,
  findSimilarEvents,
  generatePeriods,
  getEventsInPeriod,
  getPreviousPeriod,
  loadDataset,
  rankTrendFacts,
  shortOrganisationName,
  compareIsoDate,
  type EventInsightIntent,
  type FilterState,
  type Granularity,
  type PeriodInsightIntent,
  type RawFullEventDetailMap,
  type RawStreamEventList,
} from "../index";
import {
  buildEventMessages,
  buildPeriodMessages,
  type ChatMessage,
} from "../prompts/streamgraph-analysis.prompt";
import type { GroqService } from "./GroqService";
import { AIInsightRepository } from "./AIInsightRepository";
import type { InsightPayload } from "../types/AIInsight";
import type { StreamEvent } from "../types/Event";

export class StreamgraphPeriodNotFoundError extends Error {
  constructor(periodId: string) {
    super(`Period "${periodId}" was not found under the supplied filters.`);
    this.name = "StreamgraphPeriodNotFoundError";
  }
}

export class StreamgraphEventNotFoundError extends Error {
  constructor(eventId: string) {
    super(`Event "${eventId}" was not found.`);
    this.name = "StreamgraphEventNotFoundError";
  }
}

export function loadStreamgraphRepository(dataDir: string): EventRepository {
  const read = <T>(file: string): T => JSON.parse(readFileSync(path.join(dataDir, file), "utf-8")) as T;
  const { events, detailsById } = loadDataset(
    read<RawStreamEventList>("events_streamgraph.json"),
    read<RawFullEventDetailMap>("event_details_streamgraph.json"),
    read<unknown>("event_ai_streamgraph.json"),
  );
  return new EventRepository(events, detailsById);
}

/**
 * Server side of Component 2's AI Risk Analyst.
 *
 * The client sends only *selection* input — a period id, an event id, the
 * active filters — never facts. Every number in the prompt is recomputed here
 * from the dataset using the same deterministic services the UI renders from,
 * which is what stops a tampered client from talking the model into
 * describing numbers that were never in the data. Same guarantee the
 * pattern/issue routes give, applied to the timeline.
 */
export class StreamgraphAiService {
  private readonly verifiedFallback: AIInsightRepository;

  constructor(
    private readonly repository: EventRepository,
    private readonly llm: GroqService,
  ) {
    this.verifiedFallback = new AIInsightRepository(repository, null);
  }

  buildPeriodPrompt(
    intent: PeriodInsightIntent,
    granularity: Granularity,
    periodId: string,
    filters: FilterState,
    question?: string,
    focusSection?: string,
  ): ChatMessage[] {
    const filteredEvents = applyFilters(this.repository.getAll(), filters);
    const period = generatePeriods(filteredEvents, granularity).find((p) => p.id === periodId);
    if (!period) throw new StreamgraphPeriodNotFoundError(periodId);

    const periodEvents = getEventsInPeriod(filteredEvents, period);
    const currentMetrics = computePeriodMetrics(periodEvents, {
      periodId: period.id,
      label: period.label,
      startDate: period.startDate,
      endDate: period.endDate,
    });

    // A previous period that falls outside the dataset's recorded span is "no
    // baseline" rather than "went to zero" — the same distinction the UI draws.
    const previousPeriod = getPreviousPeriod(period);
    const earliest = this.repository.getEarliestOccurrenceDate();
    const latest = this.repository.getLatestOccurrenceDate();
    const previousWithinDataset =
      earliest !== null &&
      latest !== null &&
      compareIsoDate(previousPeriod.startDate, latest) <= 0 &&
      compareIsoDate(previousPeriod.endDate, earliest) >= 0;
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
    const scopeDescription = filters.organisation
      ? shortOrganisationName(filters.organisation)
      : "Enterprise-wide";

    const messages = buildPeriodMessages(intent, scopeDescription, comparison, rankedTrendFacts, buildDaySummaries(periodEvents));
    return addFollowUp(messages, question, focusSection);
  }

  buildEventPrompt(intent: EventInsightIntent, eventId: string, filters: FilterState, question?: string, focusSection?: string): ChatMessage[] {
    const event = this.repository.getById(eventId);
    if (!event) throw new StreamgraphEventNotFoundError(eventId);
    const detail = this.repository.getDetailById(eventId);

    const scopedEvents = applyFilters(this.repository.getAll(), filters);
    const share = (predicate: (e: (typeof scopedEvents)[number]) => boolean): number | null =>
      scopedEvents.length > 0 ? scopedEvents.filter(predicate).length / scopedEvents.length : null;

    const messages = buildEventMessages(
      intent,
      event,
      detail,
      findSimilarEvents(event, this.repository.getAll()),
      share((e) => e.riskTheme === event.riskTheme),
      share((e) => e.rootCause === event.rootCause),
    );
    return addFollowUp(messages, question, focusSection);
  }

  async analysePeriod(
    intent: PeriodInsightIntent,
    granularity: Granularity,
    periodId: string,
    filters: FilterState,
    question?: string,
    focusSection?: string,
  ): Promise<string> {
    try {
      const text = await this.llm.completeText(this.buildPeriodPrompt(intent, granularity, periodId, filters, question, focusSection));
      if (!isCompleteNarrative(text)) throw new Error("AI returned an incomplete narrative");
      return text;
    } catch (error) {
      // The verified narrative is a complete, deterministic fallback for any
      // filter combination. It keeps the analyst workflow usable when an
      // external provider is slow or unavailable, without inventing facts.
      if (error instanceof StreamgraphPeriodNotFoundError) throw error;
      const filteredEvents = applyFilters(this.repository.getAll(), filters);
      const period = generatePeriods(filteredEvents, granularity).find((p) => p.id === periodId);
      if (!period) throw new StreamgraphPeriodNotFoundError(periodId);
      return formatVerifiedInsight(this.verifiedFallback.getPeriodInsight(intent, filters, granularity, period), getEventsInPeriod(filteredEvents, period));
    }
  }

  async analyseEvent(intent: EventInsightIntent, eventId: string, filters: FilterState, question?: string, focusSection?: string): Promise<string> {
    try {
      const text = await this.llm.completeText(this.buildEventPrompt(intent, eventId, filters, question, focusSection));
      if (!isCompleteNarrative(text)) throw new Error("AI returned an incomplete narrative");
      return text;
    } catch (error) {
      if (error instanceof StreamgraphEventNotFoundError) throw error;
      return formatVerifiedInsight(this.verifiedFallback.getEventInsight(intent, eventId, filters));
    }
  }
}

function addFollowUp(messages: ChatMessage[], question?: string, focusSection?: string): ChatMessage[] {
  if (!question?.trim()) return messages;
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user") return messages;
  return [...messages.slice(0, -1), { ...last, content: `${last.content}\n\nFOLLOW-UP QUESTION (answer this specifically while preserving the full five-section format): ${question.trim()}\nFOCUS SECTION: ${focusSection?.trim() || "the selected section"}` }];
}

function formatVerifiedInsight(insight: InsightPayload, dayEvents: StreamEvent[] = []): string {
  const section = (label: string, text: string, bullets: string[] = []): string => {
    const lines = [text, ...bullets.map((item) => `- ${item}`)].filter((line) => line.trim().length > 0);
    return lines.length > 0 ? `${label}:\n${lines.join("\n")}` : "";
  };

  return [
    section("Observed", insight.observed),
    section("Why it matters", insight.whyItMatters),
    section("Drivers", "The recorded risk theme and root cause are the primary verified context; the data does not establish causation.", insight.drivers),
    section("Investigate", "Use the verified record to test the mechanism rather than assuming it.", insight.investigate.length > 0 ? insight.investigate : ["Confirm the event or period record against the source workflow.", "Compare this result with the relevant peer events or prior period.", "Document what evidence would confirm or challenge the initial interpretation."]),
    section("Control considerations", "Align ownership and monitoring to the recorded risk theme and root cause.", insight.controlConsiderations.length > 0 ? insight.controlConsiderations : ["Review the relevant control step and assign a clear owner.", "Monitor recurrence using the same verified metric definition."]),
    dayEvents.length > 0 ? section("Day-by-day events", "The verified occurrence-date sequence is:", buildDaySummaries(dayEvents)) : "",
    section("Supporting evidence", "", insight.supportingEvidence.map((item) => `${item.label}: ${item.value}`)),
  ].filter(Boolean).join("\n\n");
}

function buildDaySummaries(events: StreamEvent[]): string[] {
  const byDate = new Map<string, StreamEvent[]>();
  for (const event of events) byDate.set(event.occurrenceDate, [...(byDate.get(event.occurrenceDate) ?? []), event]);
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, dayEvents]) => {
    const severity = ["High", "Moderate", "Low"].map((level) => `${level}=${dayEvents.filter((event) => event.severity === level).length}`).join(", ");
    const eventsText = dayEvents.slice(0, 4).map((event) => `${event.eventId} (${event.eventTitle})`).join("; ");
    return `${date}: ${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"}; ${severity}; ${eventsText}${dayEvents.length > 4 ? "; additional events omitted from this line" : ""}`;
  });
}

function isCompleteNarrative(text: string): boolean {
  const labels = ["Observed", "Why it matters", "Drivers", "Investigate", "Control considerations"];
  return text.trim().split(/\s+/).length >= 120 && labels.every((label) => new RegExp(`\\**${label}\\**\\s*:`).test(text));
}
