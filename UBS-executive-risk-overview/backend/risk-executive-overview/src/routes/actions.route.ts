import type { FastifyInstance } from "fastify";
import { ActionRequestSchema } from "../schemas/actions.schema.js";
import type { ActionsService } from "../services/ActionsService.js";

export function registerActionsRoute(app: FastifyInstance, actionsService: ActionsService): void {
  app.post("/api/actions", async (request, reply) => {
    const body = ActionRequestSchema.parse(request.body);
    const action = actionsService.record(body);
    reply.status(201);
    return { action };
  });
}
