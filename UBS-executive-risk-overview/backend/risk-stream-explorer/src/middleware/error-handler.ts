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

/**
 * Builds the 404 handler. When the built frontend is being served alongside
 * the API, a browser navigating straight to a client-side route (`/patterns`)
 * hits Fastify, not the router — so document requests outside `/api/` fall
 * back to the app shell and let the frontend router resolve the path. API
 * routes and non-document requests still get the standard JSON 404.
 */
export function makeNotFoundHandler(resolveSpaFile: (() => string | null) | null) {
  return function notFoundHandler(request: FastifyRequest, reply: FastifyReply): void {
    const isDocumentRequest =
      request.method === "GET" &&
      !request.url.startsWith("/api/") &&
      (request.headers.accept ?? "").includes("text/html");

    const spaFile = resolveSpaFile !== null && isDocumentRequest ? resolveSpaFile() : null;
    if (spaFile !== null) {
      void reply.sendFile(spaFile);
      return;
    }

    reply.code(404).send({
      error: {
        code: "NOT_FOUND",
        message: `Route ${request.method} ${request.url} not found`,
        requestId: request.id,
      },
    });
  };
}
