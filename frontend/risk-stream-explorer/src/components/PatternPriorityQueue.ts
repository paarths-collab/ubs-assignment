import type { Pattern } from "../types/pattern";
import { el } from "./dom";

function humanizeTag(tag: string): string {
  return tag.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

function priorityPill(level: string): HTMLElement {
  const cls = level.toLowerCase() === "high" ? "priority-pill priority-pill--high" : "priority-pill priority-pill--medium";
  return el("span", { className: cls }, [level]);
}

function patternCard(pattern: Pattern, isSelected: boolean, onSelect: (patternId: string) => void): HTMLElement {
  const cardCls = pattern.priority_level.toLowerCase() === "high" ? "pattern-card pattern-card--priority-high" : "pattern-card pattern-card--priority-medium";
  const o = pattern.observed;

  return el(
    "button",
    {
      type: "button",
      className: cardCls,
      "aria-pressed": String(isSelected),
      onclick: () => onSelect(pattern.pattern_id),
    },
    [
      el("div", { className: "pattern-card__top" }, [
        el("span", { className: "pattern-card__id" }, [pattern.pattern_id]),
        priorityPill(pattern.priority_level),
      ]),
      el("div", { className: "pattern-card__title" }, [pattern.title]),
      el("div", { className: "pattern-card__why" }, [pattern.why_seen]),
      el(
        "div",
        { className: "pattern-card__tags" },
        pattern.priority_reasons.map((reason) => el("span", { className: "pattern-card__tag" }, [humanizeTag(reason)])),
      ),
      el("div", { className: "pattern-card__stats" }, [
        el("div", { className: "pattern-card__stat" }, [
          el("span", { className: "pattern-card__stat-value" }, [String(o.event_count)]),
          el("span", { className: "pattern-card__stat-label" }, ["Events"]),
        ]),
        el("div", { className: "pattern-card__stat" }, [
          el("span", { className: "pattern-card__stat-value", style: "color:var(--accent-red)" }, [`${o.high_rate_pct.toFixed(0)}%`]),
          el("span", { className: "pattern-card__stat-label" }, ["High rate"]),
        ]),
        el("div", { className: "pattern-card__stat" }, [
          el("span", { className: "pattern-card__stat-value" }, [`${o.high_rate_lift.toFixed(1)}x`]),
          el("span", { className: "pattern-card__stat-label" }, ["Lift vs ent."]),
        ]),
        el("div", { className: "pattern-card__stat" }, [
          el("span", { className: "pattern-card__stat-value" }, [String(o.open_events)]),
          el("span", { className: "pattern-card__stat-label" }, ["Open"]),
        ]),
      ]),
    ],
  );
}

/**
 * Renders the 22-item priority queue as a grid of cards. Purely
 * deterministic (`GET /api/patterns/priority`) — no AI call is needed to
 * render this panel, so it's always available even if Groq is down.
 */
export function renderPatternPriorityQueue(
  container: HTMLElement,
  patterns: Pattern[],
  selectedPatternId: string | null,
  onSelect: (patternId: string) => void,
): void {
  container.innerHTML = "";
  if (patterns.length === 0) {
    container.append(el("div", { className: "empty-state" }, ["No priority patterns available."]));
    return;
  }
  container.append(
    el(
      "div",
      { className: "pattern-grid" },
      patterns.map((pattern) => patternCard(pattern, pattern.pattern_id === selectedPatternId, onSelect)),
    ),
  );
}
