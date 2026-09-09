import { fetchIssueAiAnalysis, ApiError } from "../services/PatternApiClient";
import type { AiIssueResponse } from "../types/issue";
import { el } from "./dom";

function aiBlock(label: string, content: HTMLElement): HTMLElement {
  return el("div", {}, [
    el("div", { className: "ai-answer__block-label" }, [label, el("span", { className: "ai-source-tag" }, ["— Groq"])]),
    content,
  ]);
}

function renderSuccess(container: HTMLElement, response: AiIssueResponse & { status: "ok" }, onOpenEvent: (eventId: string) => void): void {
  container.innerHTML = "";
  const answer = el("div", { className: "ai-answer" }, [
    aiBlock("Interpretation", el("div", { className: "ai-answer__text" }, [response.ai.interpretation])),
    aiBlock("Why it may matter", el("div", { className: "ai-answer__text" }, [response.ai.whyItMayMatter])),
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

function renderFallback(container: HTMLElement, response: AiIssueResponse & { status: "fallback" }, onRetry: () => void): void {
  container.innerHTML = "";
  container.append(
    el("div", { className: "ai-fallback-note" }, [response.message]),
    el("button", { type: "button", className: "btn-reset", onclick: onRetry }, ["Try again"]),
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
 * The "AI Analyst Assistant" panel for one issue. It renders nothing and
 * requests nothing until `run()` is called from the small control in the
 * analysis panel's corner: the deterministic analysis is the product and is
 * complete without this, so interpretation stays opt-in and out of the way
 * rather than occupying a column and spending a Groq request per issue click.
 *
 * Calls POST /api/ai/issue/:issueSlug, which never calls Groq from the
 * browser and never trusts Groq for numbers/IDs — only the five prose fields
 * below are Groq-sourced, clearly labelled as such. The model is explicitly
 * instructed to challenge the evidence, not just support it — "Why it may
 * matter" and "Limitations" are where that shows up.
 */
export function renderIssueAIPanel(
  container: HTMLElement,
  issueSlug: string,
  onOpenEvent: (eventId: string) => void,
): { run: () => void } {
  container.innerHTML = "";
  container.append(
    el("div", { className: "panel__header" }, [
      el("span", { className: "panel__title" }, ["AI Analyst Assistant"]),
      el("div", { className: "panel__header-actions" }, [
        el("span", { className: "ai-panel__live-badge", style: "position:static" }, ["GROQ"]),
        el(
          "button",
          {
            type: "button",
            className: "btn-ai-corner",
            "aria-label": "Hide AI analysis",
            onclick: () => {
              container.hidden = true;
            },
          },
          ["×"],
        ),
      ]),
    ]),
  );
  const body = el("div", { className: "panel__body ai-panel" });
  container.append(body);

  let started = false;

  function load(): void {
    body.innerHTML = "";
    body.append(el("div", { className: "ai-loading" }, ["Asking Groq (openai/gpt-oss-120b) to interpret this issue's evidence…"]));

    fetchIssueAiAnalysis(issueSlug)
      .then((response) => {
        if (response.status === "ok") {
          renderSuccess(body, response, onOpenEvent);
        } else {
          renderFallback(body, response, load);
        }
      })
      .catch((err: unknown) => {
        const message = err instanceof ApiError ? err.message : "Unexpected error contacting the AI Analyst Assistant.";
        renderError(body, message, load);
      });
  }

  return {
    run(): void {
      container.hidden = false;
      // Re-showing an answer already fetched shouldn't spend another request;
      // only the first run (or an explicit retry) calls Groq.
      if (started) return;
      started = true;
      load();
      container.scrollIntoView({ behavior: "smooth", block: "nearest" });
    },
  };
}
