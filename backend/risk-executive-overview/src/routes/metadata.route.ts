import type { FastifyInstance } from "fastify";
import type { RiskRepository } from "../repositories/RiskRepository";

export function registerMetadataRoute(app: FastifyInstance, repository: RiskRepository): void {
  app.get("/api/metadata", async () => {
    const config = repository.getConfig();
    return {
      recordCount: repository.getEvents().length,
      dateRange: config.dateRange,
      organisations: config.filters.organisations,
      eventTypes: config.filters.eventTypes,
      severities: config.filters.severities,
      statuses: config.filters.statuses,
      stages: config.filters.stages,
      rootCauses: config.filters.rootCauses,
      riskThemes: config.filters.riskThemes,
      orCategories: config.filters.orCategories,
    };
  });
}
