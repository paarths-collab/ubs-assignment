import type { AppContext } from "../state/AppContext";
import { el } from "./dom";
import { streamPortfolioAnalysis, type PortfolioLens } from "../services/aiStreamClient";
import { renderStreamingPanel } from "./StreamingAnalysisPanel";
import { renderFollowUpPanel } from "./FollowUpPanel";

const ACTIONS: Array<{ lens: PortfolioLens; label: string; hint: string }> = [
  { lens: "analyse", label: "Analyse This View", hint: "Synthesise the whole current selection" },
  { lens: "unusual", label: "What Is Unusual?", hint: "Compare it with the rest of the enterprise" },
  { lens: "investigate", label: "What Should Management Investigate?", hint: "Turn findings into questions and control checks" },
];

/**
 * The persistent, context-aware AI panel. It reacts to whatever the manager
 * is currently looking at — the filtered portfolio view, not a fixed
 * summary — so a filter change invalidates any analysis already on screen
 * the same way selecting a different issue does in the per-issue panel.
 */
export function renderPortfolioAnalysisPanel(ctx: AppContext, host: HTMLElement): void {
  const panel = renderStreamingPanel("AI Analysis");
  const followUp = renderFollowUpPanel(ctx, "ai-analysis");

  for (const action of ACTIONS) {
    const button = el("button", { type: "button", className: "analysis-btn", title: action.hint }, [
      action.label,
    ]) as HTMLButtonElement;

    panel.bindAction(button, (handlers, signal) =>
      streamPortfolioAnalysis(action.lens, ctx.getState().filters, handlers, signal),
    );
  }

  host.replaceChildren(panel.root, followUp);

  // A filter change means the population being analysed is different —
  // whatever is on screen described the previous view.
  let lastFiltersKey = "";
  ctx.subscribe((state) => {
    const key = JSON.stringify(state.filters);
    if (key === lastFiltersKey) return;
    lastFiltersKey = key;
    panel.reset();
  });
}
