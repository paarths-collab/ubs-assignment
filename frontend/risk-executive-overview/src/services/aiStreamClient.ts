import type { FilterInput, RiskDetailSelection } from "../types";

export type AnalysisEndpoint = "deep-analysis" | "investigation-plan" | "enterprise-comparison";

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
 * `EventSource` is GET-only and the analysis needs a filters+selection body,
 * so this reads the response stream directly and parses the SSE framing —
 * events are `data: {json}` separated by a blank line.
 */
export async function streamAnalysis(
  endpoint: AnalysisEndpoint,
  filters: FilterInput,
  selection: RiskDetailSelection,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`/api/ai/${endpoint}/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filters, selection }),
      signal,
    });
  } catch (err) {
    handlers.onError(err instanceof Error ? err.message : "Could not reach the analysis service.");
    return;
  }

  if (!response.ok || !response.body) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    handlers.onError(body?.error?.message ?? `Analysis unavailable (HTTP ${response.status}).`);
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
