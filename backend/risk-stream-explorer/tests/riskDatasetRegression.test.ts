import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildRiskDataset } from "../src/repositories/RiskDataLoader";
import { validateRiskDataset } from "../src/validation/validateRiskDataset";
import type { RiskEventsDataset } from "../src/types/RiskEvent";
import type { RiskPatternsDataset } from "../src/types/Pattern";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../data");

function readJson<T>(fileName: string): T {
  return JSON.parse(readFileSync(path.join(dataDir, fileName), "utf-8")) as T;
}

const eventsDataset = readJson<RiskEventsDataset>("risk_events_final.json");
const patternsDataset = readJson<RiskPatternsDataset>("risk_patterns_final.json");

describe("Component 4 dataset regression (risk_events_final.json + risk_patterns_final.json)", () => {
  it("passes hard validation with zero errors", () => {
    const validation = validateRiskDataset(eventsDataset, patternsDataset);
    const errors = validation.issues.filter((i) => i.severity === "error");
    expect(errors).toEqual([]);
    expect(validation.valid).toBe(true);
  });

  it("has exactly 1000 events with unique IDs", () => {
    expect(eventsDataset.events).toHaveLength(1000);
    expect(new Set(eventsDataset.events.map((e) => e.event_id)).size).toBe(1000);
  });

  it("has exactly 137 unique pattern IDs", () => {
    expect(patternsDataset.pattern_count).toBe(137);
    expect(new Set(patternsDataset.patterns.map((p) => p.pattern_id)).size).toBe(137);
  });

  it("has exactly 22 priority_queue entries, all resolving to real patterns", () => {
    expect(patternsDataset.priority_queue).toHaveLength(22);
    const patternIds = new Set(patternsDataset.patterns.map((p) => p.pattern_id));
    for (const id of patternsDataset.priority_queue) {
      expect(patternIds.has(id)).toBe(true);
    }
  });

  it("has every pattern's matching_event_ids resolve to a real event", () => {
    const eventIds = new Set(eventsDataset.events.map((e) => e.event_id));
    for (const pattern of patternsDataset.patterns) {
      for (const eventId of pattern.matching_event_ids) {
        expect(eventIds.has(eventId)).toBe(true);
      }
    }
  });

  it("has every pattern's groq_fact_payload.matching_event_ids as a subset of its own matching_event_ids", () => {
    for (const pattern of patternsDataset.patterns) {
      const matchingSet = new Set(pattern.matching_event_ids);
      for (const eventId of pattern.groq_fact_payload.matching_event_ids) {
        expect(matchingSet.has(eventId)).toBe(true);
      }
    }
  });

  it("correctly keeps Non-Financial events' financial fields null (never 0)", () => {
    const nonFinancial = eventsDataset.events.filter((e) => e.event_type === "Non-Financial");
    expect(nonFinancial.length).toBeGreaterThan(0);
    for (const event of nonFinancial.slice(0, 50)) {
      expect(event.financial.gross_amount).toBeNull();
      expect(event.financial.net_amount_reported).toBeNull();
      expect(event.financial.recovery_amount_reported).toBeNull();
    }
  });

  it("builds a working repository pair over the full dataset", () => {
    const { eventRepository, patternRepository } = buildRiskDataset(eventsDataset, patternsDataset);
    expect(eventRepository.count()).toBe(1000);
    expect(patternRepository.count()).toBe(137);
    expect(patternRepository.getPriorityQueue()).toHaveLength(22);
  });
});
