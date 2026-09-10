import type { FastifyInstance } from "fastify";
import type { RiskRepository } from "../repositories/RiskRepository";
import { isAiConfigured } from "../services/LlmService";

export function registerHealthRoute(app: FastifyInstance, repository: RiskRepository): void {
  app.get("/api/health", async () => ({
    status: "ok",
    dataLoaded: true,
    eventCount: repository.getEvents().length,
    aiConfigured: isAiConfigured(),
  }));
}
