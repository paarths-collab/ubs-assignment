import type { EventType, Severity } from "@backend/index";
import { el } from "./dom";

export function severityBadge(severity: Severity): HTMLElement {
  const cls = `badge badge--severity-${severity.toLowerCase()}`;
  return el("span", { className: cls }, [el("span", { className: "dot" }), severity]);
}

export function eventTypeBadge(eventType: EventType): HTMLElement {
  const cls = eventType === "Financial" ? "badge badge--type-financial" : "badge badge--type-nonfinancial";
  return el("span", { className: cls }, [eventType]);
}
