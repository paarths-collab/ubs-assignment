import type { BrainDataModel, BrainEvent, BrainNode, NodeType } from "./types";
import type { FilterState } from "./app-state";
import type { FlowTemplateId } from "./flow-model";

/** Chooses only from the saved templates; the graph builder remains deterministic. */
export function chooseFlowTemplate(question: string): FlowTemplateId {
  const text = question.toLowerCase();
  if (/people|person|assignee|owner|administrator|creator|modifier|workflow|role/.test(text)) return "workflow-people";
  if (/organisation|organization|company|concentration|where.*cluster|grouped by/.test(text)) return "organisation-concentration";
  if (/full|overall|everything|complete|all connections|entire chain/.test(text)) return "full-risk-chain";
  return "issue-investigation";
}

export interface GuidanceAction {
  label: string;
  kind: "focus" | "delay" | "analyse";
  nodeId?: string;
}

export interface GuidanceCard {
  title: string;
  body: string;
  actions: GuidanceAction[];
}

function countBy(values: string[]): Array<{ value: string; count: number }> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

function nodeForEvent(data: BrainDataModel, event: BrainEvent, field: "issue" | "root_cause" | "risk_theme"): string | undefined {
  return data.eventToNodes.get(event.event_id)?.[field];
}

export function buildScopeGuidance(data: BrainDataModel, eventIds: string[]): GuidanceCard {
  const events = eventIds.map((id) => data.eventsById.get(id)).filter((event): event is BrainEvent => Boolean(event));
  if (events.length === 0) return { title: "AI guidance", body: "No events match the current scope. Refine the filters to continue.", actions: [] };
  const topIssue = countBy(events.map((event) => event.issue_detail))[0];
  const topOrg = countBy(events.map((event) => event.owner_organisation))[0];
  const delayed = events.filter((event) => event.recording_delay_days >= 7);
  const high = events.filter((event) => event.severity === "High").length;
  const issueNode = topIssue ? nodeForEvent(data, events.find((event) => event.issue_detail === topIssue.value)!, "issue") : undefined;
  const parts = [
    `${events.length} events are in scope`,
    topIssue ? `${topIssue.value} is the most repeated issue (${topIssue.count})` : "no repeated issue dominates",
    topOrg ? `${topOrg.value.split(" → ")[0]} owns the largest share (${topOrg.count})` : "",
    high > 0 ? `${high} are High severity` : "no High-severity events",
    delayed.length > 0 ? `${delayed.length} have recording delays of 7+ days` : "no 7+ day recording-delay cluster",
  ].filter(Boolean);
  return {
    title: "What should I look at?",
    body: `${parts.join(". ")}.`,
    actions: [
      ...(issueNode ? [{ label: "Focus top issue", kind: "focus" as const, nodeId: issueNode }] : []),
      ...(delayed.length > 0 ? [{ label: "Show delayed events", kind: "delay" as const }] : []),
      { label: "Explain why", kind: "analyse" },
    ],
  };
}

export function buildNodeGuidance(data: BrainDataModel, node: BrainNode, eventIds: string[]): { summary: string; suggestions: string[]; badge: string | null } {
  const events = eventIds.map((id) => data.eventsById.get(id)).filter((event): event is BrainEvent => Boolean(event));
  if (events.length === 0) return { summary: "This entity has no matching events in the current filtered scope.", suggestions: ["Widen the filters", "Compare this entity outside the current scope"], badge: null };
  const organisations = new Set(events.flatMap((event) => [event.owner_organisation, event.discovery_organisation]));
  const delayed = events.filter((event) => event.recording_delay_days >= 7).length;
  const topIssue = countBy(events.map((event) => event.issue_detail))[0];
  const high = events.filter((event) => event.severity === "High").length;
  const summary = `${node.label} is connected to ${events.length} matching event${events.length === 1 ? "" : "s"} across ${organisations.size} organisation${organisations.size === 1 ? "" : "s"}. ${topIssue ? `${topIssue.value} recurs ${topIssue.count} time${topIssue.count === 1 ? "" : "s"}.` : "No single issue dominates."} ${delayed > 0 ? `${delayed} event${delayed === 1 ? " has" : "s have"} a 7+ day recording delay.` : "Recording delay is not the strongest signal."}`;
  const badge = organisations.size >= 3 ? `AI signal · repeated across ${organisations.size} orgs` : delayed >= 3 ? `AI signal · ${delayed} delayed events` : high >= 3 ? `AI signal · ${high} High severity` : null;
  return {
    summary,
    badge,
    suggestions: [
      "Compare this issue across owner vs discovery organisations",
      "Inspect the longest-recording events",
      "Check whether the same root cause appears across multiple issue templates",
    ],
  };
}

export function evidenceBadge(data: BrainDataModel, eventIds: string[], type: NodeType): string | null {
  if (!(type === "issue" || type === "root_cause" || type === "risk_theme")) return null;
  const organisations = new Set<string>();
  for (const id of eventIds) {
    const event = data.eventsById.get(id);
    if (event) organisations.add(event.owner_organisation);
  }
  return organisations.size >= 3 ? `AI · ${organisations.size} orgs` : null;
}

export function parseNaturalLanguageQuery(question: string, data: BrainDataModel, base: FilterState): { filters: FilterState; explanation: string } {
  const q = question.toLowerCase();
  const filters: FilterState = {
    ...base,
    occurrenceDate: { ...base.occurrenceDate },
    advanced: { ...base.advanced },
  };
  const applied: string[] = [];
  if (/\bhigh[- ]severity\b|\bhigh\b/.test(q)) { filters.severity = ["High"]; applied.push("High severity"); }
  if (/\bfinancial\b/.test(q) && !/non[- ]financial/.test(q)) { filters.eventType = ["Financial"]; applied.push("Financial"); }
  if (/\bnon[- ]financial\b/.test(q)) { filters.eventType = ["Non-Financial"]; applied.push("Non-Financial"); }
  const year = q.match(/\b(2024|2025|2026)\b/)?.[1];
  if (year) { filters.occurrenceDate = { from: `${year}-01-01`, to: `${year}-12-31` }; applied.push(year); }
  if (/recording delay|recording delays|delayed recording|long recording/.test(q)) { filters.recordingDelay = { ...filters.recordingDelay, min: 7 }; applied.push("recording delay ≥ 7 days"); }
  const org = data.filterValues.owner_organisation.find((value) => {
    const name = value.split(" → ")[0]?.toLowerCase() ?? "";
    const brand = name.split(/\s+/)[0] ?? "";
    return q.includes(name) || q.includes(brand);
  });
  if (org) { filters.ownerOrganisation = [org]; applied.push(org.split(" → ")[0] ?? org); }
  const issue = data.filterValues.issue_detail.find((value) => q.includes(value.toLowerCase()));
  if (issue) { filters.issue = [issue]; applied.push("issue: " + issue.slice(0, 42)); }
  return { filters, explanation: applied.length > 0 ? `Applied ${applied.join(" · ")}. JavaScript computed the final event scope.` : "I could not map that question to a supported filter yet. Try severity, type, organisation, year, or recording delay." };
}
