import { describe, expect, it } from "vitest";
import {
  formatIsoDate,
  formatMonthLabel,
  formatWeekLabel,
  getMonthBounds,
  getWeekBounds,
  isValidIsoDate,
  mean,
  median,
  parseDmyDate,
  parseIsoDate,
} from "../src/utils/dateUtils";

describe("isValidIsoDate", () => {
  it("accepts well-formed ISO dates", () => {
    expect(isValidIsoDate("2026-01-15")).toBe(true);
    expect(isValidIsoDate("2024-09-01")).toBe(true);
  });

  it("rejects malformed or impossible dates", () => {
    expect(isValidIsoDate("2026-13-01")).toBe(false);
    expect(isValidIsoDate("2026-02-30")).toBe(false);
    expect(isValidIsoDate("not-a-date")).toBe(false);
    expect(isValidIsoDate(null)).toBe(false);
    expect(isValidIsoDate(undefined)).toBe(false);
    expect(isValidIsoDate(20260115)).toBe(false);
  });
});

describe("parseIsoDate / formatIsoDate round-trip", () => {
  it("round-trips without timezone drift", () => {
    for (const iso of ["2024-09-01", "2026-08-31", "2026-02-28", "2024-02-29"]) {
      expect(formatIsoDate(parseIsoDate(iso))).toBe(iso);
    }
  });
});

describe("parseDmyDate", () => {
  it("parses the DD-Mon-YYYY format used by Modified On", () => {
    const d = parseDmyDate("13-Oct-2024");
    expect(d).not.toBeNull();
    expect(formatIsoDate(d!)).toBe("2024-10-13");
  });

  it("returns null for unrecognised formats", () => {
    expect(parseDmyDate("2024-10-13")).toBeNull();
    expect(parseDmyDate("13-Xyz-2024")).toBeNull();
  });
});

describe("getMonthBounds", () => {
  it("computes first/last day of month and a stable monthId", () => {
    const bounds = getMonthBounds(parseIsoDate("2026-02-15"));
    expect(bounds).toEqual({ monthId: "2026-02", startDate: "2026-02-01", endDate: "2026-02-28" });
  });

  it("handles a leap-year February correctly", () => {
    const bounds = getMonthBounds(parseIsoDate("2024-02-10"));
    expect(bounds.endDate).toBe("2024-02-29");
  });

  it("handles December (year rollover)", () => {
    const bounds = getMonthBounds(parseIsoDate("2025-12-25"));
    expect(bounds).toEqual({ monthId: "2025-12", startDate: "2025-12-01", endDate: "2025-12-31" });
  });
});

describe("formatMonthLabel", () => {
  it("formats a monthId as 'Mon YYYY'", () => {
    expect(formatMonthLabel("2026-08")).toBe("Aug 2026");
  });
});

describe("getWeekBounds (ISO Monday-Sunday)", () => {
  it("anchors a Wednesday to the preceding Monday and following Sunday", () => {
    // 2026-08-05 is a Wednesday.
    const bounds = getWeekBounds(parseIsoDate("2026-08-05"));
    expect(bounds.mondayDate).toBe("2026-08-03");
    expect(bounds.startDate).toBe("2026-08-03");
    expect(bounds.endDate).toBe("2026-08-09");
  });

  it("leaves a Monday as the start of its own week", () => {
    const bounds = getWeekBounds(parseIsoDate("2026-08-03"));
    expect(bounds.mondayDate).toBe("2026-08-03");
  });

  it("maps a Sunday to the Monday six days earlier", () => {
    const bounds = getWeekBounds(parseIsoDate("2026-08-09"));
    expect(bounds.mondayDate).toBe("2026-08-03");
    expect(bounds.endDate).toBe("2026-08-09");
  });

  it("handles a week that crosses a month boundary", () => {
    // 2024-08-31 is a Saturday; its week is Mon 2024-08-26 - Sun 2024-09-01.
    const bounds = getWeekBounds(parseIsoDate("2024-08-31"));
    expect(bounds.mondayDate).toBe("2024-08-26");
    expect(bounds.endDate).toBe("2024-09-01");
  });
});

describe("formatWeekLabel", () => {
  it("formats a same-month week compactly", () => {
    expect(formatWeekLabel("2026-08-03", "2026-08-09")).toBe("3–9 Aug");
  });

  it("includes both months when the week crosses a boundary", () => {
    expect(formatWeekLabel("2024-08-26", "2024-09-01")).toBe("26 Aug–1 Sept");
  });
});

describe("mean / median", () => {
  it("returns null for an empty array", () => {
    expect(mean([])).toBeNull();
    expect(median([])).toBeNull();
  });

  it("computes mean and median for odd and even length arrays", () => {
    expect(mean([1, 2, 3])).toBe(2);
    expect(median([1, 2, 3])).toBe(2);
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("median is order-independent", () => {
    expect(median([5, 1, 3])).toBe(3);
  });
});
