import type { AppContext } from "../state/AppContext";
import type { RiskDetailSelection } from "../types";
import { el } from "./dom";
import { streamAnalysis, type AnalysisEndpoint } from "../services/aiStreamClient";

const ACTIONS: Array<{ endpoint: AnalysisEndpoint; label: string; hint: string }> = [
  { endpoint: "deep-analysis", label: "Deep Analyse", hint: "Three specialist passes over the verified dossier" },
  { endpoint: "investigation-plan", label: "Build Investigation Plan", hint: "How to investigate this issue" },
  { endpoint: "enterprise-comparison", label: "Compare to Enterprise", hint: "How it ranks against the other issues" },
];

type SectionStatus = "waiting" | "streaming" | "complete" | "failed";

const STATUS_LABEL: Record<SectionStatus, string> = {
  waiting: "Waiting…",
  streaming: "Analysing…",
  complete: "Complete",
  failed: "Failed",
};

interface SectionView {
  status: SectionStatus;
  statusEl: HTMLElement;
  markerEl: HTMLElement;
  bodyEl: HTMLElement;
}

export function renderAIAnalysisPanel(ctx: AppContext, host: HTMLElement): void {
  let running = false;
  let controller: AbortController | null = null;
  const sections = new Map<string, SectionView>();

  const header = el("div", { className: "analysis__header" }, [
    el("span", {}, ["AI Risk Analysis"]),
    el("span", { className: "analysis__badge" }, ["LIVE"]),
  ]);
  const subject = el("div", { className: "analysis__subject" });
  const buttonRow = el("div", { className: "analysis__actions" });
  const progress = el("div", { className: "analysis__progress" });
  const footer = el("div", { className: "analysis__footer" });

  function setSectionStatus(sectionId: string, status: SectionStatus): void {
    const view = sections.get(sectionId);
    if (!view) return;
    view.status = status;
    view.statusEl.textContent = STATUS_LABEL[status];
    view.markerEl.textContent = status === "waiting" ? "○" : status === "failed" ? "✕" : "●";
    view.markerEl.className = `analysis-section__marker is-${status}`;
  }

  function resetRun(): void {
    sections.clear();
    progress.replaceChildren();
    footer.replaceChildren();
  }

  function buildSections(list: Array<{ id: string; title: string }>): void {
    progress.replaceChildren(
      ...list.map((section) => {
        const marker = el("span", { className: "analysis-section__marker is-waiting" }, ["○"]);
        const status = el("span", { className: "analysis-section__status" }, [STATUS_LABEL.waiting]);
        const body = el("div", { className: "analysis-section__body" });

        sections.set(section.id, { status: "waiting", statusEl: status, markerEl: marker, bodyEl: body });

        return el("section", { className: "analysis-section" }, [
          el("div", { className: "analysis-section__head" }, [
            marker,
            el("span", { className: "analysis-section__title" }, [section.title]),
            status,
          ]),
          body,
        ]);
      }),
    );
  }

  function setRunning(value: boolean): void {
    running = value;
    for (const button of Array.from(buttonRow.querySelectorAll("button"))) {
      (button as HTMLButtonElement).disabled = value;
    }
  }

  async function run(endpoint: AnalysisEndpoint): Promise<void> {
    const scenario = ctx.getSelectedScenario();
    if (!scenario || running) return;

    const selection: RiskDetailSelection = scenario.patternId
      ? { type: "pattern", patternId: scenario.patternId }
      : { type: "issue", issueDetail: scenario.issueDetail };

    resetRun();
    setRunning(true);
    controller = new AbortController();

    await streamAnalysis(endpoint, ctx.getState().filters, selection, {
      onStart: (info) => {
        subject.textContent = `Analysis of: ${info.title} · ${info.eventCount} matching events · ${info.organisationCount} organisations`;
        buildSections(info.sections);
      },
      onSectionStart: (sectionId) => setSectionStatus(sectionId, "streaming"),
      onDelta: (sectionId, delta) => {
        // Appending a text node avoids re-rendering the section on every
        // token, which would thrash the DOM at streaming speed.
        sections.get(sectionId)?.bodyEl.append(document.createTextNode(delta));
      },
      onSectionComplete: (sectionId) => setSectionStatus(sectionId, "complete"),
      onComplete: (info) => {
        footer.replaceChildren(
          el("span", {}, [
            `Evidence basis: ${info.evidence.eventCount} events · completed in ${(info.durationMs / 1000).toFixed(1)}s`,
          ]),
        );
        setRunning(false);
      },
      onError: (message) => {
        // The section that was mid-stream did not finish — marking it
        // "Complete" would claim an analysis the manager never received.
        for (const [sectionId, view] of sections) {
          if (view.status === "streaming") setSectionStatus(sectionId, "failed");
        }
        footer.replaceChildren(el("span", { className: "analysis__error" }, [message]));
        setRunning(false);
      },
    }, controller.signal);
  }

  buttonRow.replaceChildren(
    ...ACTIONS.map((action) =>
      el(
        "button",
        { type: "button", className: "analysis-btn", title: action.hint, onclick: () => void run(action.endpoint) },
        [action.label],
      ),
    ),
  );

  host.replaceChildren(el("div", { className: "analysis" }, [header, subject, buttonRow, progress, footer]));

  // A new selection invalidates any analysis on screen — it described the
  // previous issue.
  let lastScenarioId: string | null = null;
  ctx.subscribe(() => {
    const current = ctx.getSelectedScenario()?.scenarioId ?? null;
    if (current === lastScenarioId) return;
    lastScenarioId = current;
    controller?.abort();
    setRunning(false);
    resetRun();
    subject.textContent = "";
  });
}
