import { fetchAiAnalysis, ApiError } from "../services/PatternApiClient";
import type { AiPatternResponse, ObservedFacts } from "../types/pattern";
import { el } from "./dom";

function observedRecap(observed: ObservedFacts): HTMLElement {
  const o = observed.observed;
  return el("div", { className: "panel-subsection" }, [
    el("div", { className: "panel-subsection__title" }, ["Observed (deterministic — not from Groq)"]),
    el("div", { className: "ai-answer__text" }, [
      `${o.event_count} events · ${o.high_rate_pct.toFixed(1)}% High (${o.high_rate_lift.toFixed(2)}x enterprise) · ${o.open_events} open · priority ${observed.priorityLevel}.`,
    ]),
  ]);
}

function aiBlock(label: string, content: HTMLElement): HTMLElement {
  return el("div", {}, [
    el("div", { className: "ai-answer__block-label" }, [label, el("span", { className: "ai-source-tag" }, ["— Groq"])]),
    content,
  ]);
}

function renderSuccess(container: HTMLElement, response: AiPatternResponse & { status: "ok" }, onOpenEvent: (eventId: string) => void): void {
  container.innerHTML = "";
  const answer = el("div", { className: "ai-answer" }, [
    observedRecap(response.observed),
    aiBlock("Interpretation", el("div", { className: "ai-answer__text" }, [response.ai.interpretation])),
    aiBlock(
      "Investigate",
      el(
        "ul",
        { className: "ai-answer__list" },
        response.ai.investigationQuestions.map((q) => el("li", {}, [q])),
      ),
    ),
    aiBlock("Suggested control", el("div", { className: "ai-answer__text" }, [response.ai.suggestedControl])),
    aiBlock("Limitations", el("div", { className: "ai-answer__text" }, [response.ai.limitations])),
    el("div", { className: "panel-subsection" }, [
      el("div", { className: "panel-subsection__title" }, ["Evidence — verified Event IDs only"]),
      el(
        "div",
        { className: "event-id-chip-list" },
        response.matchingEventIds.map((eventId) => el("button", { type: "button", className: "event-id-chip", onclick: () => onOpenEvent(eventId) }, [eventId])),
      ),
    ]),
  ]);
  container.append(answer);
  if (response.cached) {
    container.append(el("div", { className: "ai-cache-note" }, ["Served from cache."]));
  }
}

function renderFallback(container: HTMLElement, response: AiPatternResponse & { status: "fallback" }): void {
  container.innerHTML = "";
  container.append(
    observedRecap(response.observed),
    el("div", { className: "ai-fallback-note" }, [response.message]),
  );
}

function renderError(container: HTMLElement, message: string, onRetry: () => void): void {
  container.innerHTML = "";
  container.append(
    el("div", { className: "ai-error" }, [message]),
    el("button", { type: "button", className: "btn-reset", onclick: onRetry }, ["Retry"]),
  );
}

/**
 * The "AI Analyst Assistant" panel — loads independently from the
 * deterministic investigation panel above it (that panel is already
 * rendered and doesn't wait on this). Calls POST /api/ai/pattern/:patternId,
 * which itself never calls Groq from the browser and never trusts Groq for
 * numbers/IDs — only the four prose fields below are Groq-sourced, clearly
 * labelled as such, and the Observed recap + Event ID list underneath both
 * come straight from verified pattern data either way.
 */
export function renderAIAnalystPanel(container: HTMLElement, patternId: string, onOpenEvent: (eventId: string) => void): void {
  container.innerHTML = "";
  container.append(
    el("div", { className: "panel__header" }, [
      el("span", { className: "panel__title" }, ["AI Analyst Assistant"]),
      el("span", { className: "ai-panel__live-badge", style: "position:static" }, ["GROQ"]),
    ]),
  );
  const body = el("div", { className: "panel__body ai-panel" });
  container.append(body);

  function load(): void {
    body.innerHTML = "";
    body.append(el("div", { className: "ai-loading" }, ["Asking Groq (openai/gpt-oss-120b) to interpret this pattern…"]));

    fetchAiAnalysis(patternId)
      .then((response) => {
        if (response.status === "ok") {
          renderSuccess(body, response, onOpenEvent);
        } else {
          renderFallback(body, response);
        }
      })
      .catch((err: unknown) => {
        const message = err instanceof ApiError ? err.message : "Unexpected error contacting the AI Analyst Assistant.";
        renderError(body, message, load);
      });
  }

  load();
}
