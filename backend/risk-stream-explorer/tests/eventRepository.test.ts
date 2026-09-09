import { describe, expect, it } from "vitest";
import { EventRepository } from "../src/repositories/EventRepository";
import type { RawFullEventDetail } from "../src/types/Event";
import { makeEvent } from "./fixtures";

function detailFor(eventId: string): RawFullEventDetail {
  return {
    "Event ID": eventId,
    "Event Title": "x",
    "Event Description": null,
    "Event Type": "Non-Financial",
    "Overall Event Classification": "Low",
    "Event Gross Amount (USD)": null,
    "Event Net Amount (USD)": null,
    "Event Recovery Amount (USD)": null,
    "Event Potential Impact Amount  (USD)": null,
    "Provision Status": null,
    "Event Status": null,
    "Event Stage": null,
    "Date Event Discovered": null,
    "Event Occurrence Date": "2026-01-01",
    "Event Owner Organisation": "Org A",
    "Event Creator Name": null,
    "Event Administrator Name": null,
    "Event Owner Name": null,
    "Discovery Organisation": null,
    "Root Cause": null,
    "Risk Theme": null,
    "OR Category": null,
    "Current Assignee": null,
    "Created On": null,
    "Modified By Name": null,
    "Modified On": null,
    "Impacts": null,
    "Background Detail": null,
    "Issue Detail": null,
    "Root Cause Detail": null,
    "Impact Detail": null,
    "Opportunity": null,
    "Detection Delay Days": null,
    "Recording Delay Days": null,
    "Occurrence to Record Days": null,
  };
}

describe("EventRepository", () => {
  const events = [
    makeEvent({ eventId: "E1", occurrenceDate: "2026-01-05" }),
    makeEvent({ eventId: "E2", occurrenceDate: "2026-01-20" }),
    makeEvent({ eventId: "E3", occurrenceDate: "2026-02-01" }),
  ];
  const detailsById = { E1: detailFor("E1"), E2: detailFor("E2"), E3: detailFor("E3") };
  const repo = new EventRepository(events, detailsById);

  it("looks up an event by id in O(1)", () => {
    expect(repo.getById("E2")?.eventId).toBe("E2");
    expect(repo.getById("UNKNOWN")).toBeNull();
  });

  it("looks up event detail by id", () => {
    expect(repo.getDetailById("E1")?.["Event ID"]).toBe("E1");
    expect(repo.getDetailById("UNKNOWN")).toBeNull();
  });

  it("indexes events by calendar month", () => {
    expect(repo.getByMonthId("2026-01")).toHaveLength(2);
    expect(repo.getByMonthId("2026-02")).toHaveLength(1);
    expect(repo.getByMonthId("2026-03")).toHaveLength(0);
  });

  it("indexes events by ISO week (Monday key)", () => {
    // 2026-01-05 is a Monday.
    expect(repo.getByWeekMondayId("2026-01-05")).toHaveLength(1);
  });

  it("reports dataset-wide earliest/latest occurrence dates", () => {
    expect(repo.getEarliestOccurrenceDate()).toBe("2026-01-05");
    expect(repo.getLatestOccurrenceDate()).toBe("2026-02-01");
  });

  it("returns sorted-by-occurrence events", () => {
    const sorted = repo.getAllSortedByOccurrence();
    expect(sorted.map((e) => e.eventId)).toEqual(["E1", "E2", "E3"]);
  });

  it("counts total events", () => {
    expect(repo.count()).toBe(3);
  });
});
