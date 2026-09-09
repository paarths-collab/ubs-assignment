const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "openai/gpt-oss-120b";

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly kind: "no-key" | "auth" | "rate-limit" | "network" | "api",
  ) {
    super(message);
    this.name = "LLMError";
  }
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Thin client over Groq's OpenAI-compatible chat completions endpoint. This
 * is a genuine live network call, made directly from the browser with a key
 * the viewer supplies themselves (never embedded in this file) — used only
 * because the user explicitly asked for a live LLM integration in place of
 * the offline deterministic narrator.
 */
export async function askLLM(apiKey: string, messages: ChatMessage[]): Promise<string> {
  if (!apiKey) {
    throw new LLMError("No Groq API key set.", "no-key");
  }

  let response: Response;
  try {
    response = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        max_tokens: 1024,
        temperature: 0.2,
      }),
    });
  } catch {
    throw new LLMError(
      "Could not reach Groq — check your internet connection.",
      "network",
    );
  }

  if (response.status === 401) {
    throw new LLMError("Groq rejected the API key. Check it and try again.", "auth");
  }
  if (response.status === 429) {
    throw new LLMError("Groq rate limit hit — wait a moment and try again.", "rate-limit");
  }
  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.json();
      detail = body?.error?.message ?? "";
    } catch {
      // ignore — fall through to generic message
    }
    throw new LLMError(`Groq request failed (${response.status})${detail ? `: ${detail}` : "."}`, "api");
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || text.length === 0) {
    throw new LLMError("Groq returned an empty response.", "api");
  }
  return text;
}
