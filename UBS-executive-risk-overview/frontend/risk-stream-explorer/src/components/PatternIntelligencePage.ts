import { fetchInvestigation, fetchPriorityPatterns, ApiError } from "../services/PatternApiClient";
import type { Pattern } from "../types/pattern";
import { el } from "./dom";
import { hrefFor, navigate } from "../router";
import { renderPatternPriorityQueue } from "./PatternPriorityQueue";
import { renderInvestigationPanel } from "./InvestigationPanel";
import { renderAIAnalystPanel } from "./AIAnalystPanel";
import { renderPatternEventDrawer } from "./PatternEventDrawer";

/**
 * Component 4 — Pattern Intelligence + Investigation Workspace + AI. A
 * self-contained page (not wired into the Component 2/3 `AppContext`/Store —
 * this is a different dataset and a different backend) that talks to the
 * Component 4 API server over `fetch()`. Renders the 22-item priority queue
 * immediately (deterministic, always available); selecting a card loads the
 * investigation panel and, independently, the AI Analyst panel.
 */
export function renderPatternIntelligencePage(root: HTMLElement): void {
  root.innerHTML = "";
  root.append(el("a", { href: "#main-content", className: "skip-link" }, ["Skip to main content"]));

  root.append(
    el("header", { className: "app-header" }, [
      el("div", {}, [
        el(
          "a",
          {
            className: "app-header__back",
            href: hrefFor("home"),
            onclick: (event: MouseEvent) => {
              event.preventDefault();
              navigate("home");
            },
          },
          ["← Operational Risk Workbench"],
        ),
        el("div", { className: "app-header__title" }, [el("span", { className: "glyph" }, ["◈"]), "Pattern Intelligence"]),
        el("div", { className: "app-header__breadcrumb" }, ["Enterprise Risk · Component 4"]),
      ]),
    ]),
  );

  const main = el("main", { className: "app-main", id: "main-content" });
  root.append(main);

  main.append(
    el("div", { className: "issues-intro" }, [
      el("p", {}, [
        "Looking for where to start? ",
        el(
          "a",
          {
            href: hrefFor("issues"),
            onclick: (event: MouseEvent) => {
              event.preventDefault();
              navigate("issues");
            },
          },
          ["Issue Intelligence"],
        ),
        " ranks the 15 issue categories by transparent, named signals and surfaces the patterns below as supporting evidence inside each issue's analysis.",
      ]),
    ]),
  );

  const priorityPanel = el("div", { className: "panel" }, [
    el("div", { className: "panel__header" }, [el("span", { className: "panel__title" }, ["Priority Queue — 22 Candidate Investigations"])]),
  ]);
  const priorityBody = el("div", { className: "panel__body" }, [el("div", { className: "loading-state" }, ["Loading priority patterns…"])]);
  priorityPanel.append(priorityBody);
  main.append(priorityPanel);

  const investigationHost = el("div", {});
  main.append(investigationHost);

  const drawerHost = el("div", {});
  root.append(drawerHost);

  let patterns: Pattern[] = [];
  let selectedPatternId: string | null = null;

  function openEvent(eventId: string): void {
    renderPatternEventDrawer(drawerHost, eventId, closeEvent);
  }
  function closeEvent(): void {
    drawerHost.innerHTML = "";
  }

  function renderQueue(): void {
    renderPatternPriorityQueue(priorityBody, patterns, selectedPatternId, selectPattern);
  }

  function selectPattern(patternId: string): void {
    selectedPatternId = patternId;
    renderQueue();

    investigationHost.innerHTML = "";
    const grid = el("div", { className: "section-grid section-grid--investigation" });
    const investigationPanel = el("div", { className: "panel" }, [el("div", { className: "loading-state" }, ["Loading investigation…"])]);
    const aiPanel = el("div", { className: "panel" });
    grid.append(investigationPanel, aiPanel);
    investigationHost.append(grid);

    // The AI panel loads independently — it doesn't wait on the
    // deterministic investigation fetch, and a slow/failed AI call never
    // blocks the verified-evidence panel next to it.
    renderAIAnalystPanel(aiPanel, patternId, openEvent);

    fetchInvestigation(patternId)
      .then((investigation) => {
        renderInvestigationPanel(investigationPanel, investigation, openEvent);
      })
      .catch((err: unknown) => {
        const message = err instanceof ApiError ? err.message : "This investigation could not be loaded.";
        investigationPanel.innerHTML = "";
        investigationPanel.append(el("div", { className: "error-state" }, [message]));
      });
  }

  fetchPriorityPatterns()
    .then((response) => {
      patterns = response.patterns;
      renderQueue();
    })
    .catch((err: unknown) => {
      const message =
        err instanceof ApiError
          ? `${err.message}${err.status === 0 ? " Start it with: npm run dev:server" : ""}`
          : "Could not load priority patterns.";
      priorityBody.innerHTML = "";
      priorityBody.append(el("div", { className: "error-state" }, [message]));
    });
}
