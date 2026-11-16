import { readFileSync } from "node:fs";
import path from "node:path";

import type { RiskEventsDataset } from "../types/RiskEvent";
import type { RiskPatternsDataset } from "../types/Pattern";
import { validateRiskDataset } from "../validation/validateRiskDataset";
import type { ValidationResult } from "../validation/validateDataset";
import { PatternRepository } from "./PatternRepository";
import { RiskEventRepository } from "./RiskEventRepository";

export interface LoadedRiskDataset {
  eventRepository: RiskEventRepository;
  patternRepository: PatternRepository;
  validation: ValidationResult;
}

/**
 * Validates and wires up the two raw Component 4 JSON payloads into their
 * repositories. Throws only on hard validation failure — callers (server.ts)
 * are expected to let that throw propagate and exit the process rather than
 * serve an API over data that failed integrity checks.
 */
export function buildRiskDataset(
  eventsDataset: RiskEventsDataset,
  patternsDataset: RiskPatternsDataset,
): LoadedRiskDataset {
  const validation = validateRiskDataset(eventsDataset, patternsDataset);
  if (!validation.valid) {
    const message = validation.issues
      .filter((issue) => issue.severity === "error")
      .map((issue) => issue.message)
      .join("\n");
    throw new Error(`Risk dataset validation failed:\n${message}`);
  }

  const eventRepository = new RiskEventRepository(eventsDataset.events);
  const patternRepository = new PatternRepository(patternsDataset);

  return { eventRepository, patternRepository, validation };
}

/** Reads both JSON files from `dataDir` (defaults to `<this package>/data`) and builds the dataset. */
export function loadRiskDatasetFromDisk(dataDir: string): LoadedRiskDataset {
  const eventsDataset = JSON.parse(
    readFileSync(path.join(dataDir, "risk_events_final.json"), "utf-8"),
  ) as RiskEventsDataset;
  const patternsDataset = JSON.parse(
    readFileSync(path.join(dataDir, "risk_patterns_final.json"), "utf-8"),
  ) as RiskPatternsDataset;
  return buildRiskDataset(eventsDataset, patternsDataset);
}
