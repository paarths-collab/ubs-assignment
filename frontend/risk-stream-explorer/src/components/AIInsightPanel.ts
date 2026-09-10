import { LLMError } from "../services/LLMClient";
import { el, mount } from "./dom";
import { renderLLMAnswer } from "./renderLLMAnswer";

export interface AIActionSpec<TIntent extends string> {
  intent: TIntent;
  label: string;
}

/**
 * Renders the intent buttons and the answer area. The caller supplies
 * `runIntent`, which posts the selection (period/event id + filters) to the
 * backend — this component never sees an API key or builds a prompt, because
 * both live server-side now.
 */
export function renderAIPanel<TIntent extends string>(
  container: HTMLElement,
  actions: AIActionSpec<TIntent>[],
  runIntent: (intent: TIntent, question?: string, focusSection?: string) => Promise<string>,
  headerLabel: string,
): void {
  container.innerHTML = "";
  const buttons: Record<string, HTMLButtonElement> = {};
  const answerHost = el("div", {});

  // Guards against an out-of-order response overwriting a newer one when the
  // user clicks a second intent while the first is still in flight.
  let requestSequence = 0;

  async function run(intent: TIntent, activeBtn: HTMLButtonElement, question?: string, focusSection?: string): Promise<void> {
    const sequence = ++requestSequence;

    for (const btn of Object.values(buttons)) btn.setAttribute("aria-pressed", "false");
    activeBtn.setAttribute("aria-pressed", "true");
    mount(answerHost, el("div", { className: "ai-loading" }, ["Analysing…"]));

    try {
      const text = await runIntent(intent, question, focusSection);
      if (sequence !== requestSequence) return;
      mount(answerHost, renderLLMAnswer(text, (followUp, section) => void run(intent, activeBtn, followUp, section)));
    } catch (err) {
      if (sequence !== requestSequence) return;
      const message =
        err instanceof LLMError ? err.message : "Unexpected error while requesting the analysis.";
      mount(
        answerHost,
        el("div", { className: "ai-error" }, [message]),
        el("div", { className: "ai-error__note" }, [
          "The verified figures shown on screen are unaffected — they are computed locally and do not depend on the AI service.",
        ]),
      );
    }
  }

  const actionRow = el(
    "div",
    { className: "ai-action-row" },
    actions.map((action) => {
      const btn = el(
        "button",
        {
          type: "button",
          className: "ai-action-btn",
          "aria-pressed": "false",
          onclick: () => void run(action.intent, btn),
        },
        [action.label],
      ) as HTMLButtonElement;
      buttons[action.intent] = btn;
      return btn;
    }),
  );

  container.append(
    el("div", { className: "ai-panel__header" }, [
      el("span", {}, ["✦"]),
      headerLabel,
      el("span", { className: "ai-panel__live-badge" }, ["LIVE"]),
    ]),
    actionRow,
    answerHost,
  );
}
