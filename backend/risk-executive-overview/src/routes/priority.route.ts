import type { FastifyInstance } from "fastify";
import type { RiskRepository } from "../repositories/RiskRepository";
import { PrioritySignalsRequestSchema } from "../schemas/filters.schema";
import { normalizeFilters, filterEvents } from "../services/FilterService";
import { buildScenarioSignals, rankScenarioSignals, buildAttentionCards } from "../services/ScenarioService";

export function registerPriorityRoute(app: FastifyInstance, repository: RiskRepository): void {
  app.post("/api/priority-signals", async (request) => {
    const body = PrioritySignalsRequestSchema.parse(request.body ?? {});
    const config = repository.getConfig();

    const filters = normalizeFilters(body.filters, config);
    const filteredEvents = filterEvents(repository.getEvents(), filters);

    const scenarios = rankScenarioSignals(buildScenarioSignals(filteredEvents, repository.getPatterns(), config));
    const items = scenarios.slice(0, body.limit);

    return { filters, items, attention: buildAttentionCards(scenarios), totalCandidates: scenarios.length };
  });
}
