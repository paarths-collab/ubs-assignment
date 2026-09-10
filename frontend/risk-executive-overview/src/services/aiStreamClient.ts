import type { FilterInput, RiskDetailSelection } from "../types";

export type AnalysisEndpoint = "deep-analysis" | "investigation-plan" | "enterprise-comparison";
export type PortfolioLens = "analyse" | "unusual" | "investigate";
export type FollowUpContext = "kpi" | "ai-analysis" | "attention" | "composition" | "exposure" | "organisations" | "issues" | "risk-brief";

export interface StreamHandlers {
  onStart: (info: { title: string; eventCount: number; organisationCount: number; sections: Array<{ id: string; title: string }> }) => void;
  onSectionStart: (sectionId: string, title: string) => void;
  onDelta: (sectionId: string, delta: string) => void;
  onSectionComplete: (sectionId: string) => void;
  onComplete: (info: { durationMs: number; evidence: { eventCount: number } }) => void;
  onError: (message: string) => void;
}

/**
 * Consumes the backend's SSE analysis stream.
 *
 * `EventSource` is GET-only and the analysis needs a request body, so this
 * reads the response stream directly and parses the SSE framing — events
 * are `data: {json}` separated by a blank line. Shared by every analysis
 * endpoint (per-issue and portfolio-wide) since the framing is identical;
 * only the URL and body shape differ.
 */
async function consumeStream(url: string, body: unknown, handlers: StreamHandlers, signal?: AbortSignal): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    handlers.onError(err instanceof Error ? err.message : "Could not reach the analysis service.");
    return;
  }

  if (!response.ok || !response.body) {
    const errorBody = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    handlers.onError(errorBody?.error?.message ?? `Analysis unavailable (HTTP ${response.status}).`);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // A chunk can split mid-event, so only complete blocks are dispatched
      // and the remainder stays buffered for the next read.
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        const line = block.split("\n").find((candidate) => candidate.startsWith("data: "));
        if (!line) continue;

        let event: Record<string, unknown>;
        try {
          event = JSON.parse(line.slice(6)) as Record<string, unknown>;
        } catch {
          continue;
        }

        dispatch(event, handlers);
      }
    }
  } catch (err) {
    if ((err as Error)?.name !== "AbortError") {
      handlers.onError(err instanceof Error ? err.message : "The analysis stream was interrupted.");
    }
  }
}

/** Per-issue analysis: Deep Analyse, Investigation Plan, Enterprise Comparison. */
export function streamAnalysis(
  endpoint: AnalysisEndpoint,
  filters: FilterInput,
  selection: RiskDetailSelection,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  return consumeStream(`/api/ai/${endpoint}/stream`, { filters, selection }, handlers, signal);
}

/** Portfolio-wide analysis of whatever the manager's current filters show — no selection involved. */
export function streamPortfolioAnalysis(
  lens: PortfolioLens,
  filters: FilterInput,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  return consumeStream("/api/ai/portfolio/stream", { filters, lens }, handlers, signal);
}

export function streamFollowUp(
  context: FollowUpContext,
  question: string,
  filters: FilterInput,
  selection: RiskDetailSelection | undefined,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  return consumeStream(
    "/api/ai/follow-up/stream",
    { context, question, filters, ...(selection ? { selection } : {}) },
    handlers,
    signal,
  );
}

function dispatch(event: Record<string, unknown>, handlers: StreamHandlers): void {
  switch (event.type) {
    case "analysis_start":
      handlers.onStart({
        title: String(event.title ?? ""),
        eventCount: Number(event.eventCount ?? 0),
        organisationCount: Number(event.organisationCount ?? 0),
        sections: (event.sections as Array<{ id: string; title: string }>) ?? [],
      });
      break;
    case "section_start":
      handlers.onSectionStart(String(event.sectionId), String(event.title ?? ""));
      break;
    case "section_delta":
      handlers.onDelta(String(event.sectionId), String(event.delta ?? ""));
      break;
    case "section_complete":
      handlers.onSectionComplete(String(event.sectionId));
      break;
    case "analysis_complete":
      handlers.onComplete({
        durationMs: Number(event.durationMs ?? 0),
        evidence: (event.evidence as { eventCount: number }) ?? { eventCount: 0 },
      });
      break;
    case "analysis_error":
      handlers.onError(String(event.message ?? "Analysis failed."));
      break;
  }
}
