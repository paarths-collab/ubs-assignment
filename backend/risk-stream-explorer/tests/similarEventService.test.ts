import { describe, expect, it } from "vitest";
import { findSimilarEvents } from "../src/services/SimilarEventService";
import { makeEvent } from "./fixtures";

describe("findSimilarEvents", () => {
  const target = makeEvent({
    eventId: "TARGET",
    issueDetail: "Duplicate transaction posting",
    rootCause: "Process / Control Design Gap",
    riskTheme: "Technology Resilience",
    eventType: "Non-Financial",
    ownerOrganisation: "Org A",
  });

  it("excludes the target event itself from results", () => {
    const results = findSimilarEvents(target, [target]);
    expect(results).toHaveLength(0);
  });

  it("scores an identical-issue-detail match highest", () => {
    const sameIssue = makeEvent({ eventId: "SAME-ISSUE", issueDetail: target.issueDetail, rootCause: "Other", riskTheme: "Other", eventType: "Financial", ownerOrganisation: "Org Z" });
    const sameOrgOnly = makeEvent({ eventId: "SAME-ORG", issueDetail: "Different", rootCause: "Other", riskTheme: "Other", eventType: "Financial", ownerOrganisation: "Org A" });

    const results = findSimilarEvents(target, [sameIssue, sameOrgOnly]);
    expect(results[0]?.eventId).toBe("SAME-ISSUE");
    expect(results[0]?.matchedOn).toContain("Issue Detail");
    expect(results[0]!.score).toBeGreaterThan(results[1]!.score);
  });

  it("excludes events with zero matching dimensions", () => {
    const noMatch = makeEvent({ eventId: "NO-MATCH", issueDetail: "Unrelated", rootCause: "Other", riskTheme: "Other", eventType: "Financial", ownerOrganisation: "Org Z" });
    const results = findSimilarEvents(target, [noMatch]);
    expect(results).toHaveLength(0);
  });

  it("respects the limit parameter", () => {
    const candidates = Array.from({ length: 10 }, (_, i) =>
      makeEvent({ eventId: `MATCH-${i}`, ownerOrganisation: target.ownerOrganisation }),
    );
    expect(findSimilarEvents(target, candidates, 3)).toHaveLength(3);
  });

  it("scores accumulate additively across multiple matched dimensions", () => {
    const strongMatch = makeEvent({
      eventId: "STRONG",
      issueDetail: target.issueDetail, // +4
      rootCause: target.rootCause, // +3
      riskTheme: target.riskTheme, // +2
      eventType: target.eventType, // +1
      ownerOrganisation: target.ownerOrganisation, // +1
    });
    const results = findSimilarEvents(target, [strongMatch]);
    expect(results[0]?.score).toBe(11);
    expect(results[0]?.matchedOn).toEqual(["Issue Detail", "Root Cause", "Risk Theme", "Event Type", "Organisation"]);
  });
});
