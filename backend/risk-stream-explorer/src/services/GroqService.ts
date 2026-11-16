import Groq from "groq-sdk";
import { buildSystemPrompt } from "../prompts/pattern-analysis.prompt.js";
import { buildIssueSystemPrompt } from "../prompts/issue-analysis.prompt.js";
import type { GroqFactPayload } from "../types/Pattern.js";
import type { IssueEvidencePayload } from "../types/Issue.js";
import type { FallbackReason } from "../types/provenance.js";

/** Minimal surface this service needs from a Groq client — lets tests inject a fake without touching the network. */
export interface GroqClientLike {
  chat: {
    completions: {
      create(params: Record<string, unknown>, options?: { signal?: AbortSignal; timeout?: number }): Promise<{
        choices?: Array<{ message?: { content?: string | null } }>;
      }>;
    };
  };
}

/** Optional per-call overrides. `timeoutMs` can only lower the service timeout (used to honour an overall request budget). */
export interface CallOptions {
  timeoutMs?: number;
}

const RESPONSE_JSON_SCHEMA = {
  name: "pattern_analysis",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      strongestFinding: { type: "string" },
      whyItMayMatter: { type: "string" },
      supportingEvidence: { type: "string" },
      investigationHypothesis: { type: "string" },
      whatWouldDisproveThis: { type: "string" },
      interpretation: { type: "string" },
      investigationQuestions: {
        type: "array",
        items: { type: "string" },
        minItems: 3,
        maxItems: 5,
      },
      suggestedControl: { type: "string" },
      limitations: { type: "string" },
    },
    required: ["strongestFinding", "whyItMayMatter", "supportingEvidence", "investigationHypothesis", "whatWouldDisproveThis", "interpretation", "investigationQuestions", "suggestedControl", "limitations"],
  },
} as const;

const ISSUE_RESPONSE_JSON_SCHEMA = {
  name: "issue_analysis",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      strongestFinding: { type: "string" },
      interpretation: { type: "string" },
      supportingEvidence: { type: "string" },
      weakeningEvidence: { type: "string" },
      investigationHypothesis: { type: "string" },
      whatWouldDisproveThis: { type: "string" },
      whyItMayMatter: { type: "string" },
      investigationQuestions: {
        type: "array",
        items: { type: "string" },
        minItems: 3,
        maxItems: 5,
      },
      suggestedControl: { type: "string" },
      limitations: { type: "string" },
    },
    required: [
      "strongestFinding",
      "interpretation",
      "supportingEvidence",
      "weakeningEvidence",
      "investigationHypothesis",
      "whatWouldDisproveThis",
      "whyItMayMatter",
      "investigationQuestions",
      "suggestedControl",
      "limitations",
    ],
  },
} as const;

export class GroqEmptyResponseError extends Error {
  constructor() {
    super("Groq returned an empty completion");
    this.name = "GroqEmptyResponseError";
  }
}

export class GroqInvalidJsonError extends Error {
  constructor(cause: unknown) {
    super(`Groq response was not valid JSON: ${(cause as Error)?.message ?? String(cause)}`);
    this.name = "GroqInvalidJsonError";
  }
}

/** Why a provider call failed, in the vocabulary of {@link FallbackReason}. */
export type ProviderFailureReason = Extract<FallbackReason, "provider-not-configured" | "provider-timeout" | "provider-error">;

/**
 * Typed transport/provider failure. Routes branch on `reason` instead of
 * parsing messages: a missing key or a timeout is never retried, and the
 * reason is surfaced to the client as `fallbackReason` / `AI_UNAVAILABLE.reason`.
 * The message is the original provider message (never contains the API key).
 */
export class AiProviderError extends Error {
  readonly reason: ProviderFailureReason;
  readonly status?: number;
  constructor(reason: ProviderFailureReason, message: string, options?: { status?: number; cause?: unknown }) {
    super(message);
    this.name = "AiProviderError";
    this.reason = reason;
    if (options?.status !== undefined) this.status = options.status;
    if (options?.cause !== undefined) (this as { cause?: unknown }).cause = options.cause;
  }
}

/** True when the provider produced a response we cannot use (empty / non-JSON) — an output problem, not a transport problem. */
export function isUnusableOutputError(err: unknown): boolean {
  return err instanceof GroqEmptyResponseError || err instanceof GroqInvalidJsonError;
}

function looksLikeTimeout(err: unknown): boolean {
  const e = err as { name?: unknown; code?: unknown; status?: unknown; message?: unknown } | null;
  if (!e || typeof e !== "object") return false;
  if (e.name === "APIConnectionTimeoutError" || e.name === "AbortError" || e.name === "TimeoutError") return true;
  if (e.code === "ETIMEDOUT" || e.code === "ECONNABORTED" || e.code === "UND_ERR_CONNECT_TIMEOUT" || e.code === "UND_ERR_HEADERS_TIMEOUT" || e.code === "UND_ERR_BODY_TIMEOUT") return true;
  if (e.status === 408) return true;
  return typeof e.message === "string" && /\btime(?:d)?[ -]?out\b/i.test(e.message);
}

/**
 * Classifies any error thrown by a provider call. Output-shape errors
 * (empty/non-JSON completion) are returned unchanged so callers can treat
 * them as a rejected attempt rather than an outage.
 */
export function classifyProviderError(err: unknown): AiProviderError | Error {
  if (err instanceof AiProviderError) return err;
  if (isUnusableOutputError(err)) return err as Error;
  const message = (err as Error | null)?.message ?? String(err);
  const status = (err as { status?: unknown } | null)?.status;
  const options = { cause: err, ...(typeof status === "number" ? { status } : {}) };
  return new AiProviderError(looksLikeTimeout(err) ? "provider-timeout" : "provider-error", message, options);
}

/**
 * True for errors worth one bounded retry: transient network failure, 429,
 * or 5xx. A hard timeout is deliberately not retried — doing so doubles the
 * analyst's wait before the deterministic fallback can render. (Raw
 * connection-timeout errors still classify as retryable here; the service
 * itself checks for timeouts first and never retries them — see `withPolicy`.)
 */
export function isRetryableGroqError(err: unknown): boolean {
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === "number") {
    return status === 429 || status >= 500;
  }
  const name = (err as { name?: unknown } | null)?.name;
  if (name === "APIConnectionError" || name === "APIConnectionTimeoutError") {
    return true;
  }
  const code = (err as { code?: unknown } | null)?.code;
  return code === "ECONNRESET" || code === "ETIMEDOUT" || code === "ENOTFOUND" || code === "ECONNREFUSED";
}

/**
 * Thin wrapper over groq-sdk for the pattern-analysis structured-output call.
 * Owns exactly one concern beyond the raw HTTP call: a single bounded retry
 * on network failure/429/5xx (never on 400s or malformed-output errors,
 * which are the caller's problem to handle via regeneration/fallback).
 * Response validation (schema + no-hallucinated-IDs) is deliberately NOT
 * done here — that's AIValidationService's job, called by the route so it
 * can decide whether to regenerate or fall back.
 */
export class GroqService {
  private readonly client: GroqClientLike;
  private readonly apiKey: string;

  constructor(
    apiKey: string,
    private readonly model: string,
    private readonly timeoutMs: number,
    /**
     * Normally supplied by the composition root as the provider-agnostic
     * client from src/config/llm.ts (OpenRouter/OpenAI/Groq all speak the
     * same protocol). Falls back to groq-sdk only when nothing is injected.
     */
    client?: GroqClientLike,
  ) {
    this.apiKey = apiKey;
    this.client = client ?? (new Groq({ apiKey, maxRetries: 0 }) as unknown as GroqClientLike);
  }

  /** True when a usable API key is present. Checked before any network call. */
  isConfigured(): boolean {
    const key = this.apiKey.trim();
    return key !== "" && !/^<[^>]+>$/.test(key);
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new AiProviderError("provider-not-configured", "No usable LLM API key is configured.");
    }
  }

  /**
   * Runs `call` under the retry policy: a transient failure (429, 5xx,
   * connection reset) is retried once, but never a timeout, and the retry
   * only gets whatever is left of the per-request timeout so one request can
   * never cost more than `timeoutMs` of provider time. Output-shape errors
   * propagate unchanged; every other failure is rethrown as an `AiProviderError`.
   */
  private async withPolicy<T>(call: (timeoutMs: number) => Promise<T>, options?: CallOptions): Promise<T> {
    const budget = Math.min(this.timeoutMs, options?.timeoutMs ?? this.timeoutMs);
    const startedAt = Date.now();
    try {
      return await call(budget);
    } catch (err) {
      const typed = classifyProviderError(err);
      if (!(typed instanceof AiProviderError) || typed.reason === "provider-timeout") throw typed;
      const remaining = budget - (Date.now() - startedAt);
      if (isRetryableGroqError(err) && remaining > 0) {
        try {
          return await call(remaining);
        } catch (second) {
          throw classifyProviderError(second);
        }
      }
      throw typed;
    }
  }

  async analyzePattern(factPayload: GroqFactPayload, options?: CallOptions): Promise<unknown> {
    this.assertConfigured();
    return this.withPolicy((t) => this.callOnce(buildSystemPrompt(), factPayload, RESPONSE_JSON_SCHEMA, t), options);
  }

  async analyzeIssue(evidencePayload: IssueEvidencePayload, options?: CallOptions): Promise<unknown> {
    this.assertConfigured();
    return this.withPolicy((t) => this.callOnce(buildIssueSystemPrompt(), evidencePayload, ISSUE_RESPONSE_JSON_SCHEMA, t), options);
  }

  /**
   * Free-text completion for Component 2's timeline analyst, which wants
   * prose rather than the structured JSON the pattern/issue paths need.
   * Shares this class's client and retry policy so provider configuration
   * stays in exactly one place.
   */
  async completeText(messages: { role: "system" | "user" | "assistant"; content: string }[], options?: CallOptions): Promise<string> {
    this.assertConfigured();
    return this.withPolicy(async (timeoutMs) => {
      const completion = await this.createCompletion({ model: this.model, temperature: 0.2, max_tokens: 1024, messages }, timeoutMs);
      const content = completion.choices?.[0]?.message?.content;
      if (!content) throw new GroqEmptyResponseError();
      return content;
    }, options);
  }

  /** Structured JSON completion for analyst features that render typed sections. */
  async completeStructured<T>(systemPrompt: string, payload: unknown, jsonSchema: Record<string, unknown>, options?: CallOptions): Promise<T> {
    this.assertConfigured();
    return this.withPolicy((t) => this.callOnce(systemPrompt, payload, jsonSchema, t) as Promise<T>, options);
  }

  /**
   * One provider call with a hard deadline. The SDK `timeout` option is
   * passed through, but the deadline is also enforced here (and the request
   * aborted) so a client that ignores it cannot hang the route.
   */
  private async createCompletion(
    params: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<{ choices?: Array<{ message?: { content?: string | null } }> }> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new AiProviderError("provider-timeout", `LLM provider did not respond within ${timeoutMs} ms`));
      }, timeoutMs);
    });
    const request = this.client.chat.completions.create(params, { timeout: timeoutMs, signal: controller.signal });
    request.catch(() => undefined); // a late rejection after the deadline must not become an unhandled rejection
    try {
      return await Promise.race([request, deadline]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async callOnce(systemPrompt: string, payload: unknown, jsonSchema: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
    const completion = await this.createCompletion(
      {
        model: this.model,
        temperature: 0.2,
        max_tokens: 1600,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(payload) },
        ],
        response_format: { type: "json_schema", json_schema: jsonSchema },
      },
      timeoutMs,
    );

    const content = completion.choices?.[0]?.message?.content;
    if (!content) {
      throw new GroqEmptyResponseError();
    }
    try {
      return JSON.parse(content);
    } catch (err) {
      throw new GroqInvalidJsonError(err);
    }
  }
}
