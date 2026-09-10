import type { EventRepository } from "@backend/index";
import { el } from "./dom";
import { hrefFor, navigate, type Route } from "../router";

function statBlock(value: string, label: string, accent?: string): HTMLElement {
  return el("div", { className: "landing-stat" }, [
    el("div", { className: "landing-stat__value", style: accent ? `color:${accent}` : undefined }, [value]),
    el("div", { className: "landing-stat__label" }, [label]),
  ]);
}

/** A compact note card used for the "assumptions" and "how AI works" columns. */
function noteCard(title: string, accent: string, lines: (string | HTMLElement)[]): HTMLElement {
  return el("div", { className: "note-card", style: `border-left-color:${accent}` }, [
    el("div", { className: "note-card__title" }, [title]),
    el(
      "ul",
      { className: "note-card__list" },
      lines.map((line) => el("li", {}, [line])),
    ),
  ]);
}

interface NavCardSpec {
  route: Route;
  index: string;
  title: string;
  question: string;
  body: string;
  helps: string[];
  recommended: "Senior Manager" | "Risk Analyst";
  tags: string[];
  cta: string;
}

function navCard(spec: NavCardSpec): HTMLElement {
  return el(
    "a",
    {
      className: "nav-card",
      href: hrefFor(spec.route),
      onclick: (event: MouseEvent) => {
        event.preventDefault();
        navigate(spec.route);
      },
    },
    [
      el("div", { className: "nav-card__top" }, [
        el("span", { className: "nav-card__index" }, [spec.index]),
        el("span", { className: `nav-card__rec nav-card__rec--${spec.recommended === "Senior Manager" ? "manager" : "analyst"}` }, [
          `Start here: ${spec.recommended}`,
        ]),
      ]),
      el("div", { className: "nav-card__title" }, [spec.title]),
      el("div", { className: "nav-card__question" }, [spec.question]),
      el("p", { className: "nav-card__body" }, [spec.body]),
      el("div", { className: "nav-card__helps-label" }, ["It helps answer"]),
      el(
        "ul",
        { className: "nav-card__helps" },
        spec.helps.map((q) => el("li", {}, [q])),
      ),
      el(
        "div",
        { className: "nav-card__tags" },
        spec.tags.map((tag) => el("span", { className: "nav-card__tag" }, [tag])),
      ),
      el("div", { className: "nav-card__cta" }, [spec.cta]),
    ],
  );
}

export function renderLandingPage(repository: EventRepository, root: HTMLElement): void {
  const total = repository.count();
  const highCount = repository.getAll().filter((e) => e.severity === "High").length;
  const financialCount = repository.getAll().filter((e) => e.eventType === "Financial").length;
  const nonFinancialCount = total - financialCount;
  const orgCount = repository.getDistinctOrganisations().length;
  const earliest = repository.getEarliestOccurrenceDate();
  const latest = repository.getLatestOccurrenceDate();
  const range = earliest && latest ? `${earliest.slice(0, 7)} → ${latest.slice(0, 7)}` : "—";

  const navCards = [
    navCard({
      route: "kpi",
      index: "Section 01",
      title: "Executive Risk Overview",
      question: "What needs management attention now?",
      body:
        "See the current enterprise risk position at a glance. Identify where severity, financial exposure, potential impact, recurrence and unresolved backlog are concentrated.",
      helps: [
        "Where is the biggest current exposure?",
        "Which organisation or issue needs attention first?",
        "What should management prioritise now?",
      ],
      recommended: "Senior Manager",
      tags: ["Exposure & loss", "Hotspots", "Priority risks", "Open backlog"],
      cta: "Open Executive Overview →",
    }),
    navCard({
      route: "streamgraph",
      index: "Section 02",
      title: "Risk Stream / Timeline",
      question: "What is changing over time?",
      body:
        "Track how the risk profile changes month by month or week by week. Separate changes in event volume from changes in severity, themes, organisations and financial impact.",
      helps: [
        "Is the risk profile changing over time?",
        "Which theme or organisation is driving the change?",
        "What caused a spike in a selected period?",
      ],
      recommended: "Senior Manager",
      tags: ["Monthly / weekly", "Risk composition", "Trend shifts", "Period drill-down"],
      cta: "Open Risk Stream →",
    }),
    navCard({
      route: "graph",
      index: "Section 03",
      title: "Relationship Network",
      question: "What is connected to this risk?",
      body:
        "Explore relationships between organisations, people, issues, root causes, risk themes and individual events. Search or filter the network to trace recurring and shared patterns.",
      helps: [
        "What is connected to this risk?",
        "Is the issue person-level, team-level, or enterprise-wide?",
        "Which people, organisations, causes and events are linked?",
      ],
      recommended: "Risk Analyst",
      tags: ["Search & filter", "People & organisations", "Recurrence", "Event evidence"],
      cta: "Open Relationship Network →",
    }),
    navCard({
      route: "patterns",
      index: "Section 04",
      title: "Pattern Intelligence & Investigation",
      question: "What should I investigate, and why?",
      body:
        "Find recurring or unusually costly risk patterns, understand why they were flagged, and move directly from evidence to investigation and control action.",
      helps: [
        "What unusual or recurring patterns exist?",
        "Why was this pattern flagged?",
        "What should the analyst investigate or control next?",
      ],
      recommended: "Risk Analyst",
      tags: ["Priority queue", "Pattern signals", "AI investigation", "Suggested controls"],
      cta: "Open Pattern Intelligence →",
    }),
  ];

  root.innerHTML = "";
  root.append(
    el("a", { href: "#main-content", className: "skip-link" }, ["Skip to main content"]),

    el("header", { className: "landing-header" }, [
      el("div", { className: "landing-header__eyebrow" }, ["UBS · AI Process Improvement · Take-home"]),
      el("div", { className: "landing-header__title" }, [
        el("span", { className: "glyph" }, ["◈"]),
        "UBS Risk Insights",
      ]),
      el("div", { className: "landing-header__subtitle" }, [
        "AI-assisted risk investigation & management",
      ]),
    ]),

    el("main", { className: "landing-main", id: "main-content" }, [
      // What this is
      el("section", { className: "panel" }, [
        el("div", { className: "panel__header" }, [el("span", { className: "panel__title" }, ["What this is"])]),
        el("div", { className: "panel__body" }, [
          el("p", { className: "landing-lede" }, [
            "An AI-assisted risk insights experience built from a synthetic risk-event dataset. It helps senior managers understand exposure and trends, and helps risk analysts investigate recurring patterns, ownership and control weaknesses.",
          ]),
          el("div", { className: "scope-strip" }, [
            el("span", { className: "scope-strip__item" }, [el("strong", {}, [String(total)]), " synthetic events"]),
            el("span", { className: "scope-strip__item" }, [el("strong", {}, [range]), " occurrence range"]),
            el("span", { className: "scope-strip__item" }, ["1 fictional enterprise"]),
            el("span", { className: "scope-strip__item" }, [el("strong", {}, [String(orgCount)]), " organisations"]),
            el("span", { className: "scope-strip__item" }, [`Financial (${financialCount}) + Non-Financial (${nonFinancialCount})`]),
          ]),
          el("p", { className: "scope-note" }, [
            el("strong", {}, ["Two timelines in the data. "]),
            "Risk events occurred Sep 2024 – Aug 2026 — this occurrence period drives the risk stream. Record activity runs later: discovery and creation extend into Sep 2026, and record modification through Nov 2026 — used for workflow and aging analysis, not for when the risk actually occurred.",
          ]),
        ]),
      ]),

      // Assumptions + How AI works, side by side
      el("section", { className: "panel" }, [
        el("div", { className: "panel__header" }, [el("span", { className: "panel__title" }, ["How to read this"])]),
        el("div", { className: "panel__body" }, [
          el("div", { className: "note-grid" }, [
            noteCard("Assumptions & caveats", "var(--accent-amber)", [
              "“-” is treated as missing, not as zero.",
              "Non-Financial events are not read as zero-risk just because loss fields are absent.",
              "People are analysed for workflow and ownership concentration.",
              "Observed associations do not prove causation.",
              "Suspicious dates (e.g. future Modified-On values) are flagged as data-quality issues, not trusted silently.",
            ]),
            noteCard("How AI is used", "var(--accent-primary)", [
              "Deterministic analysis finds the facts and patterns.",
              "AI explains verified evidence, suggests investigation questions and proposes possible controls.",
              "AI does not calculate or invent the underlying numbers.",
              "AI outputs are precomputed offline, so the experience stays reproducible and auditable.",
            ]),
          ]),
        ]),
      ]),

      // Sections / navigation
      el("section", { className: "panel" }, [
        el("div", { className: "panel__header" }, [
          el("span", { className: "panel__title" }, ["Where do you want to start?"]),
        ]),
        el("div", { className: "panel__body" }, [
          el("div", { className: "path-badges" }, [
            el("div", { className: "path-badge" }, [
              el("span", { className: "path-badge__role path-badge__role--manager" }, ["Senior Manager"]),
              el("span", { className: "path-badge__flow" }, ["Executive Overview → Risk Stream → Pattern Intelligence"]),
            ]),
            el("div", { className: "path-badge" }, [
              el("span", { className: "path-badge__role path-badge__role--analyst" }, ["Risk Analyst"]),
              el("span", { className: "path-badge__flow" }, ["Relationship Network → Pattern Intelligence → Executive Overview"]),
            ]),
          ]),
          el("p", { className: "path-note" }, [
            "Recommendations are a starting point only — every section is open to both roles.",
          ]),
          el("div", { className: "nav-grid" }, navCards),
        ]),
      ]),

      // Data confidence footer
      el("section", { className: "panel panel--muted" }, [
        el("div", { className: "panel__body" }, [
          el("div", { className: "confidence-strip" }, [
            el("span", { className: "confidence-strip__label" }, ["Data confidence"]),
            el("span", {}, ["Synthetic training dataset"]),
            el("span", {}, ["·"]),
            el("span", {}, ["Data-quality checks applied"]),
            el("span", {}, ["·"]),
            el("span", {}, ["Flagged records are surfaced inside the analysis, not hidden"]),
          ]),
          el("div", { className: "landing-stats" }, [
            statBlock(String(total), "Risk events"),
            statBlock(String(orgCount), "Organisations"),
            statBlock(String(financialCount), "Financial events"),
            statBlock(String(highCount), "High severity", "var(--accent-red)"),
            statBlock(range, "Occurrence range"),
          ]),
        ]),
      ]),
    ]),
  );
}
