import Groq from "groq-sdk";
import { buildSystemPrompt } from "../prompts/pattern-analysis.prompt.js";
import { buildIssueSystemPrompt } from "../prompts/issue-analysis.prompt.js";
import type { GroqFactPayload } from "../types/Pattern.js";
import type { IssueEvidencePayload } from "../types/Issue.js";

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

/**
 * True for errors worth one bounded retry: transient network failure, 429,
 * or 5xx. A hard timeout is deliberately not retried — doing so doubles the
 * analyst's wait before the deterministic fallback can render.
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

  private assertConfigured(): void {
    if (!this.apiKey || /^<[^>]+>$/.test(this.apiKey.trim())) {
      throw new Error("No usable LLM API key is configured.");
    }
  }

  async analyzePattern(factPayload: GroqFactPayload): Promise<unknown> {
    this.assertConfigured();
    const call = () => this.callOnce(buildSystemPrompt(), factPayload, RESPONSE_JSON_SCHEMA);
    try {
      return await call();
    } catch (err) {
      if (isRetryableGroqError(err)) {
        return await call();
      }
      throw err;
    }
  }

  async analyzeIssue(evidencePayload: IssueEvidencePayload): Promise<unknown> {
    this.assertConfigured();
    const call = () => this.callOnce(buildIssueSystemPrompt(), evidencePayload, ISSUE_RESPONSE_JSON_SCHEMA);
    try {
      return await call();
    } catch (err) {
      if (isRetryableGroqError(err)) {
        return await call();
      }
      throw err;
    }
  }

  /**
   * Free-text completion for Component 2's timeline analyst, which wants
   * prose rather than the structured JSON the pattern/issue paths need.
   * Shares this class's client and retry policy so provider configuration
   * stays in exactly one place.
   */
  async completeText(messages: { role: "system" | "user" | "assistant"; content: string }[]): Promise<string> {
    this.assertConfigured();
    const call = async (): Promise<string> => {
      const completion = await this.client.chat.completions.create(
        { model: this.model, temperature: 0.2, max_tokens: 1024, messages },
        { timeout: this.timeoutMs },
      );
      const content = completion.choices?.[0]?.message?.content;
      if (!content) throw new GroqEmptyResponseError();
      return content;
    };

    try {
      return await call();
    } catch (err) {
      if (isRetryableGroqError(err)) {
        return await call();
      }
      throw err;
    }
  }

  /** Structured JSON completion for analyst features that render typed sections. */
  async completeStructured<T>(systemPrompt: string, payload: unknown, jsonSchema: Record<string, unknown>): Promise<T> {
    this.assertConfigured();
    const call = () => this.callOnce(systemPrompt, payload, jsonSchema) as Promise<T>;
    try {
      return await call();
    } catch (err) {
      if (isRetryableGroqError(err)) return await call();
      throw err;
    }
  }

  private async callOnce(systemPrompt: string, payload: unknown, jsonSchema: Record<string, unknown>): Promise<unknown> {
    const completion = await this.client.chat.completions.create(
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
