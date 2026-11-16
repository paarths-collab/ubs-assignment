import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { loadDataset } from "../src/repositories/DataLoader";
import { DATASET_REGRESSION_TRUTHS } from "../src/config/constants";
import type { RawFullEventDetailMap, RawStreamEventList } from "../src/types/Event";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../data");

function readJson<T>(fileName: string): T {
  return JSON.parse(readFileSync(path.join(dataDir, fileName), "utf-8")) as T;
}

function main(): void {
  const rawEvents = readJson<RawStreamEventList>("events_streamgraph.json");
  const rawDetails = readJson<RawFullEventDetailMap>("event_details_streamgraph.json");
  const rawAi = readJson<unknown>("event_ai_streamgraph.json");

  console.log(`Loaded ${rawEvents.length} events, ${Object.keys(rawDetails).length} detail records.`);

  let hasFailure = false;

  try {
    const { events, validation } = loadDataset(rawEvents, rawDetails, rawAi);

    for (const issue of validation.issues) {
      const marker = issue.severity === "error" ? "ERROR" : "WARN ";
      console.log(`[${marker}] ${issue.message}`);
    }

    console.log("\n--- Regression checks against known dataset truths ---");
    const check = (label: string, actual: unknown, expected: unknown) => {
      const pass = JSON.stringify(actual) === JSON.stringify(expected);
      console.log(`${pass ? "PASS" : "FAIL"}  ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      if (!pass) hasFailure = true;
    };

    check("total events", events.length, DATASET_REGRESSION_TRUTHS.totalEvents);

    const eventTypeCounts = { Financial: 0, "Non-Financial": 0 } as Record<string, number>;
    const severityCounts = { Low: 0, Moderate: 0, High: 0 } as Record<string, number>;
    for (const e of events) {
      eventTypeCounts[e.eventType] = (eventTypeCounts[e.eventType] ?? 0) + 1;
      severityCounts[e.severity] = (severityCounts[e.severity] ?? 0) + 1;
    }
    check("event type counts", eventTypeCounts, DATASET_REGRESSION_TRUTHS.eventTypeCounts);
    check("severity counts", severityCounts, DATASET_REGRESSION_TRUTHS.severityCounts);

    const dates = events.map((e) => e.occurrenceDate).sort();
    check("earliest occurrence date", dates[0], DATASET_REGRESSION_TRUTHS.occurrenceDateStart);
    check("latest occurrence date", dates[dates.length - 1], DATASET_REGRESSION_TRUTHS.occurrenceDateEnd);

    const orgCount = new Set(events.map((e) => e.ownerOrganisation)).size;
    check("organisation count", orgCount, DATASET_REGRESSION_TRUTHS.organisationCount);

    const rootCauseCount = new Set(events.map((e) => e.rootCause)).size;
    check("root cause count", rootCauseCount, DATASET_REGRESSION_TRUTHS.rootCauseCount);
  } catch (err) {
    console.error((err as Error).message);
    hasFailure = true;
  }

  if (hasFailure) {
    console.error("\nData validation FAILED.");
    process.exit(1);
  }
  console.log("\nData validation PASSED.");
}

main();
