import { beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

import { buildApp } from "../src/app";
import type { Env } from "../src/config/env";
import { EventRepository } from "../src/repositories/EventRepository";
import { GroqService, type GroqClientLike } from "../src/services/GroqService";
import { StreamgraphAiService } from "../src/services/StreamgraphAiService";
import { AICacheService } from "../src/services/AICacheService";
import { PatternRepository } from "../src/repositories/PatternRepository";
import { RiskEventRepository } from "../src/repositories/RiskEventRepository";
import type { LoadedRiskDataset } from "../src/repositories/RiskDataLoader";
import type { RawFullEventDetail, RawFullEventDetailMap, StreamEvent } from "../src/types/Event";
import { makeEvent, resetCounter } from "./fixtures";
import { makePattern, makePatternsDataset, makeRiskEvent, resetRiskFixtureCounters } from "./riskFixtures";

function testEnv(): Env {
  return {
    llm: {
      provider: "groq",
      apiKey: "test-key",
      baseURL: "https://api.groq.com/openai/v1",
      model: "test-model",
      referer: "http://localhost:3001",
      title: "test",
    },
    GROQ_API_KEY: "test-key",
    GROQ_MODEL: "test-model",
    PORT: 0,
    CORS_ORIGIN: ["http://localhost:5173"],
    AI_TIMEOUT_MS: 5000,
    AI_CACHE_TTL_MS: 60_000,
    NODE_ENV: "test",
  };
}

function detailFor(event: StreamEvent): RawFullEventDetail {
  return {
    "Event ID": event.eventId,
    "Event Title": event.eventTitle,
    "Event Description": null,
    "Event Type": event.eventType,
    "Overall Event Classification": event.severity,
    "Event Gross Amount (USD)": null,
    "Event Net Amount (USD)": null,
    "Event Recovery Amount (USD)": null,
    "Event Potential Impact Amount  (USD)": null,
    "Provision Status": null,
    "Event Status": event.eventStatus,
    "Event Stage": event.eventStage,
    "Date Event Discovered": event.discoveredDate,
    "Event Occurrence Date": event.occurrenceDate,
    "Event Owner Organisation": event.ownerOrganisation,
    "Event Creator Name": null,
    "Event Administrator Name": null,
    "Event Owner Name": null,
    "Discovery Organisation": event.discoveryOrganisation,
    "Root Cause": event.rootCause,
    "Risk Theme": event.riskTheme,
    "OR Category": event.orCategory,
    "Current Assignee": null,
    "Created On": null,
    "Modified By Name": null,
    "Modified On": null,
    Impacts: null,
    "Background Detail": null,
    "Issue Detail": event.issueDetail,
    "Root Cause Detail": null,
    "Impact Detail": null,
    Opportunity: null,
    "Detection Delay Days": event.detectionDelayDays,
    "Recording Delay Days": event.recordingDelayDays,
    "Occurrence to Record Days": event.occurrenceToRecordDays,
  };
}

/** Captures what was actually sent to the model so we can assert on the prompt. */
function makeCapturingLlm(): { service: GroqService; sent: Record<string, unknown>[] } {
  const sent: Record<string, unknown>[] = [];
  const client: GroqClientLike = {
    chat: {
      completions: {
        create: async (params: Record<string, unknown>) => {
          sent.push(params);
          return {
            choices: [{ message: { content: "Observed: canned test answer with verified context. Why it matters: this is a test answer explaining the bounded significance of the selected scope. Drivers: the supplied deterministic metrics provide the relevant context without establishing causation. Investigate: - Review the selected events. - Compare the previous period. - Confirm the source records. Control considerations: - Assign an owner. - Monitor recurrence. This test narrative is intentionally long enough to exercise the production completeness guard while remaining synthetic and non-causal. It contains no unsupported claims or invented identifiers and confirms that the response contract is complete for the analyst interface." } }],
          };
        },
      },
    },
  };
  return { service: new GroqService("test-key", "test-model", 5000, client), sent };
}

const EVENTS: StreamEvent[] = [
  makeEvent({ eventId: "SIM-A", occurrenceDate: "2026-01-05", severity: "High", riskTheme: "Financial Reporting" }),
  makeEvent({ eventId: "SIM-B", occurrenceDate: "2026-01-12", severity: "Low", riskTheme: "Technology Resilience" }),
  makeEvent({ eventId: "SIM-C", occurrenceDate: "2025-12-20", severity: "Low", riskTheme: "Technology Resilience" }),
];

/** Component 4's dataset is irrelevant here but buildApp requires one. */
function minimalRiskDataset(): LoadedRiskDataset {
  const pattern = makePattern();
  return {
    eventRepository: new RiskEventRepository([makeRiskEvent()]),
    patternRepository: new PatternRepository(makePatternsDataset([pattern], [pattern.pattern_id])),
  } as LoadedRiskDataset;
}

async function buildTestApp(llm: GroqService): Promise<FastifyInstance> {
  const detailsById: RawFullEventDetailMap = Object.fromEntries(EVENTS.map((e) => [e.eventId, detailFor(e)]));
  const repository = new EventRepository(EVENTS, detailsById);
  return buildApp({
    env: testEnv(),
    dataset: minimalRiskDataset(),
    groqService: llm,
    aiCache: new AICacheService(60_000),
    serveBuiltFrontend: false,
    streamgraphAiService: new StreamgraphAiService(repository, llm),
  });
}

const NO_FILTERS = {
  organisation: null,
  severity: null,
  eventType: null,
  riskTheme: null,
  dateStart: null,
  dateEnd: null,
};

describe("streamgraph AI routes", () => {
  beforeEach(() => {
    resetCounter();
    resetRiskFixtureCounters();
  });

  it("resolves period facts server-side and puts real computed numbers in the prompt", async () => {
    const { service, sent } = makeCapturingLlm();
    const app = await buildTestApp(service);

    const response = await app.inject({
      method: "POST",
      url: "/api/ai/streamgraph/period",
      payload: { intent: "explain_period", granularity: "month", periodId: "month:2026-01", filters: NO_FILTERS },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok", text: expect.stringContaining("Observed:") });

    // The client sent no facts — only ids and filters. Everything below was
    // computed by the server from the dataset.
    const userMessage = (sent[0]!.messages as { role: string; content: string }[]).find((m) => m.role === "user")!;
    expect(userMessage.content).toContain("Event count: 2");
    expect(userMessage.content).toContain("High=1");
    expect(userMessage.content).toContain("previous period: 1"); // Dec 2025 has SIM-C
  });

  it("rejects a body that tries to smuggle in its own facts", async () => {
    const { service } = makeCapturingLlm();
    const app = await buildTestApp(service);

    const response = await app.inject({
      method: "POST",
      url: "/api/ai/streamgraph/period",
      payload: {
        intent: "explain_period",
        granularity: "month",
        periodId: "month:2026-01",
        filters: NO_FILTERS,
        observedFacts: "High severity is 99%",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("INVALID_BODY");
  });

  it("404s for a period that does not exist under the supplied filters", async () => {
    const { service } = makeCapturingLlm();
    const app = await buildTestApp(service);

    const response = await app.inject({
      method: "POST",
      url: "/api/ai/streamgraph/period",
      payload: { intent: "explain_period", granularity: "month", periodId: "month:1999-01", filters: NO_FILTERS },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("PERIOD_NOT_FOUND");
  });

  it("resolves event facts server-side from the event id alone", async () => {
    const { service, sent } = makeCapturingLlm();
    const app = await buildTestApp(service);

    const response = await app.inject({
      method: "POST",
      url: "/api/ai/streamgraph/event",
      payload: { intent: "summarise_event", eventId: "SIM-A", filters: NO_FILTERS },
    });

    expect(response.statusCode).toBe(200);
    const userMessage = (sent[0]!.messages as { role: string; content: string }[]).find((m) => m.role === "user")!;
    expect(userMessage.content).toContain("SIM-A");
    expect(userMessage.content).toContain("Severity: High");
  });

  it("404s for an unknown event id", async () => {
    const { service } = makeCapturingLlm();
    const app = await buildTestApp(service);

    const response = await app.inject({
      method: "POST",
      url: "/api/ai/streamgraph/event",
      payload: { intent: "summarise_event", eventId: "NOPE", filters: NO_FILTERS },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("EVENT_NOT_FOUND");
  });

  it("returns a verified narrative fallback when the model call fails", async () => {
    const failing: GroqClientLike = {
      chat: { completions: { create: async () => { throw new Error("upstream down"); } } },
    };
    const app = await buildTestApp(new GroqService("k", "m", 5000, failing));

    const response = await app.inject({
      method: "POST",
      url: "/api/ai/streamgraph/event",
      payload: { intent: "summarise_event", eventId: "SIM-A", filters: NO_FILTERS },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("ok");
    expect(response.json().text).toContain("Observed:");
    expect(response.json().text).toContain("Supporting evidence:");
  });
});
