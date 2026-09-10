import { fetchIssueAiAnalysis, ApiError } from "../services/PatternApiClient";
import type { AiIssueResponse } from "../types/issue";
import { el } from "./dom";

/**
 * The attribution names the model the server actually used, from the API
 * response — the provider is configurable, so a hard-coded "Groq" would
 * become a false attribution the moment it is switched.
 */
function aiBlock(label: string, content: HTMLElement, sourceLabel: string): HTMLElement {
  return el("div", {}, [
    el("div", { className: "ai-answer__block-label" }, [label, el("span", { className: "ai-source-tag" }, [`— ${sourceLabel}`])]),
    content,
  ]);
}

/** "deepseek/deepseek-v4-flash-0731" -> "deepseek-v4-flash-0731" for display. */
function shortModelName(model: string): string {
  const slash = model.lastIndexOf("/");
  return slash === -1 ? model : model.slice(slash + 1);
}

function renderSuccess(container: HTMLElement, response: AiIssueResponse & { status: "ok" }, onOpenEvent: (eventId: string) => void): void {
  container.innerHTML = "";
  const source = shortModelName(response.model);
  const answer = el("div", { className: "ai-answer" }, [
    aiBlock("Interpretation", el("div", { className: "ai-answer__text" }, [response.ai.interpretation]), source),
    aiBlock("Why it may matter", el("div", { className: "ai-answer__text" }, [response.ai.whyItMayMatter]), source),
    aiBlock(
      "Investigate",
      el(
        "ul",
        { className: "ai-answer__list" },
        response.ai.investigationQuestions.map((q) => el("li", {}, [q])),
      ),
      source,
    ),
    aiBlock("Suggested control", el("div", { className: "ai-answer__text" }, [response.ai.suggestedControl]), source),
    aiBlock("Limitations", el("div", { className: "ai-answer__text" }, [response.ai.limitations]), source),
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
 * rather than occupying a column and spending a request per issue click.
 *
 * Calls POST /api/ai/issue/:issueSlug. The provider is chosen server-side and
 * its key never reaches the browser; the model is never trusted for numbers
 * or IDs — only the five prose fields below come from it, each labelled with
 * the model that produced them. It is explicitly instructed to challenge the
 * evidence, not just support it — "Why it may matter" and "Limitations" are
 * where that shows up.
 */
export function renderIssueAIPanel(
  container: HTMLElement,
  issueSlug: string,
  onOpenEvent: (eventId: string) => void,
): { run: () => void } {
  container.innerHTML = "";
  // Which model answers is server-side configuration, so the badge starts
  // generic and is replaced with the real provider once a response names it.
  const providerBadge = el("span", { className: "ai-panel__live-badge", style: "position:static" }, ["LLM"]);
  container.append(
    el("div", { className: "panel__header" }, [
      el("span", { className: "panel__title" }, ["AI Analyst Assistant"]),
      el("div", { className: "panel__header-actions" }, [
        providerBadge,
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
    body.append(el("div", { className: "ai-loading" }, ["Asking the configured model to interpret this issue's evidence…"]));

    fetchIssueAiAnalysis(issueSlug)
      .then((response) => {
        providerBadge.textContent = response.provider.toUpperCase();
        providerBadge.title = `Model: ${response.model}`;
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
