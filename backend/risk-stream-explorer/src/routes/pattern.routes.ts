import type { FastifyInstance } from "fastify";
import type { PatternRepository } from "../repositories/PatternRepository.js";

export function registerPatternRoutes(app: FastifyInstance, patternRepository: PatternRepository): void {
  /** The 22-item priority queue that drives the main UI — deterministic, no AI call needed. */
  app.get("/api/patterns/priority", async () => {
    const patterns = patternRepository.getPriorityQueue();
    return { patterns, count: patterns.length };
  });

  /** Full detail for one pattern, from the 137-pattern library — audit/drilldown surface, not the primary UI. */
  app.get<{ Params: { patternId: string } }>("/api/patterns/:patternId", async (request, reply) => {
    const pattern = patternRepository.getById(request.params.patternId);
    if (!pattern) {
      return reply.code(404).send({
        error: {
          code: "PATTERN_NOT_FOUND",
          message: `Pattern "${request.params.patternId}" was not found.`,
          requestId: request.id,
        },
      });
    }
    return pattern;
  });
}
