import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  CORS_ORIGINS: z.string().default("http://localhost:5173"),

  GROQ_API_KEY: z.string().min(1).optional(),
  GROQ_MODEL: z.string().default("openai/gpt-oss-120b"),
  GROQ_TIMEOUT_MS: z.coerce.number().int().positive().default(20000),
  GROQ_REASONING_EFFORT: z.enum(["low", "medium", "high"]).default("low"),

  // OpenRouter is OpenAI-API-compatible, so it needs no extra SDK.
  LLM_PROVIDER: z.enum(["groq", "openrouter"]).optional(),
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  OPENROUTER_MODEL: z.string().default("deepseek/deepseek-chat"),
  OPENROUTER_BASE_URL: z.string().default("https://openrouter.ai/api/v1"),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration");
}

/** Explicit choice wins; otherwise an OpenRouter key implies OpenRouter. */
const llmProvider: "groq" | "openrouter" =
  parsed.data.LLM_PROVIDER ?? (parsed.data.OPENROUTER_API_KEY ? "openrouter" : "groq");

export const env = {
  ...parsed.data,
  CORS_ORIGINS: parsed.data.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean),
  llmProvider,
  /** The AI features are usable only if the *selected* provider has a key. */
  aiConfigured:
    llmProvider === "openrouter" ? Boolean(parsed.data.OPENROUTER_API_KEY) : Boolean(parsed.data.GROQ_API_KEY),
};
