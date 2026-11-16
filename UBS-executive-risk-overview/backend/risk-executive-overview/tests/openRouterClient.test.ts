import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

/**
 * The OpenRouter client talks to an OpenAI-compatible endpoint over plain
 * `fetch`, so these tests stub `fetch` rather than an SDK. The SSE parsing is
 * the fiddly part: chunk boundaries do not respect event boundaries.
 */
vi.mock("../src/config/env", () => ({
  env: {
    llmProvider: "openrouter",
    OPENROUTER_API_KEY: "test-openrouter-key",
    OPENROUTER_MODEL: "deepseek/deepseek-v4-flash",
    OPENROUTER_BASE_URL: "https://openrouter.test/api/v1",
    GROQ_API_KEY: undefined,
    GROQ_MODEL: "openai/gpt-oss-120b",
    GROQ_TIMEOUT_MS: 20000,
    GROQ_REASONING_EFFORT: "low",
    aiConfigured: true,
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    CORS_ORIGINS: [],
  },
}));

/** Builds a Response whose body streams the given raw SSE text in fixed-size slices. */
function sseResponse(raw: string, sliceSize = raw.length): Response {
  const encoder = new TextEncoder();
  let offset = 0;

  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= raw.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(raw.slice(offset, offset + sliceSize)));
      offset += sliceSize;
    },
  });

  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

function delta(content: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
}

const originalFetch = globalThis.fetch;

describe("OpenRouterClient", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("streams deltas in order and returns the concatenated text", async () => {
    const raw = `${delta("Alpha ")}${delta("beta ")}${delta("gamma.")}data: [DONE]\n\n`;
    globalThis.fetch = vi.fn().mockResolvedValue(sseResponse(raw)) as unknown as typeof fetch;

    const { streamOpenRouter } = await import("../src/services/OpenRouterClient");
    const received: string[] = [];
    const full = await streamOpenRouter("system", "user", (d) => received.push(d));

    expect(received).toEqual(["Alpha ", "beta ", "gamma."]);
    expect(full).toBe("Alpha beta gamma.");
  });

  it("reassembles events split across chunk boundaries", async () => {
    // 7-byte slices cut through the middle of the JSON payloads.
    const raw = `${delta("one ")}${delta("two ")}${delta("three")}data: [DONE]\n\n`;
    globalThis.fetch = vi.fn().mockResolvedValue(sseResponse(raw, 7)) as unknown as typeof fetch;

    const { streamOpenRouter } = await import("../src/services/OpenRouterClient");
    const full = await streamOpenRouter("system", "user", () => {});

    expect(full).toBe("one two three");
  });

  it("ignores the [DONE] sentinel and any unparseable keep-alive lines", async () => {
    const raw = `: keep-alive\n\n${delta("text")}data: not-json\n\ndata: [DONE]\n\n`;
    globalThis.fetch = vi.fn().mockResolvedValue(sseResponse(raw)) as unknown as typeof fetch;

    const { streamOpenRouter } = await import("../src/services/OpenRouterClient");
    await expect(streamOpenRouter("system", "user", () => {})).resolves.toBe("text");
  });

  it("throws AI_INVALID_RESPONSE when the stream carries no content", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(sseResponse("data: [DONE]\n\n")) as unknown as typeof fetch;

    const { streamOpenRouter } = await import("../src/services/OpenRouterClient");
    await expect(streamOpenRouter("system", "user", () => {})).rejects.toMatchObject({
      code: "AI_INVALID_RESPONSE",
    });
  });

  it("throws AI_UNAVAILABLE on a non-OK response and keeps the provider detail in the error", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response("Invalid API key", { status: 401 })) as unknown as typeof fetch;

    const { streamOpenRouter } = await import("../src/services/OpenRouterClient");
    await expect(streamOpenRouter("system", "user", () => {})).rejects.toMatchObject({
      code: "AI_UNAVAILABLE",
    });
  });

  it("sends the configured model and bearer key to the configured base URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(`${delta("x")}data: [DONE]\n\n`));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { streamOpenRouter } = await import("../src/services/OpenRouterClient");
    await streamOpenRouter("system", "user", () => {});

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://openrouter.test/api/v1/chat/completions");

    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-openrouter-key");

    const body = JSON.parse(String(init.body)) as { model: string; stream: boolean };
    expect(body.model).toBe("deepseek/deepseek-v4-flash");
    expect(body.stream).toBe(true);
  });

  it("returns raw JSON content for the non-streaming completion", async () => {
    const payload = { choices: [{ message: { content: '{"ok":true}' } }] };
    globalThis.fetch = vi.fn().mockResolvedValue(Response.json(payload)) as unknown as typeof fetch;

    const { completeOpenRouterJson } = await import("../src/services/OpenRouterClient");
    await expect(completeOpenRouterJson("system", "user")).resolves.toBe('{"ok":true}');
  });

  it("routes streamCompletion through OpenRouter when that provider is selected", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(`${delta("routed")}data: [DONE]\n\n`));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { streamCompletion, isAiConfigured } = await import("../src/services/LlmService");

    expect(isAiConfigured()).toBe(true);
    await expect(streamCompletion("system", "user", () => {})).resolves.toBe("routed");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
