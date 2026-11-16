import { config, isAiConfigured } from "../config";
import { ApiError } from "../middleware/error-handler";
import { logger } from "../logger";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ProviderResult {
  content: string;
  model: string;
  latencyMs: number;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
}

/**
 * Adapter for any OpenAI-compatible chat-completions API. Configured by
 * default for Groq (`openai/gpt-oss-120b`); the route handler knows nothing
 * about the provider, so switching is an environment change, not a code
 * change. The API key lives only here, server-side.
 */
export async function requestChatCompletion(messages: ChatMessage[]): Promise<ProviderResult> {
  if (!isAiConfigured()) {
    throw new ApiError(503, "AI_NOT_CONFIGURED", "AI analysis is not configured on this server.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.ai.timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(`${config.ai.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.ai.apiKey}`,
      },
      body: JSON.stringify({
        model: config.ai.model,
        messages,
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });

    const latencyMs = Date.now() - startedAt;

    if (!response.ok) {
      // The provider's own error body may echo request details; log the
      // status only and never surface provider internals to the client.
      logger.warn({ status: response.status, latencyMs }, "ai provider returned an error status");
      throw new ApiError(503, "AI_PROVIDER_ERROR", "AI analysis is temporarily unavailable.");
    }

    const payload = (await response.json()) as ChatCompletionResponse;
    const content = payload.choices?.[0]?.message?.content;

    if (typeof content !== "string" || content.trim().length === 0) {
      throw new ApiError(503, "AI_EMPTY_RESPONSE", "AI analysis returned no usable content.");
    }

    return { content, model: config.ai.model, latencyMs };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiError(503, "AI_TIMEOUT", "The analysis request timed out. Try again with a narrower scope.");
    }
    logger.error({ err: error }, "ai provider request failed");
    throw new ApiError(503, "AI_PROVIDER_UNREACHABLE", "AI analysis is temporarily unavailable.");
  } finally {
    clearTimeout(timeout);
  }
}
