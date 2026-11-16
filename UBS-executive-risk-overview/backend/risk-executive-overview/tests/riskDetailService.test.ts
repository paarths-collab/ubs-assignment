import { describe, expect, it } from "vitest";
import { buildRiskDetail, resolveSelectionSlice } from "../src/services/RiskDetailService";
import { AppError } from "../src/utils/errors";
import { makeConfig, makeEvent, resetCounter } from "./fixtures";
import type { RiskRepository } from "../src/repositories/RiskRepository";
import type { RiskPattern } from "../src/types/Pattern";

describe("RiskDetailService", () => {
  const config = makeConfig();

  it("builds a full detail response with severity, ownership, financial and timeliness sections", () => {
    resetCounter();
    const events = [
      makeEvent({ severity: "High", eventType: "Financial", grossAmountUsd: 1000, netAmountUsd: 900, ownerName: "A" }),
      makeEvent({ severity: "Low", eventType: "Financial", grossAmountUsd: 500, netAmountUsd: 450, ownerName: "B" }),
    ];
    const detail = buildRiskDetail({ type: "eventIds", eventIds: events.map((e) => e.eventId) }, events, config, null);

    expect(detail.summary.eventCount).toBe(2);
    expect(detail.severity).toEqual({ High: 1, Low: 1 });
    expect(detail.ownership.ownerCount).toBe(2);
    expect(detail.financial.grossAmountUsd).toBe(1500);
    expect(detail.financial.netAmountUsd).toBe(1350);
    expect(detail.timeliness.detectionDelayDays).not.toBeNull();
    expect(detail.evidence.eventIds).toEqual(events.map((e) => e.eventId));
  });

  it("groups issue summaries by issueDetail, most frequent first", () => {
    resetCounter();
    const events = [
      makeEvent({ issueDetail: "Issue A" }),
      makeEvent({ issueDetail: "Issue A" }),
      makeEvent({ issueDetail: "Issue B" }),
    ];
    const detail = buildRiskDetail({ type: "issue", issueDetail: "Issue A" }, events, config, null);
    expect(detail.issues[0]).toEqual({ issueDetail: "Issue A", eventCount: 2 });
  });

  it("throws NO_EVENTS_MATCH for an empty slice instead of returning an empty-but-valid response", () => {
    expect(() => buildRiskDetail({ type: "issue", issueDetail: "x" }, [], config, null)).toThrow(AppError);
  });

  describe("resolveSelectionSlice", () => {
    resetCounter();
    const events = [
      makeEvent({ status: "Active" }),
      makeEvent({ status: "Closed" }),
      makeEvent({ eventType: "Financial", grossAmountUsd: 100 }),
      makeEvent({ eventType: "Financial", grossAmountUsd: null }),
    ];
    const filteredIds = new Set(events.map((e) => e.eventId));

    it("resolves the openBacklog KPI selection using the config-driven exclusion rule", () => {
      const slice = resolveSelectionSlice({ type: "kpi", kpiId: "openBacklog" }, events, filteredIds, config, {} as RiskRepository);
      expect(slice.every((event) => event.status !== "Closed")).toBe(true);
    });

    it("resolves the grossExposure KPI selection to only Financial events with a valid amount", () => {
      const slice = resolveSelectionSlice({ type: "kpi", kpiId: "grossExposure" }, events, filteredIds, config, {} as RiskRepository);
      expect(slice).toHaveLength(1);
      expect(slice[0]?.grossAmountUsd).toBe(100);
    });

    it("rejects an unknown kpiId", () => {
      expect(() =>
        resolveSelectionSlice({ type: "kpi", kpiId: "notReal" }, events, filteredIds, config, {} as RiskRepository),
      ).toThrow(AppError);
    });

    it("throws PATTERN_NOT_FOUND for an unknown patternId", () => {
      const repository = { getPatternById: () => undefined } as unknown as RiskRepository;
      expect(() =>
        resolveSelectionSlice({ type: "pattern", patternId: "missing" }, events, filteredIds, config, repository),
      ).toThrow(AppError);
    });

    it("intersects pattern membership with the filtered set for a pattern selection", () => {
      const testPattern: RiskPattern = { patternId: "p1", patternType: "issue", eventIds: [events[0]!.eventId], group: {} };
      const repository = {
        getPatternById: () => testPattern,
        getEventsByIds: (ids: readonly string[]) => events.filter((e) => ids.includes(e.eventId)),
      } as unknown as RiskRepository;
      const slice = resolveSelectionSlice({ type: "pattern", patternId: "p1" }, events, filteredIds, config, repository);
      expect(slice).toEqual([events[0]]);
    });
  });
});
