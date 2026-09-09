import type { FastifyInstance } from "fastify";
import type { RiskRepository } from "../repositories/RiskRepository";
import { OverviewRequestSchema } from "../schemas/filters.schema";
import { normalizeFilters, filterEvents } from "../services/FilterService";
import { calculateKPIs, calculateDistributions } from "../services/KpiService";
import { buildComposition, buildExposureSummary } from "../services/CompositionService";

export function registerOverviewRoute(app: FastifyInstance, repository: RiskRepository): void {
  app.post("/api/overview", async (request) => {
    const body = OverviewRequestSchema.parse(request.body ?? {});
    const config = repository.getConfig();

    const filters = normalizeFilters(body.filters, config);
    const filteredEvents = filterEvents(repository.getEvents(), filters);

    return {
      filters,
      eventCount: filteredEvents.length,
      datasetEventCount: repository.getEvents().length,
      kpis: calculateKPIs(filteredEvents, config, filters),
      distributions: calculateDistributions(filteredEvents),
      composition: buildComposition(filteredEvents, config),
      exposure: buildExposureSummary(filteredEvents),
    };
  });
}
