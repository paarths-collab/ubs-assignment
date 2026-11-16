import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { loadDataset } from "../src/repositories/DataLoader";
import { EventRepository } from "../src/repositories/EventRepository";
import { DATASET_REGRESSION_TRUTHS } from "../src/config/constants";
import { assertFieldRegistryComplete } from "../src/config/fieldRegistry";
import type { RawFullEventDetailMap, RawStreamEventList } from "../src/types/Event";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../data");

function readJson<T>(fileName: string): T {
  return JSON.parse(readFileSync(path.join(dataDir, fileName), "utf-8")) as T;
}

const rawEvents = readJson<RawStreamEventList>("events_streamgraph.json");
const rawDetails = readJson<RawFullEventDetailMap>("event_details_streamgraph.json");
const rawAi = readJson<unknown>("event_ai_streamgraph.json");

describe("dataset regression (known-true facts about the shipped data)", () => {
  it("loads without hard validation errors", () => {
    expect(() => loadDataset(rawEvents, rawDetails, rawAi)).not.toThrow();
  });

  const { events } = loadDataset(rawEvents, rawDetails, rawAi);

  it(`has exactly ${DATASET_REGRESSION_TRUTHS.totalEvents} events`, () => {
    expect(events).toHaveLength(DATASET_REGRESSION_TRUTHS.totalEvents);
  });

  it("has exactly 1000 detail records", () => {
    expect(Object.keys(rawDetails)).toHaveLength(1000);
  });

  it("matches the known Financial/Non-Financial split", () => {
    const counts = { Financial: 0, "Non-Financial": 0 };
    for (const e of events) counts[e.eventType] += 1;
    expect(counts).toEqual(DATASET_REGRESSION_TRUTHS.eventTypeCounts);
  });

  it("matches the known Low/Moderate/High severity split", () => {
    const counts = { Low: 0, Moderate: 0, High: 0 };
    for (const e of events) counts[e.severity] += 1;
    expect(counts).toEqual(DATASET_REGRESSION_TRUTHS.severityCounts);
  });

  it("matches the known occurrence date range", () => {
    const dates = events.map((e) => e.occurrenceDate).sort();
    expect(dates[0]).toBe(DATASET_REGRESSION_TRUTHS.occurrenceDateStart);
    expect(dates[dates.length - 1]).toBe(DATASET_REGRESSION_TRUTHS.occurrenceDateEnd);
  });

  it("matches the known organisation count", () => {
    expect(new Set(events.map((e) => e.ownerOrganisation)).size).toBe(DATASET_REGRESSION_TRUTHS.organisationCount);
  });

  it("matches the known root cause count", () => {
    expect(new Set(events.map((e) => e.rootCause)).size).toBe(DATASET_REGRESSION_TRUTHS.rootCauseCount);
  });

  it("has every event id resolve to a detail record and vice versa", () => {
    const eventIds = new Set(events.map((e) => e.eventId));
    const detailIds = new Set(Object.keys(rawDetails));
    expect(eventIds.size).toBe(detailIds.size);
    for (const id of eventIds) expect(detailIds.has(id)).toBe(true);
  });

  it("has no duplicate event ids", () => {
    const ids = events.map((e) => e.eventId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("field registry covers every one of the 35 raw detail fields, no more, no less", () => {
    const sampleKeys = Object.keys(Object.values(rawDetails)[0]!);
    expect(sampleKeys).toHaveLength(35);
    expect(() => assertFieldRegistryComplete(sampleKeys)).not.toThrow();
  });

  it("builds a working EventRepository over the full dataset", () => {
    const repo = new EventRepository(events, rawDetails);
    expect(repo.count()).toBe(1000);
    expect(repo.getDistinctOrganisations()).toHaveLength(12);
    expect(repo.getEarliestOccurrenceDate()).toBe(DATASET_REGRESSION_TRUTHS.occurrenceDateStart);
    expect(repo.getLatestOccurrenceDate()).toBe(DATASET_REGRESSION_TRUTHS.occurrenceDateEnd);
    // Every event resolves to both its lightweight and full-detail record.
    for (const event of events.slice(0, 25)) {
      expect(repo.getById(event.eventId)).not.toBeNull();
      expect(repo.getDetailById(event.eventId)).not.toBeNull();
    }
  });
});
