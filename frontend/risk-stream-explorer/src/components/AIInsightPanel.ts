import type { InsightPayload } from "@backend/index";
import { INSUFFICIENT_EVIDENCE_TEXT } from "@backend/index";
import { el } from "./dom";

function renderPayload(payload: InsightPayload): HTMLElement {
  if (payload.observed === INSUFFICIENT_EVIDENCE_TEXT) {
    return el("div", { className: "ai-insufficient" }, [INSUFFICIENT_EVIDENCE_TEXT]);
  }

  const blocks: HTMLElement[] = [
    el("div", {}, [
      el("div", { className: "ai-answer__block-label" }, ["Observed"]),
      el("div", { className: "ai-answer__text" }, [payload.observed]),
    ]),
    el("div", {}, [
      el("div", { className: "ai-answer__block-label" }, ["Why it matters"]),
      el("div", { className: "ai-answer__text" }, [payload.whyItMatters]),
    ]),
  ];

  if (payload.drivers.length > 0) {
    blocks.push(
      el("div", {}, [
        el("div", { className: "ai-answer__block-label" }, ["Drivers"]),
        el("ul", { className: "ai-answer__list" }, payload.drivers.map((d) => el("li", {}, [d]))),
      ]),
    );
  }

  if (payload.investigate.length > 0) {
    blocks.push(
      el("div", {}, [
        el("div", { className: "ai-answer__block-label" }, ["Investigate"]),
        el("ul", { className: "ai-answer__list" }, payload.investigate.map((d) => el("li", {}, [d]))),
      ]),
    );
  }

  if (payload.controlConsiderations.length > 0) {
    blocks.push(
      el("div", {}, [
        el("div", { className: "ai-answer__block-label" }, ["Control considerations"]),
        el("ul", { className: "ai-answer__list" }, payload.controlConsiderations.map((d) => el("li", {}, [d]))),
      ]),
    );
  }

  if (payload.supportingEvidence.length > 0) {
    blocks.push(
      el("div", { className: "ai-answer__evidence" }, [
        el("div", { className: "ai-answer__block-label" }, ["Supporting evidence"]),
        ...payload.supportingEvidence.map((m) =>
          el("div", { className: "ai-answer__evidence-row" }, [
            el("span", { className: "label" }, [m.label]),
            el("span", { className: "value" }, [m.value]),
          ]),
        ),
      ]),
    );
  }

  return el("div", { className: "ai-answer" }, blocks);
}

export interface AIActionSpec<TIntent extends string> {
  intent: TIntent;
  label: string;
}

export function renderAIPanel<TIntent extends string>(
  container: HTMLElement,
  actions: AIActionSpec<TIntent>[],
  getInsight: (intent: TIntent) => InsightPayload,
  headerLabel: string,
): void {
  container.innerHTML = "";
  const buttons: Record<string, HTMLButtonElement> = {};
  let activeIntent: TIntent | null = null;

  const answerHost = el("div", {});

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
          onclick: () => {
            activeIntent = action.intent;
            for (const [key, b] of Object.entries(buttons)) b.setAttribute("aria-pressed", String(key === action.intent));
            answerHost.innerHTML = "";
            answerHost.append(renderPayload(getInsight(action.intent)));
          },
        },
        [action.label],
      ) as HTMLButtonElement;
      buttons[action.intent] = btn;
      return btn;
    }),
  );

  container.append(
    el("div", { className: "ai-panel__header" }, [el("span", {}, ["✦"]), headerLabel]),
    actionRow,
    answerHost,
  );

  const first = actions[0];
  if (first) {
    (buttons[first.intent] as HTMLButtonElement).click();
  }
}
