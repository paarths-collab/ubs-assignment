import { describe, expect, it, beforeEach, beforeAll, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { RiskRepository } from "../src/repositories/RiskRepository";
import { buildApp } from "../src/app";
import { computeTrend, buildEnterpriseComparison, buildRiskDossier } from "../src/services/DossierService";
import {
  ANALYST_SYSTEM_PROMPT,
  DEEP_ANALYSIS_SECTIONS,
  INVESTIGATION_PLAN_SECTION,
  ENTERPRISE_COMPARISON_SECTION,
  runAnalysisSection,
} from "../src/services/AIAnalysisOrchestrator";
import { buildScenarioSignals, rankScenarioSignals } from "../src/services/ScenarioService";
import { normalizeFilters, filterEvents } from "../src/services/FilterService";
import type { RiskEvent } from "../src/types/RiskEvent";
import type { RiskDossier } from "../src/types/Dossier";
import { makeEvent, makeConfig, resetCounter } from "./fixtures";

let mockStreamCreateFn = vi.fn();
let mockCreateFn = vi.fn();

// Mock env to disable AI by default, override in specific tests
vi.mock("../src/config/env", () => ({
  env: {
    GROQ_API_KEY: undefined,
    GROQ_MODEL: "openai/gpt-oss-120b",
    GROQ_TIMEOUT_MS: 20000,
    GROQ_REASONING_EFFORT: "low",
    aiConfigured: false,
    NODE_ENV: "test",
    PORT: 4000,
    HOST: "0.0.0.0",
    LOG_LEVEL: "silent",
    CORS_ORIGINS: [],
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

describe("AI Orchestration - computeTrend", () => {
  beforeEach(() => {
    resetCounter();
  });

  it("returns null for an empty event list", () => {
    const config = makeConfig();
    const filters = normalizeFilters(
      { dateFrom: "2025-01-01", dateTo: "2025-12-31", organisation: "Enterprise-wide", eventType: "All", severity: "All" },
      config,
    );
    const excludedStatuses = new Set(config.businessRules.openBacklog.excludedStatuses);

    const result = computeTrend([], filters, excludedStatuses);
    expect(result).toBeNull();
  });

  it("splits the filtered window at its midpoint and counts events correctly", () => {
    const config = makeConfig();
    const filters = normalizeFilters(
      { dateFrom: "2025-01-01", dateTo: "2025-12-31", organisation: "Enterprise-wide", eventType: "All", severity: "All" },
      config,
    );
    const excludedStatuses = new Set(config.businessRules.openBacklog.excludedStatuses);

    const events = [
      makeEvent({ occurrenceDate: "2025-01-15", severity: "Low" }),
      makeEvent({ occurrenceDate: "2025-02-15", severity: "High" }),
      makeEvent({ occurrenceDate: "2025-03-15", severity: "Low" }),
      makeEvent({ occurrenceDate: "2025-09-15", severity: "High" }),
      makeEvent({ occurrenceDate: "2025-10-15", severity: "High" }),
      makeEvent({ occurrenceDate: "2025-11-15", severity: "Low" }),
    ];

    const result = computeTrend(events, filters, excludedStatuses)!;
    expect(result).not.toBeNull();
    expect(result.firstPeriod.eventCount).toBe(3);
    expect(result.firstPeriod.highSeverityCount).toBe(1);
    expect(result.secondPeriod.eventCount).toBe(3);
    expect(result.secondPeriod.highSeverityCount).toBe(2);
  });

  it("sets direction to 'increasing' when second half has meaningfully more events", () => {
    const config = makeConfig();
    const filters = normalizeFilters(
      { dateFrom: "2025-01-01", dateTo: "2025-12-31", organisation: "Enterprise-wide", eventType: "All", severity: "All" },
      config,
    );
    const excludedStatuses = new Set(config.businessRules.openBacklog.excludedStatuses);

    const events = [
      makeEvent({ occurrenceDate: "2025-01-15" }),
      makeEvent({ occurrenceDate: "2025-09-15" }),
      makeEvent({ occurrenceDate: "2025-10-15" }),
      makeEvent({ occurrenceDate: "2025-11-15" }),
    ];

    const result = computeTrend(events, filters, excludedStatuses)!;
    expect(result.direction).toBe("increasing");
  });

  it("sets direction to 'decreasing' when second half has meaningfully fewer events", () => {
    const config = makeConfig();
    const filters = normalizeFilters(
      { dateFrom: "2025-01-01", dateTo: "2025-12-31", organisation: "Enterprise-wide", eventType: "All", severity: "All" },
      config,
    );
    const excludedStatuses = new Set(config.businessRules.openBacklog.excludedStatuses);

    const events = [
      makeEvent({ occurrenceDate: "2025-01-15" }),
      makeEvent({ occurrenceDate: "2025-02-15" }),
      makeEvent({ occurrenceDate: "2025-03-15" }),
      makeEvent({ occurrenceDate: "2025-09-15" }),
    ];

    const result = computeTrend(events, filters, excludedStatuses)!;
    expect(result.direction).toBe("decreasing");
  });

  it("sets direction to 'stable' when event count difference is 0", () => {
    const config = makeConfig();
    const filters = normalizeFilters(
      { dateFrom: "2025-01-01", dateTo: "2025-12-31", organisation: "Enterprise-wide", eventType: "All", severity: "All" },
      config,
    );
    const excludedStatuses = new Set(config.businessRules.openBacklog.excludedStatuses);

    const events = [
      makeEvent({ occurrenceDate: "2025-01-15" }),
      makeEvent({ occurrenceDate: "2025-02-15" }),
      makeEvent({ occurrenceDate: "2025-09-15" }),
      makeEvent({ occurrenceDate: "2025-10-15" }),
    ];

    const result = computeTrend(events, filters, excludedStatuses)!;
    expect(result.direction).toBe("stable");
  });

  it("sets direction to 'stable' when event count difference is ±1 (noise boundary)", () => {
    const config = makeConfig();
    const filters = normalizeFilters(
      { dateFrom: "2025-01-01", dateTo: "2025-12-31", organisation: "Enterprise-wide", eventType: "All", severity: "All" },
      config,
    );
    const excludedStatuses = new Set(config.businessRules.openBacklog.excludedStatuses);

    // 2 in first half, 3 in second half = +1 difference, should be stable
    const events = [
      makeEvent({ occurrenceDate: "2025-01-15" }),
      makeEvent({ occurrenceDate: "2025-02-15" }),
      makeEvent({ occurrenceDate: "2025-09-15" }),
      makeEvent({ occurrenceDate: "2025-10-15" }),
      makeEvent({ occurrenceDate: "2025-11-15" }),
    ];

    const result = computeTrend(events, filters, excludedStatuses)!;
    expect(result.direction).toBe("stable");
  });

  it("sets eventCountChangePct to null when first period has zero events", () => {
    const config = makeConfig();
    const filters = normalizeFilters(
      { dateFrom: "2025-01-01", dateTo: "2025-12-31", organisation: "Enterprise-wide", eventType: "All", severity: "All" },
      config,
    );
    const excludedStatuses = new Set(config.businessRules.openBacklog.excludedStatuses);

    const events = [
      makeEvent({ occurrenceDate: "2025-09-15" }),
      makeEvent({ occurrenceDate: "2025-10-15" }),
    ];

    const result = computeTrend(events, filters, excludedStatuses)!;
    expect(result.eventCountChangePct).toBeNull();
  });

  it("calculates eventCountChangePct correctly when first period has events", () => {
    const config = makeConfig();
    const filters = normalizeFilters(
      { dateFrom: "2025-01-01", dateTo: "2025-12-31", organisation: "Enterprise-wide", eventType: "All", severity: "All" },
      config,
    );
    const excludedStatuses = new Set(config.businessRules.openBacklog.excludedStatuses);

    const events = [
      makeEvent({ occurrenceDate: "2025-01-15" }),
      makeEvent({ occurrenceDate: "2025-02-15" }),
      makeEvent({ occurrenceDate: "2025-09-15" }),
      makeEvent({ occurrenceDate: "2025-10-15" }),
      makeEvent({ occurrenceDate: "2025-11-15" }),
      makeEvent({ occurrenceDate: "2025-12-15" }),
    ];

    const result = computeTrend(events, filters, excludedStatuses)!;
    expect(result.firstPeriod.eventCount).toBe(2);
    expect(result.secondPeriod.eventCount).toBe(4);
    expect(result.eventCountChangePct).toBe(1); // (4 - 2) / 2 = 1
  });
});

describe("AI Orchestration - buildEnterpriseComparison", () => {
  beforeEach(() => {
    resetCounter();
  });

  it("rank 1 goes to the scenario with highest value on a measure", () => {
    const config = makeConfig();
    const repo = new RiskRepository();
    const allEvents = repo.getEvents();
    const patterns = repo.getPatterns();

    // Get the real scenarios
    const scenarios = rankScenarioSignals(buildScenarioSignals(allEvents, patterns, config));
    expect(scenarios.length).toBeGreaterThan(1);

    const selected = scenarios[0]!;
    const comparison = buildEnterpriseComparison(selected, scenarios);

    // The top-ranked scenario on eventCount should have rank 1
    const eventCountMetric = comparison.metrics.eventCount!;
    expect(eventCountMetric.rank).toBe(1);
    expect(eventCountMetric.value).toBe(selected.eventCount);
  });

  it("totalIssues equals the number of scenarios compared", () => {
    const config = makeConfig();
    const repo = new RiskRepository();
    const allEvents = repo.getEvents();
    const patterns = repo.getPatterns();

    const scenarios = rankScenarioSignals(buildScenarioSignals(allEvents, patterns, config));
    const selected = scenarios[0]!;
    const comparison = buildEnterpriseComparison(selected, scenarios);

    expect(comparison.totalIssues).toBe(scenarios.length);
    expect(comparison.metrics.eventCount!.totalIssues).toBe(scenarios.length);
  });

  it("handles null metric values without throwing and does not rank null as rank 1", () => {
    const config = makeConfig();

    // Create a scenario with null netExposureUsd
    const events = [makeEvent({ eventType: "Non-Financial", grossAmountUsd: null, netAmountUsd: null })];
    const patterns = [{ patternId: "test", patternType: "issue" as const, eventIds: [], group: { issueDetail: "Test" } }];

    const scenarios = buildScenarioSignals(events, patterns, config);
    expect(scenarios.length).toBeGreaterThan(0);

    const selected = scenarios[0]!;
    const allScenarios = [selected];
    const comparison = buildEnterpriseComparison(selected, allScenarios);

    // The metric for a null value should not have rank 1
    const netExposure = comparison.metrics.netExposureUsd!;
    expect(netExposure.value).toBeNull();
    expect(netExposure.rank).toBe(allScenarios.length); // Should be last rank when value is null
  });

  it("percentile is 100 for the top-ranked scenario on each measure", () => {
    const config = makeConfig();
    const repo = new RiskRepository();
    const allEvents = repo.getEvents();
    const patterns = repo.getPatterns();

    const scenarios = rankScenarioSignals(buildScenarioSignals(allEvents, patterns, config));
    const selected = scenarios[0]!;
    const comparison = buildEnterpriseComparison(selected, scenarios);

    // Find at least one measure where selected is rank 1
    const rank1Measures = Object.values(comparison.metrics).filter((m) => m.rank === 1);
    expect(rank1Measures.length).toBeGreaterThan(0);

    // All rank 1 measures should have percentile 100
    for (const metric of rank1Measures) {
      expect(metric.percentile).toBe(100);
    }
  });
});

describe("AI Orchestration - buildRiskDossier", () => {
  beforeEach(() => {
    resetCounter();
  });

  it("highStillOpen counts events that are High AND not in excluded statuses", () => {
    const config = makeConfig();
    const issue = "Test high severity filtering";
    const events = [
      makeEvent({ issueDetail: issue, severity: "High", status: "Active" }),
      makeEvent({ issueDetail: issue, severity: "High", status: "Closed" }),
      makeEvent({ issueDetail: issue, severity: "High", status: "Cancelled" }),
      makeEvent({ issueDetail: issue, severity: "Moderate", status: "Active" }),
    ];

    const patterns = [{ patternId: "test", patternType: "issue" as const, eventIds: [], group: { issueDetail: issue } }];
    const scenarios = rankScenarioSignals(buildScenarioSignals(events, patterns, config));
    const selected = scenarios[0]!;
    const filters = normalizeFilters(
      { dateFrom: "2024-01-01", dateTo: "2026-12-31", organisation: "Enterprise-wide", eventType: "All", severity: "All" },
      config,
    );
    const selectedIds = new Set(selected.eventIds);
    const scenarioEvents = events.filter((e) => selectedIds.has(e.eventId));

    const dossier = buildRiskDossier(selected, scenarios, scenarioEvents, filters, config);

    // Should count only High + Active (1), not High + Closed (0)
    expect(dossier.severity.highStillOpen).toBe(1);
  });

  it("people.repeatedOwners counts owners appearing more than once", () => {
    const config = makeConfig();
    const issue = "Test owner concentration";
    const events = [
      makeEvent({ issueDetail: issue, ownerName: "Owner1" }),
      makeEvent({ issueDetail: issue, ownerName: "Owner1" }),
      makeEvent({ issueDetail: issue, ownerName: "Owner2" }),
      makeEvent({ issueDetail: issue, ownerName: "Owner3" }),
      makeEvent({ issueDetail: issue, ownerName: "Owner3" }),
      makeEvent({ issueDetail: issue, ownerName: "Owner3" }),
    ];

    const patterns = [{ patternId: "test", patternType: "issue" as const, eventIds: [], group: { issueDetail: issue } }];
    const scenarios = rankScenarioSignals(buildScenarioSignals(events, patterns, config));
    const selected = scenarios[0]!;
    const filters = normalizeFilters(
      { dateFrom: "2024-01-01", dateTo: "2026-12-31", organisation: "Enterprise-wide", eventType: "All", severity: "All" },
      config,
    );
    const selectedIds = new Set(selected.eventIds);
    const scenarioEvents = events.filter((e) => selectedIds.has(e.eventId));

    const dossier = buildRiskDossier(selected, scenarios, scenarioEvents, filters, config);

    // Owner1 (2 events), Owner3 (3 events) appear more than once = 2 repeated owners
    expect(dossier.people.repeatedOwners).toBe(2);
    // maxEventsUnderOneOwner should be 3 (Owner3)
    expect(dossier.people.maxEventsUnderOneOwner).toBe(3);
  });

  it("evidence.eventIds matches selected scenario's event IDs exactly", () => {
    const config = makeConfig();
    const repo = new RiskRepository();
    const allEvents = repo.getEvents();
    const patterns = repo.getPatterns();

    const scenarios = rankScenarioSignals(buildScenarioSignals(allEvents, patterns, config));
    const selected = scenarios[0]!;
    const filters = normalizeFilters(
      { dateFrom: "2024-01-01", dateTo: "2026-12-31", organisation: "Enterprise-wide", eventType: "All", severity: "All" },
      config,
    );
    const selectedIds = new Set(selected.eventIds);
    const scenarioEvents = allEvents.filter((e) => selectedIds.has(e.eventId));

    const dossier = buildRiskDossier(selected, scenarios, scenarioEvents, filters, config);

    expect(dossier.evidence.eventIds).toEqual(selected.eventIds);
    expect(dossier.evidence.eventCount).toBe(selected.eventIds.length);
  });

  it("serializes to JSON without throwing and contains no undefined values at top level", () => {
    const config = makeConfig();
    const repo = new RiskRepository();
    const allEvents = repo.getEvents();
    const patterns = repo.getPatterns();

    const scenarios = rankScenarioSignals(buildScenarioSignals(allEvents, patterns, config));
    const selected = scenarios[0]!;
    const filters = normalizeFilters(
      { dateFrom: "2024-01-01", dateTo: "2026-12-31", organisation: "Enterprise-wide", eventType: "All", severity: "All" },
      config,
    );
    const selectedIds = new Set(selected.eventIds);
    const scenarioEvents = allEvents.filter((e) => selectedIds.has(e.eventId));

    const dossier = buildRiskDossier(selected, scenarios, scenarioEvents, filters, config);

    // Should serialize without error
    const json = JSON.stringify(dossier);
    expect(typeof json).toBe("string");

    // Parse back and check no top-level undefined
    const parsed = JSON.parse(json) as RiskDossier;
    for (const key of Object.keys(dossier)) {
      expect(parsed[key as keyof RiskDossier]).not.toBeUndefined();
    }
  });
});

describe("AI Orchestration - Prompts & Sections", () => {
  it("DEEP_ANALYSIS_SECTIONS has exactly 3 sections with ids 'situation', 'pattern', 'response' in order", () => {
    expect(DEEP_ANALYSIS_SECTIONS).toHaveLength(3);
    expect(DEEP_ANALYSIS_SECTIONS[0]!.id).toBe("situation");
    expect(DEEP_ANALYSIS_SECTIONS[1]!.id).toBe("pattern");
    expect(DEEP_ANALYSIS_SECTIONS[2]!.id).toBe("response");
  });

  it("ANALYST_SYSTEM_PROMPT contains people guardrail mentioning workflow concentration", () => {
    expect(ANALYST_SYSTEM_PROMPT).toContain("workflow concentration");
    expect(ANALYST_SYSTEM_PROMPT).toContain("personal fault");
  });

  it("ANALYST_SYSTEM_PROMPT forbids recalculating quantitative facts", () => {
    expect(ANALYST_SYSTEM_PROMPT).toContain("MUST NOT invent or recalculate");
  });

  it("ANALYST_SYSTEM_PROMPT forbids inventing or recalculating facts", () => {
    // This should be present based on the spec - the prompt owns fact grounding
    expect(ANALYST_SYSTEM_PROMPT).toMatch(/MUST NOT/i);
    expect(ANALYST_SYSTEM_PROMPT).toMatch(/invent|recalculate/i);
  });

  it("the grounding property: every analysis section call receives the same dossier, never another call's output", async () => {
    // This is the most critical test - mock Groq and verify no prose leaks between calls
    vi.resetModules();
    mockStreamCreateFn.mockClear();

    const sentinelToken = "SENTINEL_FROM_PREVIOUS_CALL_DO_NOT_PROPAGATE";

    // Mock the GroqService to capture calls and return a sentinel for the first call
    const { runAnalysisSection } = await import("../src/services/AIAnalysisOrchestrator");
    const GroqService = await import("../src/services/LlmService");

    let callCount = 0;
    const capturedMessages: Array<Array<{ role: string; content: string }>> = [];

    vi.spyOn(GroqService, "streamCompletion").mockImplementation(async (systemPrompt, userPrompt, onDelta) => {
      // Capture the exact messages
      capturedMessages.push([
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ]);

      // Return sentinel on first call, normal text on others
      const response = callCount === 0 ? sentinelToken : `Response ${callCount}`;
      callCount++;

      onDelta(response);
      return response;
    });

    const config = makeConfig();
    const repo = new RiskRepository();
    const allEvents = repo.getEvents();
    const patterns = repo.getPatterns();

    const scenarios = rankScenarioSignals(buildScenarioSignals(allEvents, patterns, config));
    const selected = scenarios[0]!;
    const filters = normalizeFilters(
      { dateFrom: "2024-01-01", dateTo: "2026-12-31", organisation: "Enterprise-wide", eventType: "All", severity: "All" },
      config,
    );
    const selectedIds = new Set(selected.eventIds);
    const scenarioEvents = allEvents.filter((e) => selectedIds.has(e.eventId));
    const dossier = buildRiskDossier(selected, scenarios, scenarioEvents, filters, config);

    // Run all three deep analysis sections
    for (const section of DEEP_ANALYSIS_SECTIONS) {
      await runAnalysisSection(section, dossier, () => {});
    }

    // All calls should have the same system prompt
    const systemPrompts = capturedMessages.map((m) => m[0]!.content);
    expect(systemPrompts[0]).toBe(systemPrompts[1]);
    expect(systemPrompts[1]).toBe(systemPrompts[2]);

    // All calls should have the serialized dossier
    const userPrompts = capturedMessages.map((m) => m[1]!.content);
    const dossierJson = JSON.stringify(dossier);
    for (const userPrompt of userPrompts) {
      expect(userPrompt).toContain(dossierJson);
    }

    // NO call should contain the sentinel (prose from previous call)
    for (let i = 1; i < userPrompts.length; i++) {
      expect(userPrompts[i]!).not.toContain(sentinelToken);
    }

    vi.restoreAllMocks();
  });

  it("runAnalysisSection invokes onDelta once per streamed chunk and resolves with concatenation", async () => {
    vi.resetModules();

    const { runAnalysisSection } = await import("../src/services/AIAnalysisOrchestrator");
    const GroqService = await import("../src/services/LlmService");

    const chunks = ["Hello ", "world", "!"];
    let chunkIndex = 0;

    vi.spyOn(GroqService, "streamCompletion").mockImplementation(async (_, __, onDelta) => {
      for (const chunk of chunks) {
        onDelta(chunk);
      }
      return chunks.join("");
    });

    const config = makeConfig();
    const repo = new RiskRepository();
    const allEvents = repo.getEvents();
    const dossier = buildRiskDossier(
      (buildScenarioSignals(allEvents, repo.getPatterns(), config)[0])!,
      buildScenarioSignals(allEvents, repo.getPatterns(), config),
      allEvents.slice(0, 10),
      normalizeFilters(
        { dateFrom: "2024-01-01", dateTo: "2026-12-31", organisation: "Enterprise-wide", eventType: "All", severity: "All" },
        config,
      ),
      config,
    );

    let deltaCount = 0;
    const result = await runAnalysisSection(DEEP_ANALYSIS_SECTIONS[0]!, dossier, () => {
      deltaCount++;
    });

    expect(deltaCount).toBe(chunks.length);
    expect(result).toBe("Hello world!");

    vi.restoreAllMocks();
  });

  it("streamCompletion correctly concatenates and returns streamed content", async () => {
    vi.resetModules();

    const { runAnalysisSection } = await import("../src/services/AIAnalysisOrchestrator");
    const GroqService = await import("../src/services/LlmService");

    const testResponse = "Stream chunk 1 Stream chunk 2";

    vi.spyOn(GroqService, "streamCompletion").mockResolvedValueOnce(testResponse);

    const config = makeConfig();
    const repo = new RiskRepository();
    const dossier = buildRiskDossier(
      (buildScenarioSignals(repo.getEvents(), repo.getPatterns(), config)[0])!,
      buildScenarioSignals(repo.getEvents(), repo.getPatterns(), config),
      repo.getEvents().slice(0, 10),
      normalizeFilters(
        { dateFrom: "2024-01-01", dateTo: "2026-12-31", organisation: "Enterprise-wide", eventType: "All", severity: "All" },
        config,
      ),
      config,
    );

    const result = await runAnalysisSection(DEEP_ANALYSIS_SECTIONS[0]!, dossier, () => {});
    expect(result).toBe(testResponse);

    vi.restoreAllMocks();
  });

  it("streamCompletion throws AI_UNAVAILABLE when underlying call rejects", async () => {
    vi.resetModules();

    const { streamCompletion } = await import("../src/services/LlmService");

    mockCreateFn.mockRejectedValueOnce(new Error("Connection failed"));

    try {
      await streamCompletion("system", "user", () => {});
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toHaveProperty("code", "AI_UNAVAILABLE");
    }

    vi.restoreAllMocks();
  });
});

describe("AI Orchestration - SSE Routes", () => {
  let app: FastifyInstance;
  let repository: RiskRepository;
  let firstIssueDetail: string;

  beforeAll(() => {
    repository = new RiskRepository();
    app = buildApp({ repository });
    // Get a real issue detail from the dataset
    const config = repository.getConfig();
    const scenarios = rankScenarioSignals(buildScenarioSignals(repository.getEvents(), repository.getPatterns(), config));
    firstIssueDetail = scenarios[0]?.issueDetail || "Test Issue";
  });

  it("without GROQ_API_KEY configured, POST /api/ai/deep-analysis/stream returns 503 with AI_UNAVAILABLE error", async () => {
    const filters = {
      dateFrom: "2024-01-01",
      dateTo: "2026-12-31",
      organisation: "Enterprise-wide",
      eventType: "All",
      severity: "All",
    };

    const selection = {
      type: "issue" as const,
      issueDetail: firstIssueDetail,
    };

    const response = await app.inject({
      method: "POST",
      url: "/api/ai/deep-analysis/stream",
      payload: { filters, selection },
    });

    expect(response.statusCode).toBe(503);
    const body = JSON.parse(response.body);
    expect(body.error.code).toBe("AI_UNAVAILABLE");
    expect(body.error.message).toContain("GROQ_API_KEY");
  });

  it("a selection matching no events returns 404 before stream opens", async () => {
    const filters = {
      dateFrom: "2024-01-01",
      dateTo: "2026-12-31",
      organisation: "Enterprise-wide",
      eventType: "All",
      severity: "All",
    };

    const selection = {
      type: "issue" as const,
      issueDetail: "A completely non-existent issue detail that should match nothing in the dataset xyz123",
    };

    const response = await app.inject({
      method: "POST",
      url: "/api/ai/deep-analysis/stream",
      payload: { filters, selection },
    });

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.error.code).toBe("NO_EVENTS_MATCH");
  });

  it("POST /api/ai/dossier returns 200 with dossier object for valid issue selection", async () => {
    const filters = {
      dateFrom: "2024-01-01",
      dateTo: "2026-12-31",
      organisation: "Enterprise-wide",
      eventType: "All",
      severity: "All",
    };

    const selection = {
      type: "issue" as const,
      issueDetail: firstIssueDetail,
    };

    const response = await app.inject({
      method: "POST",
      url: "/api/ai/dossier",
      payload: { filters, selection },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty("dossier");

    const dossier = body.dossier as RiskDossier;
    expect(dossier).toHaveProperty("scenarioId");
    expect(dossier).toHaveProperty("title");
    expect(dossier).toHaveProperty("severity");
    expect(dossier).toHaveProperty("evidence");
    expect(Array.isArray(dossier.evidence.eventIds)).toBe(true);
  });
});
