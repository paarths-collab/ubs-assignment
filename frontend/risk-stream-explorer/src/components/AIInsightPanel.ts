import { getApiKey, setApiKey } from "../state/apiKeyStore";
import { LLMError, type ChatMessage, askLLM } from "../services/LLMClient";
import { el, mount } from "./dom";
import { renderLLMAnswer } from "./renderLLMAnswer";

export interface AIActionSpec<TIntent extends string> {
  intent: TIntent;
  label: string;
}

function renderKeyGate(onSaved: () => void): HTMLElement {
  const input = el("input", {
    type: "password",
    placeholder: "Paste your Groq API key",
    className: "api-key-input",
    "aria-label": "Groq API key",
  }) as HTMLInputElement;

  const save = () => {
    if (input.value.trim().length === 0) return;
    setApiKey(input.value);
    onSaved();
  };

  return el("div", { className: "ai-key-gate" }, [
    el("div", { className: "ai-key-gate__text" }, [
      "This is a live AI feature — it sends the verified data below to Groq (model openai/gpt-oss-120b) over the internet. Enter your own Groq API key to enable it. The key is stored only in this browser's localStorage, never in this file.",
    ]),
    el("div", { className: "ai-key-gate__row" }, [
      input,
      el("button", { type: "button", className: "ai-action-btn", onclick: save }, ["Save key"]),
    ]),
  ]);
}

export function renderAIPanel<TIntent extends string>(
  container: HTMLElement,
  actions: AIActionSpec<TIntent>[],
  buildMessages: (intent: TIntent) => ChatMessage[],
  headerLabel: string,
): void {
  container.innerHTML = "";
  const buttons: Record<string, HTMLButtonElement> = {};
  const answerHost = el("div", {});

  function renderGateOrActions(): void {
    container.innerHTML = "";
    const apiKey = getApiKey();

    container.append(el("div", { className: "ai-panel__header" }, [el("span", {}, ["✦"]), headerLabel, el("span", { className: "ai-panel__live-badge" }, ["LIVE"])]));

    if (!apiKey) {
      container.append(renderKeyGate(renderGateOrActions));
      return;
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
            onclick: () => runIntent(action.intent, btn),
          },
          [action.label],
        ) as HTMLButtonElement;
        buttons[action.intent] = btn;
        return btn;
      }),
    );

    answerHost.innerHTML = "";
    container.append(actionRow, answerHost);
  }

  async function runIntent(intent: TIntent, activeBtn: HTMLButtonElement): Promise<void> {
    const apiKey = getApiKey();
    if (!apiKey) {
      renderGateOrActions();
      return;
    }

    for (const [, b] of Object.entries(buttons)) b.setAttribute("aria-pressed", "false");
    activeBtn.setAttribute("aria-pressed", "true");

    answerHost.innerHTML = "";
    answerHost.append(el("div", { className: "ai-loading" }, ["Asking Groq (openai/gpt-oss-120b)…"]));

    try {
      const messages = buildMessages(intent);
      const text = await askLLM(apiKey, messages);
      answerHost.innerHTML = "";
      answerHost.append(renderLLMAnswer(text));
    } catch (err) {
      const message = err instanceof LLMError ? err.message : "Unexpected error contacting Groq.";
      const isAuthIssue = err instanceof LLMError && (err.kind === "auth" || err.kind === "no-key");
      mount(
        answerHost,
        el("div", { className: "ai-error" }, [message]),
        isAuthIssue
          ? el(
              "button",
              {
                type: "button",
                className: "btn-reset",
                onclick: () => renderGateOrActions(),
              },
              ["Update API key"],
            )
          : null,
      );
    }
  }

  renderGateOrActions();
}
