import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load this package's own .env regardless of where the process was started
// from (repo root, workspace script, or the package directory), then let a
// cwd-local .env fill in anything still unset.
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config();

function readInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readList(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * Directory containing the four canonical brain JSON datasets. Defaults to
 * the frontend package's copy so both sides read the exact same bytes
 * without duplicating a multi-megabyte dataset in the repo.
 */
export function getBrainDataDir(): string {
  return process.env.BRAIN_DATA_DIR
    ? path.resolve(process.cwd(), process.env.BRAIN_DATA_DIR)
    : path.resolve(__dirname, "../../../frontend/risk-relationship-network/data");
}

export const config = {
  port: readInt("PORT", 3000),
  nodeEnv: process.env.NODE_ENV ?? "development",

  ai: {
    /** Never sent to the client, never logged. */
    apiKey: process.env.AI_API_KEY ?? "",
    /** Groq exposes an OpenAI-compatible API, so one adapter serves both. */
    baseUrl: process.env.AI_BASE_URL ?? "https://api.groq.com/openai/v1",
    model: process.env.AI_MODEL ?? "openai/gpt-oss-120b",
    timeoutMs: readInt("AI_TIMEOUT_MS", 20_000),
    maxEventSamples: readInt("MAX_AI_EVENT_SAMPLES", 30),
  },

  cors: {
    allowedOrigins: readList("ALLOWED_ORIGINS"),
    /** Opening dist/index.html from disk sends Origin: null — off by default. */
    allowFileOrigin: process.env.ALLOW_FILE_ORIGIN === "true",
  },

  rateLimit: {
    windowMs: readInt("AI_RATE_LIMIT_WINDOW_MS", 60_000),
    max: readInt("AI_RATE_LIMIT_MAX", 20),
  },

  limits: {
    maxEventIds: readInt("MAX_EVENT_IDS", 1000),
    maxQuestionLength: readInt("MAX_QUESTION_LENGTH", 500),
    jsonBodyLimit: process.env.JSON_BODY_LIMIT ?? "100kb",
  },
} as const;

export function isAiConfigured(): boolean {
  return config.ai.apiKey.length > 0;
}
