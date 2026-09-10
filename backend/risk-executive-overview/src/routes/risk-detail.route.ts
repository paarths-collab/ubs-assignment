import type { FastifyInstance } from "fastify";
import type { RiskRepository } from "../repositories/RiskRepository.js";
import { RiskDetailRequestSchema } from "../schemas/risk-detail.schema.js";
import { normalizeFilters, filterEvents } from "../services/FilterService.js";
import { resolveSelectionSlice, buildRiskDetail } from "../services/RiskDetailService.js";

export function registerRiskDetailRoute(app: FastifyInstance, repository: RiskRepository): void {
  app.post("/api/risk-detail", async (request) => {
    const body = RiskDetailRequestSchema.parse(request.body);
    const config = repository.getConfig();

    const filters = normalizeFilters(body.filters, config);
    const filteredEvents = filterEvents(repository.getEvents(), filters);
    const filteredEventIds = new Set(filteredEvents.map((event) => event.eventId));

    const sliceEvents = resolveSelectionSlice(body.selection, filteredEvents, filteredEventIds, config, repository);
    const patternId = body.selection.type === "pattern" ? body.selection.patternId : null;

    return { filters, detail: buildRiskDetail(body.selection, sliceEvents, config, patternId) };
  });
}
