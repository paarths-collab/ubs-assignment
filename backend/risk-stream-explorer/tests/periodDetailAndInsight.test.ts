import { describe, expect, it } from "vitest";
import { EventRepository } from "../src/repositories/EventRepository";
import { AIInsightRepository } from "../src/services/AIInsightRepository";
import { getPeriodDetail } from "../src/services/PeriodDetailService";
import { generatePeriods } from "../src/services/TimelineService";
import { EMPTY_FILTER_STATE } from "../src/types/Filters";
import { INSUFFICIENT_EVIDENCE_TEXT } from "../src/types/AIInsight";
import { makeEvent } from "./fixtures";
import type { RawFullEventDetail, RawFullEventDetailMap } from "../src/types/Event";

function minimalDetail(e: ReturnType<typeof makeEvent>): RawFullEventDetail {
  return {
    "Event ID": e.eventId,
    "Event Title": e.eventTitle,
    "Event Description": null,
    "Event Type": e.eventType,
    "Overall Event Classification": e.severity,
    "Event Gross Amount (USD)": null,
    "Event Net Amount (USD)": null,
    "Event Recovery Amount (USD)": null,
    "Event Potential Impact Amount  (USD)": null,
    "Provision Status": null,
    "Event Status": e.eventStatus,
    "Event Stage": e.eventStage,
    "Date Event Discovered": e.discoveredDate,
    "Event Occurrence Date": e.occurrenceDate,
    "Event Owner Organisation": e.ownerOrganisation,
    "Event Creator Name": null,
    "Event Administrator Name": null,
    "Event Owner Name": null,
    "Discovery Organisation": e.discoveryOrganisation,
    "Root Cause": e.rootCause,
    "Risk Theme": e.riskTheme,
    "OR Category": e.orCategory,
    "Current Assignee": null,
    "Created On": null,
    "Modified By Name": null,
    "Modified On": null,
    "Impacts": null,
    "Background Detail": null,
    "Issue Detail": e.issueDetail,
    "Root Cause Detail": null,
    "Impact Detail": null,
    "Opportunity": null,
    "Detection Delay Days": e.detectionDelayDays,
    "Recording Delay Days": e.recordingDelayDays,
    "Occurrence to Record Days": e.occurrenceToRecordDays,
  };
}

const events = [
  makeEvent({ eventId: "P1", occurrenceDate: "2026-01-05", severity: "High", riskTheme: "Financial Reporting" }),
  makeEvent({ eventId: "P2", occurrenceDate: "2026-01-05", severity: "Low", riskTheme: "Technology Resilience" }),
  makeEvent({ eventId: "P3", occurrenceDate: "2026-01-10", severity: "Moderate", riskTheme: "Technology Resilience" }),
  makeEvent({ eventId: "P4", occurrenceDate: "2025-12-15", severity: "Low", riskTheme: "Technology Resilience" }),
];
const detailsById: RawFullEventDetailMap = Object.fromEntries(events.map((e) => [e.eventId, minimalDetail(e)]));

describe("getPeriodDetail", () => {
  const period = generatePeriods(events, "month").find((p) => p.id === "month:2026-01")!;

  it("groups events into chronological day buckets, High severity first within a day", () => {
    const detail = getPeriodDetail(events, period, {
      earliestOccurrenceDate: "2025-12-15",
      latestOccurrenceDate: "2026-01-10",
    });
    expect(detail.days.map((d) => d.date)).toEqual(["2026-01-05", "2026-01-10"]);
    expect(detail.days[0]?.events.map((e) => e.eventId)).toEqual(["P1", "P2"]); // High before Low
  });

  it("computes a real previous-period comparison when the previous month has data", () => {
    const detail = getPeriodDetail(events, period, {
      earliestOccurrenceDate: "2025-12-15",
      latestOccurrenceDate: "2026-01-10",
    });
    expect(detail.comparison.previous).not.toBeNull();
    expect(detail.comparison.previous?.eventCount).toBe(1); // P4
  });

  it("reports no baseline when the previous period falls outside the dataset's recorded span", () => {
    const detail = getPeriodDetail(events, period, {
      earliestOccurrenceDate: "2026-01-01", // dataset doesn't actually go back to December
      latestOccurrenceDate: "2026-01-10",
    });
    expect(detail.comparison.previous).toBeNull();
    expect(detail.comparison.eventCountDelta.isNew).toBe(true);
  });
});

describe("AIInsightRepository", () => {
  const repo = new EventRepository(events, detailsById);
  const emptyAiData = { period_insights: {}, event_insights: {}, trend_insights: {} };
  const ai = new AIInsightRepository(repo, emptyAiData);

  it("generates a populated, evidence-grounded period insight for a real period", () => {
    const period = generatePeriods(events, "month").find((p) => p.id === "month:2026-01")!;
    const payload = ai.getPeriodInsight("explain_period", EMPTY_FILTER_STATE, "month", period);
    expect(payload.source).toBe("verified-narrative");
    expect(payload.observed).not.toBe(INSUFFICIENT_EVIDENCE_TEXT);
    expect(payload.supportingEvidence.length).toBeGreaterThan(0);
  });

  it("returns insufficient-evidence for a period with zero matching events under the active filters", () => {
    const period = generatePeriods(events, "month").find((p) => p.id === "month:2026-01")!;
    const noMatchFilters = { ...EMPTY_FILTER_STATE, severity: "High" as const, eventType: "Financial" as const };
    const payload = ai.getPeriodInsight("explain_period", noMatchFilters, "month", period);
    expect(payload.observed).toBe(INSUFFICIENT_EVIDENCE_TEXT);
  });

  it("generates an event-level insight grounded in the event's own fields", () => {
    const payload = ai.getEventInsight("summarise_event", "P1", EMPTY_FILTER_STATE);
    expect(payload.observed).toContain("P1".length > 0 ? "High" : ""); // sanity: severity referenced
    expect(payload.supportingEvidence.some((m) => m.label === "Event ID" && m.value === "P1")).toBe(true);
  });

  it("throws for an unknown event id rather than fabricating a response", () => {
    expect(() => ai.getEventInsight("summarise_event", "UNKNOWN", EMPTY_FILTER_STATE)).toThrow();
  });
});
