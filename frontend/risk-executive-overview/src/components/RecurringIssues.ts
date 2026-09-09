import type { AppContext } from "../state/AppContext";
import type { ScenarioSignal } from "../types";
import { el } from "./dom";

/** One short line naming the dominant characteristic — replaces a row of badges. */
function characterise(signal: ScenarioSignal): string {
  const { organisationCount, ownerCount } = signal.analytics.recurrence;
  if (organisationCount > 1) return "Cross-organisation recurrence";
  if (ownerCount >= 3) return "Multi-owner recurrence";
  if (signal.analytics.workflow.openShare >= 0.6) return "High unresolved backlog";
  return "Contained within one workflow";
}

export function renderRecurringIssues(ctx: AppContext, host: HTMLElement): void {
  function sync(): void {
    const { priority, loading, selectedScenarioId } = ctx.getState();

    if (!priority || priority.items.length === 0) {
      host.replaceChildren(
        el("div", { className: loading ? "loading-state" : "empty-state" }, [
          loading ? "Loading recurring issues…" : "No recurring issues in the current selection.",
        ]),
      );
      return;
    }

    const cards = priority.items.map((signal) =>
      el(
        "button",
        {
          type: "button",
          className: `issue-card${signal.scenarioId === selectedScenarioId ? " is-selected" : ""}${
            signal.highSeverityCount > 0 ? " issue-card--has-high" : ""
          }`,
          "aria-pressed": String(signal.scenarioId === selectedScenarioId),
          onclick: () => {
            ctx.selectScenario(signal.scenarioId);
            document.getElementById("risk-brief")?.scrollIntoView({ behavior: "smooth", block: "start" });
          },
        },
        [
          el("div", { className: "issue-card__title" }, [signal.title]),
          el("div", { className: "issue-card__figures" }, [
            el("span", {}, [el("b", {}, [String(signal.eventCount)]), " events"]),
            el("span", { className: signal.highSeverityCount > 0 ? "is-high" : "" }, [
              el("b", {}, [String(signal.highSeverityCount)]),
              " High",
            ]),
            el("span", {}, [el("b", {}, [String(signal.openEventCount)]), " open"]),
            el("span", {}, [
              el("b", {}, [String(signal.analytics.recurrence.organisationCount)]),
              " orgs",
            ]),
          ]),
          el("div", { className: "issue-card__note" }, [characterise(signal)]),
        ],
      ),
    );

    host.replaceChildren(el("div", { className: "issue-grid" }, cards));
  }

  ctx.subscribe(sync);
  sync();
}
