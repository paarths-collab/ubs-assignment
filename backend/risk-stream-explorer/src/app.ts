import path from "node:path";
import { fileURLToPath } from "node:url";

import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";

import { loadEnv, type Env } from "./config/env";
import { loadRiskDatasetFromDisk, type LoadedRiskDataset } from "./repositories/RiskDataLoader";
import { InvestigationService } from "./services/InvestigationService";
import { GroqService } from "./services/GroqService";
import { AICacheService } from "./services/AICacheService";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import { registerHealthRoutes } from "./routes/health.routes";
import { registerPatternRoutes } from "./routes/pattern.routes";
import { registerInvestigationRoutes } from "./routes/investigation.routes";
import { registerEventRoutes } from "./routes/event.routes";
import { registerAiRoutes } from "./routes/ai.routes";

export interface AppDependencies {
  env: Env;
  dataset: LoadedRiskDataset;
}

function defaultDataDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../data");
}

/**
 * Builds (but does not start listening on) the Fastify app. Kept separate
 * from server.ts so tests can `await buildApp({...})` then `.inject(...)`
 * without binding a real port, and can inject an in-memory dataset instead
 * of reading disk.
 *
 * This is async — and plugin registration is `await`ed in order — because
 * `@fastify/rate-limit` installs itself via an `onRoute` hook: if a route is
 * registered before that hook exists (which happens if you fire-and-forget
 * `app.register(rateLimit, ...)` and then immediately call `app.post(...)`),
 * the route silently gets no rate limiting at all. Awaiting each plugin
 * before registering routes avoids that trap.
 */
export async function buildApp(overrides: Partial<AppDependencies> = {}): Promise<FastifyInstance> {
  const env = overrides.env ?? loadEnv();
  const dataset = overrides.dataset ?? loadRiskDatasetFromDisk(defaultDataDir());

  if (!env.GROQ_API_KEY) {
    // Deterministic routes work fine without a key; only /api/ai/* degrades
    // (gracefully, to the fallback response) — so this is a warning, not a
    // startup failure.
    // eslint-disable-next-line no-console
    console.warn("GROQ_API_KEY is not set — /api/ai/* will always return the fallback response.");
  }

  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "test" ? "silent" : "info",
      redact: ["req.headers.authorization"],
    },
  });

  await app.register(helmet);
  await app.register(cors, { origin: env.CORS_ORIGIN });
  await app.register(rateLimit, { global: false });

  const investigationService = new InvestigationService(dataset.patternRepository, dataset.eventRepository);
  const aiCache = new AICacheService(env.AI_CACHE_TTL_MS);
  const groqService = new GroqService(env.GROQ_API_KEY, env.GROQ_MODEL, env.AI_TIMEOUT_MS);

  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);

  registerHealthRoutes(app);
  registerPatternRoutes(app, dataset.patternRepository);
  registerInvestigationRoutes(app, investigationService);
  registerEventRoutes(app, dataset.eventRepository);
  registerAiRoutes(app, { patternRepository: dataset.patternRepository, groqService, aiCache, env });

  return app;
}
