import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { RelationshipAiService, RelationshipNodeNotFoundError } from "../services/RelationshipAiService";

const bodySchema = z.object({
  selectedNodeId: z.string().max(200).nullable(),
  eventIds: z.array(z.string().min(1).max(64)).min(1).max(2000),
  question: z.string().max(500).optional(),
}).strict();
const querySchema = z.object({ question: z.string().min(3).max(500) }).strict();

export function registerRelationshipAiRoutes(app: FastifyInstance, service: RelationshipAiService, model: string): void {
  app.post("/api/ai/query", { bodyLimit: 8_192, config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (request, reply) => {
    const parsed = querySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: "INVALID_QUERY", message: "Ask a longer risk-filter question.", requestId: request.id } });
    try {
      return { requestId: request.id, model, intent: await service.interpretFilterQuery(parsed.data.question) };
    } catch (error) {
      request.log.warn({ error: (error as Error).message }, "ai.relationship.query.failed");
      return reply.code(503).send({ error: { code: "AI_UNAVAILABLE", message: "AI filter interpretation is unavailable.", requestId: request.id } });
    }
  });

  app.post("/api/ai/analyse", {
    bodyLimit: 32_768,
    config: { rateLimit: { max: 15, timeWindow: "1 minute" } },
  }, async (request, reply) => {
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: "INVALID_BODY", message: "Invalid investigation scope.", requestId: request.id } });
    }
    try {
      const result = await service.analyse(parsed.data.selectedNodeId, parsed.data.eventIds, parsed.data.question);
      return {
        requestId: request.id,
        generatedAt: new Date().toISOString(),
        model,
        verifiedFacts: {
          scope: { eventCount: result.eventCount, requestedEventCount: parsed.data.eventIds.length, droppedEventCount: parsed.data.eventIds.length - result.eventCount },
          selectedNode: result.selectedNode,
          severityCounts: result.severityCounts,
          eventTypeCounts: result.eventTypeCounts,
          actualExposure: { gross: { total: result.grossTotal, contributingCount: result.grossCount }, recovery: { total: result.recoveryTotal, contributingCount: result.recoveryCount }, net: { total: result.netTotal, contributingCount: result.netCount } },
          potentialExposure: { total: result.potentialTotal, contributingCount: result.potentialCount },
          evidenceEventIds: result.evidenceEventIds,
        },
        analysis: result.analysis,
      };
    } catch (error) {
      if (error instanceof RelationshipNodeNotFoundError) {
        return reply.code(404).send({ error: { code: "NODE_NOT_FOUND", message: error.message, requestId: request.id } });
      }
      request.log.warn({ error: (error as Error).message }, "ai.relationship.failed");
      return reply.code(503).send({ error: { code: "AI_UNAVAILABLE", message: "AI analysis is temporarily unavailable. Deterministic relationship evidence remains available.", requestId: request.id } });
    }
  });
}
