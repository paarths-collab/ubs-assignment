/**
 * Single source of truth for which LLM provider the server talks to.
 *
 * Every provider used here (OpenRouter, Groq, OpenAI) speaks the same
 * OpenAI-compatible `chat/completions` protocol, so switching between them is
 * a base-URL + key + model-slug change and nothing else — no request or
 * response reshaping. `GroqClientLike` in GroqService.ts is already that
 * protocol's shape, so it consumes this config unchanged.
 *
 * To switch providers, set LLM_PROVIDER in .env. To use a provider this file
 * doesn't list, set LLM_BASE_URL/LLM_API_KEY/LLM_MODEL directly and they win.
 */

export type LlmProvider = "openrouter" | "groq" | "openai";

export interface LlmConfig {
  provider: LlmProvider;
  apiKey: string;
  baseURL: string;
  model: string;
  /** Sent by OpenRouter clients for leaderboard attribution; ignored by other providers. */
  referer: string;
  title: string;
}

interface ProviderDefaults {
  baseURL: string;
  model: string;
  keyVar: string;
}

/**
 * Model slugs are pinned rather than floating ("...-latest") so a graded
 * build can't silently change behaviour between when it's written and when
 * it's reviewed.
 */
const PROVIDER_DEFAULTS: Record<LlmProvider, ProviderDefaults> = {
  openrouter: {
    baseURL: "https://openrouter.ai/api/v1",
    model: "deepseek/deepseek-v4-flash-0731",
    keyVar: "OPENROUTER_API_KEY",
  },
  groq: {
    baseURL: "https://api.groq.com/openai/v1",
    model: "openai/gpt-oss-120b",
    keyVar: "GROQ_API_KEY",
  },
  openai: {
    baseURL: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    keyVar: "OPENAI_API_KEY",
  },
};

const DEFAULT_PROVIDER: LlmProvider = "openrouter";

function parseProvider(raw: string | undefined): LlmProvider {
  if (raw === undefined || raw.trim() === "") return DEFAULT_PROVIDER;
  const value = raw.trim().toLowerCase();
  if (value === "openrouter" || value === "groq" || value === "openai") return value;
  throw new Error(
    `Invalid LLM_PROVIDER: "${raw}". Expected one of: ${Object.keys(PROVIDER_DEFAULTS).join(", ")}`,
  );
}

function firstNonEmpty(...values: (string | undefined)[]): string {
  for (const value of values) {
    const trimmed = value?.trim();
    // Treat copied template markers as missing credentials. Otherwise the
    // server spends the full provider timeout making a guaranteed 401 call.
    if (trimmed !== undefined && trimmed !== "" && !/^<[^>]+>$/.test(trimmed)) return trimmed;
  }
  return "";
}

/**
 * Resolves provider config from the environment. An absent key is tolerated
 * here on purpose: the deterministic routes must keep serving without any LLM
 * credential at all, so the failure surfaces per-request in the AI path
 * (see `assertUsable`) rather than crashing the server at boot.
 */
export function loadLlmConfig(source: NodeJS.ProcessEnv = process.env): LlmConfig {
  const provider = parseProvider(source.LLM_PROVIDER);
  const defaults = PROVIDER_DEFAULTS[provider];

  return {
    provider,
    // Explicit LLM_* overrides win, then the provider's own key var, so an
    // existing GROQ_API_KEY keeps working untouched when provider=groq.
    apiKey: firstNonEmpty(source.LLM_API_KEY, source[defaults.keyVar]),
    baseURL: firstNonEmpty(source.LLM_BASE_URL, defaults.baseURL),
    // GROQ_MODEL is legacy and must never override an OpenRouter model.
    model: firstNonEmpty(source.LLM_MODEL, provider === "groq" ? source.GROQ_MODEL : undefined, defaults.model),
    referer: firstNonEmpty(source.LLM_REFERER, "http://localhost:3001"),
    title: firstNonEmpty(source.LLM_TITLE, "UBS Operational Risk Workbench"),
  };
}

/** Throws a message naming the exact env var to set, for surfacing to the caller. */
export function assertUsable(config: LlmConfig): void {
  if (config.apiKey === "") {
    const keyVar = PROVIDER_DEFAULTS[config.provider].keyVar;
    throw new Error(
      `No API key for LLM provider "${config.provider}". Set ${keyVar} (or LLM_API_KEY) in backend/risk-stream-explorer/.env`,
    );
  }
}

/**
 * Extra headers the provider expects. OpenRouter uses these for attribution
 * on its public leaderboards; sending them elsewhere is harmless but pointless.
 */
export function providerHeaders(config: LlmConfig): Record<string, string> {
  if (config.provider !== "openrouter") return {};
  return { "HTTP-Referer": config.referer, "X-Title": config.title };
}

/** The subset of the OpenAI client surface this project actually calls. */
export interface ChatCompletionsClient {
  chat: {
    completions: {
      create(
        params: Record<string, unknown>,
        options?: { signal?: AbortSignal; timeout?: number },
      ): Promise<{ choices?: Array<{ message?: { content?: string | null } }> }>;
    };
  };
}

/** Mirrors the SDK error shape closely enough for the existing retry predicate. */
class ChatCompletionsHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ChatCompletionsHttpError";
  }
}

/**
 * A `fetch`-based OpenAI-compatible chat client.
 *
 * We can't drive OpenRouter through groq-sdk: that client hardcodes an
 * `/openai/v1` path segment, so pointing its baseURL at OpenRouter produces
 * `openrouter.ai/api/v1/openai/v1/chat/completions` and a 404. Every provider
 * here exposes the identical `POST {baseURL}/chat/completions` contract, so
 * one small client covers all of them and keeps the path under our control.
 */
export function createChatCompletionsClient(config: LlmConfig): ChatCompletionsClient {
  const url = `${config.baseURL.replace(/\/+$/, "")}/chat/completions`;
  return {
    chat: {
      completions: {
        async create(params, options) {
          // Prefer the caller's signal; otherwise derive one from the timeout
          // so a hung provider can't pin a request open indefinitely.
          const controller = new AbortController();
          const timeout = options?.timeout;
          const timer =
            timeout === undefined ? null : setTimeout(() => controller.abort(), timeout);
          try {
            // OpenRouter models can default to expensive/high reasoning and
            // price-first provider selection. This application needs a short,
            // structured analyst response, so prefer the lowest-latency host
            // and explicitly keep reasoning bounded. Callers may still
            // override either setting by supplying their own values.
            const requestParams =
              config.provider === "openrouter"
                ? {
                    provider: { sort: "latency" },
                    reasoning: { effort: "low", exclude: true },
                    ...params,
                  }
                : params;
            const response = await fetch(url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${config.apiKey}`,
                ...providerHeaders(config),
              },
              body: JSON.stringify(requestParams),
              signal: options?.signal ?? controller.signal,
            });

            if (!response.ok) {
              const detail = (await response.text()).slice(0, 300);
              throw new ChatCompletionsHttpError(
                `${config.provider} request failed (${response.status}): ${detail}`,
                response.status,
              );
            }
            return (await response.json()) as {
              choices?: Array<{ message?: { content?: string | null } }>;
            };
          } finally {
            if (timer !== null) clearTimeout(timer);
          }
        },
      },
    },
  };
}
