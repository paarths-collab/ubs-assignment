import { describe, expect, it, vi } from "vitest";

// env.ts loads a local .env via dotenv/config at import time; keep the test
// hermetic by neutralising that, and feed parseEnv explicit objects instead.
vi.mock("dotenv/config", () => ({}));

const { parseEnv } = await import("../src/config/env");

describe("parseEnv shared-name fallbacks", () => {
  it("keeps the defaults when nothing is set", () => {
    const env = parseEnv({});
    expect(env.CORS_ORIGINS).toEqual(["http://localhost:5173"]);
    expect(env.OPENROUTER_MODEL).toBe("deepseek/deepseek-v4-flash");
    expect(env.GROQ_MODEL).toBe("openai/gpt-oss-120b");
  });

  it("uses CORS_ORIGIN when CORS_ORIGINS is unset", () => {
    const env = parseEnv({ CORS_ORIGIN: "https://a.example, https://b.example" });
    expect(env.CORS_ORIGINS).toEqual(["https://a.example", "https://b.example"]);
  });

  it("uses CORS_ORIGIN when CORS_ORIGINS is blank", () => {
    expect(parseEnv({ CORS_ORIGINS: "  ", CORS_ORIGIN: "https://a.example" }).CORS_ORIGINS).toEqual(["https://a.example"]);
  });

  it("lets CORS_ORIGINS take precedence over CORS_ORIGIN", () => {
    const env = parseEnv({ CORS_ORIGINS: "https://own.example", CORS_ORIGIN: "https://shared.example" });
    expect(env.CORS_ORIGINS).toEqual(["https://own.example"]);
  });

  it("uses LLM_MODEL for the OpenRouter model when OPENROUTER_MODEL is unset", () => {
    const env = parseEnv({ LLM_MODEL: "vendor/shared-model" });
    expect(env.OPENROUTER_MODEL).toBe("vendor/shared-model");
    expect(env.GROQ_MODEL).toBe("openai/gpt-oss-120b");
  });

  it("lets OPENROUTER_MODEL take precedence over LLM_MODEL", () => {
    const env = parseEnv({ OPENROUTER_MODEL: "vendor/own-model", LLM_MODEL: "vendor/shared-model" });
    expect(env.OPENROUTER_MODEL).toBe("vendor/own-model");
  });

  it("applies LLM_MODEL to the Groq model when Groq is the selected provider", () => {
    const env = parseEnv({ LLM_PROVIDER: "groq", LLM_MODEL: "vendor/shared-model" });
    expect(env.GROQ_MODEL).toBe("vendor/shared-model");
    expect(env.OPENROUTER_MODEL).toBe("deepseek/deepseek-v4-flash");
  });

  it("lets GROQ_MODEL take precedence over LLM_MODEL under Groq", () => {
    const env = parseEnv({ LLM_PROVIDER: "groq", GROQ_MODEL: "vendor/own-groq", LLM_MODEL: "vendor/shared-model" });
    expect(env.GROQ_MODEL).toBe("vendor/own-groq");
  });

  it("does not mutate the source object", () => {
    const source = { CORS_ORIGIN: "https://a.example", LLM_MODEL: "m/x" };
    parseEnv(source);
    expect(source).toEqual({ CORS_ORIGIN: "https://a.example", LLM_MODEL: "m/x" });
  });
});

describe("optional provider keys", () => {
  it("allows both blank keys from the shipped template in deterministic mode", () => {
    expect(parseEnv({ GROQ_API_KEY: "", OPENROUTER_API_KEY: "  " }).aiConfigured).toBe(false);
  });
  it("ignores an unused blank key when the selected provider has a key", () => {
    expect(parseEnv({ LLM_PROVIDER: "openrouter", GROQ_API_KEY: "", OPENROUTER_API_KEY: " test-key " })).toMatchObject({ aiConfigured: true, OPENROUTER_API_KEY: "test-key" });
    expect(parseEnv({ LLM_PROVIDER: "groq", GROQ_API_KEY: " test-key ", OPENROUTER_API_KEY: "" }).aiConfigured).toBe(true);
  });
});


describe("deployed shared AI settings", () => {
  it("accepts the shared server key for the selected provider", () => {
    expect(parseEnv({ LLM_API_KEY: "test-key" })).toMatchObject({ aiConfigured: true, OPENROUTER_API_KEY: "test-key" });
    expect(parseEnv({ LLM_PROVIDER: "groq", LLM_API_KEY: "test-groq" })).toMatchObject({ aiConfigured: true, GROQ_API_KEY: "test-groq" });
  });
  it("preserves explicit provider settings over shared fallbacks", () => {
    expect(parseEnv({ OPENROUTER_API_KEY: "provider-key", LLM_API_KEY: "shared-key", OPENROUTER_BASE_URL: "https://own.example/v1", LLM_BASE_URL: "https://shared.example/v1" })).toMatchObject({ OPENROUTER_API_KEY: "provider-key", OPENROUTER_BASE_URL: "https://own.example/v1" });
  });
  it("uses the shared compatible endpoint only for OpenRouter", () => {
    expect(parseEnv({ LLM_BASE_URL: "https://gateway.example/v1" }).OPENROUTER_BASE_URL).toBe("https://gateway.example/v1");
    expect(parseEnv({ LLM_PROVIDER: "groq", LLM_BASE_URL: "https://gateway.example/v1" }).OPENROUTER_BASE_URL).toBe("https://openrouter.ai/api/v1");
  });
  it("does not expose an unused provider's key as configured", () => {
    expect(parseEnv({ LLM_PROVIDER: "groq", OPENROUTER_API_KEY: "unused-key" }).aiConfigured).toBe(false);
  });
});
