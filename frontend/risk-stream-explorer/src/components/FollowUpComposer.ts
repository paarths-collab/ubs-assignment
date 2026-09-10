import { el, mount } from "./dom";
import { renderLLMAnswer } from "./renderLLMAnswer";

/** Adds an evidence-scoped follow-up composer to any rendered Streamgraph section. */
export function followUpComposer(
  label: string,
  ask: (question: string, focusSection: string) => Promise<string>,
): HTMLElement {
  const toggle = el("button", { type: "button", className: "ai-followup__toggle" }, ["Ask follow-up"]);
  const input = el("input", {
    type: "text",
    className: "ai-followup__input",
    placeholder: `Ask a follow-up about ${label.toLowerCase()}…`,
    maxLength: 500,
    hidden: true,
    "aria-label": `Follow-up question about ${label}`,
  }) as HTMLInputElement;
  const send = el("button", { type: "submit", className: "ai-followup__button", hidden: true }, ["Send"]);
  const answer = el("div", { className: "ai-followup__answer" });
  toggle.addEventListener("click", () => {
    toggle.hidden = true;
    input.hidden = false;
    send.hidden = false;
    input.focus();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      input.value = "";
      input.hidden = true;
      send.hidden = true;
      toggle.hidden = false;
    }
  });
  const form = el("form", {
    className: "ai-followup",
    onsubmit: async (event: Event) => {
      event.preventDefault();
      const question = input.value.trim();
      if (!question) return;
      input.disabled = true;
      mount(answer, el("div", { className: "ai-loading" }, ["Analysing…"]));
      try {
        mount(answer, renderLLMAnswer(await ask(question, label), (nextQuestion, section) =>
          void ask(nextQuestion, section).then((text) => mount(answer, renderLLMAnswer(text))),
        ));
      } catch (error) {
        mount(answer, el("div", { className: "ai-error" }, [error instanceof Error ? error.message : "Unable to answer this follow-up."]));
      } finally {
        input.disabled = false;
        input.value = "";
      }
    },
  }, [toggle, input, send, answer]);
  return form;
}
