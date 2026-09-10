import type { IncomingMessage, ServerResponse } from "node:http";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../backend/risk-executive-overview/src/app";

let appPromise: Promise<FastifyInstance> | undefined;

function getApp(): Promise<FastifyInstance> {
  appPromise ??= (async () => {
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
