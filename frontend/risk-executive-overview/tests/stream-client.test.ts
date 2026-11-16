import { afterEach, describe, expect, it, vi } from "vitest";
import { streamPortfolioAnalysis, type StreamHandlers } from "../src/services/aiStreamClient";

const filters = { organisation: "Enterprise-wide", eventType: "All", severity: "All" } as const;
const event = (value: Record<string, unknown>, ending = "\n"): string => `data: ${JSON.stringify(value)}${ending}${ending}`;
function handlers(): StreamHandlers {
  return { onStart: vi.fn(), onSectionStart: vi.fn(), onDelta: vi.fn(), onSectionComplete: vi.fn(), onComplete: vi.fn(), onError: vi.fn() };
}
function fakeStream(chunks: string[], close = true) {
  const cancel = vi.fn();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new ReadableStream({
    start(controller) {
      for (const text of chunks) controller.enqueue(new TextEncoder().encode(text));
      if (close) controller.close();
    }, cancel,
  }))));
  return { cancel };
}
afterEach(() => vi.unstubAllGlobals());

describe("analysis stream lifecycle", () => {
  it("reports a truncated stream so controls can leave the running state", async () => {
    fakeStream([event({ type: "analysis_start", title: "Selected events", sections: [{ id: "analysis", title: "Analysis" }] }), event({ type: "section_delta", sectionId: "analysis", delta: "Partial explanation" })]);
    const callbacks = handlers();
    await streamPortfolioAnalysis("analyse", filters, callbacks);
    expect(callbacks.onDelta).toHaveBeenCalledWith("analysis", "Partial explanation");
    expect(callbacks.onError).toHaveBeenCalledOnce();
    expect(callbacks.onError).toHaveBeenCalledWith("The analysis stream ended before completion. Please retry.");
    expect(callbacks.onComplete).not.toHaveBeenCalled();
  });

  it("reports EOF before any complete event instead of silently succeeding", async () => {
    fakeStream(['data: {"type":"analysis_complete"']);
    const callbacks = handlers();
    await streamPortfolioAnalysis("analyse", filters, callbacks);
    expect(callbacks.onError).toHaveBeenCalledOnce();
    expect(callbacks.onComplete).not.toHaveBeenCalled();
  });

  it("finishes on the terminal event and cancels a transport that remains open", async () => {
    const { cancel } = fakeStream([event({ type: "analysis_complete", durationMs: 100, evidence: { eventCount: 10 } })], false);
    const callbacks = handlers();
    await streamPortfolioAnalysis("analyse", filters, callbacks);
    expect(callbacks.onComplete).toHaveBeenCalledOnce();
    expect(callbacks.onComplete).toHaveBeenCalledWith({ durationMs: 100, evidence: { eventCount: 10 } });
    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("accepts CRLF frames split across arbitrary transport chunks", async () => {
    const wire = event({ type: "section_delta", sectionId: "analysis", delta: "Current explanation" }, "\r\n") + event({ type: "analysis_complete", evidence: { eventCount: 1 } }, "\r\n");
    fakeStream([wire.slice(0, 8), wire.slice(8, 27), wire.slice(27, -1), wire.slice(-1)]);
    const callbacks = handlers();
    await streamPortfolioAnalysis("analyse", filters, callbacks);
    expect(callbacks.onDelta).toHaveBeenCalledOnce();
    expect(callbacks.onDelta).toHaveBeenCalledWith("analysis", "Current explanation");
    expect(callbacks.onComplete).toHaveBeenCalledOnce();
    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  it("stops at analysis_error and ignores any following deltas", async () => {
    fakeStream([event({ type: "analysis_error", message: "Analysis unavailable" }) + event({ type: "section_delta", sectionId: "analysis", delta: "Obsolete response" })]);
    const callbacks = handlers();
    await streamPortfolioAnalysis("analyse", filters, callbacks);
    expect(callbacks.onError).toHaveBeenCalledOnce();
    expect(callbacks.onError).toHaveBeenCalledWith("Analysis unavailable");
    expect(callbacks.onDelta).not.toHaveBeenCalled();
  });

  it("keeps intentional cancellation silent", async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("Cancelled", "AbortError")));
    const callbacks = handlers();
    await streamPortfolioAnalysis("analyse", filters, callbacks, controller.signal);
    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(callbacks.onComplete).not.toHaveBeenCalled();
  });
});
