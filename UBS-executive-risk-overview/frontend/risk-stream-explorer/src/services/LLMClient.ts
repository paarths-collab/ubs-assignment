import type { EventInsightIntent, FilterState, Granularity, PeriodInsightIntent } from "@backend/index";

/**
 * Component 2 calls its own backend only — never an LLM provider directly,
 * and never holds an API key in the browser. The key lives server-side in
 * `.env` (see backend src/config/llm.ts), which is also what lets the
 * provider be switched (OpenRouter / Groq / OpenAI) without touching the UI.
 *
 * The request carries only *selection* input — which period, which event,
 * which filters. The server recomputes every number in the prompt itself, so
 * a tampered client cannot feed the model invented facts.
 *
 * `VITE_API_BASE_URL` is a build-time public value (just an origin), not a
 * secret.
 */
const DEV_API_ORIGIN = "http://localhost:3001";

/**
 * Three contexts to satisfy, hence no single hardcoded default:
 *  - Vite dev server (:5187): API is on another port, so an absolute origin.
 *  - Production build served by Fastify: same-origin, so a relative path —
 *    hardcoding :3001 here would break it whenever the server runs on any
 *    other port.
 *  - Single-file build opened from disk (file://): relative can't work, so
 *    fall back to the dev origin.
 */
function resolveApiBase(): string {
  const configured = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (import.meta.env.DEV) return DEV_API_ORIGIN;
  return window.location.protocol === "file:" ? DEV_API_ORIGIN : "";
}

const API_BASE = resolveApiBase();

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly kind: "network" | "not-found" | "unavailable" | "api",
  ) {
    super(message);
    this.name = "LLMError";
  }
}

interface AiTextResponse {
  status: "ok";
  text: string;
}

interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

async function postForText(path: string, body: unknown): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new LLMError(
      "Could not reach the analysis backend — is it running? (npm run dev:server)",
      "network",
    );
  }

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    let code: string | undefined;
    try {
      const parsed = (await response.json()) as ApiErrorBody;
      message = parsed?.error?.message ?? message;
      code = parsed?.error?.code;
    } catch {
      // Non-JSON error body — keep the status-code message.
    }
    if (response.status === 404) throw new LLMError(message, "not-found");
    if (response.status === 503 || code === "AI_UNAVAILABLE") throw new LLMError(message, "unavailable");
    throw new LLMError(message, "api");
  }

  const data = (await response.json()) as AiTextResponse;
  if (typeof data?.text !== "string" || data.text.length === 0) {
    throw new LLMError("The analysis service returned an empty response.", "api");
  }
  return data.text;
}

export function analysePeriod(
  intent: PeriodInsightIntent,
  granularity: Granularity,
  periodId: string,
  filters: FilterState,
  question?: string,
  focusSection?: string,
): Promise<string> {
  return postForText("/api/ai/streamgraph/period", { intent, granularity, periodId, filters, ...(question ? { question, focusSection } : {}) });
}

export function analyseEvent(
  intent: EventInsightIntent,
  eventId: string,
  filters: FilterState,
  question?: string,
  focusSection?: string,
): Promise<string> {
  return postForText("/api/ai/streamgraph/event", { intent, eventId, filters, ...(question ? { question, focusSection } : {}) });
}
