import { describe, expect, it, beforeEach } from "vitest";
import { buildAiFactPackage } from "../src/services/AiFactService";
import { RiskRepository } from "../src/repositories/RiskRepository";
import { filterEvents, normalizeFilters } from "../src/services/FilterService";
import { AppError } from "../src/utils/errors";
import { makeConfig, makeEvent, resetCounter } from "./fixtures";

describe("AiFactService", () => {
  describe("buildAiFactPackage", () => {
    let repository: RiskRepository;
    let config = makeConfig();

    beforeEach(() => {
      repository = new RiskRepository();
      config = makeConfig();
    });

    it("builds a fact package for a pattern selection with correct event counts and severity", () => {
      resetCounter();
      // Use a hand-crafted pattern with concrete events for testing
      const events = [
        makeEvent({ severity: "High", status: "Active" }),
        makeEvent({ severity: "Low", status: "Closed" }),
        makeEvent({ severity: "High", status: "Active" }),
      ];

      const filters = normalizeFilters({ organisation: "Enterprise-wide", eventType: "All", severity: "All" }, config);
      const filteredIds = new Set(events.map((e) => e.eventId));
      const testPatternId = "test_pattern_123";

      const fakeRepository = {
        getPatternById: () => ({
          patternId: testPatternId,
          patternType: "issue",
          eventIds: events.map((e) => e.eventId),
          group: { issueDetail: "Test Issue" },
        }),
        getEventsByIds: (ids: readonly string[]) => events.filter((e) => ids.includes(e.eventId)),
        getAiConfig: () => repository.getAiConfig(),
      } as unknown as RiskRepository;

      const factPackage = buildAiFactPackage(
        { type: "pattern", patternId: testPatternId },
        filters,
        events,
        filteredIds,
        config,
        fakeRepository,
      );

      // Manually compute expected counts
      const severities: Record<string, number> = {};
      let highCount = 0;
      let openCount = 0;
      const excluded = new Set(config.businessRules.openBacklog.excludedStatuses);

      events.forEach((event) => {
        severities[event.severity] = (severities[event.severity] ?? 0) + 1;
        if (event.severity === "High") highCount += 1;
        if (!excluded.has(event.status)) openCount += 1;
      });

      expect(factPackage.eventIds).toEqual(events.map((e) => e.eventId));
      expect(factPackage.eventCount).toBe(events.length);
      expect(factPackage.severityCounts).toEqual(severities);
      expect(factPackage.highSeverityCount).toBe(highCount);
      expect(factPackage.openEventCount).toBe(openCount);
      expect(factPackage.patternId).toBe(testPatternId);
      expect(factPackage.selectionType).toBe("pattern");
    });

    it("sets financial amounts to null when the slice contains zero Financial events", () => {
      resetCounter();
      const events = [
        makeEvent({ eventType: "Non-Financial", potentialImpactUsd: 100 }),
        makeEvent({ eventType: "Non-Financial", potentialImpactUsd: 200 }),
      ];
      const filters = normalizeFilters({ organisation: "Enterprise-wide", eventType: "All", severity: "All" }, config);
      const eventIds = new Set(events.map((e) => e.eventId));

      const fakeRepository = {
        getPatternById: () => undefined,
        getEventsByIds: (ids: readonly string[]) => events.filter((e) => ids.includes(e.eventId)),
      } as unknown as RiskRepository;

      const factPackage = buildAiFactPackage(
        { type: "eventIds", eventIds: events.map((e) => e.eventId) },
        filters,
        events,
        eventIds,
        config,
        fakeRepository,
      );

      expect(factPackage.grossAmountUsd).toBeNull();
      expect(factPackage.recoveryAmountUsd).toBeNull();
      expect(factPackage.netAmountUsd).toBeNull();
      expect(factPackage.recoveryRate).toBeNull();
      // potentialImpactUsd should still sum
      expect(factPackage.potentialImpactUsd).toBe(300);
    });

    it("sums potentialImpactUsd correctly across Financial and Non-Financial events", () => {
      resetCounter();
      const events = [
        makeEvent({ eventType: "Financial", potentialImpactUsd: 1000 }),
        makeEvent({ eventType: "Non-Financial", potentialImpactUsd: 200 }),
        makeEvent({ eventType: "Financial", potentialImpactUsd: null }),
      ];
      const filters = normalizeFilters({ organisation: "Enterprise-wide", eventType: "All", severity: "All" }, config);
      const eventIds = new Set(events.map((e) => e.eventId));

      const fakeRepository = {
        getPatternById: () => undefined,
        getEventsByIds: (ids: readonly string[]) => events.filter((e) => ids.includes(e.eventId)),
      } as unknown as RiskRepository;

      const factPackage = buildAiFactPackage(
        { type: "eventIds", eventIds: events.map((e) => e.eventId) },
        filters,
        events,
        eventIds,
        config,
        fakeRepository,
      );

      expect(factPackage.potentialImpactUsd).toBe(1200);
    });

    it("sets selectionLabel to the issueDetail for an issue selection", () => {
      resetCounter();
      const events = [
        makeEvent({ issueDetail: "API timeout occurred" }),
        makeEvent({ issueDetail: "API timeout occurred" }),
      ];
      const filters = normalizeFilters({ organisation: "Enterprise-wide", eventType: "All", severity: "All" }, config);
      const eventIds = new Set(events.map((e) => e.eventId));

      const fakeRepository = {
        getPatternById: () => undefined,
        getEventsByIds: (ids: readonly string[]) => events.filter((e) => ids.includes(e.eventId)),
      } as unknown as RiskRepository;

      const factPackage = buildAiFactPackage(
        { type: "issue", issueDetail: "API timeout occurred" },
        filters,
        events,
        eventIds,
        config,
        fakeRepository,
      );

      expect(factPackage.selectionLabel).toBe("API timeout occurred");
      expect(factPackage.selectionType).toBe("issue");
      expect(factPackage.patternId).toBeNull();
    });

    it("sets selectionLabel to the KPI label from config for a KPI selection", () => {
      resetCounter();
      const events = [makeEvent(), makeEvent(), makeEvent()];
      const filters = normalizeFilters({ organisation: "Enterprise-wide", eventType: "All", severity: "All" }, config);
      const eventIds = new Set(events.map((e) => e.eventId));

      const fakeRepository = {
        getPatternById: () => undefined,
        getEventsByIds: (ids: readonly string[]) => events.filter((e) => ids.includes(e.eventId)),
      } as unknown as RiskRepository;

      const factPackage = buildAiFactPackage(
        { type: "kpi", kpiId: "openBacklog" },
        filters,
        events,
        eventIds,
        config,
        fakeRepository,
      );

      expect(factPackage.selectionLabel).toBe("Open Backlog");
      expect(factPackage.selectionType).toBe("kpi");
      expect(factPackage.patternId).toBeNull();
    });

    it("throws PATTERN_NOT_FOUND for an unknown patternId", () => {
      resetCounter();
      const events = [makeEvent()];
      const filters = normalizeFilters({ organisation: "Enterprise-wide", eventType: "All", severity: "All" }, config);
      const eventIds = new Set(events.map((e) => e.eventId));

      const fakeRepository = {
        getPatternById: () => undefined,
        getEventsByIds: (ids: readonly string[]) => events.filter((e) => ids.includes(e.eventId)),
      } as unknown as RiskRepository;

      expect(() =>
        buildAiFactPackage(
          { type: "pattern", patternId: "unknown-pattern-xyz" },
          filters,
          events,
          eventIds,
          config,
          fakeRepository,
        ),
      ).toThrow(AppError);

      try {
        buildAiFactPackage(
          { type: "pattern", patternId: "unknown-pattern-xyz" },
          filters,
          events,
          eventIds,
          config,
          fakeRepository,
        );
      } catch (error) {
        if (error instanceof AppError) {
          expect(error.code).toBe("PATTERN_NOT_FOUND");
        }
      }
    });

    it("throws NO_EVENTS_MATCH when the resolved slice is empty", () => {
      resetCounter();
      const events = [makeEvent()];
      const filters = normalizeFilters({ organisation: "Enterprise-wide", eventType: "All", severity: "All" }, config);
      const eventIds = new Set(events.map((e) => e.eventId));

      const fakeRepository = {
        getPatternById: () => undefined,
        getEventsByIds: (ids: readonly string[]) => events.filter((e) => ids.includes(e.eventId)),
      } as unknown as RiskRepository;

      // Try to select an issue that doesn't exist in the events
      expect(() =>
        buildAiFactPackage(
          { type: "issue", issueDetail: "Nonexistent issue" },
          filters,
          events,
          eventIds,
          config,
          fakeRepository,
        ),
      ).toThrow(AppError);

      try {
        buildAiFactPackage(
          { type: "issue", issueDetail: "Nonexistent issue" },
          filters,
          events,
          eventIds,
          config,
          fakeRepository,
        );
      } catch (error) {
        if (error instanceof AppError) {
          expect(error.code).toBe("NO_EVENTS_MATCH");
        }
      }
    });

    it("includes recurrenceFacts with the correct shape", () => {
      resetCounter();
      const events = [
        makeEvent({ ownerName: "Alice", currentAssignee: "Bob" }),
        makeEvent({ ownerName: "Alice", currentAssignee: "Bob" }),
      ];
      const filters = normalizeFilters({ organisation: "Enterprise-wide", eventType: "All", severity: "All" }, config);
      const eventIds = new Set(events.map((e) => e.eventId));

      const fakeRepository = {
        getPatternById: () => undefined,
        getEventsByIds: (ids: readonly string[]) => events.filter((e) => ids.includes(e.eventId)),
      } as unknown as RiskRepository;

      const factPackage = buildAiFactPackage(
        { type: "eventIds", eventIds: events.map((e) => e.eventId) },
        filters,
        events,
        eventIds,
        config,
        fakeRepository,
      );

      expect(factPackage.recurrenceFacts).toBeDefined();
      expect(typeof factPackage.recurrenceFacts).toBe("object");
      expect(factPackage.recurrenceFacts).toHaveProperty("ownerCount");
      expect(factPackage.recurrenceFacts).toHaveProperty("assigneeCount");
      expect(factPackage.recurrenceFacts).toHaveProperty("organisationCount");
      expect(factPackage.recurrenceFacts).toHaveProperty("recurrenceCase");
      expect(factPackage.recurrenceFacts).toHaveProperty("interpretation");
    });

    it("ensures all fact package keys are in the allowedInputFields list", () => {
      resetCounter();
      const events = [
        makeEvent({ severity: "High", eventType: "Financial", grossAmountUsd: 1000, ownerName: "A" }),
        makeEvent({ severity: "Low", eventType: "Non-Financial", potentialImpactUsd: 500, ownerName: "B" }),
      ];
      const filters = normalizeFilters({ organisation: "Enterprise-wide", eventType: "All", severity: "All" }, config);
      const eventIds = new Set(events.map((e) => e.eventId));

      const fakeRepository = {
        getPatternById: () => undefined,
        getEventsByIds: (ids: readonly string[]) => events.filter((e) => ids.includes(e.eventId)),
      } as unknown as RiskRepository;

      const factPackage = buildAiFactPackage(
        { type: "eventIds", eventIds: events.map((e) => e.eventId) },
        filters,
        events,
        eventIds,
        config,
        fakeRepository,
      );

      // Load the allowedInputFields from the AI config
      const aiConfig = repository.getAiConfig();
      const allowedFields = new Set(aiConfig.allowedInputFields);

      const factPackageKeys = Object.keys(factPackage);
      for (const key of factPackageKeys) {
        expect(allowedFields.has(key)).toBe(true);
      }
    });

    it("correctly resolves a KPI selection (openBacklog) using config exclusion rules", () => {
      resetCounter();
      const events = [
        makeEvent({ status: "Active" }),
        makeEvent({ status: "Closed" }),
        makeEvent({ status: "Remediation in Progress" }),
        makeEvent({ status: "Cancelled" }),
      ];
      const filters = normalizeFilters({ organisation: "Enterprise-wide", eventType: "All", severity: "All" }, config);
      const eventIds = new Set(events.map((e) => e.eventId));

      const fakeRepository = {
        getPatternById: () => undefined,
        getEventsByIds: (ids: readonly string[]) => events.filter((e) => ids.includes(e.eventId)),
      } as unknown as RiskRepository;

      const factPackage = buildAiFactPackage(
        { type: "kpi", kpiId: "openBacklog" },
        filters,
        events,
        eventIds,
        config,
        fakeRepository,
      );

      // openBacklog should exclude "Closed" and "Cancelled"
      // Active and Remediation in Progress should be included
      expect(factPackage.openEventCount).toBe(2);
      expect(factPackage.eventCount).toBe(2);
    });
  });
});
