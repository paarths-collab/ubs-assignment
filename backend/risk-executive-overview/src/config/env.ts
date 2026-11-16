import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  CORS_ORIGINS: z.string().default("http://localhost:5173"),

  GROQ_API_KEY: z.preprocess(blankToUndefined, z.string().trim().min(1).optional()),
  GROQ_MODEL: z.string().default("openai/gpt-oss-120b"),
  // Also bounds the OpenRouter client (OpenRouterClient.ts). Kept in step
  // with the stream-explorer backend and inside the function maxDuration.
  GROQ_TIMEOUT_MS: z.coerce.number().int().positive().default(45000),
  GROQ_REASONING_EFFORT: z.enum(["low", "medium", "high"]).default("low"),

  // OpenRouter is OpenAI-API-compatible, so it needs no extra SDK.
  LLM_PROVIDER: z.enum(["groq", "openrouter"]).optional(),
  OPENROUTER_API_KEY: z.preprocess(blankToUndefined, z.string().trim().min(1).optional()),
  OPENROUTER_MODEL: z.string().default("deepseek/deepseek-v4-flash"),
  OPENROUTER_BASE_URL: z.string().default("https://openrouter.ai/api/v1"),
});

function blankToUndefined(value: unknown): unknown {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}

function isUnset(value: string | undefined): boolean {
  return value === undefined || value.trim() === "";
}

/**
 * The stream-explorer backend names these settings differently, and on Vercel
 * one function (and one set of project env vars) hosts both apps. So when
 * this app's own name is unset, fall back to the shared name: CORS_ORIGIN
 * for CORS_ORIGINS, LLM_MODEL for the selected provider's model. This app's
 * own names always take precedence.
 */
function withSharedAliases(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const merged: NodeJS.ProcessEnv = { ...source };
  if (isUnset(source.CORS_ORIGINS) && !isUnset(source.CORS_ORIGIN)) {
    merged.CORS_ORIGINS = source.CORS_ORIGIN;
  }
  const keyVar = source.LLM_PROVIDER === "groq" ? "GROQ_API_KEY" : "OPENROUTER_API_KEY";
  if (isUnset(source[keyVar]) && !isUnset(source.LLM_API_KEY)) {
    merged[keyVar] = source.LLM_API_KEY;
  }
  if (source.LLM_PROVIDER !== "groq" && isUnset(source.OPENROUTER_BASE_URL) && !isUnset(source.LLM_BASE_URL)) {
    merged.OPENROUTER_BASE_URL = source.LLM_BASE_URL;
  }
  if (!isUnset(source.LLM_MODEL)) {
    // Only the model of the provider actually selected (default openrouter).
    const modelVar = source.LLM_PROVIDER === "groq" ? "GROQ_MODEL" : "OPENROUTER_MODEL";
    if (isUnset(source[modelVar])) merged[modelVar] = source.LLM_MODEL;
  }
  return merged;
}

/** Validates and shapes configuration from an environment-like object. Exported for tests. */
export function parseEnv(source: NodeJS.ProcessEnv) {
  const parsed = EnvSchema.safeParse(withSharedAliases(source));

  if (!parsed.success) {
    console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment configuration");
  }

  /** OpenRouter/DeepSeek is the default provider for the executive overview. */
  const llmProvider: "groq" | "openrouter" = parsed.data.LLM_PROVIDER ?? "openrouter";

  return {
    ...parsed.data,
    CORS_ORIGINS: parsed.data.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean),
    llmProvider,
    /** The AI features are usable only if the *selected* provider has a key. */
    aiConfigured:
      llmProvider === "openrouter" ? Boolean(parsed.data.OPENROUTER_API_KEY) : Boolean(parsed.data.GROQ_API_KEY),
  };
}

export const env = parseEnv(process.env);
