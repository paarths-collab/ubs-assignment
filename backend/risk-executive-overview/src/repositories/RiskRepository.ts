import { readFileSync } from "node:fs";
import { DATA_PATHS } from "../config/constants";
import type { RiskEvent } from "../types/RiskEvent";
import type { RiskConfig } from "../types/Config";
import type { RiskPattern, RiskPatternsFile } from "../types/Pattern";
import type { RiskAiConfig } from "../types/AiConfig";
import { validateDataset } from "../validation/validateDataset";

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

/**
 * Loads the four source-of-truth JSON assets once at startup and holds them
 * immutably in memory. 1,000 events is small enough that re-reading from
 * disk per request would be pure waste.
 */
export class RiskRepository {
  private readonly events: readonly RiskEvent[];
  private readonly eventsById: ReadonlyMap<string, RiskEvent>;
  private readonly config: RiskConfig;
  private readonly patterns: readonly RiskPattern[];
  private readonly patternsById: ReadonlyMap<string, RiskPattern>;
  private readonly aiConfig: RiskAiConfig;

  constructor() {
    this.events = readJson<RiskEvent[]>(DATA_PATHS.events);
    this.eventsById = new Map(this.events.map((event) => [event.eventId, event]));
    this.config = readJson<RiskConfig>(DATA_PATHS.config);
    const patternsFile = readJson<RiskPatternsFile>(DATA_PATHS.patterns);
    this.patterns = patternsFile.patterns;
    this.patternsById = new Map(this.patterns.map((pattern) => [pattern.patternId, pattern]));
    this.aiConfig = readJson<RiskAiConfig>(DATA_PATHS.aiConfig);

    validateDataset(this.events, this.patterns, this.config);
  }

  getEvents(): readonly RiskEvent[] {
    return this.events;
  }

  getEventById(eventId: string): RiskEvent | undefined {
    return this.eventsById.get(eventId);
  }

  getEventsByIds(eventIds: readonly string[]): RiskEvent[] {
    return eventIds.map((id) => this.eventsById.get(id)).filter((event): event is RiskEvent => event != null);
  }

  getConfig(): RiskConfig {
    return this.config;
  }

  getPatterns(): readonly RiskPattern[] {
    return this.patterns;
  }

  getPatternById(patternId: string): RiskPattern | undefined {
    return this.patternsById.get(patternId);
  }

  getAiConfig(): RiskAiConfig {
    return this.aiConfig;
  }
}
