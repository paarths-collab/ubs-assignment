import type { FastifyInstance } from "fastify";
import type { RiskRepository } from "../repositories/RiskRepository";
import { ManagerInsightRequestSchema } from "../schemas/ai.schema";
import { normalizeFilters, filterEvents } from "../services/FilterService";
import { buildAiFactPackage } from "../services/AiFactService";
import { generateManagerInsight, isAiConfigured } from "../services/LlmService";
import { AppError } from "../utils/errors";

export function registerAiRoute(app: FastifyInstance, repository: RiskRepository): void {
  app.post("/api/ai/manager-insight", async (request) => {
    const body = ManagerInsightRequestSchema.parse(request.body);
    const config = repository.getConfig();

    const filters = normalizeFilters(body.filters, config);
    const filteredEvents = filterEvents(repository.getEvents(), filters);
    const filteredEventIds = new Set(filteredEvents.map((event) => event.eventId));

    const factPackage = buildAiFactPackage(
      body.selection,
      filters,
      filteredEvents,
      filteredEventIds,
      config,
      repository,
    );

    // Not being configured is a permanent, actionable state — reporting it as
    // "temporarily unavailable" would send someone hunting for an outage that
    // isn't happening.
    if (!isAiConfigured()) {
      return {
        available: false,
        configured: false,
        reason: "AI assistant is not configured. Set GROQ_API_KEY in the backend environment to enable it.",
      };
    }

    try {
      const insight = await generateManagerInsight(factPackage);
      return { available: true, insight };
    } catch (error) {
      // AI failures never break the manager's factual analytics — surface a
      // graceful "unavailable" response instead of an HTTP error.
      if (error instanceof AppError && (error.code === "AI_UNAVAILABLE" || error.code === "AI_INVALID_RESPONSE")) {
        request.log.warn({ code: error.code, requestId: request.id }, error.message);
        return { available: false, configured: true, reason: "AI assistant temporarily unavailable." };
      }
      throw error;
    }
  });
}
