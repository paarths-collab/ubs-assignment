import { loadLlmConfig, type LlmConfig } from "./llm";

export interface Env {
  /**
   * Resolved LLM provider (key, base URL, model). This is the source of
   * truth — see src/config/llm.ts. Providers are OpenAI-compatible, so
   * switching between OpenRouter/Groq/OpenAI is config only.
   */
  llm: LlmConfig;
  /**
   * @deprecated Kept so existing call sites (cache keys, log fields) keep
   * working. These now mirror `llm.apiKey` / `llm.model`, which means they
   * hold whichever provider is configured — not necessarily Groq. Prefer
   * `env.llm` in new code.
   */
  GROQ_API_KEY: string;
  GROQ_MODEL: string;
  PORT: number;
  CORS_ORIGIN: string[];
  AI_TIMEOUT_MS: number;
  AI_CACHE_TTL_MS: number;
  NODE_ENV: string;
}

const DEFAULT_PORT = 3001;
// Vite's singlefile plugin bundles the frontend into one portable HTML file
// meant to be opened directly (double-clicked, `file://`) as well as served
// by a dev/static server, so the allowlist covers both: the Vite dev server
// ports this project uses, the plain static-file preview port, and "null" —
// the literal Origin value browsers send for a `file://` page's fetch calls.
const DEFAULT_CORS_ORIGIN = "http://localhost:5173,http://localhost:5183,http://localhost:5187,http://localhost:5199,null";
/**
 * Raised from 15s: the issue follow-up route packs a large evidence payload
 * into its prompt and was intermittently aborting mid-call, which surfaced
 * as a 500. Stays well inside the deployed function's 60s `maxDuration`
 * (see vercel.json) so the platform never cuts the request first.
 */
const DEFAULT_AI_TIMEOUT_MS = 45_000;
const DEFAULT_AI_CACHE_TTL_MS = 3_600_000;

function parseOriginList(raw: string): string[] {
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function parsePositiveInt(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid ${name}: "${raw}" is not a positive number`);
  }
  return value;
}

/**
 * Reads and validates server configuration from `process.env`. The LLM API
 * key is read here and only here — it is never logged and never echoed in any
 * response. An empty key is tolerated at this layer (deterministic routes
 * must keep working without it); the AI service fails per-request instead.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const llm = loadLlmConfig(source);
  return {
    llm,
    GROQ_API_KEY: llm.apiKey,
    GROQ_MODEL: llm.model,
    PORT: parsePositiveInt(source.PORT, DEFAULT_PORT, "PORT"),
    CORS_ORIGIN: parseOriginList(
      source.CORS_ORIGIN && source.CORS_ORIGIN.length > 0 ? source.CORS_ORIGIN : DEFAULT_CORS_ORIGIN,
    ),
    AI_TIMEOUT_MS: parsePositiveInt(source.AI_TIMEOUT_MS, DEFAULT_AI_TIMEOUT_MS, "AI_TIMEOUT_MS"),
    AI_CACHE_TTL_MS: parsePositiveInt(source.AI_CACHE_TTL_MS, DEFAULT_AI_CACHE_TTL_MS, "AI_CACHE_TTL_MS"),
    NODE_ENV: source.NODE_ENV ?? "development",
  };
}
