import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Frontend engines
import eventsFile from "../../../frontend/risk-relationship-network/data/events_brain.json";
import nodesFile from "../../../frontend/risk-relationship-network/data/nodes_brain.json";
import edgesFile from "../../../frontend/risk-relationship-network/data/edges_brain.json";
import indexesFile from "../../../frontend/risk-relationship-network/data/indexes_brain.json";
import { buildBrainData } from "../../../frontend/risk-relationship-network/src/data-loader";
import { computeFilteredEventIds } from "../../../frontend/risk-relationship-network/src/filter-engine";
import { createEmptyFilterState } from "../../../frontend/risk-relationship-network/src/app-state";
import { calculateMetrics } from "../../../frontend/risk-relationship-network/src/metrics";
import type {
  EdgesBrainFile,
  EventsBrainFile,
  IndexesBrainFile,
  NodesBrainFile,
} from "../../../frontend/risk-relationship-network/src/types";

// Backend engines
import { loadCanonicalBrainData } from "../src/services/brain-data";
import { buildInvestigationContext } from "../src/services/investigation-context";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../../../frontend/risk-relationship-network/data");

const frontendData = buildBrainData(
  eventsFile as EventsBrainFile,
  nodesFile as NodesBrainFile,
  edgesFile as EdgesBrainFile,
  indexesFile as IndexesBrainFile,
);
const backendData = loadCanonicalBrainData(dataDir);

/**
 * Guards against the two layers drifting apart. The frontend decides the
 * scope; the backend independently recomputes every figure from canonical
 * data. If these ever disagree, the AI would be reasoning over different
 * numbers than the analyst is reading.
 */
describe("cross-layer accuracy — frontend scope vs backend facts", () => {
  const filters = createEmptyFilterState();
  filters.severity = ["High"];
  filters.eventType = ["Financial"];
  filters.ownerOrganisation = ["Northstar Advisory Services → Fictional Enterprise Operations"];
  filters.occurrenceDate = { from: "2026-01-01", to: "2026-12-31" };

  const filteredEventIds = computeFilteredEventIds(frontendData, filters);

  it("the fixture resolves to the expected deterministic event set", () => {
    expect(Array.from(filteredEventIds)).toEqual(["SIM-0000637"]);
  });

  it("backend severity and type counts match the frontend metrics exactly", () => {
    const frontendMetrics = calculateMetrics(frontendData, filteredEventIds);
    const context = buildInvestigationContext(backendData, { eventIds: Array.from(filteredEventIds) });

    expect(context.scope.eventCount).toBe(frontendMetrics.eventCount);
    expect(context.severityCounts).toEqual(frontendMetrics.severityCounts);
    expect(context.eventTypeCounts.financial).toBe(frontendMetrics.financialCount);
    expect(context.eventTypeCounts.nonFinancial).toBe(frontendMetrics.nonFinancialCount);
  });

  it("backend exposure figures match the frontend metrics exactly", () => {
    const frontendMetrics = calculateMetrics(frontendData, filteredEventIds);
    const context = buildInvestigationContext(backendData, { eventIds: Array.from(filteredEventIds) });

    expect(context.actualExposure.gross.total).toBe(frontendMetrics.grossAmount.total);
    expect(context.actualExposure.net.total).toBe(frontendMetrics.netAmount.total);
    expect(context.actualExposure.recovery.total).toBe(frontendMetrics.recoveryAmount.total);
    expect(context.potentialExposure.total).toBe(frontendMetrics.potentialImpact.total);
  });

  it("agrees across a large scope too, including delay statistics", () => {
    const wideFilters = { ...createEmptyFilterState(), severity: ["High", "Moderate"] };
    const wideScope = computeFilteredEventIds(frontendData, wideFilters);

    const frontendMetrics = calculateMetrics(frontendData, wideScope);
    const context = buildInvestigationContext(backendData, { eventIds: Array.from(wideScope) });

    expect(context.scope.eventCount).toBe(295);
    expect(context.severityCounts).toEqual(frontendMetrics.severityCounts);
    expect(context.actualExposure.gross.total).toBeCloseTo(frontendMetrics.grossAmount.total!, 6);
    expect(context.delays.detection.average).toBeCloseTo(frontendMetrics.detectionDelay.average!, 6);
    expect(context.delays.detection.median).toBe(frontendMetrics.detectionDelay.median);
    expect(context.delays.occurrenceToRecord.average).toBeCloseTo(frontendMetrics.occurrenceToRecord.average!, 6);
  });

  it("agrees that a Non-Financial-only scope has no actual exposure at all", () => {
    const nonFinancial = computeFilteredEventIds(frontendData, {
      ...createEmptyFilterState(),
      eventType: ["Non-Financial"],
    });

    const frontendMetrics = calculateMetrics(frontendData, nonFinancial);
    const context = buildInvestigationContext(backendData, { eventIds: Array.from(nonFinancial) });

    // Both layers must report "no value", never a zero total.
    expect(frontendMetrics.grossAmount.total).toBeNull();
    expect(context.actualExposure.gross.total).toBeNull();
    expect(context.actualExposure.gross.contributingCount).toBe(0);
  });

  it("caps the representative event sample while keeping aggregates over the full scope", () => {
    const wideScope = computeFilteredEventIds(frontendData, createEmptyFilterState());
    const context = buildInvestigationContext(backendData, { eventIds: Array.from(wideScope) });

    expect(context.scope.eventCount).toBe(1000);
    expect(context.representativeEvents.length).toBeLessThanOrEqual(30);
    // The sample leads with the most investigation-relevant events.
    expect(context.representativeEvents[0]?.severity).toBe("High");
  });
});
