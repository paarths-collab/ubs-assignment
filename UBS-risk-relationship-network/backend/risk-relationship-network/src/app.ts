import express from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config";
import { requestId } from "./middleware/request-id";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import { healthRouter } from "./routes/health";
import { aiRouter } from "./routes/ai";

/**
 * CORS is allow-listed rather than open. A page opened from disk sends
 * `Origin: null`, which is only honoured when explicitly enabled for local
 * testing of the self-contained HTML build.
 */
function corsOptions(): cors.CorsOptions {
  const allowed = new Set(config.cors.allowedOrigins);
  return {
    origin(origin, callback) {
      // Same-origin and non-browser callers (curl, tests) send no Origin.
      if (!origin) return callback(null, true);
      if (allowed.has(origin)) return callback(null, true);
      if (origin === "null" && config.cors.allowFileOrigin) return callback(null, true);
      return callback(null, false);
    },
    methods: ["GET", "POST"],
    maxAge: 600,
  };
}

export function createApp(): express.Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors(corsOptions()));
  app.use(requestId);
  app.use(express.json({ limit: config.limits.jsonBodyLimit }));

  app.use("/api", healthRouter);
  app.use("/api", aiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
