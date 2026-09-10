import path from "node:path";
import { fileURLToPath } from "node:url";

import fs from "node:fs";

import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";

import { loadEnv, type Env } from "./config/env.js";
import { createChatCompletionsClient } from "./config/llm.js";
import { loadRiskDatasetFromDisk, type LoadedRiskDataset } from "./repositories/RiskDataLoader.js";
import { InvestigationService } from "./services/InvestigationService.js";
import { IssueIntelligenceService } from "./services/IssueIntelligenceService.js";
import { GroqService } from "./services/GroqService.js";
import { AICacheService } from "./services/AICacheService.js";
import { errorHandler, makeNotFoundHandler } from "./middleware/error-handler.js";
import { registerHealthRoutes } from "./routes/health.routes.js";
import { registerPatternRoutes } from "./routes/pattern.routes.js";
import { registerInvestigationRoutes } from "./routes/investigation.routes.js";
import { registerIssueRoutes } from "./routes/issue.routes.js";
import { registerEventRoutes } from "./routes/event.routes.js";
import { registerAiRoutes, registerIssueAiRoutes } from "./routes/ai.routes.js";
import { registerStreamgraphAiRoutes } from "./routes/streamgraph-ai.routes.js";
import { loadStreamgraphRepository, StreamgraphAiService } from "./services/StreamgraphAiService.js";
import { registerRelationshipAiRoutes } from "./routes/relationship-ai.routes.js";
import { RelationshipAiService } from "./services/RelationshipAiService.js";

export interface AppDependencies {
  env: Env;
  dataset: LoadedRiskDataset;
  /** Overridable so integration tests can inject a fake Groq client without touching the network. */
  groqService: GroqService;
  aiCache: AICacheService;
  /** Tests set this false so 404s stay JSON regardless of whether dist/ exists locally. */
  serveBuiltFrontend: boolean;
  /** Overridable so tests can supply an in-memory streamgraph dataset. */
  streamgraphAiService: StreamgraphAiService | null;
}

/**
 * Component 2's dataset lives in the same data dir but is loaded separately
 * from the pattern/issue dataset. A failure here must not take the server
 * down — the other components are independent of it.
 */
function createStreamgraphAiService(
  groqService: GroqService,
  app: FastifyInstance,
): StreamgraphAiService | null {
  try {
    return new StreamgraphAiService(loadStreamgraphRepository(defaultDataDir()), groqService);
  } catch (err) {
    app.log.warn(
      { error: (err as Error).message },
      "streamgraph dataset unavailable — /api/ai/streamgraph/* will not be registered",
    );
    return null;
  }
}

function defaultDataDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../data");
}

function graphDataDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../../../frontend/risk-stream-explorer/src/graph/data");
}

/**
 * The built frontend, if `npm run build` has been run. Serving it from the
 * API process makes the whole app same-origin on one port, which sidesteps
 * CORS entirely and means a reviewer needs one command and one URL rather
 * than a dev server, an API server and a `file://` page that browsers treat
 * as an opaque origin.
 */
function distDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../../../dist");
}

/**
 * Resolved per request rather than cached at startup: the build writes
 * `index.html` and then renames it, and a rebuild while the server is up
 * would otherwise leave us serving a filename that no longer exists.
 */
function builtFrontendFile(): string | null {
  const dir = distDir();
  for (const file of ["risk-stream-explorer.html", "index.html"]) {
    if (fs.existsSync(path.join(dir, file))) return file;
  }
  return null;
}

function resolveBuiltFrontend(): { dir: string; file: string } | null {
  const file = builtFrontendFile();
  return file === null ? null : { dir: distDir(), file };
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

  if (!env.llm.apiKey) {
    // Deterministic routes work fine without a key; only /api/ai/* degrades
    // (gracefully, to the fallback response) — so this is a warning, not a
    // startup failure.
    // eslint-disable-next-line no-console
    console.warn(
      `No API key for LLM provider "${env.llm.provider}" — /api/ai/* will always return the fallback response. ` +
        `Set ${env.llm.provider === "openrouter" ? "OPENROUTER_API_KEY" : env.llm.provider === "groq" ? "GROQ_API_KEY" : "OPENAI_API_KEY"} in .env`,
    );
  } else {
    // eslint-disable-next-line no-console
    console.info(`LLM provider: ${env.llm.provider} · model: ${env.llm.model}`);
  }

  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "test" ? "silent" : "info",
      redact: ["req.headers.authorization"],
    },
  });

  const builtFrontend = overrides.serveBuiltFrontend === false ? null : resolveBuiltFrontend();

  // The frontend is bundled by vite-plugin-singlefile, so its JS and CSS are
  // inlined into one HTML document. Serving that under helmet's default
  // `script-src 'self'` would leave the page blank — the browser refuses to
  // run inline scripts — so script-src is relaxed only when we are actually
  // serving that bundle. The API-only configuration keeps the strict default.
  await app.register(helmet, {
    contentSecurityPolicy: builtFrontend
      ? {
          useDefaults: true,
          directives: {
            "script-src": ["'self'", "'unsafe-inline'"],
            "connect-src": ["'self'"],
          },
        }
      : undefined,
  });
  await app.register(cors, { origin: env.CORS_ORIGIN });
  await app.register(rateLimit, { global: false });

  const investigationService = new InvestigationService(dataset.patternRepository, dataset.eventRepository);
  // Computed once at startup and served from memory thereafter — see
  // IssueIntelligenceService's class doc for why this never recomputes per request.
  const issueIntelligenceService = new IssueIntelligenceService(dataset.eventRepository, dataset.patternRepository);
  const aiCache = overrides.aiCache ?? new AICacheService(env.AI_CACHE_TTL_MS);
  const groqService =
    overrides.groqService ??
    new GroqService(
      env.llm.apiKey,
      env.llm.model,
      env.AI_TIMEOUT_MS,
      createChatCompletionsClient(env.llm),
    );

  if (builtFrontend) {
    await app.register(fastifyStatic, { root: builtFrontend.dir, index: false });
    app.get("/", (_request, reply) => {
      const file = builtFrontendFile();
      return file === null ? reply.callNotFound() : reply.sendFile(file);
    });
  }

  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(makeNotFoundHandler(builtFrontend ? builtFrontendFile : null));

  registerHealthRoutes(app);
  registerPatternRoutes(app, dataset.patternRepository);
  registerInvestigationRoutes(app, investigationService);
  registerIssueRoutes(app, issueIntelligenceService, dataset.patternRepository);
  registerEventRoutes(app, dataset.eventRepository);
  registerAiRoutes(app, { patternRepository: dataset.patternRepository, groqService, aiCache, env });
  registerIssueAiRoutes(app, { issueIntelligenceService, groqService, aiCache, env });

  // Component 2's timeline analyst. Loaded lazily so a missing streamgraph
  // dataset degrades to "this one route is absent" rather than failing the
  // whole server for the components that don't need it.
  // `in` rather than `??` so a test can pass an explicit null to disable this
  // route group without it being treated as "not supplied".
  const streamgraphService =
    "streamgraphAiService" in overrides
      ? overrides.streamgraphAiService
      : createStreamgraphAiService(groqService, app);
  if (streamgraphService) {
    registerStreamgraphAiRoutes(app, streamgraphService);
  }

  // Component 3's graph data is kept in the frontend package because it is
  // also bundled into the visualisation. The server reads the same canonical
  // files so the model never receives client-supplied facts.
  try {
    registerRelationshipAiRoutes(app, new RelationshipAiService(groqService, graphDataDir()), env.llm.model);
  } catch (err) {
    app.log.warn({ error: (err as Error).message }, "relationship graph dataset unavailable — /api/ai/analyse will not be registered");
  }

  return app;
}
