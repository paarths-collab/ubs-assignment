import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { env } from "./config/env.js";
import { generateRequestId, registerRequestId } from "./middleware/requestId.js";
import { registerErrorHandler } from "./middleware/errorHandler.js";
import { RiskRepository } from "./repositories/RiskRepository.js";
import { ActionsService } from "./services/ActionsService.js";
import { registerHealthRoute } from "./routes/health.route.js";
import { registerMetadataRoute } from "./routes/metadata.route.js";
import { registerOverviewRoute } from "./routes/overview.route.js";
import { registerPriorityRoute } from "./routes/priority.route.js";
import { registerRiskDetailRoute } from "./routes/risk-detail.route.js";
import { registerAiRoute } from "./routes/ai.route.js";
import { registerAiStreamRoutes } from "./routes/ai-stream.route.js";
import { registerActionsRoute } from "./routes/actions.route.js";

const MAX_BODY_BYTES = 1_000_000;

export interface BuildAppOptions {
  repository?: RiskRepository;
  actionsService?: ActionsService;
}

/**
 * Builds (but does not start) the Fastify app. Data loading and startup
 * validation happen the moment `RiskRepository` is constructed — a bad
 * dataset fails here, before the server ever binds a port.
 */
export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const repository = options.repository ?? new RiskRepository();
  const actionsService = options.actionsService ?? new ActionsService();

  const app = Fastify({
    logger: { level: env.LOG_LEVEL },
    genReqId: generateRequestId,
    bodyLimit: MAX_BODY_BYTES,
  });

  app.register(cors, { origin: env.CORS_ORIGINS });

  registerRequestId(app);
  registerErrorHandler(app);

  registerHealthRoute(app, repository);
  registerMetadataRoute(app, repository);
  registerOverviewRoute(app, repository);
  registerPriorityRoute(app, repository);
  registerRiskDetailRoute(app, repository);
  registerAiRoute(app, repository);
  registerAiStreamRoutes(app, repository);
  registerActionsRoute(app, actionsService);

  return app;
}
