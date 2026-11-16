import type { FastifyInstance } from "fastify";
import type { RiskRepository } from "../repositories/RiskRepository.js";

/** Read-only source used by the connected frontend's charts and evidence table. */
export function registerSourceEventsRoute(app: FastifyInstance, repository: RiskRepository): void {
  app.get("/api/source-events", async () => ({
    source: "risk-events",
    synthetic: true,
    totalRows: repository.getEvents().length,
    events: repository.getEvents().map(event => ({
      eventId: event.eventId, title: event.title, description: event.description,
      eventType: event.eventType, severity: event.severity, status: event.status, stage: event.stage,
      occurrenceDate: event.occurrenceDate, ownerOrganisation: event.ownerOrganisation,
      riskTheme: event.riskTheme, rootCause: event.rootCause, issueDetail: event.issueDetail,
      grossAmountUsd: event.grossAmountUsd, netAmountUsd: event.netAmountUsd,
      recoveryAmountUsd: event.recoveryAmountUsd, potentialImpactUsd: event.potentialImpactUsd,
      remediationHours: event.remediationHours,
    })),
  }));
}
