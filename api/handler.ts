import type { IncomingMessage, ServerResponse } from "node:http";
import type { FastifyInstance } from "fastify";
import { resolveBackend, type Backend } from "./routes.js";

/**
 * Single Vercel function fronting both Fastify backends.
 *
 * Not named `[...path].ts`: Vercel's filename-based routing for a bracketed
 * catch-all only generated `^/api/([^/]+)$`, so two-segment routes such as
 * `/api/ai/follow-up/stream` returned a platform 404 before any function ran.
 * A nested `api/ai/[...path].ts` cannot fix that either — it collides with
 * the parent catch-all. `vercel.json` instead rewrites all of `/api/(.*)`
 * here explicitly, which preserves the full path in `req.url` and works for
 * any depth.
 *
 * Both apps are built lazily and memoised, so a request that only needs one
 * backend never pays for loading the other's dataset.
 */
const apps: Partial<Record<Backend, Promise<FastifyInstance>>> = {};

function getApp(backend: Backend): Promise<FastifyInstance> {
  const existing = apps[backend];
  if (existing !== undefined) return existing;
  const started = backend === "kpi" ? buildKpiApp() : buildLegacyApp();
  apps[backend] = started;
  return started;
}

async function buildKpiApp(): Promise<FastifyInstance> {
  const { buildApp } = await import("../backend/risk-executive-overview/src/app.js");
  const app = buildApp();
  await app.ready();
  return app;
}

async function buildLegacyApp(): Promise<FastifyInstance> {
  const { buildApp } = await import("../backend/risk-stream-explorer/src/app.js");
  // `serveBuiltFrontend: false` because the static frontend is served by
  // Vercel's CDN, not by this function. Left on, Fastify's not-found handler
  // would answer unmatched `/api/*` calls with the app's HTML instead of a
  // JSON 404, which is far harder to debug from the browser.
  const app = await buildApp({ serveBuiltFrontend: false });
  await app.ready();
  return app;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const app = await getApp(resolveBackend(req.url));
  app.server.emit("request", req, res);
}
