import { describe, expect, it } from "vitest";
import { ENTERPRISE_WIDE, filterEvents, normalizeFilters } from "../src/services/FilterService";
import { AppError } from "../src/utils/errors";
import { makeConfig, makeEvent, resetCounter } from "./fixtures";

describe("FilterService", () => {
  const config = makeConfig();

  it("normalizes defaults to Enterprise-wide, All, All and the config date bounds", () => {
    const filters = normalizeFilters({ organisation: ENTERPRISE_WIDE, eventType: "All", severity: "All" }, config);
    expect(filters).toEqual({
      organisation: ENTERPRISE_WIDE,
      eventType: "All",
      severity: "All",
      dateFrom: config.dateRange.min,
      dateTo: config.dateRange.max,
    });
  });

  it("rejects an organisation not present in config", () => {
    expect(() =>
      normalizeFilters({ organisation: "Not A Real Org", eventType: "All", severity: "All" }, config),
    ).toThrow(AppError);
  });

  it("rejects dateFrom after dateTo", () => {
    expect(() =>
      normalizeFilters(
        { organisation: ENTERPRISE_WIDE, dateFrom: "2026-01-01", dateTo: "2025-01-01", eventType: "All", severity: "All" },
        config,
      ),
    ).toThrow(AppError);
  });

  describe("filterEvents", () => {
    resetCounter();
    const events = [
      makeEvent({ ownerOrganisation: "Summit Payments → Fictional Enterprise Operations", occurrenceDate: "2025-01-10", eventType: "Financial", severity: "High" }),
      makeEvent({ ownerOrganisation: "Northstar Advisory Services → Fictional Enterprise Operations", occurrenceDate: "2025-06-01", eventType: "Non-Financial", severity: "Low" }),
      makeEvent({ ownerOrganisation: "Summit Payments → Fictional Enterprise Operations", occurrenceDate: "2026-08-31", eventType: "Non-Financial", severity: "Moderate" }),
    ];

    it("Enterprise-wide keeps every event regardless of organisation", () => {
      const filters = normalizeFilters({ organisation: ENTERPRISE_WIDE, eventType: "All", severity: "All" }, config);
      expect(filterEvents(events, filters)).toHaveLength(3);
    });

    it("filters by organisation", () => {
      const filters = normalizeFilters(
        { organisation: "Summit Payments → Fictional Enterprise Operations", eventType: "All", severity: "All" },
        config,
      );
      expect(filterEvents(events, filters)).toHaveLength(2);
    });

    it("filters by inclusive date range", () => {
      const filters = normalizeFilters(
        { organisation: ENTERPRISE_WIDE, dateFrom: "2025-01-10", dateTo: "2025-06-01", eventType: "All", severity: "All" },
        config,
      );
      expect(filterEvents(events, filters)).toHaveLength(2);
    });

    it("filters by event type", () => {
      const filters = normalizeFilters({ organisation: ENTERPRISE_WIDE, eventType: "Financial", severity: "All" }, config);
      expect(filterEvents(events, filters)).toHaveLength(1);
    });

    it("filters by severity", () => {
      const filters = normalizeFilters({ organisation: ENTERPRISE_WIDE, eventType: "All", severity: "Moderate" }, config);
      expect(filterEvents(events, filters)).toHaveLength(1);
    });

    it("combines all filter dimensions", () => {
      const filters = normalizeFilters(
        {
          organisation: "Summit Payments → Fictional Enterprise Operations",
          eventType: "Non-Financial",
          severity: "Moderate",
          dateFrom: "2026-01-01",
          dateTo: "2026-12-31",
        },
        config,
      );
      const result = filterEvents(events, filters);
      expect(result).toHaveLength(1);
      expect(result[0]?.occurrenceDate).toBe("2026-08-31");
    });
  });
});
