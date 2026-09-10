import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AICacheService } from "../src/services/AICacheService";

describe("AICacheService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("builds a key from patternId, promptVersion and model", () => {
    const cache = new AICacheService(1000);
    expect(cache.key("PAT-0001", "openai/gpt-oss-120b", "v1")).toBe("PAT-0001:v1:openai/gpt-oss-120b");
  });

  it("returns null for a miss and the stored value for a hit", () => {
    const cache = new AICacheService(60_000);
    expect(cache.get("missing")).toBeNull();

    cache.set("k1", { foo: "bar" });
    expect(cache.get("k1")).toEqual({ foo: "bar" });
    expect(cache.has("k1")).toBe(true);
  });

  it("expires entries after the configured TTL", () => {
    const cache = new AICacheService(1000);
    cache.set("k1", "value");
    expect(cache.get("k1")).toBe("value");

    vi.advanceTimersByTime(1001);
    expect(cache.get("k1")).toBeNull();
    expect(cache.has("k1")).toBe(false);
  });

  it("clear() empties the cache", () => {
    const cache = new AICacheService(60_000);
    cache.set("k1", "v1");
    cache.set("k2", "v2");
    expect(cache.size()).toBe(2);
    cache.clear();
    expect(cache.size()).toBe(0);
  });
});
