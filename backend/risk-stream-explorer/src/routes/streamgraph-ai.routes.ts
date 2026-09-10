import type { FastifyInstance } from "fastify";
import { z } from "zod";

import {
  StreamgraphAiService,
  StreamgraphEventNotFoundError,
  StreamgraphPeriodNotFoundError,
} from "../services/StreamgraphAiService.js";

const AI_BODY_LIMIT_BYTES = 2048;
const AI_RATE_LIMIT_MAX = 15;
const AI_RATE_LIMIT_WINDOW = "1 minute";

/**
 * Filters are *selection* input, not facts: they say which slice of the
 * dataset to analyse, and the server recomputes every number from that slice
 * itself. Constrained to the exact shape the UI can produce so a malformed or
 * probing body is rejected before it reaches the analytics layer.
 */
const filterSchema = z
  .object({
    organisation: z.string().max(200).nullable().default(null),
    severity: z.enum(["Low", "Moderate", "High"]).nullable().default(null),
    eventType: z.enum(["Financial", "Non-Financial"]).nullable().default(null),
    riskTheme: z.string().max(200).nullable().default(null),
    dateStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
    dateEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  })
  .strict();

const periodBodySchema = z
  .object({
    intent: z.enum([
      "explain_period",
      "what_changed",
      "what_is_driving_change",
      "what_to_investigate",
      "control_considerations",
    ]),
    granularity: z.enum(["month", "week"]),
    periodId: z.string().min(1).max(64),
    filters: filterSchema,
    question: z.string().max(500).optional(),
    focusSection: z.string().max(80).optional(),
  })
  .strict();

const eventBodySchema = z
  .object({
    intent: z.enum([
      "summarise_event",
      "why_it_matters",
      "what_to_investigate",
      "suggest_controls",
      "find_similar_events",
      "explain_reporting_delay",
    ]),
    eventId: z.string().min(1).max(64),
    filters: filterSchema,
    question: z.string().max(500).optional(),
    focusSection: z.string().max(80).optional(),
  })
  .strict();

const routeOptions = {
  bodyLimit: AI_BODY_LIMIT_BYTES,
  config: { rateLimit: { max: AI_RATE_LIMIT_MAX, timeWindow: AI_RATE_LIMIT_WINDOW } },
};

export function registerStreamgraphAiRoutes(app: FastifyInstance, service: StreamgraphAiService): void {
  app.post("/api/ai/streamgraph/period", routeOptions, async (request, reply) => {
    const parsed = periodBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: "INVALID_BODY", message: parsed.error.issues[0]?.message ?? "Invalid request body.", requestId: request.id },
      });
    }

    const { intent, granularity, periodId, filters, question, focusSection } = parsed.data;
    const startedAt = Date.now();
    try {
      const text = await service.analysePeriod(intent, granularity, periodId, filters, question, focusSection);
      request.log.info({ intent, periodId, latencyMs: Date.now() - startedAt, success: true }, "ai.streamgraph.period");
      return { status: "ok" as const, text };
    } catch (err) {
      if (err instanceof StreamgraphPeriodNotFoundError) {
        return reply.code(404).send({ error: { code: "PERIOD_NOT_FOUND", message: err.message, requestId: request.id } });
      }
      request.log.warn({ intent, periodId, error: (err as Error).message }, "ai.streamgraph.period.failed");
      return reply.code(503).send({
        error: {
          code: "AI_UNAVAILABLE",
          message: "AI analysis is temporarily unavailable. The verified period metrics on screen remain accurate.",
          requestId: request.id,
        },
      });
    }
  });

  app.post("/api/ai/streamgraph/event", routeOptions, async (request, reply) => {
    const parsed = eventBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: "INVALID_BODY", message: parsed.error.issues[0]?.message ?? "Invalid request body.", requestId: request.id },
      });
    }

    const { intent, eventId, filters, question, focusSection } = parsed.data;
    const startedAt = Date.now();
    try {
      const text = await service.analyseEvent(intent, eventId, filters, question, focusSection);
      request.log.info({ intent, eventId, latencyMs: Date.now() - startedAt, success: true }, "ai.streamgraph.event");
      return { status: "ok" as const, text };
    } catch (err) {
      if (err instanceof StreamgraphEventNotFoundError) {
        return reply.code(404).send({ error: { code: "EVENT_NOT_FOUND", message: err.message, requestId: request.id } });
      }
      request.log.warn({ intent, eventId, error: (err as Error).message }, "ai.streamgraph.event.failed");
      return reply.code(503).send({
        error: {
          code: "AI_UNAVAILABLE",
          message: "AI analysis is temporarily unavailable. The verified event record on screen remains accurate.",
          requestId: request.id,
        },
      });
    }
  });
}
