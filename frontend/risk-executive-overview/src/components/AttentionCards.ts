import type { AppContext } from "../state/AppContext";
import type { AttentionLens } from "../types";
import { el } from "./dom";

const LENS_META: Record<AttentionLens, { title: string; question: string; action: string }> = {
  urgency: { title: "Urgency", question: "What is most pressing?", action: "Review issue" },
  exposure: { title: "Exposure", question: "Where is the money?", action: "Review exposure" },
  recurrence: { title: "Recurrence", question: "What keeps coming back?", action: "Review recurrence" },
};

/**
 * Three cards answering "why should I care?" from three different angles.
 * Each lens ranks on its own measure, so they can — and often do — surface
 * different scenarios.
 */
export function renderAttentionCards(ctx: AppContext, host: HTMLElement): void {
  function sync(): void {
    const { priority, loading } = ctx.getState();

    if (!priority || priority.attention.length === 0) {
      host.replaceChildren(
        el("div", { className: loading ? "loading-state" : "empty-state" }, [
          loading ? "Assessing priorities…" : "No scenarios in the current selection.",
        ]),
      );
      return;
    }

    const cards = priority.attention.map((card) => {
      const meta = LENS_META[card.lens];
      return el("article", { className: `attention attention--${card.lens}` }, [
        el("div", { className: "attention__lens" }, [
          el("span", { className: "attention__lens-name" }, [meta.title]),
          el("span", { className: "attention__lens-question" }, [meta.question]),
        ]),
        el("h3", { className: "attention__title" }, [card.title]),
        el("div", { className: "attention__headline" }, [card.headline]),
        el("p", { className: "attention__reason" }, [card.reason]),
        el(
          "button",
          {
            type: "button",
            className: "attention__cta",
            onclick: () => {
              ctx.selectScenario(card.scenarioId);
              document.getElementById("risk-brief")?.scrollIntoView({ behavior: "smooth", block: "start" });
            },
          },
          [`${meta.action} →`],
        ),
      ]);
    });

    host.replaceChildren(el("div", { className: "attention-grid" }, cards));
  }

  ctx.subscribe(sync);
  sync();
}
