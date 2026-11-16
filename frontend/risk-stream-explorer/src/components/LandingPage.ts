import type { EventRepository, StreamEvent } from "@backend/index";
import { el } from "./dom";
import { hrefFor, navigate, type Route } from "../router";

type Scope = "All events" | "Financial" | "Non-Financial";
const LINKS: Array<{ route: Route; label: string; mark: string }> = [
  { route: "home", label: "Overview", mark: "◫" },
  { route: "kpi", label: "Dashboard", mark: "▥" },
  { route: "streamgraph", label: "Timeline", mark: "≋" },
  { route: "graph", label: "Network", mark: "⌘" },
  { route: "issues", label: "Issues", mark: "◎" },
  { route: "patterns", label: "Patterns", mark: "⋈" },
];

function routeLink(route: Route, label: string, className: string): HTMLAnchorElement {
  return el("a", {
    href: hrefFor(route), className,
    onclick: (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigate(route);
    },
  }, [label]);
}

function svgNode<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>): SVGElementTagNameMap[K] {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

function monthLabel(month: string, short = false): string {
  return new Intl.DateTimeFormat("en", { month: short ? "short" : "long", ...(short ? {} : { year: "numeric" }), timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
}

/** A data-first entry point: every chart and figure is derived from the timeline repository. */
export function renderLandingPage(repository: EventRepository, root: HTMLElement): void {
  let scope: Scope = "All events";
  let selectedMonth: string | null = null;
  const allEvents = repository.getAll();
  const months = [...new Set(allEvents.map((event) => event.occurrenceDate.slice(0, 7)))].sort();
  const nav = el("nav", { className: "signal-nav", "aria-label": "Analysis workspaces" });
  for (const link of LINKS) {
    const anchor = routeLink(link.route, link.label, `signal-nav__link${link.route === "home" ? " is-active" : ""}`);
    anchor.prepend(el("span", { "aria-hidden": "true", className: "signal-nav__icon" }, [link.mark]));
    if (link.route === "home") anchor.setAttribute("aria-current", "page");
    nav.append(anchor);
  }
  const brand = routeLink("home", "Signal", "signal-brand");
  brand.prepend(el("span", { className: "signal-brand__mark", "aria-hidden": "true" }, ["∿"]));
  const sidebar = el("aside", { className: "signal-sidebar" }, [
    brand, el("div", { className: "signal-brand__caption" }, ["DATA ANALYSIS"]),
    el("div", { className: "signal-nav__label" }, ["WORKSPACE"]), nav,
    el("div", { className: "signal-sidebar__note" }, [
      el("span", { className: "signal-status-dot", "aria-hidden": "true" }),
      el("div", {}, [el("strong", {}, ["Demo workspace"]), el("p", {}, ["Synthetic operational data"])]),
    ]),
  ]);
  const stats = el("div", { className: "signal-stats", "aria-live": "polite" });
  const plot = el("div", { className: "signal-chart" });
  const chartSummary = el("p", { className: "signal-chart__summary", "aria-live": "polite" });
  const period = el("div", { className: "signal-period", "aria-live": "polite" });
  const severity = el("div", { className: "signal-severity" });
  const scopeButtons = new Map<Scope, HTMLButtonElement>();
  const tabs = el("div", { className: "signal-segments", role: "group", "aria-label": "Event type" });
  for (const option of ["All events", "Financial", "Non-Financial"] as Scope[]) {
    const button = el("button", { type: "button", onclick: () => { scope = option; selectedMonth = null; update(); } }, [option]);
    scopeButtons.set(option, button);
    tabs.append(button);
  }
  function updatePeriod(events: readonly StreamEvent[]): void {
    if (!selectedMonth) {
      period.replaceChildren(el("span", {}, ["Select a month to inspect its events"]), routeLink("streamgraph", "Explore timeline ↗", "signal-text-link"));
      return;
    }
    const matching = events.filter((event) => event.occurrenceDate.startsWith(selectedMonth!));
    const high = matching.filter((event) => event.severity === "High").length;
    period.replaceChildren(el("span", {}, [el("strong", {}, [monthLabel(selectedMonth)]), ` · ${matching.length} events · ${high} High`]), routeLink("streamgraph", "Open full timeline ↗", "signal-text-link"));
  }
  function update(): void {
    const events = scope === "All events" ? allEvents : allEvents.filter((event) => event.eventType === scope);
    for (const [option, button] of scopeButtons) button.setAttribute("aria-pressed", String(scope === option));
    const high = events.filter((event) => event.severity === "High").length;
    const organisations = new Set(events.map((event) => event.ownerOrganisation)).size;
    const financial = events.filter((event) => event.eventType === "Financial").length;
    const cards = [
      ["Events in view", events.length.toLocaleString(), `${allEvents.length.toLocaleString()} in the timeline dataset`, "↗"],
      ["High severity", high.toLocaleString(), `${events.length ? (high / events.length * 100).toFixed(1) : "0.0"}% of selected events`, "◎"],
      ["Organisations", String(organisations), "Distinct event owners", "⌘"],
      ["Financial events", financial.toLocaleString(), `${events.length ? (financial / events.length * 100).toFixed(1) : "0.0"}% of selected events`, "◇"],
    ];
    stats.replaceChildren(...cards.map(([label, value, detail, mark], index) => el("div", { className: `signal-stat signal-stat--${index}` }, [
      el("div", { className: "signal-stat__label" }, [label, el("span", { "aria-hidden": "true" }, [mark])]),
      el("div", { className: "signal-stat__value" }, [value]),
      el("div", { className: "signal-stat__detail" }, [detail]),
    ])));
    const counts = months.map((month) => events.filter((event) => event.occurrenceDate.startsWith(month)).length);
    const max = Math.max(1, ...counts);
    const chart = svgNode("svg", { viewBox: "0 0 820 250", role: "group", "aria-label": "Monthly event counts. Focus a month and press Enter or Space to inspect it." });
    const left = 32, top = 16, height = 188, width = 766;
    for (let tick = 0; tick <= 4; tick++) {
      const y = top + height - height * tick / 4;
      chart.append(svgNode("line", { x1: String(left), x2: String(left + width), y1: String(y), y2: String(y), class: "signal-chart__grid" }));
      const label = svgNode("text", { x: "22", y: String(y + 4), "text-anchor": "end", class: "signal-chart__axis" });
      label.textContent = String(Math.round(max * tick / 4)); chart.append(label);
    }
    const step = width / Math.max(1, months.length);
    months.forEach((month, index) => {
      const value = counts[index] ?? 0;
      const group = svgNode("g", { tabindex: "0", role: "button", "aria-label": `${monthLabel(month)}: ${value} events`, "aria-pressed": String(selectedMonth === month), class: "signal-chart__month" });
      const barHeight = value / max * height;
      const bar = svgNode("rect", { x: String(left + index * step + 3), y: String(top + height - barHeight), width: String(Math.max(2, step - 7)), height: String(Math.max(2, barHeight)), rx: "3", class: "signal-chart__bar" });
      group.append(svgNode("rect", { x: String(left + index * step), y: String(top), width: String(step), height: String(height), fill: "transparent" }), bar);
      const title = svgNode("title", {}); title.textContent = `${monthLabel(month)}: ${value} events`; group.append(title);
      const select = () => { selectedMonth = month; chart.querySelectorAll("[aria-pressed]").forEach((node) => node.setAttribute("aria-pressed", String(node === group))); updatePeriod(events); };
      group.addEventListener("click", select);
      group.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(); } });
      chart.append(group);
      if (index % 3 === 0 || index === months.length - 1) {
        const label = svgNode("text", { x: String(left + index * step + step / 2), y: "228", "text-anchor": "middle", class: "signal-chart__axis" });
        label.textContent = `${monthLabel(month, true)} '${month.slice(2, 4)}`; chart.append(label);
      }
    });
    plot.replaceChildren(chart);
    chartSummary.textContent = `${scope} · ${events.length.toLocaleString()} records across ${months.length} months`;
    updatePeriod(events);
    const segments = ["Low", "Moderate", "High"].map((level) => ({ level, count: events.filter((event) => event.severity === level).length }));
    const strip = el("div", { className: "signal-severity__strip", "aria-hidden": "true" });
    for (const item of segments) strip.append(el("span", { className: `signal-severity__fill is-${item.level.toLowerCase()}`, style: `width:${events.length ? item.count / events.length * 100 : 0}%` }));
    severity.replaceChildren(el("div", { className: "signal-severity__total" }, [String(events.length), el("span", {}, ["events classified"])]), strip,
      ...segments.map((item) => el("div", { className: "signal-severity__row" }, [el("span", { className: `signal-severity__dot is-${item.level.toLowerCase()}`, "aria-hidden": "true" }), el("span", {}, [item.level]), el("strong", {}, [String(item.count)]), el("span", { className: "signal-severity__share" }, [`${events.length ? (item.count / events.length * 100).toFixed(1) : "0.0"}%`])])),
      el("p", { className: "signal-note" }, ["Classification from the source records. Select an event type to compare the mix."]));
  }
  const workspaces: Array<{ route: Route; title: string; copy: string; tag: string; icon: string }> = [
    { route: "kpi", title: "Executive dashboard", copy: "Exposure, backlog and the issues that need attention.", tag: "MEASURE", icon: "▥" },
    { route: "graph", title: "Relationship network", copy: "Follow the connections between people, events and causes.", tag: "CONNECT", icon: "⌘" },
    { route: "patterns", title: "Pattern intelligence", copy: "Investigate recurring signals with matching event evidence.", tag: "DISCOVER", icon: "⋈" },
    { route: "issues", title: "Issue analysis", copy: "Review priorities, comparisons and evidence behind each issue.", tag: "INVESTIGATE", icon: "◎" },
  ];
  const workspaceGrid = el("div", { className: "signal-workspaces" }, workspaces.map((item) => {
    const link = routeLink(item.route, "", "signal-workspace");
    link.append(el("div", { className: "signal-workspace__top" }, [el("span", { className: "signal-workspace__icon", "aria-hidden": "true" }, [item.icon]), el("span", {}, [item.tag]), el("span", { className: "signal-workspace__arrow", "aria-hidden": "true" }, ["↗"])]), el("h3", {}, [item.title]), el("p", {}, [item.copy]));
    return link;
  }));
  root.replaceChildren(el("a", { href: "#main-content", className: "skip-link" }, ["Skip to analysis"]), el("div", { className: "signal-shell" }, [
    sidebar,
    el("div", { className: "signal-content" }, [
      el("header", { className: "signal-topbar" }, [el("span", {}, ["Workspace", el("span", { className: "signal-topbar__slash", "aria-hidden": "true" }, ["/"]), el("strong", {}, ["Overview"])]), el("span", { className: "signal-badge" }, [el("span", { className: "signal-status-dot", "aria-hidden": "true" }), "Synthetic dataset"])]),
      el("main", { className: "signal-main", id: "main-content" }, [
        el("div", { className: "signal-heading" }, [el("div", {}, [el("p", { className: "signal-eyebrow" }, ["YOUR DATA, IN FOCUS"]), el("h1", {}, ["Analysis overview"]), el("p", { className: "signal-subtitle" }, ["Understand the trends. Explore the connections. Find the next question."])]), routeLink("kpi", "Open dashboard ↗", "signal-primary-link")]),
        stats,
        el("div", { className: "signal-analysis-grid" }, [
          el("section", { className: "signal-frame signal-frame--activity", "aria-labelledby": "activity-title" }, [el("div", { className: "signal-frame__header" }, [el("div", {}, [el("h2", { id: "activity-title" }, ["Event activity"]), chartSummary]), tabs]), plot, period]),
          el("section", { className: "signal-frame signal-frame--severity", "aria-labelledby": "severity-title" }, [el("div", { className: "signal-frame__header" }, [el("div", {}, [el("h2", { id: "severity-title" }, ["Severity mix"]), el("p", {}, ["A closer look at the current selection"])])]), severity]),
        ]),
        el("div", { className: "signal-section-heading" }, [el("h2", {}, ["Go deeper"]), el("span", {}, ["Choose a lens for your analysis"])]), workspaceGrid,
        el("footer", { className: "signal-footer" }, [el("span", {}, ["Signal · Data Analysis"]), el("span", {}, ["Overview uses the timeline dataset. Dashboard, issues and patterns use the structured risk dataset."])]),
      ]),
    ]),
  ]));
  update();
}
