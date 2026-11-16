import type { FastifyInstance } from "fastify";
import type { IssueIntelligenceService } from "../services/IssueIntelligenceService";
import type { PatternRepository } from "../repositories/PatternRepository";

/**
 * Issue-centric entry point (the pivot from the 22-item pattern priority
 * queue): "Which issues deserve the most attention, and what evidence
 * explains why?" Both routes are purely deterministic — no AI call needed,
 * so they're always available even if Groq is down. See
 * `POST /api/ai/issue/:issueId` (ai.routes.ts) for the Groq interpretation
 * layered on top.
 */
export function registerIssueRoutes(
  app: FastifyInstance,
  issueIntelligenceService: IssueIntelligenceService,
  patternRepository: PatternRepository,
): void {
  /** The ranked "Issues Requiring Attention" list — deterministic, transparent signals only, no opaque AI score. */
  app.get("/api/issues", async () => {
    return issueIntelligenceService.getRankedIssues();
  });

  /** Full deterministic analysis for one issue, resolved from its URL slug. */
  app.get<{ Params: { issueId: string } }>("/api/issues/:issueId", async (request, reply) => {
    const enterprise = patternRepository.getEnterpriseBaseline();
    const detail = issueIntelligenceService.getDetail(request.params.issueId, enterprise);
    if (!detail) {
      return reply.code(404).send({
        error: {
          code: "ISSUE_NOT_FOUND",
          message: `Issue "${request.params.issueId}" was not found.`,
          requestId: request.id,
        },
      });
    }
    return detail;
  });
}
