import { describe, expect, it } from "vitest";
import {
  buildStreamSeriesData,
  generatePeriods,
  getEventsInPeriod,
  getPreviousPeriod,
  getStableSeriesOrder,
} from "../src/services/TimelineService";
import { makeEvent } from "./fixtures";

describe("generatePeriods (monthly)", () => {
  it("derives one bucket per distinct month present in the data, with no gaps filled in", () => {
    const events = [
      makeEvent({ occurrenceDate: "2026-01-05" }),
      makeEvent({ occurrenceDate: "2026-01-20" }),
      makeEvent({ occurrenceDate: "2026-03-10" }), // February has zero events — no bucket for it
    ];
    const periods = generatePeriods(events, "month");
    expect(periods.map((p) => p.id)).toEqual(["month:2026-01", "month:2026-03"]);
    expect(periods[0]?.pointDate).toBe("2026-01-31");
    expect(periods[0]?.label).toBe("Jan 2026");
  });

  it("returns an empty array for an empty event set", () => {
    expect(generatePeriods([], "month")).toEqual([]);
  });
});

describe("generatePeriods (weekly, ISO Monday-Sunday)", () => {
  it("buckets events into the correct Monday-anchored week", () => {
    const events = [
      makeEvent({ occurrenceDate: "2026-08-03" }), // Monday
      makeEvent({ occurrenceDate: "2026-08-09" }), // Sunday, same week
      makeEvent({ occurrenceDate: "2026-08-10" }), // Monday, next week
    ];
    const periods = generatePeriods(events, "week");
    expect(periods.map((p) => p.id)).toEqual(["week:2026-08-03", "week:2026-08-10"]);
    expect(periods[0]?.startDate).toBe("2026-08-03");
    expect(periods[0]?.endDate).toBe("2026-08-09");
  });
});

describe("getEventsInPeriod", () => {
  it("includes only events within the period's inclusive bounds", () => {
    const events = [
      makeEvent({ occurrenceDate: "2026-01-01" }),
      makeEvent({ occurrenceDate: "2026-01-31" }),
      makeEvent({ occurrenceDate: "2026-02-01" }),
    ];
    const period = generatePeriods(events, "month")[0]!;
    expect(getEventsInPeriod(events, period)).toHaveLength(2);
  });
});

describe("getPreviousPeriod", () => {
  it("returns the prior calendar month for a monthly period", () => {
    const period = generatePeriods([makeEvent({ occurrenceDate: "2026-03-15" })], "month")[0]!;
    const prev = getPreviousPeriod(period);
    expect(prev.id).toBe("month:2026-02");
  });

  it("handles January -> previous December (year rollover)", () => {
    const period = generatePeriods([makeEvent({ occurrenceDate: "2026-01-15" })], "month")[0]!;
    const prev = getPreviousPeriod(period);
    expect(prev.id).toBe("month:2025-12");
  });

  it("returns the prior 7-day week for a weekly period", () => {
    const period = generatePeriods([makeEvent({ occurrenceDate: "2026-08-10" })], "week")[0]!;
    const prev = getPreviousPeriod(period);
    expect(prev.id).toBe("week:2026-08-03");
  });
});

describe("getStableSeriesOrder", () => {
  it("uses the fixed Low/Moderate/High order for severity, regardless of data order", () => {
    const events = [makeEvent({ severity: "High" }), makeEvent({ severity: "Low" })];
    expect(getStableSeriesOrder(events, "severity")).toEqual(["Low", "Moderate", "High"]);
  });

  it("uses the fixed Non-Financial/Financial order for event type", () => {
    const events = [makeEvent({ eventType: "Financial" })];
    expect(getStableSeriesOrder(events, "eventType")).toEqual(["Non-Financial", "Financial"]);
  });
});

describe("buildStreamSeriesData", () => {
  it("produces one point per period with every series key present (zero-filled)", () => {
    const events = [
      makeEvent({ occurrenceDate: "2026-01-05", severity: "High" }),
      makeEvent({ occurrenceDate: "2026-01-10", severity: "Low" }),
    ];
    const data = buildStreamSeriesData(events, "month", "severity");
    expect(data.seriesKeys).toEqual(["Low", "Moderate", "High"]);
    expect(data.points).toHaveLength(1);
    expect(data.points[0]?.series).toEqual({ Low: 1, Moderate: 0, High: 1 });
    expect(data.points[0]?.total).toBe(2);
  });
});
