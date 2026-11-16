import type { AppContext } from "../state/AppContext";
import type { RiskDetailSelection } from "../types";
import { el } from "./dom";
import { streamAnalysis, type AnalysisEndpoint } from "../services/aiStreamClient";
import { renderStreamingPanel } from "./StreamingAnalysisPanel";

const ACTIONS: Array<{ endpoint: AnalysisEndpoint; label: string; hint: string }> = [
  { endpoint: "deep-analysis", label: "Deep Analyse", hint: "Three specialist passes over the verified dossier" },
  { endpoint: "investigation-plan", label: "Build Investigation Plan", hint: "How to investigate this issue" },
  { endpoint: "enterprise-comparison", label: "Compare to Enterprise", hint: "How it ranks against the other issues" },
];

/** Deep analysis of the one currently-selected issue in the Risk Brief. */
export function renderAIAnalysisPanel(ctx: AppContext, host: HTMLElement): void {
  const panel = renderStreamingPanel("AI Risk Analysis");

  for (const action of ACTIONS) {
    const button = el("button", { type: "button", className: "analysis-btn", title: action.hint }, [
      action.label,
    ]) as HTMLButtonElement;

    panel.bindAction(button, (handlers, signal) => {
      const scenario = ctx.getSelectedScenario();
      if (!scenario) return Promise.resolve();

      const selection: RiskDetailSelection = scenario.patternId
        ? { type: "pattern", patternId: scenario.patternId }
        : { type: "issue", issueDetail: scenario.issueDetail };

      return streamAnalysis(action.endpoint, ctx.getState().filters, selection, handlers, signal);
    });
  }

  host.replaceChildren(panel.root);

  // A new selection invalidates any analysis on screen — it described the
  // previous issue.
  let lastScenarioId: string | null = null;
  ctx.subscribe(() => {
    const current = ctx.getSelectedScenario()?.scenarioId ?? null;
    if (current === lastScenarioId) return;
    lastScenarioId = current;
    panel.reset();
  });
}
