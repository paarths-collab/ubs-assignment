import type { BrainDataModel, BrainEvent } from "./types";

/**
 * The six pre-computed investigation flows shown on the landing screen.
 * Deterministic — every flow is a plain JavaScript computation over the raw
 * event fields, never an AI call.
 */
export type PriorityFlowId =
  | "high-severity-open"
  | "high-exposure-open"
  | "high-actual-loss-open"
  | "late-reported"
  | "ageing-open"
  | "repeated-issues"
  | "repeated-root-causes"
  | "owner-discovery-mismatch"
  | "high-severity-long-delay"
  | "high-exposure-long-delay"
  | "workflow-concentration";
  

export interface PriorityFlow {
  id: PriorityFlowId;
  title: string;
  /** A fixed, one-sentence explanation of why this flow matters — constant per flow id, not recomputed per run. */
  whyItMatters: string;
  eventIds: string[];
  /** Short "N events · M organisations" style summary chip. */
  headline: string;
  /** Short domain-specific tail chip (money, delay, or concentration signal). */
  signal: string;
}

const OPEN_STATUSES = new Set(["Active", "Under Investigation", "Remediation in Progress", "Pending Closure"]);
const DAY_MS = 86_400_000;
const WORKFLOW_CONCENTRATION_THRESHOLD = 15;
const REPEATED_ISSUE_THRESHOLD = 5;
const REPEATED_ROOT_CAUSE_THRESHOLD = 5;

function isOpenStatus(status: string): boolean {
  return OPEN_STATUSES.has(status);
}

function daysSince(dateStr: string): number {
  const parsed = Date.parse(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(parsed)) return 0;
  return Math.max(0, Math.floor((Date.now() - parsed) / DAY_MS));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function formatMillions(value: number): string {
  return `$${(value / 1_000_000).toFixed(1)}M`;
}

function orgCount(data: BrainDataModel, eventIds: string[]): number {
  const orgs = new Set<string>();
  for (const id of eventIds) {
    const event = data.eventsById.get(id);
    if (event) orgs.add(event.owner_organisation);
  }
  return orgs.size;
}

function genericHeadline(data: BrainDataModel, eventIds: string[]): string {
  const orgs = orgCount(data, eventIds);
  return `${eventIds.length} event${eventIds.length === 1 ? "" : "s"} · ${orgs} organisation${orgs === 1 ? "" : "s"}`;
}

const TITLE: Record<PriorityFlowId, string> = {
  "high-severity-open": "High-severity open",
  "high-exposure-open": "High-exposure open",
  "high-actual-loss-open": "High actual-loss open",
  "late-reported": "Late-reported",
  "ageing-open": "Ageing open",
  "repeated-issues": "Repeated issues",
  "repeated-root-causes": "Repeated root causes",
  "owner-discovery-mismatch": "Owner / discovery mismatch",
  "high-severity-long-delay": "High severity + long delay",
  "high-exposure-long-delay": "High exposure + long delay",
  "workflow-concentration": "Workflow concentration",
};

const WHY_IT_MATTERS: Record<PriorityFlowId, string> = {
  "high-severity-open": "These are the events with the biggest downside still on the table.",
  "high-exposure-open": "The largest potential financial exposure is still sitting in open events.",
  "high-actual-loss-open": "Actual loss is still unresolved in these open events.",
  "late-reported":
    "Events reported long after they occurred are the hardest to trust and the easiest to have compounded unnoticed.",
  "ageing-open": "The longer an event stays open, the harder it gets to close and the more it can quietly compound.",
  "repeated-issues": "The same issue recurring across many events points to a systemic root cause, not a one-off.",
  "repeated-root-causes": "A recurring root cause across organisations deserves a control review.",
  "owner-discovery-mismatch": "Cross-organisation ownership can slow resolution and obscure accountability.",
  "high-severity-long-delay": "Severity and delayed visibility compound the risk.",
  "high-exposure-long-delay": "Material exposure was visible late and remains unresolved.",
  "workflow-concentration":
    "When one person carries too many open events, that queue becomes a bottleneck and a single point of failure.",
};

function makeFlow(id: PriorityFlowId, eventIds: string[], headline: string, signal: string): PriorityFlow {
  return {
    id,
    title: TITLE[id],
    whyItMatters: WHY_IT_MATTERS[id],
    eventIds,
    headline: eventIds.length === 0 ? "No events match" : headline,
    signal: eventIds.length === 0 ? "" : signal,
  };
}

/**
 * Computes the six priority flows from the raw event/index data. Pure and
 * deterministic — no AI, no randomness — so the same dataset always yields
 * the same cards. Called once per page load; the flows do not depend on the
 * analyst's own filter selections.
 */
export function computePriorityFlows(data: BrainDataModel): PriorityFlow[] {
  const allEvents = Array.from(data.eventsById.values());
  const openEvents = allEvents.filter((event) => isOpenStatus(event.status));

  // (1) High-severity open — every open event with severity "High".
  const highSeverityOpen = openEvents.filter((event) => event.severity === "High");
  const highSeverityIds = highSeverityOpen.map((event) => event.event_id);
  const highSeverityPotential = highSeverityOpen.reduce(
    (sum, event) => sum + (event.potential_impact_amount_usd ?? 0),
    0,
  );
  const highSeverityOldest = highSeverityOpen.reduce((max, event) => Math.max(max, daysSince(event.occurrence_date)), 0);
  const highSeverityFlow = makeFlow(
    "high-severity-open",
    highSeverityIds,
    genericHeadline(data, highSeverityIds),
    `${formatMillions(highSeverityPotential)} potential · oldest ${highSeverityOldest} days`,
  );

  // (2) High-exposure open — open events with a known potential impact, top 30 by that amount.
  const exposureCandidates = openEvents.filter((event) => event.potential_impact_amount_usd !== null);
  const highExposureOpen = [...exposureCandidates]
    .sort((a, b) => (b.potential_impact_amount_usd ?? 0) - (a.potential_impact_amount_usd ?? 0))
    .slice(0, 30);
  const highExposureIds = highExposureOpen.map((event) => event.event_id);
  const exposurePotential = highExposureOpen.reduce((sum, event) => sum + (event.potential_impact_amount_usd ?? 0), 0);
  const exposureActual = highExposureOpen.reduce((sum, event) => sum + (event.net_amount_usd ?? 0), 0);
  const highExposureFlow = makeFlow(
    "high-exposure-open",
    highExposureIds,
    genericHeadline(data, highExposureIds),
    `${formatMillions(exposurePotential)} potential · ${formatMillions(exposureActual)} actual`,
  );

  // (3) Late-reported — every event (open or closed), top 25 by recording delay.
  const lateReported = [...allEvents].sort((a, b) => b.recording_delay_days - a.recording_delay_days).slice(0, 25);
  const lateReportedIds = lateReported.map((event) => event.event_id);
  const lateDelays = lateReported.map((event) => event.recording_delay_days);
  const lateReportedFlow = makeFlow(
    "late-reported",
    lateReportedIds,
    genericHeadline(data, lateReportedIds),
    `median lag ${Math.round(median(lateDelays))} days · max ${Math.max(0, ...lateDelays)} days`,
  );

  // (4) Ageing open — open events, oldest occurrence date first, top 30.
  const ageingOpen = [...openEvents].sort((a, b) => a.occurrence_date.localeCompare(b.occurrence_date)).slice(0, 30);
  const ageingIds = ageingOpen.map((event) => event.event_id);
  const ageingDays = ageingOpen.map((event) => daysSince(event.occurrence_date));
  const ageingFlow = makeFlow(
    "ageing-open",
    ageingIds,
    genericHeadline(data, ageingIds),
    `oldest ${Math.max(0, ...ageingDays)} days · median ${Math.round(median(ageingDays))} days`,
  );

  // (5) Repeated issues — events bucketed by issue node id, issues recurring 5+ times.
  const issueBuckets = new Map<string, string[]>();
  for (const event of allEvents) {
    const issueId = data.eventToNodes.get(event.event_id)?.issue;
    if (!issueId) continue;
    const bucket = issueBuckets.get(issueId) ?? [];
    bucket.push(event.event_id);
    issueBuckets.set(issueId, bucket);
  }
  const repeatedBuckets = [...issueBuckets.values()].filter((bucket) => bucket.length >= REPEATED_ISSUE_THRESHOLD);
  const repeatedIds = repeatedBuckets.flat();
  const topIssueCount = repeatedBuckets.reduce((max, bucket) => Math.max(max, bucket.length), 0);
  const repeatedFlow = makeFlow(
    "repeated-issues",
    repeatedIds,
    `${repeatedBuckets.length} recurring issue${repeatedBuckets.length === 1 ? "" : "s"} · ${repeatedIds.length} events`,
    `top issue ${topIssueCount} events`,
  );

  // (6) Workflow concentration — open events bucketed by owner and by assignee;
  // a person "concentrates" work when either bucket reaches the threshold.
  const ownerBuckets = new Map<string, Set<string>>();
  const assigneeBuckets = new Map<string, Set<string>>();
  const addToBucket = (buckets: Map<string, Set<string>>, key: string, eventId: string): void => {
    const set = buckets.get(key) ?? new Set<string>();
    set.add(eventId);
    buckets.set(key, set);
  };
  for (const event of openEvents) {
    if (event.owner_name) addToBucket(ownerBuckets, event.owner_name, event.event_id);
    if (event.current_assignee) addToBucket(assigneeBuckets, event.current_assignee, event.event_id);
  }
  const people = new Set<string>([...ownerBuckets.keys(), ...assigneeBuckets.keys()]);
  const concentratedEventIds = new Set<string>();
  let concentratedPeople = 0;
  let topLoad = 0;
  for (const person of people) {
    const ownerSet = ownerBuckets.get(person) ?? new Set<string>();
    const assigneeSet = assigneeBuckets.get(person) ?? new Set<string>();
    const concentrates =
      ownerSet.size >= WORKFLOW_CONCENTRATION_THRESHOLD || assigneeSet.size >= WORKFLOW_CONCENTRATION_THRESHOLD;
    if (!concentrates) continue;
    concentratedPeople += 1;
    topLoad = Math.max(topLoad, ownerSet.size, assigneeSet.size);
    for (const id of ownerSet) concentratedEventIds.add(id);
    for (const id of assigneeSet) concentratedEventIds.add(id);
  }
  const concentrationIds = Array.from(concentratedEventIds);
  const concentrationFlow = makeFlow(
    "workflow-concentration",
    concentrationIds,
    `${concentratedPeople} people carrying 15+ open events`,
    `top load ${topLoad} events on one person`,
  );

  const actualCandidates = openEvents.filter((event) => event.net_amount_usd !== null);
  const highActual = [...actualCandidates].sort((a, b) => (b.net_amount_usd ?? 0) - (a.net_amount_usd ?? 0)).slice(0, 30);
  const actualIds = highActual.map((event) => event.event_id);
  const actualFlow = makeFlow("high-actual-loss-open", actualIds, genericHeadline(data, actualIds), `${formatMillions(highActual.reduce((sum, event) => sum + (event.net_amount_usd ?? 0), 0))} actual`);

  const rootBuckets = new Map<string, string[]>();
  for (const event of openEvents) {
    const root = event.root_cause;
    const bucket = rootBuckets.get(root) ?? [];
    bucket.push(event.event_id);
    rootBuckets.set(root, bucket);
  }
  const repeatedRootIds = [...rootBuckets.values()].filter((ids) => ids.length >= REPEATED_ROOT_CAUSE_THRESHOLD).flat();
  const repeatedRootFlow = makeFlow("repeated-root-causes", repeatedRootIds, genericHeadline(data, repeatedRootIds), `recurring root causes ${new Set(repeatedRootIds).size}`);

  const mismatchIds = openEvents.filter((event) => event.owner_organisation !== event.discovery_organisation).map((event) => event.event_id);
  const mismatchFlow = makeFlow("owner-discovery-mismatch", mismatchIds, genericHeadline(data, mismatchIds), "owner and discovery organisations differ");
  const highDelay = openEvents.filter((event) => event.severity === "High" && event.recording_delay_days >= 7);
  const highDelayIds = highDelay.map((event) => event.event_id);
  const highDelayFlow = makeFlow("high-severity-long-delay", highDelayIds, genericHeadline(data, highDelayIds), `max lag ${Math.max(0, ...highDelay.map((event) => event.recording_delay_days))} days`);
  const exposureDelay = highExposureOpen.filter((event) => event.recording_delay_days >= 7);
  const exposureDelayIds = exposureDelay.map((event) => event.event_id);
  const exposureDelayFlow = makeFlow("high-exposure-long-delay", exposureDelayIds, genericHeadline(data, exposureDelayIds), `max lag ${Math.max(0, ...exposureDelay.map((event) => event.recording_delay_days))} days`);

  return [highSeverityFlow, highExposureFlow, actualFlow, lateReportedFlow, ageingFlow, repeatedFlow, repeatedRootFlow, mismatchFlow, highDelayFlow, exposureDelayFlow, concentrationFlow];
}
