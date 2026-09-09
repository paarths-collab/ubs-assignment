import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { FastifyInstance } from "fastify";

/** Reuses an incoming X-Request-Id when the caller supplied one; otherwise generates one. Used as Fastify's `genReqId`. */
export function generateRequestId(req: IncomingMessage): string {
  const incoming = req.headers["x-request-id"];
  return typeof incoming === "string" && incoming.length > 0 ? incoming : randomUUID();
}

/** Echoes the resolved request id back on every response so callers can correlate logs. */
export function registerRequestId(app: FastifyInstance): void {
  app.addHook("onRequest", (request, reply, done) => {
    reply.header("X-Request-Id", request.id);
    done();
  });
}
