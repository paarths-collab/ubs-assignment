import Groq, { APIError, APIConnectionTimeoutError } from "groq-sdk";
import { env } from "../config/env";
import { PROMPT_VERSION } from "../config/constants";
import {
  MANAGER_INSIGHT_JSON_SCHEMA,
  ManagerInsightResponseSchema,
  type ManagerInsightResponse,
} from "../schemas/ai.schema";
import type { AiFactPackage } from "../types/AiFactPackage";
import { AppError } from "../utils/errors";

/**
 * Fixed system prompt for the Manager Assistant. This is the only place the
 * model's behavioural contract is defined — it must never calculate facts,
 * only explain the VERIFIED_FACTS package it's given, and must frame
 * repeated people as workflow concentration rather than blame.
 */
const SYSTEM_PROMPT = `You are a senior risk-management assistant supporting a manager reviewing synthetic enterprise risk-event data.

Use only the VERIFIED_FACTS supplied by the backend.

Never calculate, estimate, modify or invent:
- event counts
- severity counts
- financial amounts
- potential impact
- backlog
- recovery rates
- recurrence counts
- delay metrics
- Event IDs

Distinguish observed facts from interpretation.

If the supplied facts do not support a conclusion, explicitly state that the evidence is insufficient.

Repeated owners or assignees indicate workflow concentration only. Never attribute blame, misconduct, causation or poor performance to an individual.

Keep the output concise, factual and decision-oriented.

Return only the requested JSON structure.`;

let client: Groq | null = null;

function getClient(): Groq {
  if (!env.GROQ_API_KEY) {
    throw new AppError("AI_UNAVAILABLE", "AI assistant is not configured (missing GROQ_API_KEY).");
  }
  // Constructed once and reused; maxRetries is disabled here because retry
  // policy is handled explicitly below (exactly one retry, transient errors only).
  client ??= new Groq({ apiKey: env.GROQ_API_KEY, maxRetries: 0, timeout: env.GROQ_TIMEOUT_MS });
  return client;
}

const TRANSIENT_STATUS_CODES = new Set([429, 502, 503, 504]);

function isTransient(error: unknown): boolean {
  if (error instanceof APIConnectionTimeoutError) return true;
  if (error instanceof APIError && typeof error.status === "number") {
    return TRANSIENT_STATUS_CODES.has(error.status);
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retries transient failures (429/502/503/504/timeout) exactly once, with short backoff + jitter. Never retries validation or other 4xx errors. */
async function callWithOneRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (!isTransient(error)) throw error;
    await sleep(300 + Math.random() * 200);
    return fn();
  }
}

const responseCache = new Map<string, ManagerInsightResponse>();

function cacheKey(factPackage: AiFactPackage): string {
  return JSON.stringify({ factPackage, model: env.GROQ_MODEL, promptVersion: PROMPT_VERSION });
}

/** The model's own eventIds/patternId must be a subset of what it was actually given — never a superset. */
function validateEvidence(response: ManagerInsightResponse, factPackage: AiFactPackage): void {
  const allowedEventIds = new Set(factPackage.eventIds);
  const inventedEventIds = response.evidence.eventIds.filter((id) => !allowedEventIds.has(id));
  if (inventedEventIds.length > 0) {
    throw new AppError("AI_INVALID_RESPONSE", `Model referenced unsupported Event IDs: ${inventedEventIds.join(", ")}`);
  }

  if (response.evidence.patternId != null && response.evidence.patternId !== factPackage.patternId) {
    throw new AppError("AI_INVALID_RESPONSE", "Model referenced a pattern ID outside the verified fact package");
  }
}

export function isAiConfigured(): boolean {
  return env.aiConfigured;
}

/**
 * Streams a single completion, invoking `onDelta` per token chunk.
 *
 * Groq cannot combine Structured Outputs (JSON Schema) with streaming, so
 * streamed calls return prose and the *backend* owns the section boundaries
 * rather than relying on a schema-shaped response. The non-streaming
 * `generateManagerInsight` above keeps its JSON-schema contract precisely
 * because it does not stream.
 *
 * Retries are deliberately not applied here: a stream that fails partway has
 * already emitted tokens to the client, so silently restarting it would
 * duplicate visible text.
 */
export async function streamCompletion(
  systemPrompt: string,
  userPrompt: string,
  onDelta: (text: string) => void,
  reasoningEffort: "low" | "medium" | "high" = env.GROQ_REASONING_EFFORT,
): Promise<string> {
  const groq = getClient();
  let full = "";

  try {
    const stream = await groq.chat.completions.create({
      model: env.GROQ_MODEL,
      reasoning_effort: reasoningEffort,
      temperature: 0.3,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    for await (const chunk of stream) {
      const delta = chunk?.choices?.[0]?.delta?.content;
      if (delta) {
        full += delta;
        onDelta(delta);
      }
    }
  } catch (error) {
    throw new AppError(
      "AI_UNAVAILABLE",
      `Groq stream failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (full.trim().length === 0) {
    throw new AppError("AI_INVALID_RESPONSE", "Groq returned an empty stream");
  }

  return full;
}

/**
 * Sends only the verified fact package (never raw events, never the whole
 * dataset) to Groq and returns a validated structured explanation. Callers
 * must catch AppError("AI_UNAVAILABLE" | "AI_INVALID_RESPONSE") and fall
 * back gracefully — the factual Risk Detail response must never depend on
 * this succeeding.
 */
export async function generateManagerInsight(factPackage: AiFactPackage): Promise<ManagerInsightResponse> {
  const key = cacheKey(factPackage);
  const cached = responseCache.get(key);
  if (cached) return cached;

  const groq = getClient();

  let completion;
  try {
    completion = await callWithOneRetry(() =>
      groq.chat.completions.create({
        model: env.GROQ_MODEL,
        reasoning_effort: env.GROQ_REASONING_EFFORT,
        temperature: 0.2,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `VERIFIED_FACTS:\n${JSON.stringify(factPackage)}` },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "manager_insight", schema: MANAGER_INSIGHT_JSON_SCHEMA, strict: true },
        },
      }),
    );
  } catch (error) {
    throw new AppError(
      "AI_UNAVAILABLE",
      `Groq request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const rawContent = completion.choices[0]?.message?.content;
  if (!rawContent) {
    throw new AppError("AI_INVALID_RESPONSE", "Groq returned an empty response");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawContent);
  } catch {
    throw new AppError("AI_INVALID_RESPONSE", "Groq response was not valid JSON");
  }

  const validated = ManagerInsightResponseSchema.safeParse(parsedJson);
  if (!validated.success) {
    throw new AppError("AI_INVALID_RESPONSE", `Groq response failed schema validation: ${validated.error.message}`);
  }

  validateEvidence(validated.data, factPackage);

  responseCache.set(key, validated.data);
  return validated.data;
}
