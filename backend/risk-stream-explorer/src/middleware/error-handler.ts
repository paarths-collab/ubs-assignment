import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";

interface ErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

/**
 * Centralized error handler — every error path (thrown handler, validation
 * failure, unexpected exception) ends up here so the API only ever returns
 * one JSON shape and never leaks a stack trace.
 */
export function errorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply): void {
  const statusCode = typeof error.statusCode === "number" ? error.statusCode : 500;

  request.log.error({ err: error, requestId: request.id, statusCode }, "request_error");

  const body: ErrorBody = {
    error: {
      code: error.code ?? (statusCode >= 500 ? "INTERNAL_ERROR" : "BAD_REQUEST"),
      message: statusCode >= 500 ? "Internal server error" : error.message,
      requestId: request.id,
    },
  };

  reply.code(statusCode).send(body);
}

export function notFoundHandler(request: FastifyRequest, reply: FastifyReply): void {
  reply.code(404).send({
    error: {
      code: "NOT_FOUND",
      message: `Route ${request.method} ${request.url} not found`,
      requestId: request.id,
    },
  });
}
