import { el } from "./dom";
import type { StreamHandlers } from "../services/aiStreamClient";

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

export interface StreamingPanelHandle {
  root: HTMLElement;
  /** Wires one action's click to a stream-starting function; disables every button while any run is active. */
  bindAction: (button: HTMLButtonElement, start: (handlers: StreamHandlers, signal: AbortSignal) => Promise<void>) => void;
  /** Aborts any in-flight run and clears the panel — call when the thing being analysed changes. */
  reset: () => void;
}

/**
 * The streaming UI shared by every AI analysis surface: a progress list of
 * named sections (marker + status + streamed text) and a footer showing the
 * evidence basis once complete. Callers supply the header, the action
 * buttons, and how to actually start a stream — this owns only the
 * rendering and the run/abort/disable bookkeeping, which is identical
 * whether the analysis is scoped to one issue or the whole filtered view.
 */
export function renderStreamingPanel(headerLabel: string): StreamingPanelHandle {
  let running = false;
  let controller: AbortController | null = null;
  const sections = new Map<string, SectionView>();

  const header = el("div", { className: "analysis__header" }, [
    el("span", {}, [headerLabel]),
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
    subject.textContent = "";
  }

  function buildSections(list: Array<{ id: string; title: string }>): void {
    progress.replaceChildren(
      ...list.map((section) => {
        const marker = el("span", { className: "analysis-section__marker is-waiting" }, ["○"]);
        const status = el("span", { className: "analysis-section__status" }, [STATUS_LABEL.waiting]);
        const body = el("div", { className: "analysis-section__body" });

        sections.set(section.id, { status: "waiting", statusEl: status, markerEl: marker, bodyEl: body });

        return el("section", { className: "analysis-section" }, [
          el("div", { className: "analysis-section__head" }, [marker, el("span", { className: "analysis-section__title" }, [section.title]), status]),
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

  function bindAction(
    button: HTMLButtonElement,
    start: (handlers: StreamHandlers, signal: AbortSignal) => Promise<void>,
  ): void {
    buttonRow.append(button);
    button.addEventListener("click", () => {
      if (running) return;

      resetRun();
      setRunning(true);
      controller = new AbortController();

      void start(
        {
          onStart: (info) => {
            subject.textContent = `${info.title} · ${info.eventCount} matching events · ${info.organisationCount} organisations`;
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
              el("span", {}, [`Evidence basis: ${info.evidence.eventCount} events · completed in ${(info.durationMs / 1000).toFixed(1)}s`]),
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
        },
        controller.signal,
      );
    });
  }

  function reset(): void {
    controller?.abort();
    setRunning(false);
    resetRun();
  }

  const root = el("div", { className: "analysis" }, [header, subject, buttonRow, progress, footer]);

  return { root, bindAction, reset };
}
