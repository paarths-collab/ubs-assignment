import pino from "pino";
import { config } from "./config";

/**
 * Structured logging. Secrets and full prompts are deliberately never
 * logged — only identifiers, timings, and scope sizes.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (config.nodeEnv === "test" ? "silent" : "info"),
  redact: {
    paths: ["req.headers.authorization", "headers.authorization", "apiKey", "*.apiKey"],
    remove: true,
  },
});
