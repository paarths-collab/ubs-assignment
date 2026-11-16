import type { FastifyInstance } from "fastify";
import type { RiskRepository } from "../repositories/RiskRepository.js";
import type { RiskDetailSelection } from "../types/RiskDetail.js";
import { RiskDetailRequestSchema } from "../schemas/risk-detail.schema.js";
import { normalizeFilters, filterEvents } from "../services/FilterService.js";
import { resolveSelectionSlice, buildRiskDetail } from "../services/RiskDetailService.js";

export function registerRiskDetailRoute(app: FastifyInstance, repository: RiskRepository): void {
  app.post("/api/risk-detail", async (request) => {
    const body = RiskDetailRequestSchema.parse(request.body);
    const selection = body.selection as RiskDetailSelection;
    const config = repository.getConfig();

    const filters = normalizeFilters(body.filters, config);
    const filteredEvents = filterEvents(repository.getEvents(), filters);
    const filteredEventIds = new Set(filteredEvents.map((event) => event.eventId));

    const sliceEvents = resolveSelectionSlice(selection, filteredEvents, filteredEventIds, config, repository);
    const patternId = selection.type === "pattern" ? selection.patternId : null;

    return { filters, detail: buildRiskDetail(selection, sliceEvents, config, patternId) };
  });
}
