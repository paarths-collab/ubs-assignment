import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { env } from "./config/env";
import { generateRequestId, registerRequestId } from "./middleware/requestId";
import { registerErrorHandler } from "./middleware/errorHandler";
import { RiskRepository } from "./repositories/RiskRepository";
import { ActionsService } from "./services/ActionsService";
import { registerHealthRoute } from "./routes/health.route";
import { registerMetadataRoute } from "./routes/metadata.route";
import { registerOverviewRoute } from "./routes/overview.route";
import { registerPriorityRoute } from "./routes/priority.route";
import { registerRiskDetailRoute } from "./routes/risk-detail.route";
import { registerAiRoute } from "./routes/ai.route";
import { registerAiStreamRoutes } from "./routes/ai-stream.route";
import { registerActionsRoute } from "./routes/actions.route";

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
