import { fetchIssueDetail, fetchRankedIssues, ApiError } from "../services/PatternApiClient";
import type { IssueSummary } from "../types/issue";
import { el } from "./dom";
import { hrefFor, navigate } from "../router";
import { renderIssueAttentionList } from "./IssueAttentionList";
import { renderIssueDetailPanel } from "./IssueDetailPanel";
import { renderIssueAIPanel } from "./IssueAIPanel";
import { renderPatternEventDrawer } from "./PatternEventDrawer";

/**
 * Component 4 — Issue Intelligence. The primary Pattern Intelligence entry
 * point: "Which issues deserve the most attention, and what evidence
 * explains why?" Renders the ranked "Issues Requiring Attention" list
 * immediately (deterministic, always available); selecting an issue loads
 * its full deterministic analysis and, independently, the AI Analyst panel.
 * The 137-pattern library remains reachable from here — those patterns are
 * reused as supporting evidence inside each issue's analysis, not replaced.
 */
export function renderIssuesPage(root: HTMLElement): void {
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
        el("div", { className: "app-header__title" }, [el("span", { className: "glyph" }, ["◈"]), "Issue Intelligence"]),
        el("div", { className: "app-header__breadcrumb" }, ["Enterprise Risk · Component 4"]),
      ]),
    ]),
  );

  const main = el("main", { className: "app-main", id: "main-content" });
  root.append(main);

  main.append(
    el("div", { className: "synthetic-banner" }, [
      el("strong", {}, ["Synthetic data notice:"]),
      " Every event, issue, pattern, organisation and person on this page is 100% simulated for an internship take-home project. This is not real UBS data, and no AI-generated text here should be treated as verified fact — only the numbers and IDs are.",
    ]),
  );

  main.append(
    el("div", { className: "issues-intro" }, [
      el("p", {}, [
        "Issues are ranked by named, transparent signals — not an opaque AI score. Each signal is individually explainable with the number behind it. Dimensions that carry no information across issues (event count, organisation count, owner count, top-organisation volume share) are deliberately excluded from ranking and narrative.",
      ]),
      el(
        "a",
        {
          className: "issues-intro__patterns-link",
          href: hrefFor("patterns"),
          onclick: (event: MouseEvent) => {
            event.preventDefault();
            navigate("patterns");
          },
        },
        ["Browse the full 137-pattern library →"],
      ),
    ]),
  );

  const attentionPanel = el("div", { className: "panel" }, [
    el("div", { className: "panel__header" }, [el("span", { className: "panel__title" }, ["Issues Requiring Attention"])]),
  ]);
  const attentionBody = el("div", { className: "panel__body" }, [el("div", { className: "loading-state" }, ["Loading issues…"])]);
  attentionPanel.append(attentionBody);
  main.append(attentionPanel);

  const detailHost = el("div", {});
  main.append(detailHost);

  const drawerHost = el("div", {});
  root.append(drawerHost);

  let issues: IssueSummary[] = [];
  let selectedSlug: string | null = null;
  let showAll = false;

  function openEvent(eventId: string): void {
    renderPatternEventDrawer(drawerHost, eventId, closeEvent);
  }
  function closeEvent(): void {
    drawerHost.innerHTML = "";
  }

  function renderList(): void {
    renderIssueAttentionList(attentionBody, issues, selectedSlug, selectIssue, showAll, toggleShowAll);
  }

  function toggleShowAll(): void {
    showAll = !showAll;
    renderList();
  }

  function selectIssue(slug: string): void {
    selectedSlug = slug;
    renderList();

    detailHost.innerHTML = "";
    const grid = el("div", { className: "section-grid section-grid--investigation" });
    const detailPanel = el("div", { className: "panel" }, [el("div", { className: "loading-state" }, ["Loading issue analysis…"])]);
    const aiPanel = el("div", { className: "panel" });
    grid.append(detailPanel, aiPanel);
    detailHost.append(grid);

    // The AI panel loads independently — it never waits on (or blocks) the
    // deterministic analysis fetch next to it.
    renderIssueAIPanel(aiPanel, slug, openEvent);

    fetchIssueDetail(slug)
      .then((detail) => {
        renderIssueDetailPanel(detailPanel, detail, openEvent);
      })
      .catch((err: unknown) => {
        const message = err instanceof ApiError ? err.message : "This issue could not be loaded.";
        detailPanel.innerHTML = "";
        detailPanel.append(el("div", { className: "error-state" }, [message]));
      });
  }

  fetchRankedIssues()
    .then((response) => {
      issues = response.issues;
      renderList();
    })
    .catch((err: unknown) => {
      const message =
        err instanceof ApiError
          ? `${err.message}${err.status === 0 ? " Start it with: npm run dev:server" : ""}`
          : "Could not load ranked issues.";
      attentionBody.innerHTML = "";
      attentionBody.append(el("div", { className: "error-state" }, [message]));
    });
}
