import type { FastifyInstance } from "fastify";
import type { RiskEventRepository } from "../repositories/RiskEventRepository";

export function registerEventRoutes(app: FastifyInstance, eventRepository: RiskEventRepository): void {
  app.get<{ Params: { eventId: string } }>("/api/events/:eventId", async (request, reply) => {
    const event = eventRepository.getById(request.params.eventId);
    if (!event) {
      return reply.code(404).send({
        error: {
          code: "EVENT_NOT_FOUND",
          message: `Event "${request.params.eventId}" was not found.`,
          requestId: request.id,
        },
      });
    }
    return event;
  });
}
