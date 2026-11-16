import type { AppContext } from "../state/AppContext";
import type { RiskDetailSelection } from "../types";
import { streamFollowUp, type FollowUpContext } from "../services/aiStreamClient";
import { el } from "./dom";
import { renderStreamingPanel } from "./StreamingAnalysisPanel";

/** A compact, context-aware AI entry point shared by every dashboard section. */
export function renderFollowUpPanel(
  ctx: AppContext,
  context: FollowUpContext,
  getSelection?: () => RiskDetailSelection | undefined,
): HTMLElement {
  const panel = renderStreamingPanel("Ask about this section");
  panel.root.classList.add("follow-up__panel");
  panel.root.hidden = true;

  const toggle = el("button", { type: "button", className: "follow-up-toggle" }, ["Ask AI"]) as HTMLButtonElement;
  toggle.addEventListener("click", () => {
    panel.root.hidden = false;
    toggle.hidden = true;
  });

  const input = el("input", {
    type: "text",
    className: "follow-up__input",
    placeholder: "Ask a follow-up question…",
    maxLength: 1000,
    "aria-label": "Ask a follow-up question",
  }) as HTMLInputElement;
  const button = el("button", { type: "button", className: "analysis-btn" }, ["Ask"] ) as HTMLButtonElement;

  panel.root.insertBefore(
    el("div", { className: "follow-up__form" }, [input]),
    panel.root.children[2] ?? null,
  );

  panel.bindAction(button, (handlers, signal) => {
    const question = input.value.trim();
    if (!question) {
      input.focus();
      handlers.onError("Enter a question to continue.");
      return Promise.resolve();
    }
    return streamFollowUp(context, question, ctx.getState().filters, getSelection?.(), handlers, signal);
  });

  let lastKey = "";
  ctx.subscribe((state) => {
    const selection = getSelection?.();
    const key = `${JSON.stringify(state.filters)}|${JSON.stringify(selection ?? null)}`;
    if (key === lastKey) return;
    lastKey = key;
    panel.reset();
    panel.root.hidden = true;
    toggle.hidden = false;
  });

  return el("div", { className: "follow-up" }, [toggle, panel.root]);
}
