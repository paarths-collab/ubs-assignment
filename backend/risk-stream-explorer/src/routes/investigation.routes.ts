import type { FastifyInstance } from "fastify";
import type { InvestigationService } from "../services/InvestigationService";

export function registerInvestigationRoutes(app: FastifyInstance, investigationService: InvestigationService): void {
  app.get<{ Params: { patternId: string } }>("/api/investigations/:patternId", async (request, reply) => {
    const investigation = investigationService.getInvestigation(request.params.patternId);
    if (!investigation) {
      return reply.code(404).send({
        error: {
          code: "PATTERN_NOT_FOUND",
          message: `Pattern "${request.params.patternId}" was not found.`,
          requestId: request.id,
        },
      });
    }
    return investigation;
  });
}
