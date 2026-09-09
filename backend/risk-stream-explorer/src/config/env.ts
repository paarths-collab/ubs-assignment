export interface Env {
  GROQ_API_KEY: string;
  GROQ_MODEL: string;
  PORT: number;
  CORS_ORIGIN: string;
  AI_TIMEOUT_MS: number;
  AI_CACHE_TTL_MS: number;
  NODE_ENV: string;
}

const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";
const DEFAULT_PORT = 3001;
const DEFAULT_CORS_ORIGIN = "http://localhost:5173";
const DEFAULT_AI_TIMEOUT_MS = 15_000;
const DEFAULT_AI_CACHE_TTL_MS = 3_600_000;

function parsePositiveInt(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid ${name}: "${raw}" is not a positive number`);
  }
  return value;
}

/**
 * Reads and validates server configuration from `process.env`. The Groq key
 * is read here and only here — it is never logged and never echoed in any
 * response. An empty GROQ_API_KEY is tolerated at this layer (deterministic
 * routes must keep working without it); GroqService fails per-request instead.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return {
    GROQ_API_KEY: source.GROQ_API_KEY ?? "",
    GROQ_MODEL: source.GROQ_MODEL && source.GROQ_MODEL.length > 0 ? source.GROQ_MODEL : DEFAULT_GROQ_MODEL,
    PORT: parsePositiveInt(source.PORT, DEFAULT_PORT, "PORT"),
    CORS_ORIGIN: source.CORS_ORIGIN && source.CORS_ORIGIN.length > 0 ? source.CORS_ORIGIN : DEFAULT_CORS_ORIGIN,
    AI_TIMEOUT_MS: parsePositiveInt(source.AI_TIMEOUT_MS, DEFAULT_AI_TIMEOUT_MS, "AI_TIMEOUT_MS"),
    AI_CACHE_TTL_MS: parsePositiveInt(source.AI_CACHE_TTL_MS, DEFAULT_AI_CACHE_TTL_MS, "AI_CACHE_TTL_MS"),
    NODE_ENV: source.NODE_ENV ?? "development",
  };
}
