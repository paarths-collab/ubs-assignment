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

const KPI_NOT_SERVED_HTML =
  "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>404 - KPI overview not served here</title></head>" +
  "<body><h1>404</h1><p>The KPI overview is not served by this server. " +
  "Run <code>npm run start:local</code> for the full deployed layout.</p></body></html>";

function isKpiPath(url: string): boolean {
  const pathname = url.split("?")[0] ?? "";
  return pathname === "/kpi" || pathname.startsWith("/kpi/");
}

/**
 * Builds the 404 handler. When the built frontend is being served alongside
 * the API, a browser navigating straight to a client-side route (`/patterns`)
 * hits Fastify, not the router — so document requests outside `/api/` fall
 * back to the app shell and let the frontend router resolve the path. API
 * routes and non-document requests still get the standard JSON 404.
 *
 * `/kpi` and `/kpi/*` are the one exception. In the deployed layout those
 * belong to the separate executive-overview app, which this single-origin
 * server does not serve. Falling back to the stream app's shell there would
 * make its client router call `location.assign("/kpi")` and reload forever,
 * so they get an honest 404 page instead.
 */
export function makeNotFoundHandler(resolveSpaFile: (() => string | null) | null) {
  return function notFoundHandler(request: FastifyRequest, reply: FastifyReply): void {
    if (resolveSpaFile !== null && request.method === "GET" && isKpiPath(request.url)) {
      reply.code(404).type("text/html; charset=utf-8").send(KPI_NOT_SERVED_HTML);
      return;
    }

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
