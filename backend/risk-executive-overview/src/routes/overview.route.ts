import type { FastifyInstance } from "fastify";
import type { RiskRepository } from "../repositories/RiskRepository.js";
import { OverviewRequestSchema } from "../schemas/filters.schema.js";
import { normalizeFilters, filterEvents } from "../services/FilterService.js";
import { calculateKPIs, calculateDistributions, computeKpiDeltas } from "../services/KpiService.js";
import { buildComposition, buildExposureSummary } from "../services/CompositionService.js";

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
      kpiTrend: computeKpiDeltas(filteredEvents, config, filters),
      distributions: calculateDistributions(filteredEvents),
      composition: buildComposition(filteredEvents, config),
      exposure: buildExposureSummary(filteredEvents),
    };
  });
}
