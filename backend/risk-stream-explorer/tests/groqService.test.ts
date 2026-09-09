import { describe, expect, it, vi } from "vitest";
import { GroqEmptyResponseError, GroqInvalidJsonError, GroqService, isRetryableGroqError, type GroqClientLike } from "../src/services/GroqService";
import { makeGroqFactPayload } from "./riskFixtures";

function fakeClient(create: GroqClientLike["chat"]["completions"]["create"]): GroqClientLike {
  return { chat: { completions: { create } } };
}

function completionWith(content: string) {
  return { choices: [{ message: { content } }] };
}

const VALID_JSON = JSON.stringify({
  interpretation: "x",
  investigationQuestions: ["a", "b", "c"],
  suggestedControl: "y",
  limitations: "z",
});

describe("isRetryableGroqError", () => {
  it("treats 429 and 5xx as retryable", () => {
    expect(isRetryableGroqError({ status: 429 })).toBe(true);
    expect(isRetryableGroqError({ status: 500 })).toBe(true);
    expect(isRetryableGroqError({ status: 503 })).toBe(true);
  });

  it("treats 400/401/404 as not retryable", () => {
    expect(isRetryableGroqError({ status: 400 })).toBe(false);
    expect(isRetryableGroqError({ status: 401 })).toBe(false);
    expect(isRetryableGroqError({ status: 404 })).toBe(false);
  });

  it("treats network-ish errors as retryable", () => {
    expect(isRetryableGroqError({ name: "APIConnectionError" })).toBe(true);
    expect(isRetryableGroqError({ name: "APIConnectionTimeoutError" })).toBe(true);
    expect(isRetryableGroqError({ code: "ECONNRESET" })).toBe(true);
    expect(isRetryableGroqError({ code: "ETIMEDOUT" })).toBe(true);
  });

  it("treats an unrelated error as not retryable", () => {
    expect(isRetryableGroqError(new Error("boom"))).toBe(false);
  });
});

describe("GroqService", () => {
  it("returns the parsed structured JSON on a successful call", async () => {
    const create = vi.fn().mockResolvedValue(completionWith(VALID_JSON));
    const service = new GroqService("key", "test-model", 5000, fakeClient(create));

    const result = await service.analyzePattern(makeGroqFactPayload());
    expect(result).toEqual(JSON.parse(VALID_JSON));
    expect(create).toHaveBeenCalledTimes(1);
    const [params] = create.mock.calls[0]!;
    expect(params.model).toBe("test-model");
    expect(params.response_format.type).toBe("json_schema");
  });

  it("throws GroqEmptyResponseError when Groq returns no content", async () => {
    const create = vi.fn().mockResolvedValue({ choices: [{ message: {} }] });
    const service = new GroqService("key", "m", 5000, fakeClient(create));
    await expect(service.analyzePattern(makeGroqFactPayload())).rejects.toBeInstanceOf(GroqEmptyResponseError);
  });

  it("throws GroqInvalidJsonError when Groq returns malformed JSON", async () => {
    const create = vi.fn().mockResolvedValue(completionWith("{not json"));
    const service = new GroqService("key", "m", 5000, fakeClient(create));
    await expect(service.analyzePattern(makeGroqFactPayload())).rejects.toBeInstanceOf(GroqInvalidJsonError);
  });

  it("retries exactly once on a 429 and succeeds on the second attempt", async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("rate limited"), { status: 429 }))
      .mockResolvedValueOnce(completionWith(VALID_JSON));
    const service = new GroqService("key", "m", 5000, fakeClient(create));

    const result = await service.analyzePattern(makeGroqFactPayload());
    expect(result).toEqual(JSON.parse(VALID_JSON));
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("does not retry a second time — two consecutive 5xx failures both propagate", async () => {
    const err = Object.assign(new Error("server error"), { status: 503 });
    const create = vi.fn().mockRejectedValue(err);
    const service = new GroqService("key", "m", 5000, fakeClient(create));

    await expect(service.analyzePattern(makeGroqFactPayload())).rejects.toThrow("server error");
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("never retries a 400 (bad request) error", async () => {
    const err = Object.assign(new Error("bad request"), { status: 400 });
    const create = vi.fn().mockRejectedValue(err);
    const service = new GroqService("key", "m", 5000, fakeClient(create));

    await expect(service.analyzePattern(makeGroqFactPayload())).rejects.toThrow("bad request");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("never retries a malformed-JSON (schema) error", async () => {
    const create = vi.fn().mockResolvedValue(completionWith("not json at all"));
    const service = new GroqService("key", "m", 5000, fakeClient(create));

    await expect(service.analyzePattern(makeGroqFactPayload())).rejects.toBeInstanceOf(GroqInvalidJsonError);
    expect(create).toHaveBeenCalledTimes(1);
  });
});
