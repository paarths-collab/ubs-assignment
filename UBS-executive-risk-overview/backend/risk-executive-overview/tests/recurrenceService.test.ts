import { describe, expect, it } from "vitest";
import { computeRecurrenceFacts } from "../src/services/RecurrenceService";
import { makeEvent, resetCounter } from "./fixtures";

const SAME_ISSUE = "A transaction was posted twice after a retry was processed as a new request.";

describe("computeRecurrenceFacts", () => {
  it("identifies same-person-same-issue recurrence with workflow-concentration language, never blame", () => {
    resetCounter();
    const events = [
      makeEvent({ issueDetail: SAME_ISSUE, ownerName: "Alex Maddox" }),
      makeEvent({ issueDetail: SAME_ISSUE, ownerName: "Alex Maddox" }),
      makeEvent({ issueDetail: SAME_ISSUE, ownerName: "Alex Maddox" }),
    ];
    const facts = computeRecurrenceFacts(events);
    expect(facts.recurrenceCase).toBe("same_person_same_issue");
    expect(facts.interpretation).toContain("assigned or owned workflow");
    expect(facts.interpretation.toLowerCase()).not.toContain("caused");
    expect(facts.interpretation.toLowerCase()).not.toContain("responsible");
  });

  it("identifies multiple-people-same-issue-same-organisation as a shared process pattern", () => {
    resetCounter();
    const org = "Summit Payments → Fictional Enterprise Operations";
    const events = [
      makeEvent({ issueDetail: SAME_ISSUE, ownerName: "Owner A", ownerOrganisation: org }),
      makeEvent({ issueDetail: SAME_ISSUE, ownerName: "Owner B", ownerOrganisation: org }),
    ];
    const facts = computeRecurrenceFacts(events);
    expect(facts.recurrenceCase).toBe("multiple_people_same_issue_same_organisation");
    expect(facts.interpretation).toContain("shared process or control pattern");
  });

  it("identifies same-issue-across-organisations as a broader enterprise pattern", () => {
    resetCounter();
    const events = [
      makeEvent({ issueDetail: SAME_ISSUE, ownerOrganisation: "Summit Payments → Fictional Enterprise Operations" }),
      makeEvent({ issueDetail: SAME_ISSUE, ownerOrganisation: "Northstar Advisory Services → Fictional Enterprise Operations" }),
    ];
    const facts = computeRecurrenceFacts(events);
    expect(facts.recurrenceCase).toBe("same_issue_multiple_organisations");
    expect(facts.interpretation).toContain("enterprise-level pattern");
  });

  it("reports raw counts regardless of which recurrence case applies", () => {
    resetCounter();
    const events = [
      makeEvent({ ownerName: "A", currentAssignee: "X" }),
      makeEvent({ ownerName: "B", currentAssignee: "Y" }),
    ];
    const facts = computeRecurrenceFacts(events);
    expect(facts.ownerCount).toBe(2);
    expect(facts.assigneeCount).toBe(2);
  });

  it("falls back to 'none' when the slice spans multiple distinct issues", () => {
    resetCounter();
    const events = [makeEvent({ issueDetail: "Issue A" }), makeEvent({ issueDetail: "Issue B" })];
    expect(computeRecurrenceFacts(events).recurrenceCase).toBe("none");
  });
});
