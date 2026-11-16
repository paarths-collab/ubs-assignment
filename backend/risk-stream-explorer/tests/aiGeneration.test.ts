import { describe, expect, it, vi } from "vitest";

import {
  generateValidated,
  validateFollowUpAnswer,
  validateGroqIssueResult,
  validateGroqResult,
  type Verdict,
} from "../src/services/AIValidationService";
import { AiProviderError, GroqEmptyResponseError, GroqService, classifyProviderError, type GroqClientLike } from "../src/services/GroqService";
import { makeGroqFactPayload } from "./riskFixtures";

const accept: Verdict<string> = { valid: true, value: "ok", checks: ["schema"] };
const reject: Verdict<string> = { valid: false, reason: "bad", failures: ["ungrounded-number:42%"] };

function fakeClient(create: GroqClientLike["chat"]["completions"]["create"]): GroqClientLike {
  return { chat: { completions: { create } } };
}

describe("GroqService provider failures", () => {
  it("throws a typed provider-not-configured error before any network call", async () => {
    const create = vi.fn();
    for (const key of ["", "   ", "<your-key>"]) {
      const service = new GroqService(key, "m", 1000, fakeClient(create));
      expect(service.isConfigured()).toBe(false);
      await expect(service.analyzePattern(makeGroqFactPayload())).rejects.toMatchObject({ name: "AiProviderError", reason: "provider-not-configured" });
      await expect(service.completeStructured("s", {}, {})).rejects.toBeInstanceOf(AiProviderError);
      await expect(service.completeText([{ role: "user", content: "x" }])).rejects.toBeInstanceOf(AiProviderError);
    }
    expect(create).not.toHaveBeenCalled();
  });

  it("classifies a timeout and does not retry it", async () => {
    const create = vi.fn().mockRejectedValue(Object.assign(new Error("Request timed out."), { name: "APIConnectionTimeoutError" }));
    const service = new GroqService("key", "m", 1000, fakeClient(create));
    await expect(service.completeStructured("s", {}, {})).rejects.toMatchObject({ reason: "provider-timeout" });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("enforces its own deadline when the client never settles, and aborts the request", async () => {
    let seenSignal: AbortSignal | undefined;
    const create = vi.fn().mockImplementation((_params: unknown, options?: { signal?: AbortSignal }) => {
      seenSignal = options?.signal;
      return new Promise(() => undefined);
    });
    const service = new GroqService("key", "m", 30, fakeClient(create));
    await expect(service.completeStructured("s", {}, {})).rejects.toMatchObject({ reason: "provider-timeout" });
    expect(seenSignal?.aborted).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("lets a caller lower (never raise) the per-call timeout", async () => {
    const create = vi.fn().mockImplementation(() => new Promise(() => undefined));
    const service = new GroqService("key", "m", 10_000, fakeClient(create));
    const started = Date.now();
    await expect(service.completeStructured("s", {}, {}, { timeoutMs: 25 })).rejects.toMatchObject({ reason: "provider-timeout" });
    expect(Date.now() - started).toBeLessThan(2000);
    expect(create.mock.calls[0]![1]).toMatchObject({ timeout: 25 });
  });

  it("keeps the original message on a provider error and still retries a transient 5xx once", async () => {
    const create = vi.fn().mockRejectedValue(Object.assign(new Error("upstream exploded"), { status: 502 }));
    const service = new GroqService("key", "m", 1000, fakeClient(create));
    await expect(service.completeStructured("s", {}, {})).rejects.toMatchObject({ reason: "provider-error", message: "upstream exploded", status: 502 });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("leaves output-shape errors unclassified so callers can treat them as rejected attempts", () => {
    const err = new GroqEmptyResponseError();
    expect(classifyProviderError(err)).toBe(err);
  });
});

describe("generateValidated (bounded retry policy)", () => {
  const base = { maxAttempts: 2, providerTimeoutMs: 45_000, totalBudgetMs: 50_000 };

  it("does not retry after provider-not-configured or provider-timeout", async () => {
    for (const reason of ["provider-not-configured", "provider-timeout"] as const) {
      const call = vi.fn().mockRejectedValue(new AiProviderError(reason, "x"));
      const outcome = await generateValidated({ ...base, call, validate: () => accept });
      expect(outcome).toMatchObject({ kind: "provider-failure", reason, attempts: 1 });
      expect(call).toHaveBeenCalledTimes(1);
    }
  });

  it("retries only after a validation failure, at most maxAttempts times", async () => {
    const call = vi.fn().mockResolvedValue({});
    const outcome = await generateValidated({ ...base, call, validate: () => reject });
    expect(outcome).toEqual({ kind: "validation-failed", attempts: 2, rejectedAttempts: 2, failures: ["ungrounded-number:42%"] });
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("reports the previous rejection when the retry succeeds", async () => {
    const call = vi.fn().mockResolvedValue({});
    const validate = vi.fn().mockReturnValueOnce(reject).mockReturnValueOnce(accept);
    const outcome = await generateValidated({ ...base, call, validate });
    expect(outcome).toMatchObject({ kind: "valid", rejectedAttempts: 1, lastRejection: ["ungrounded-number:42%"] });
  });

  it("skips a second attempt that could not finish inside the remaining budget, and caps the timeout it does grant", async () => {
    let clock = 0;
    const timeouts: number[] = [];
    // First attempt takes 30s of a 50s budget: 20s left < 30s needed -> no retry.
    const slow = vi.fn().mockImplementation(async ({ timeoutMs }: { timeoutMs: number }) => {
      timeouts.push(timeoutMs);
      clock += 30_000;
      return {};
    });
    const skipped = vi.fn();
    const outcome = await generateValidated({ ...base, call: slow, validate: () => reject, now: () => clock, onRetrySkipped: skipped });
    expect(outcome.kind).toBe("validation-failed");
    expect(slow).toHaveBeenCalledTimes(1);
    expect(skipped).toHaveBeenCalledWith({ nextAttempt: 2, remainingMs: 20_000, lastAttemptMs: 30_000 });

    // A fast first attempt (5s) leaves 45s: the retry runs, with its timeout capped by what is left.
    clock = 0;
    timeouts.length = 0;
    const fast = vi.fn().mockImplementation(async ({ timeoutMs }: { timeoutMs: number }) => {
      timeouts.push(timeoutMs);
      clock += 5_000;
      return {};
    });
    await generateValidated({ ...base, totalBudgetMs: 49_000, call: fast, validate: () => reject, now: () => clock });
    expect(fast).toHaveBeenCalledTimes(2);
    expect(timeouts).toEqual([45_000, 44_000]);
  });

  it("treats an empty completion as a rejected attempt rather than an outage", async () => {
    const call = vi.fn().mockRejectedValue(new GroqEmptyResponseError());
    const outcome = await generateValidated({ ...base, call, validate: () => accept });
    expect(outcome).toEqual({ kind: "validation-failed", attempts: 2, rejectedAttempts: 2, failures: ["unusable-output:empty"] });
  });
});

describe("validation outcome contract", () => {
  const evidence = { observed: { event_count: 4, high_rate: 0.5 }, matching_event_ids: ["SIM-0000025"] };
  const grounding = { evidence, knownEventIds: ["SIM-0000025", "SIM-0000130"] };
  const ISSUE = {
    strongestFinding: "A finding.",
    whyItMayMatter: "It may matter.",
    supportingEvidence: "Support.",
    weakeningEvidence: "Weakening.",
    investigationHypothesis: "A hypothesis.",
    whatWouldDisproveThis: "Disproof.",
    investigationQuestions: ["What changed?", "Which evidence would challenge this?"],
    suggestedControl: "A control.",
    limitations: "Synthetic.",
  };

  it("lists schema plus grounding checks on success and stable failure strings on rejection", () => {
    const ok = validateGroqIssueResult(ISSUE, ["SIM-0000025"], grounding);
    expect(ok).toMatchObject({ valid: true, checks: ["schema", "event-ids", "numeric-grounding"] });

    const bad = validateGroqIssueResult({ ...ISSUE, supportingEvidence: "SIM-0000130 shows 37% of 4 events." }, ["SIM-0000025"], grounding);
    expect(bad).toMatchObject({ valid: false, failures: ["out-of-scope-event-id:SIM-0000130", "ungrounded-number:37%", "unverified-quantitative-claim:4 events"] });
  });

  it("reports schema failures as schema-invalid:<field>", () => {
    const bad = validateGroqResult({ strongestFinding: "x" }, []);
    expect(bad.valid).toBe(false);
    if (!bad.valid) expect(bad.failures).toContain("schema-invalid:interpretation");
  });

  it("validates follow-up answers with the same grounding rules", () => {
    expect(validateFollowUpAnswer({ answer: "The matching events share a handoff step, per the evidence." }, ["SIM-0000025"], grounding)).toMatchObject({ valid: true });
    expect(validateFollowUpAnswer({ answer: "short" }, ["SIM-0000025"], grounding)).toMatchObject({ valid: false, failures: ["schema-invalid:answer"] });
    expect(validateFollowUpAnswer({ answer: "SIM-9999999 caused 99% of losses overall." }, ["SIM-0000025"], grounding)).toMatchObject({
      valid: false,
      failures: ["unknown-event-id:SIM-9999999", "ungrounded-number:99%"],
    });
  });
});
