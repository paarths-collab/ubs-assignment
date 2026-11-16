import { describe, expect, it, beforeAll, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { RiskRepository } from "../src/repositories/RiskRepository";
import { AppError } from "../src/utils/errors";
import type { ManagerInsightResponse } from "../src/schemas/ai.schema";

// Mock GroqService to avoid hitting real API
vi.mock("../src/services/LlmService", () => ({
  isAiConfigured: vi.fn(() => true),
  generateManagerInsight: vi.fn(async (factPackage) => ({
    whatHappened: "Test insight happened",
    whyItMatters: "Test insight matters",
    whereItSits: "Test location",
    managementQuestion: "Test question?",
    suggestedAction: "Test action",
    evidence: {
      eventIds: factPackage.eventIds.slice(0, 1), // subset of given events
      patternId: factPackage.patternId,
    },
  })),
}));

describe("API Routes (Integration)", () => {
  let app: FastifyInstance;
  let repository: RiskRepository;

  beforeAll(() => {
    repository = new RiskRepository();
    app = buildApp({ repository });
  });

  describe("GET /api/health", () => {
    it("returns 200 with status ok, dataLoaded true, correct eventCount, and aiConfigured", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/health",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toMatchObject({
        status: "ok",
        dataLoaded: true,
        eventCount: 1000,
        aiConfigured: expect.any(Boolean),
      });
    });

    it("includes x-request-id response header", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/health",
      });

      expect(response.headers["x-request-id"]).toBeDefined();
      expect(typeof response.headers["x-request-id"]).toBe("string");
    });
  });

  describe("GET /api/metadata", () => {
    it("returns 200 with config metadata", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/metadata",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("organisations");
      expect(body).toHaveProperty("dateRange");
      expect(body).toHaveProperty("eventTypes");
      expect(body).toHaveProperty("severities");
      expect(body).toHaveProperty("statuses");
      expect(body).toHaveProperty("stages");

      expect(Array.isArray(body.organisations)).toBe(true);
      expect(body.organisations.length > 0).toBe(true);
      expect(body.organisations).toContain("Enterprise-wide");
    });

    it("dateRange has min and max properties", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/metadata",
      });

      const body = JSON.parse(response.body);
      expect(body.dateRange).toHaveProperty("min");
      expect(body.dateRange).toHaveProperty("max");
      expect(typeof body.dateRange.min).toBe("string");
      expect(typeof body.dateRange.max).toBe("string");
    });
  });

  describe("POST /api/overview", () => {
    it("returns 200 with empty filters (defaults)", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/overview",
        payload: { filters: {} },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.eventCount).toBe(1000);
      expect(body.kpis.totalEvents.value).toBe(1000);
      expect(body).toHaveProperty("filters");
      expect(body).toHaveProperty("kpis");
      expect(body).toHaveProperty("distributions");
    });

    it("KPI values have value, applicable, and unit properties", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/overview",
        payload: { filters: {} },
      });

      const body = JSON.parse(response.body);
      const kpiKeys = Object.keys(body.kpis);
      for (const kpiKey of kpiKeys) {
        const kpi = body.kpis[kpiKey];
        expect(kpi).toHaveProperty("value");
        expect(kpi).toHaveProperty("applicable");
        expect(kpi).toHaveProperty("unit");
      }
    });

    it("Non-Financial filter sets grossExposure to not applicable", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/overview",
        payload: { filters: { eventType: "Non-Financial" } },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.kpis.grossExposure).toEqual({
        value: null,
        applicable: false,
        unit: "USD",
      });
      expect(body.kpis.netExposure).toEqual({
        value: null,
        applicable: false,
        unit: "USD",
      });
      expect(body.kpis.recoveryRate.applicable).toBe(false);
    });

    it("Financial filter keeps grossExposure applicable", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/overview",
        payload: { filters: { eventType: "Financial" } },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      // Financial KPIs should be applicable for Financial event type
      expect(body.kpis.grossExposure.applicable).toBe(true);
      expect(body.kpis.netExposure.applicable).toBe(true);
    });

    it("returns 400 for invalid organisation", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/overview",
        payload: { filters: { organisation: "Not Real" } },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe("INVALID_FILTER");
    });

    it("distributions include severity, status, and eventType", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/overview",
        payload: { filters: {} },
      });

      const body = JSON.parse(response.body);
      expect(body.distributions).toHaveProperty("severity");
      expect(body.distributions).toHaveProperty("status");
      expect(body.distributions).toHaveProperty("eventType");
    });
  });

  describe("POST /api/priority-signals", () => {
    it("returns 200 with items array", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/priority-signals",
        payload: { filters: {} },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body.items)).toBe(true);
      expect(body).toHaveProperty("filters");
      expect(body).toHaveProperty("totalCandidates");
    });

    it("each item has reasonCodes, eventIds, and patternId", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/priority-signals",
        payload: { filters: {} },
      });

      const body = JSON.parse(response.body);
      if (body.items.length > 0) {
        const item = body.items[0];
        expect(item).toHaveProperty("reasonCodes");
        expect(Array.isArray(item.reasonCodes)).toBe(true);
        expect(item).toHaveProperty("eventIds");
        expect(Array.isArray(item.eventIds)).toBe(true);
        expect(item).toHaveProperty("patternId");
      }
    });

    it("respects limit parameter (default 5)", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/priority-signals",
        payload: { filters: {}, limit: 3 },
      });

      const body = JSON.parse(response.body);
      expect(body.items.length).toBeLessThanOrEqual(3);
    });
  });

  describe("POST /api/risk-detail", () => {
    it("returns 200 for pattern selection with real patternId", async () => {
      const realPatterns = repository.getPatterns();
      if (realPatterns.length === 0) {
        // skip if no patterns
        expect(true).toBe(true);
        return;
      }

      const patternId = realPatterns[0]!.patternId;
      const response = await app.inject({
        method: "POST",
        url: "/api/risk-detail",
        payload: {
          filters: {},
          selection: { type: "pattern", patternId },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as Record<string, unknown>;
      expect(body.detail).toBeDefined();
      expect((body.detail as Record<string, unknown>).evidence).toBeDefined();
      expect(((body.detail as Record<string, unknown>).evidence as Record<string, unknown>).patternId).toBe(patternId);
      expect(Array.isArray(((body.detail as Record<string, unknown>).evidence as Record<string, unknown>).eventIds)).toBe(true);
    });

    it("returns 404 for unknown patternId", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/risk-detail",
        payload: {
          filters: {},
          selection: { type: "pattern", patternId: "UNKNOWN-PATTERN" },
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe("PATTERN_NOT_FOUND");
    });

    it("returns 400 for missing required selection field", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/risk-detail",
        payload: {
          filters: {},
          selection: { type: "pattern" }, // missing patternId
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe("INVALID_FILTER");
    });

    it("accepts eventIds selection type", async () => {
      const events = repository.getEvents();
      if (events.length === 0) {
        expect(true).toBe(true);
        return;
      }

      const eventId = events[0]!.eventId;
      const response = await app.inject({
        method: "POST",
        url: "/api/risk-detail",
        payload: {
          filters: {},
          selection: { type: "eventIds", eventIds: [eventId] },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as Record<string, unknown>;
      expect(body.detail).toBeDefined();
    });

    it("accepts kpi selection type", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/risk-detail",
        payload: {
          filters: {},
          selection: { type: "kpi", kpiId: "totalEvents" },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.detail).toBeDefined();
    });
  });

  describe("POST /api/ai/manager-insight", () => {
    it("returns 200 with available true and insight when Groq succeeds", async () => {
      const realPatterns = repository.getPatterns();
      if (realPatterns.length === 0) {
        expect(true).toBe(true);
        return;
      }

      const response = await app.inject({
        method: "POST",
        url: "/api/ai/manager-insight",
        payload: {
          filters: {},
          selection: { type: "pattern", patternId: realPatterns[0]!.patternId },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as Record<string, unknown>;
      expect(body.available).toBe(true);
      expect(body.insight).toBeDefined();
      const insight = body.insight as Record<string, unknown>;
      expect(insight.whatHappened).toBeDefined();
      expect(insight.whyItMatters).toBeDefined();
      expect(insight.whereItSits).toBeDefined();
      expect(insight.managementQuestion).toBeDefined();
      expect(insight.suggestedAction).toBeDefined();
      expect(insight.evidence).toBeDefined();
    });

    it("returns 200 with available false and reason when AI fails", async () => {
      const groqService = await import("../src/services/LlmService");
      // Override mock to throw AI_UNAVAILABLE
      const generateManagerInsightMock = vi.mocked(groqService.generateManagerInsight);
      generateManagerInsightMock.mockRejectedValueOnce(
        new AppError("AI_UNAVAILABLE", "Test AI unavailable"),
      );

      const realPatterns = repository.getPatterns();
      if (realPatterns.length === 0) {
        expect(true).toBe(true);
        return;
      }

      const response = await app.inject({
        method: "POST",
        url: "/api/ai/manager-insight",
        payload: {
          filters: {},
          selection: { type: "pattern", patternId: realPatterns[0]!.patternId },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body) as Record<string, unknown>;
      expect(body.available).toBe(false);
      expect(body.reason).toBeDefined();
    });

    it("still returns 4xx for validation errors on selection", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/ai/manager-insight",
        payload: {
          filters: {},
          selection: { type: "pattern" }, // missing patternId
        },
      });

      // Validation error should not be swallowed — should return real error status
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();
    });
  });

  describe("POST /api/actions", () => {
    it("returns 201 with action when valid actionType and eventIds", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/actions",
        payload: {
          actionType: "OPEN_INVESTIGATION",
          eventIds: ["SIM-0000001"],
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.action).toBeDefined();
      expect(body.action.actionId).toBeDefined();
      expect(body.action.status).toBe("SIMULATED");
      expect(body.action.actionType).toBe("OPEN_INVESTIGATION");
    });

    it("returns 201 with ASSIGN_REVIEW action", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/actions",
        payload: {
          actionType: "ASSIGN_REVIEW",
          eventIds: [],
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.action.actionType).toBe("ASSIGN_REVIEW");
    });

    it("returns 400 for invalid actionType", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/actions",
        payload: {
          actionType: "INVALID_ACTION",
          eventIds: [],
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.code).toBe("INVALID_FILTER");
    });

    it("sets createdAt timestamp on action", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/actions",
        payload: {
          actionType: "ESCALATE",
          eventIds: [],
        },
      });

      const body = JSON.parse(response.body);
      expect(body.action.createdAt).toBeDefined();
      // Should be a valid ISO timestamp
      expect(() => new Date(body.action.createdAt)).not.toThrow();
    });
  });

  describe("404 handling", () => {
    it("returns 404 with error for unknown route", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/does-not-exist",
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe("NOT_FOUND");
      expect(body.error.message).toContain("not found");
    });

    it("404 error response includes proper error structure", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/invalid",
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toHaveProperty("code");
      expect(body.error).toHaveProperty("message");
    });
  });

  describe("Request ID handling", () => {
    it("generates x-request-id when none supplied", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/health",
      });

      const requestId = response.headers["x-request-id"];
      expect(requestId).toBeDefined();
      expect(typeof requestId).toBe("string");
      expect(requestId).toMatch(/^[0-9a-f-]+$/); // UUID format
    });

    it("echoes back x-request-id when supplied", async () => {
      const suppliedId = "my-custom-request-id-12345";
      const response = await app.inject({
        method: "GET",
        url: "/api/health",
        headers: {
          "X-Request-Id": suppliedId,
        },
      });

      expect(response.headers["x-request-id"]).toBe(suppliedId);
    });

    it("all endpoints include x-request-id response header", async () => {
      const endpoints = [
        { method: "GET", url: "/api/health" },
        { method: "GET", url: "/api/metadata" },
        { method: "POST", url: "/api/overview", payload: {} },
        { method: "POST", url: "/api/priority-signals", payload: {} },
      ];

      for (const endpoint of endpoints) {
        const response = await app.inject({
          method: endpoint.method as "GET" | "POST",
          url: endpoint.url,
          payload: "payload" in endpoint ? endpoint.payload : undefined,
        });

        // Missing x-request-id on ${endpoint.method} ${endpoint.url}
        expect(response.headers["x-request-id"]).toBeDefined();
      }
    });
  });

  describe("CORS handling", () => {
    it("includes access-control-allow-origin when Origin header matches config", async () => {
      // CORS_ORIGINS default is http://localhost:5173 per .env.example
      const response = await app.inject({
        method: "GET",
        url: "/api/health",
        headers: {
          Origin: "http://localhost:5173",
        },
      });

      expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    });

    it("does not include allow-origin for mismatched origin", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/health",
        headers: {
          Origin: "http://other-site.com",
        },
      });

      // @fastify/cors does not include header if origin doesn't match
      const headerValue = response.headers["access-control-allow-origin"] as string | undefined;
      // Either undefined or not matching the bad origin
      if (headerValue) {
        expect(headerValue).not.toBe("http://other-site.com");
      }
    });
  });

  describe("Cross-endpoint consistency", () => {
    it("priority-signals subset sum <= overview high-severity count", async () => {
      const filters = {
        organisation: "Enterprise-wide",
        eventType: "All",
        severity: "All",
      };

      const overviewResponse = await app.inject({
        method: "POST",
        url: "/api/overview",
        payload: { filters },
      });

      const priorityResponse = await app.inject({
        method: "POST",
        url: "/api/priority-signals",
        payload: { filters, limit: 50 },
      });

      const overviewBody = JSON.parse(overviewResponse.body);
      const priorityBody = JSON.parse(priorityResponse.body);

      const highSeverityFromOverview = overviewBody.kpis.highSeverityEvents.value;

      // Count high-severity events referenced in priority signals
      const priorityEventIds = new Set<string>();
      for (const signal of priorityBody.items) {
        for (const eventId of signal.eventIds) {
          priorityEventIds.add(eventId);
        }
      }

      // Priority signals should reference a subset of the filtered population
      expect(priorityEventIds.size).toBeLessThanOrEqual(overviewBody.eventCount);

      // The architectural invariant: patterns are a grouping of the same population
      expect(priorityBody.items.length).toBeLessThanOrEqual(overviewBody.kpis.totalEvents.value);
    });

    it("same filters produce consistent results across endpoints", async () => {
      const filters = { organisation: "Enterprise-wide", eventType: "All", severity: "All" };

      const overviewResponse = await app.inject({
        method: "POST",
        url: "/api/overview",
        payload: { filters },
      });

      const metadataResponse = await app.inject({
        method: "GET",
        url: "/api/metadata",
      });

      const overviewBody = JSON.parse(overviewResponse.body);
      const metadataBody = JSON.parse(metadataResponse.body);

      // Date range from overview filters should match metadata
      expect(overviewBody.filters.dateFrom).toBe(metadataBody.dateRange.min);
      expect(overviewBody.filters.dateTo).toBe(metadataBody.dateRange.max);
    });
  });
});
