import Groq from "groq-sdk";
import { buildSystemPrompt } from "../prompts/pattern-analysis.prompt";
import type { GroqFactPayload } from "../types/Pattern";

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

const RESPONSE_JSON_SCHEMA = {
  name: "pattern_analysis",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
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
    required: ["interpretation", "investigationQuestions", "suggestedControl", "limitations"],
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

/** True for errors worth one bounded retry: network failure, 429, or 5xx. Never for 400s or local parse/schema errors. */
export function isRetryableGroqError(err: unknown): boolean {
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === "number") {
    return status === 429 || status >= 500;
  }
  const name = (err as { name?: unknown } | null)?.name;
  if (name === "APIConnectionError" || name === "APIConnectionTimeoutError" || name === "AbortError") {
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

  constructor(
    apiKey: string,
    private readonly model: string,
    private readonly timeoutMs: number,
    client?: GroqClientLike,
  ) {
    this.client = client ?? (new Groq({ apiKey, maxRetries: 0 }) as unknown as GroqClientLike);
  }

  async analyzePattern(factPayload: GroqFactPayload): Promise<unknown> {
    try {
      return await this.callOnce(factPayload);
    } catch (err) {
      if (isRetryableGroqError(err)) {
        return await this.callOnce(factPayload);
      }
      throw err;
    }
  }

  private async callOnce(factPayload: GroqFactPayload): Promise<unknown> {
    const completion = await this.client.chat.completions.create(
      {
        model: this.model,
        temperature: 0.2,
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: JSON.stringify(factPayload) },
        ],
        response_format: { type: "json_schema", json_schema: RESPONSE_JSON_SCHEMA },
      },
      { timeout: this.timeoutMs },
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
