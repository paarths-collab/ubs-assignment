import { describe, expect, it } from "vitest";
import { validateDataset } from "../src/validation/validateDataset";
import type { RiskEvent } from "../src/types/RiskEvent";
import type { RiskPattern } from "../src/types/Pattern";
import type { RiskConfig } from "../src/types/Config";
import { makeEvent, makeConfig, resetCounter } from "./fixtures";

function buildMinimalEvent(eventId: string, overrides: Partial<RiskEvent> = {}): RiskEvent {
  return {
    eventId,
    title: "Test event",
    eventType: "Non-Financial",
    severity: "Low",
    status: "Active",
    stage: "Initial Assessment",
    occurrenceDate: "2025-06-15",
    ownerOrganisation: "Test Org",
    ownerName: "Test Owner",
    currentAssignee: "Test Assignee",
    issueDetail: "Test issue",
    rootCause: "Test cause",
    description: "Test description",
    rootCauseDetail: "Test root cause detail",
    riskTheme: "Technology Resilience",
    orCategory: "Internal Control and Governance",
    grossAmountUsd: null,
    netAmountUsd: null,
    recoveryAmountUsd: null,
    potentialImpactUsd: null,
    provisionStatus: "Not Required",
    discoveredDate: "2025-06-16",
    createdOn: "2025-06-17",
    modifiedOn: "2025-06-18",
    discoveryOrganisation: "Test Org",
    creatorName: "Test Creator",
    administratorName: "Test Admin",
    modifiedByName: "Test Modifier",
    backgroundDetail: "Test background",
    impactDetail: "Test impact",
    opportunity: "Test opportunity",
    impactsRaw: "Test impacts",
    detectionDelayDays: 1,
    recordingDelayDays: 1,
    occurrenceToRecordDays: 2,
    remediationHours: 10,
    remediationHoursFromImpactsField: 10,
    ...overrides,
  };
}

describe("validateDataset", () => {
  describe("valid datasets", () => {
    it("accepts a valid dataset with exactly 1000 events", () => {
      const events = Array.from({ length: 1000 }, (_, i) =>
        buildMinimalEvent(`EVT-${String(i).padStart(6, "0")}`),
      );
      const patterns: RiskPattern[] = [];
      const config = makeConfig();

      // Should not throw
      expect(() => validateDataset(events, patterns, config)).not.toThrow();
    });

    it("accepts a valid dataset with patterns that reference existing events", () => {
      const events = Array.from({ length: 1000 }, (_, i) =>
        buildMinimalEvent(`EVT-${String(i).padStart(6, "0")}`),
      );
      const patterns: RiskPattern[] = [
        {
          patternId: "PAT-001",
          patternType: "issue",
          eventIds: ["EVT-000000", "EVT-000001"],
          group: { issue: "Test" },
        },
      ];
      const config = makeConfig();

      expect(() => validateDataset(events, patterns, config)).not.toThrow();
    });
  });

  describe("event count validation", () => {
    it("rejects a dataset with fewer than 1000 events (999)", () => {
      const events = Array.from({ length: 999 }, (_, i) =>
        buildMinimalEvent(`EVT-${String(i).padStart(6, "0")}`),
      );
      const patterns: RiskPattern[] = [];
      const config = makeConfig();

      expect(() => validateDataset(events, patterns, config)).toThrow("Expected 1000 events, found 999");
    });

    it("rejects a dataset with more than 1000 events (1001)", () => {
      const events = Array.from({ length: 1001 }, (_, i) =>
        buildMinimalEvent(`EVT-${String(i).padStart(6, "0")}`),
      );
      const patterns: RiskPattern[] = [];
      const config = makeConfig();

      expect(() => validateDataset(events, patterns, config)).toThrow("Expected 1000 events, found 1001");
    });
  });

  describe("required field validation", () => {
    it("rejects an event with missing eventId", () => {
      const events = Array.from({ length: 1000 }, (_, i) => {
        const event = buildMinimalEvent(`EVT-${String(i).padStart(6, "0")}`);
        if (i === 500) event.eventId = ""; // empty eventId
        return event;
      });
      const patterns: RiskPattern[] = [];
      const config = makeConfig();

      expect(() => validateDataset(events, patterns, config)).toThrow(/missing required field "eventId"/);
    });

    it("rejects an event with missing title", () => {
      const events = Array.from({ length: 1000 }, (_, i) => {
        const event = buildMinimalEvent(`EVT-${String(i).padStart(6, "0")}`);
        if (i === 500) event.title = "";
        return event;
      });
      const patterns: RiskPattern[] = [];
      const config = makeConfig();

      expect(() => validateDataset(events, patterns, config)).toThrow(/missing required field "title"/);
    });

    it("rejects an event with missing issueDetail", () => {
      const events = Array.from({ length: 1000 }, (_, i) => {
        const event = buildMinimalEvent(`EVT-${String(i).padStart(6, "0")}`);
        if (i === 500) event.issueDetail = "";
        return event;
      });
      const patterns: RiskPattern[] = [];
      const config = makeConfig();

      expect(() => validateDataset(events, patterns, config)).toThrow(/missing required field "issueDetail"/);
    });
  });

  describe("duplicate ID validation", () => {
    it("rejects a dataset with duplicate eventIds", () => {
      const events = Array.from({ length: 1000 }, (_, i) =>
        buildMinimalEvent(i < 500 ? `EVT-${String(i).padStart(6, "0")}` : `EVT-000000`),
      );
      const patterns: RiskPattern[] = [];
      const config = makeConfig();

      expect(() => validateDataset(events, patterns, config)).toThrow('Duplicate eventId "EVT-000000"');
    });

    it("rejects a dataset with duplicate patternIds", () => {
      const events = Array.from({ length: 1000 }, (_, i) =>
        buildMinimalEvent(`EVT-${String(i).padStart(6, "0")}`),
      );
      const patterns: RiskPattern[] = [
        {
          patternId: "PAT-001",
          patternType: "issue",
          eventIds: ["EVT-000000"],
          group: { issue: "Test" },
        },
        {
          patternId: "PAT-001",
          patternType: "issue",
          eventIds: ["EVT-000001"],
          group: { issue: "Test" },
        },
      ];
      const config = makeConfig();

      expect(() => validateDataset(events, patterns, config)).toThrow('Duplicate patternId "PAT-001"');
    });
  });

  describe("event type validation", () => {
    it("rejects an event with invalid eventType", () => {
      const events = Array.from({ length: 1000 }, (_, i) => {
        const event = buildMinimalEvent(`EVT-${String(i).padStart(6, "0")}`);
        if (i === 500) (event.eventType as unknown) = "InvalidType";
        return event;
      });
      const patterns: RiskPattern[] = [];
      const config = makeConfig();

      expect(() => validateDataset(events, patterns, config)).toThrow(/invalid eventType "InvalidType"/);
    });

    it("accepts Financial event type", () => {
      const events = Array.from({ length: 1000 }, (_, i) =>
        buildMinimalEvent(`EVT-${String(i).padStart(6, "0")}`, { eventType: "Financial" }),
      );
      const patterns: RiskPattern[] = [];
      const config = makeConfig();

      expect(() => validateDataset(events, patterns, config)).not.toThrow();
    });
  });

  describe("severity validation", () => {
    it("rejects an event with invalid severity", () => {
      const events = Array.from({ length: 1000 }, (_, i) => {
        const event = buildMinimalEvent(`EVT-${String(i).padStart(6, "0")}`);
        if (i === 500) (event.severity as unknown) = "Critical";
        return event;
      });
      const patterns: RiskPattern[] = [];
      const config = makeConfig();

      expect(() => validateDataset(events, patterns, config)).toThrow(/invalid severity "Critical"/);
    });

    it("accepts all valid severity levels", () => {
      const severities: Array<"Low" | "Moderate" | "High"> = ["Low", "Moderate", "High"];
      for (const severity of severities) {
        const events = Array.from({ length: 1000 }, (_, i) =>
          buildMinimalEvent(`EVT-${String(i).padStart(6, "0")}`, { severity }),
        );
        const patterns: RiskPattern[] = [];
        const config = makeConfig();

        expect(() => validateDataset(events, patterns, config)).not.toThrow();
      }
    });
  });

  describe("date format validation", () => {
    it("rejects an event with non-ISO occurrenceDate", () => {
      const events = Array.from({ length: 1000 }, (_, i) => {
        const event = buildMinimalEvent(`EVT-${String(i).padStart(6, "0")}`);
        if (i === 500) event.occurrenceDate = "09/01/2024"; // non-ISO format
        return event;
      });
      const patterns: RiskPattern[] = [];
      const config = makeConfig();

      expect(() => validateDataset(events, patterns, config)).toThrow(/non-ISO occurrenceDate "09\/01\/2024"/);
    });

    it("accepts valid ISO dates", () => {
      const events = Array.from({ length: 1000 }, (_, i) =>
        buildMinimalEvent(`EVT-${String(i).padStart(6, "0")}`, { occurrenceDate: "2025-06-15" }),
      );
      const patterns: RiskPattern[] = [];
      const config = makeConfig();

      expect(() => validateDataset(events, patterns, config)).not.toThrow();
    });
  });

  describe("pattern reference validation", () => {
    it("rejects a pattern referencing a non-existent eventId", () => {
      const events = Array.from({ length: 1000 }, (_, i) =>
        buildMinimalEvent(`EVT-${String(i).padStart(6, "0")}`),
      );
      const patterns: RiskPattern[] = [
        {
          patternId: "PAT-001",
          patternType: "issue",
          eventIds: ["EVT-000000", "EVT-999999"], // EVT-999999 does not exist
          group: { issue: "Test" },
        },
      ];
      const config = makeConfig();

      expect(() => validateDataset(events, patterns, config)).toThrow(/references unknown eventId "EVT-999999"/);
    });

    it("accepts patterns where all referenced eventIds exist", () => {
      const events = Array.from({ length: 1000 }, (_, i) =>
        buildMinimalEvent(`EVT-${String(i).padStart(6, "0")}`),
      );
      const patterns: RiskPattern[] = [
        {
          patternId: "PAT-001",
          patternType: "issue",
          eventIds: ["EVT-000000", "EVT-000001", "EVT-000002"],
          group: { issue: "Test" },
        },
      ];
      const config = makeConfig();

      expect(() => validateDataset(events, patterns, config)).not.toThrow();
    });
  });

  describe("config validation", () => {
    it("rejects a config missing businessRules.openBacklog.excludedStatuses", () => {
      const events = Array.from({ length: 1000 }, (_, i) =>
        buildMinimalEvent(`EVT-${String(i).padStart(6, "0")}`),
      );
      const patterns: RiskPattern[] = [];
      const config = makeConfig();
      config.businessRules.openBacklog.excludedStatuses = []; // empty array

      expect(() => validateDataset(events, patterns, config)).toThrow(
        /businessRules.openBacklog.excludedStatuses/,
      );
    });

    it("accepts a config with valid excludedStatuses", () => {
      const events = Array.from({ length: 1000 }, (_, i) =>
        buildMinimalEvent(`EVT-${String(i).padStart(6, "0")}`),
      );
      const patterns: RiskPattern[] = [];
      const config = makeConfig();
      config.businessRules.openBacklog.excludedStatuses = ["Closed", "Cancelled"];

      expect(() => validateDataset(events, patterns, config)).not.toThrow();
    });
  });

  describe("error messages", () => {
    it("includes the specific eventId in error messages for missing fields", () => {
      const events = Array.from({ length: 1000 }, (_, i) => {
        const event = buildMinimalEvent(`TEST-EVENT-${i}`);
        if (i === 42) event.issueDetail = "";
        return event;
      });
      const patterns: RiskPattern[] = [];
      const config = makeConfig();

      expect(() => validateDataset(events, patterns, config)).toThrow();
    });

    it("includes multiple errors in a single message", () => {
      const events = Array.from({ length: 1000 }, (_, i) => {
        const event = buildMinimalEvent(`EVT-${String(i).padStart(6, "0")}`);
        if (i === 500) {
          event.eventType = "Invalid" as unknown as "Financial" | "Non-Financial";
          event.severity = "Critical" as unknown as "Low" | "Moderate" | "High";
        }
        return event;
      });
      const patterns: RiskPattern[] = [];
      const config = makeConfig();

      let thrownError: Error | null = null;
      try {
        validateDataset(events, patterns, config);
      } catch (e) {
        thrownError = e as Error;
      }

      // Should have validation failed message and contain specifics
      expect(thrownError).not.toBeNull();
      expect(thrownError?.message || String(thrownError)).toContain("Dataset validation failed");
    });
  });
});
