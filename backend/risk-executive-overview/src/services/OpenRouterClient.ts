import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";

/**
 * OpenRouter exposes an OpenAI-compatible Chat Completions API, so this
 * talks to it over plain `fetch` rather than pulling in another SDK.
 *
 * Note on structured output: JSON Schema support varies by the model you
 * route to, so the schema is requested *and* restated in the prompt, and the
 * caller's Zod validation still enforces the actual shape. Asking for a bare
 * `json_object` without naming the fields is not enough — the model then
 * returns well-formed JSON in a shape of its own invention, which fails
 * validation and degrades the endpoint to its fallback response.
 */
function requireKey(): string {
  const key = env.OPENROUTER_API_KEY;
  if (!key) {
    throw new AppError("AI_UNAVAILABLE", "AI assistant is not configured (missing OPENROUTER_API_KEY).");
  }
  return key;
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${requireKey()}`,
    "Content-Type": "application/json",
    // Optional attribution headers OpenRouter uses for its rankings.
    "X-Title": "UBS Executive Risk Overview",
  };
}

async function failure(response: Response): Promise<AppError> {
  // The body can carry provider detail; it is surfaced to the caller as an
  // AppError message and logged, never streamed to the browser.
  const text = await response.text().catch(() => "");
  return new AppError("AI_UNAVAILABLE", `OpenRouter request failed (${response.status}): ${text.slice(0, 300)}`);
}

export function isOpenRouterConfigured(): boolean {
  return Boolean(env.OPENROUTER_API_KEY);
}

/**
 * Restates the required shape in the prompt. Belt-and-braces alongside the
 * `response_format` parameter: a model that silently ignores the parameter
 * still has the field names in front of it, which is the difference between
 * a usable answer and a schema-validation failure.
 */
function withSchemaInstruction(systemPrompt: string, jsonSchema?: { name: string; schema: unknown }): string {
  if (jsonSchema === undefined) return systemPrompt;
  return `${systemPrompt}\n\nReturn a single JSON object matching this JSON Schema exactly. Include every required property and add no others:\n${JSON.stringify(jsonSchema.schema)}`;
}

/**
 * Non-streaming JSON completion. Returns the raw message content for the
 * caller to parse and validate.
 *
 * `jsonSchema` is the OpenAI-style JSON Schema for the expected response.
 * It is sent as a `json_schema` response format for models that honour it,
 * and appended to the system prompt so models that ignore the parameter
 * still see the required field names.
 */
export async function completeOpenRouterJson(
  systemPrompt: string,
  userPrompt: string,
  jsonSchema?: { name: string; schema: unknown },
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.GROQ_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${env.OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: headers(),
      signal: controller.signal,
      body: JSON.stringify({
        model: env.OPENROUTER_MODEL,
        temperature: 0.2,
        response_format:
          jsonSchema === undefined
            ? { type: "json_object" }
            : { type: "json_schema", json_schema: { ...jsonSchema, strict: true } },
        messages: [
          { role: "system", content: withSchemaInstruction(systemPrompt, jsonSchema) },
          { role: "user", content: userPrompt },
        ],
      }),
    });
  } catch (error) {
    throw new AppError(
      "AI_UNAVAILABLE",
      `OpenRouter request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) throw await failure(response);

  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new AppError("AI_INVALID_RESPONSE", "OpenRouter returned an empty response");

  return content;
}

/**
 * Streams a completion, invoking `onDelta` per token chunk. Parses the
 * OpenAI-style SSE framing: `data: {json}` lines terminated by `data: [DONE]`.
 */
export async function streamOpenRouter(
  systemPrompt: string,
  userPrompt: string,
  onDelta: (text: string) => void,
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${env.OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        model: env.OPENROUTER_MODEL,
        temperature: 0.3,
        stream: true,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });
  } catch (error) {
    throw new AppError(
      "AI_UNAVAILABLE",
      `OpenRouter stream failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!response.ok) throw await failure(response);
  if (!response.body) throw new AppError("AI_UNAVAILABLE", "OpenRouter returned no response body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // A chunk can split mid-event, so only complete blocks are consumed
      // and the remainder stays buffered for the next read.
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        for (const line of block.split("\n")) {
          if (!line.startsWith("data: ")) continue;

          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              full += delta;
              onDelta(delta);
            }
          } catch {
            // OpenRouter interleaves comment/keep-alive lines; skip anything unparseable.
          }
        }
      }
    }
  } catch (error) {
    throw new AppError(
      "AI_UNAVAILABLE",
      `OpenRouter stream interrupted: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (full.trim().length === 0) {
    throw new AppError("AI_INVALID_RESPONSE", "OpenRouter returned an empty stream");
  }

  return full;
}
