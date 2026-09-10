import type { IncomingMessage, ServerResponse } from "node:http";
import type { FastifyInstance } from "fastify";

let appPromise: Promise<FastifyInstance> | undefined;

function getApp(): Promise<FastifyInstance> {
  appPromise ??= (async () => {
    const { buildApp } = await import("../backend/risk-executive-overview/src/app.js");
    const app = buildApp();
    await app.ready();
    return app;
  })();
  return appPromise;
}

/** Vercel catch-all function for the Executive Risk Overview backend API. */
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const app = await getApp();
  app.server.emit("request", req, res);
}
