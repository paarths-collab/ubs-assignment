import { describe, expect, it } from "vitest";

import eventsFile from "../data/events_brain.json";
import nodesFile from "../data/nodes_brain.json";
import edgesFile from "../data/edges_brain.json";
import indexesFile from "../data/indexes_brain.json";

import { buildBrainData } from "../src/data-loader";
import { computeFilteredEventIds } from "../src/filter-engine";
import { createEmptyFilterState } from "../src/app-state";
import { calculateMetrics } from "../src/metrics";
import { formatDays, formatMoney, formatPercent, NOT_APPLICABLE } from "../src/formatters";
import type { EdgesBrainFile, EventsBrainFile, IndexesBrainFile, NodesBrainFile } from "../src/types";

const data = buildBrainData(
  eventsFile as EventsBrainFile,
  nodesFile as NodesBrainFile,
  edgesFile as EdgesBrainFile,
  indexesFile as IndexesBrainFile,
);

const allEvents = computeFilteredEventIds(data, createEmptyFilterState());

describe("calculateMetrics — deterministic facts over a concrete event set", () => {
  it("reproduces the dataset severity distribution and percentages", () => {
    const metrics = calculateMetrics(data, allEvents);
    expect(metrics.eventCount).toBe(1000);
    expect(metrics.severityCounts).toEqual({ Low: 705, Moderate: 244, High: 51 });
    expect(metrics.severityPercentages.High).toBeCloseTo(5.1, 5);
    expect(metrics.severityPercentages.Low).toBeCloseTo(70.5, 5);
  });

  it("reproduces the Financial / Non-Financial split", () => {
    const metrics = calculateMetrics(data, allEvents);
    expect(metrics.financialCount).toBe(239);
    expect(metrics.nonFinancialCount).toBe(761);
  });

  it("reproduces independently computed exposure totals", () => {
    const metrics = calculateMetrics(data, allEvents);
    expect(metrics.grossAmount.total).toBeCloseTo(2_512_564.44, 2);
    expect(metrics.netAmount.total).toBeCloseTo(1_746_532.7, 2);
    expect(metrics.recoveryAmount.total).toBeCloseTo(766_031.74, 2);
    expect(metrics.potentialImpact.total).toBeCloseTo(21_549_693.02, 2);
  });

  it("satisfies Gross - Recovery = Net across the whole dataset", () => {
    const metrics = calculateMetrics(data, allEvents);
    expect(metrics.grossAmount.total! - metrics.recoveryAmount.total!).toBeCloseTo(metrics.netAmount.total!, 2);
  });

  it("counts only the events that actually carry each amount", () => {
    const metrics = calculateMetrics(data, allEvents);
    // Only the 239 Financial events carry gross/net/recovery.
    expect(metrics.grossAmount.contributingCount).toBe(239);
    expect(metrics.netAmount.contributingCount).toBe(239);
    expect(metrics.recoveryAmount.contributingCount).toBe(239);
    // Potential impact is a separate concept present on a different subset.
    expect(metrics.potentialImpact.contributingCount).toBe(724);
  });

  it("reports a null total — never zero — when no event in scope carries the amount", () => {
    const nonFinancialOnly = computeFilteredEventIds(data, {
      ...createEmptyFilterState(),
      eventType: ["Non-Financial"],
    });
    const metrics = calculateMetrics(data, nonFinancialOnly);

    expect(metrics.eventCount).toBe(761);
    expect(metrics.grossAmount.total).toBeNull();
    expect(metrics.grossAmount.contributingCount).toBe(0);
    expect(formatMoney(metrics.grossAmount.total)).toBe(NOT_APPLICABLE);
  });

  it("computes average, median and max delays", () => {
    const metrics = calculateMetrics(data, allEvents);
    expect(metrics.detectionDelay.average).toBeCloseTo(2.462, 3);
    expect(metrics.detectionDelay.median).toBe(1);
    expect(metrics.detectionDelay.max).toBe(8);
  });

  it("returns an empty, non-throwing result for an empty scope", () => {
    const metrics = calculateMetrics(data, new Set<string>());
    expect(metrics.eventCount).toBe(0);
    expect(metrics.severityCounts).toEqual({ Low: 0, Moderate: 0, High: 0 });
    expect(metrics.grossAmount.total).toBeNull();
    expect(metrics.detectionDelay.average).toBeNull();
    expect(metrics.severityPercentages.High).toBe(0);
  });

  it("distributes status and stage across the full dataset", () => {
    const metrics = calculateMetrics(data, allEvents);
    const statusTotal = Object.values(metrics.statusCounts).reduce((a, b) => a + b, 0);
    const stageTotal = Object.values(metrics.stageCounts).reduce((a, b) => a + b, 0);
    expect(statusTotal).toBe(1000);
    expect(stageTotal).toBe(1000);
  });
});

describe("formatters — N/A versus a real zero", () => {
  it("renders a structurally absent amount as N/A", () => {
    expect(formatMoney(null)).toBe(NOT_APPLICABLE);
    expect(formatMoney(undefined)).toBe(NOT_APPLICABLE);
  });

  it("renders a genuine zero as $0, not N/A", () => {
    expect(formatMoney(0)).toBe("$0");
  });

  it("formats money, percentages and days readably", () => {
    expect(formatMoney(1234567)).toBe("$1,234,567");
    expect(formatPercent(5.1)).toBe("5.1%");
    expect(formatPercent(70.5)).toBe("70.5%");
    expect(formatDays(1)).toBe("1 day");
    expect(formatDays(2.46)).toBe("2.5 days");
    expect(formatDays(null)).toBe(NOT_APPLICABLE);
  });
});
