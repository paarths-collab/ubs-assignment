import type { EventRepository } from "@backend/index";
import { el } from "./dom";
import { hrefFor, navigate } from "../router";

function statBlock(value: string, label: string, accent?: string): HTMLElement {
  return el("div", { className: "landing-stat" }, [
    el("div", { className: "landing-stat__value", style: accent ? `color:${accent}` : undefined }, [value]),
    el("div", { className: "landing-stat__label" }, [label]),
  ]);
}

export function renderLandingPage(repository: EventRepository, root: HTMLElement): void {
  const highCount = repository.getAll().filter((e) => e.severity === "High").length;
  const financialCount = repository.getAll().filter((e) => e.eventType === "Financial").length;
  const earliest = repository.getEarliestOccurrenceDate();
  const latest = repository.getLatestOccurrenceDate();

  const streamgraphCard = el(
    "a",
    {
      className: "component-card component-card--active",
      href: hrefFor("streamgraph"),
      onclick: (event: MouseEvent) => {
        event.preventDefault();
        navigate("streamgraph");
      },
    },
    [
      el("div", { className: "component-card__index" }, ["Component 2"]),
      el("div", { className: "component-card__title" }, ["Streamgraph"]),
      el("div", { className: "component-card__subtitle" }, ["Risk Stream / Timeline Explorer"]),
      el("p", { className: "component-card__body" }, [
        "Track how the nature of risk changes over time — not just how many events there were. Stack the timeline by risk theme, severity, organisation or event type, drill into any month or week, walk the events day by day, and open any event's full record.",
      ]),
      el("div", { className: "component-card__tags" }, [
        el("span", { className: "component-card__tag" }, ["Monthly / weekly"]),
        el("span", { className: "component-card__tag" }, ["Composition & severity mix"]),
        el("span", { className: "component-card__tag" }, ["Exposure & delays"]),
        el("span", { className: "component-card__tag" }, ["AI analysis"]),
      ]),
      el("div", { className: "component-card__cta" }, ["Open Streamgraph →"]),
    ],
  );

  const patternsCard = el(
    "a",
    {
      className: "component-card component-card--active",
      href: hrefFor("patterns"),
      onclick: (event: MouseEvent) => {
        event.preventDefault();
        navigate("patterns");
      },
    },
    [
      el("div", { className: "component-card__index" }, ["Component 4"]),
      el("div", { className: "component-card__title" }, ["Pattern Intelligence"]),
      el("div", { className: "component-card__subtitle" }, ["Investigation Workspace + AI Analyst"]),
      el("p", { className: "component-card__body" }, [
        "Browse the 22-item priority queue of statistically-detected patterns, drill into any pattern's verified evidence — matching events, enterprise comparison, workflow concentration, financial exposure — and ask an AI Analyst Assistant to interpret it. Every number and Event ID is code-verified; the AI only interprets, it never invents facts.",
      ]),
      el("div", { className: "component-card__tags" }, [
        el("span", { className: "component-card__tag" }, ["Priority queue"]),
        el("span", { className: "component-card__tag" }, ["Deterministic evidence"]),
        el("span", { className: "component-card__tag" }, ["Server-side Groq"]),
        el("span", { className: "component-card__tag" }, ["Synthetic data"]),
      ]),
      el("div", { className: "component-card__cta" }, ["Open Pattern Intelligence →"]),
    ],
  );

  root.innerHTML = "";
  root.append(
    el("header", { className: "landing-header" }, [
      el("div", { className: "landing-header__title" }, [
        el("span", { className: "glyph" }, ["◈"]),
        "Operational Risk Workbench",
      ]),
      el("div", { className: "landing-header__subtitle" }, [
        "Synthetic operational risk event analysis · Internship take-home",
      ]),
    ]),

    el("main", { className: "landing-main", id: "main-content" }, [
      el("section", { className: "panel" }, [
        el("div", { className: "panel__header" }, [
          el("span", { className: "panel__title" }, ["Dataset"]),
        ]),
        el("div", { className: "panel__body" }, [
          el("div", { className: "landing-stats" }, [
            statBlock(String(repository.count()), "Risk events"),
            statBlock(String(repository.getDistinctOrganisations().length), "Organisations"),
            statBlock(String(financialCount), "Financial events"),
            statBlock(String(highCount), "High severity", "var(--accent-red)"),
            statBlock(
              earliest && latest ? `${earliest.slice(0, 7)} → ${latest.slice(0, 7)}` : "—",
              "Occurrence range",
            ),
          ]),
        ]),
      ]),

      el("section", { className: "panel" }, [
        el("div", { className: "panel__header" }, [
          el("span", { className: "panel__title" }, ["Components"]),
        ]),
        el("div", { className: "panel__body" }, [
          el("div", { className: "component-grid" }, [streamgraphCard, patternsCard]),
        ]),
      ]),
    ]),
  );
}
