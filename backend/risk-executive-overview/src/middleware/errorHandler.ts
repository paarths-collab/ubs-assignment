import type { FastifyInstance, FastifyError } from "fastify";
import { ZodError } from "zod";
import { AppError } from "../utils/errors";

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | AppError | ZodError | Error, request, reply) => {
    if (error instanceof AppError) {
      request.log.warn({ code: error.code, requestId: request.id }, error.message);
      reply.status(error.statusCode).send({ error: { code: error.code, message: error.message } });
      return;
    }

    if (error instanceof ZodError) {
      request.log.warn({ requestId: request.id }, "Request validation failed");
      reply.status(400).send({
        error: { code: "INVALID_FILTER", message: error.issues.map((issue) => issue.message).join("; ") },
      });
      return;
    }

    // Fastify's own body/schema parsing errors (malformed JSON, payload too large, etc.)
    if ("statusCode" in error && typeof error.statusCode === "number" && error.statusCode < 500) {
      reply.status(error.statusCode).send({ error: { code: "INVALID_FILTER", message: error.message } });
      return;
    }

    request.log.error({ err: error, requestId: request.id }, "Unhandled error");
    reply.status(500).send({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({ error: { code: "NOT_FOUND", message: `Route ${request.method} ${request.url} not found` } });
  });
}
