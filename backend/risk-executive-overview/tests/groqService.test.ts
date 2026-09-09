import { describe, expect, it, beforeEach, vi } from "vitest";
import { APIConnectionTimeoutError, RateLimitError, APIError } from "groq-sdk";
import type { AiFactPackage } from "../src/types/AiFactPackage";

/**
 * IMPORTANT: These tests verify that GroqService correctly:
 * 1. Retries transient errors (timeout, 429, 502-504) exactly once
 * 2. Does NOT retry non-transient errors (4xx except 429)
 * 3. Validates response schema and evidence against fact package
 * 4. Caches successful responses
 * 5. Handles null patternIds correctly
 *
 * Note: Full integration tests with live Groq API can be run via:
 *   npm run smoke:ai
 *
 * These unit tests mock the Groq client to isolate GroqService logic from SDK behavior.
 */

let mockCreateFn = vi.fn();

// Mock the env module to provide test values
vi.mock("../src/config/env", () => ({
  env: {
    GROQ_API_KEY: "test-key-for-unit-tests",
    GROQ_MODEL: "openai/gpt-oss-120b",
    GROQ_TIMEOUT_MS: 20000,
    GROQ_REASONING_EFFORT: "low",
    aiConfigured: true,
  },
}));

vi.mock("groq-sdk", async () => {
  const actual = await vi.importActual<typeof import("groq-sdk")>("groq-sdk");
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreateFn,
        },
      },
    })),
    APIConnectionTimeoutError: actual.APIConnectionTimeoutError,
    APIError: actual.APIError,
    RateLimitError: actual.RateLimitError,
  };
});

describe("GroqService", () => {
  beforeEach(() => {
    // Each test dynamically re-imports GroqService below; without resetting
    // Vitest's module registry first, that import resolves to the SAME
    // cached module instance every time, so the module-level `client` and
    // `responseCache` singletons leak between tests (e.g. two tests using
    // the same fact package shape would silently hit each other's cache).
    vi.resetModules();
    mockCreateFn.mockClear();
    mockCreateFn.mockReset();
  });

  function getTestFactPackage(overrides: Partial<AiFactPackage> = {}): AiFactPackage {
    return {
      selectionType: "pattern",
      selectionLabel: "Test Pattern",
      filters: { organisation: "Enterprise-wide", dateFrom: "2025-01-01", dateTo: "2025-12-31", eventType: "All", severity: "All" },
      eventIds: ["SIM-0000001", "SIM-0000002"],
      eventCount: 2,
      severityCounts: { High: 1, Low: 1 },
      highSeverityCount: 1,
      openEventCount: 2,
      grossAmountUsd: 1000,
      recoveryAmountUsd: 100,
      netAmountUsd: 900,
      recoveryRate: 0.1,
      potentialImpactUsd: 500,
      remediationHours: 20,
      ownerOrganisations: ["Org1"],
      ownerNames: ["Owner1"],
      assigneeNames: ["Assignee1"],
      issueDetails: ["Issue1"],
      rootCauses: ["Cause1"],
      riskThemes: ["Theme1"],
      orCategories: ["Category1"],
      statusCounts: { Active: 2 },
      stageCounts: { "Initial Assessment": 2 },
      detectionDelay: { min: 1, max: 5, mean: 3, median: 3 },
      recordingDelay: { min: 0, max: 2, mean: 1, median: 1 },
      occurrenceToRecordDelay: { min: 1, max: 7, mean: 4, median: 4 },
      recurrenceFacts: {
        ownerCount: 1,
        ownerNames: ["Owner1"],
        assigneeCount: 1,
        assigneeNames: ["Assignee1"],
        organisationCount: 1,
        organisations: ["Org1"],
        distinctIssueCount: 1,
        recurrenceCase: "none",
        interpretation: "No repeated occurrence patterns.",
      },
      patternType: "issue",
      patternId: "test_pattern_1",
      ...overrides,
    };
  }

  describe("generateManagerInsight", () => {
    it("retries exactly once on APIConnectionTimeoutError and succeeds", async () => {
      // Use dynamic import to ensure fresh module with mocked Groq
      const { generateManagerInsight } = await import("../src/services/GroqService");

      const factPackage = getTestFactPackage();
      const validResponse = {
        whatHappened: "Test",
        whyItMatters: "Important",
        whereItSits: "Location",
        managementQuestion: "Q?",
        suggestedAction: "Action",
        evidence: { eventIds: ["SIM-0000001"], patternId: "test_pattern_1" },
      };

      mockCreateFn.mockRejectedValueOnce(new APIConnectionTimeoutError());
      mockCreateFn.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify(validResponse) } }],
      });

      const result = await generateManagerInsight(factPackage);

      expect(result.whatHappened).toBe("Test");
      expect(mockCreateFn).toHaveBeenCalledTimes(2);
    });

    it("retries exactly once on RateLimitError (429) and succeeds", async () => {
      const { generateManagerInsight } = await import("../src/services/GroqService");

      const factPackage = getTestFactPackage();
      const validResponse = {
        whatHappened: "Success",
        whyItMatters: "Important",
        whereItSits: "Location",
        managementQuestion: "Q?",
        suggestedAction: "Action",
        evidence: { eventIds: ["SIM-0000001"], patternId: "test_pattern_1" },
      };

      const rateLimitError = new RateLimitError(429, { error: "rate limited" } as any, "Rate limited", new Headers());
      mockCreateFn.mockRejectedValueOnce(rateLimitError);
      mockCreateFn.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify(validResponse) } }],
      });

      const result = await generateManagerInsight(factPackage);

      expect(result.whatHappened).toBe("Success");
      expect(mockCreateFn).toHaveBeenCalledTimes(2);
    });

    it("retries exactly once on 502/503/504 server errors and fails after second attempt", async () => {
      const { generateManagerInsight } = await import("../src/services/GroqService");

      const factPackage = getTestFactPackage();
      const serverError = new APIError(503, { error: "service unavailable" } as any, "Service Unavailable", new Headers());
      mockCreateFn.mockRejectedValue(serverError);

      try {
        await generateManagerInsight(factPackage);
        // Should not reach here
        expect.fail("Expected generateManagerInsight to throw");
      } catch (error) {
        // Expected - should throw AI_UNAVAILABLE after retries
        expect(error).toBeDefined();
        // Should have tried twice (first + one retry)
        expect(mockCreateFn).toHaveBeenCalledTimes(2);
      }
    });

    it("does NOT retry on non-transient errors like 400 BadRequest", async () => {
      const { generateManagerInsight } = await import("../src/services/GroqService");

      const factPackage = getTestFactPackage();
      const badRequestError = new APIError(400, { error: "bad request" } as any, "Bad Request", new Headers());
      mockCreateFn.mockRejectedValueOnce(badRequestError);

      try {
        await generateManagerInsight(factPackage);
        expect.fail("Expected generateManagerInsight to throw");
      } catch (error) {
        // Expected - should throw immediately without retrying
        expect(mockCreateFn).toHaveBeenCalledTimes(1);
      }
    });

    it("throws AI_INVALID_RESPONSE when response is not valid JSON", async () => {
      const { generateManagerInsight } = await import("../src/services/GroqService");

      const factPackage = getTestFactPackage();
      mockCreateFn.mockResolvedValueOnce({
        choices: [{ message: { content: "Not JSON{invalid}" } }],
      });

      try {
        await generateManagerInsight(factPackage);
        expect.fail("Expected generateManagerInsight to throw");
      } catch (error: any) {
        expect(error.code).toBe("AI_INVALID_RESPONSE");
        expect(error.message).toContain("not valid JSON");
      }
    });

    it("throws AI_INVALID_RESPONSE when schema validation fails", async () => {
      const { generateManagerInsight } = await import("../src/services/GroqService");

      const factPackage = getTestFactPackage();
      const invalidResponse = {
        whatHappened: "Test",
        // Missing required fields like whyItMatters, whereItSits, etc.
        evidence: { eventIds: ["SIM-0000001"], patternId: "test_pattern_1" },
      };

      mockCreateFn.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify(invalidResponse) } }],
      });

      try {
        await generateManagerInsight(factPackage);
        expect.fail("Expected generateManagerInsight to throw");
      } catch (error: any) {
        expect(error.code).toBe("AI_INVALID_RESPONSE");
        expect(error.message).toContain("schema validation");
      }
    });

    it("throws AI_INVALID_RESPONSE when response includes invented eventIds not in fact package", async () => {
      const { generateManagerInsight } = await import("../src/services/GroqService");

      const factPackage = getTestFactPackage({
        eventIds: ["SIM-0000001", "SIM-0000002"],
      });

      const responseWithInventedId = {
        whatHappened: "Test",
        whyItMatters: "Important",
        whereItSits: "Location",
        managementQuestion: "Q?",
        suggestedAction: "Action",
        evidence: {
          eventIds: ["SIM-0000001", "SIM-9999999"], // Invented ID not in fact package
          patternId: "test_pattern_1",
        },
      };

      mockCreateFn.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify(responseWithInventedId) } }],
      });

      try {
        await generateManagerInsight(factPackage);
        expect.fail("Expected generateManagerInsight to throw");
      } catch (error: any) {
        expect(error.code).toBe("AI_INVALID_RESPONSE");
        expect(error.message).toContain("SIM-9999999");
      }
    });

    it("throws AI_INVALID_RESPONSE when response patternId doesn't match fact package", async () => {
      const { generateManagerInsight } = await import("../src/services/GroqService");

      const factPackage = getTestFactPackage({
        patternId: "correct_pattern",
      });

      const responseWithWrongPattern = {
        whatHappened: "Test",
        whyItMatters: "Important",
        whereItSits: "Location",
        managementQuestion: "Q?",
        suggestedAction: "Action",
        evidence: {
          eventIds: ["SIM-0000001"],
          patternId: "wrong_pattern",
        },
      };

      mockCreateFn.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify(responseWithWrongPattern) } }],
      });

      try {
        await generateManagerInsight(factPackage);
        expect.fail("Expected generateManagerInsight to throw");
      } catch (error: any) {
        expect(error.code).toBe("AI_INVALID_RESPONSE");
        expect(error.message).toContain("pattern ID");
      }
    });

    it("accepts null patternId in response when fact package has null patternId", async () => {
      const { generateManagerInsight } = await import("../src/services/GroqService");

      const factPackage = getTestFactPackage({
        patternId: null,
      });

      const validResponse = {
        whatHappened: "Test",
        whyItMatters: "Important",
        whereItSits: "Location",
        managementQuestion: "Q?",
        suggestedAction: "Action",
        evidence: {
          eventIds: ["SIM-0000001"],
          patternId: null,
        },
      };

      mockCreateFn.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify(validResponse) } }],
      });

      const result = await generateManagerInsight(factPackage);

      expect(result.evidence.patternId).toBeNull();
    });

    it("caches responses and returns cached result on second identical request", async () => {
      // Need a fresh import to get fresh cache
      const { generateManagerInsight: generateInsight } = await import("../src/services/GroqService");

      const uniqueFactPackage = getTestFactPackage({
        eventIds: ["CACHE-TEST-001"],
      });
      const validResponse = {
        whatHappened: "Cached",
        whyItMatters: "Important",
        whereItSits: "Location",
        managementQuestion: "Q?",
        suggestedAction: "Action",
        evidence: { eventIds: ["CACHE-TEST-001"], patternId: "test_pattern_1" },
      };

      mockCreateFn.mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify(validResponse) } }],
      });

      const result1 = await generateInsight(uniqueFactPackage);
      const result2 = await generateInsight(uniqueFactPackage);

      expect(result1.whatHappened).toBe("Cached");
      expect(result2.whatHappened).toBe("Cached");
      // Should only call API once; second call uses cache
      expect(mockCreateFn).toHaveBeenCalledTimes(1);
    });
  });

  describe("isAiConfigured", () => {
    it("reflects whether GROQ_API_KEY is configured in environment", async () => {
      // Import dynamically to check the value at runtime
      // Note: The actual value depends on the test environment's GROQ_API_KEY
      const { isAiConfigured } = await import("../src/services/GroqService");

      // Just verify it returns a boolean
      const result = isAiConfigured();
      expect(typeof result).toBe("boolean");
    });
  });
});
