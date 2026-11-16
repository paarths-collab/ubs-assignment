import type { BrainDataModel, EventToNodesEntry, Severity } from "./types";

/**
 * A relationship aggregated across every filtered event that shares the
 * same (from, to) pair — e.g. "Meridian Client Operations -> Instruction
 * processing issue, 8 events". Never a source-data edge: always traceable
 * back to the real Event IDs that produced it.
 */
export interface DerivedAggregateEdge {
  id: string;
  from: string;
  to: string;
  eventIds: string[];
  severityCounts: Record<Severity, number>;
}

const ROLE_PAIRS: ReadonlyArray<readonly [keyof EventToNodesEntry, keyof EventToNodesEntry]> = [
  ["owner_organisation", "issue"],
  ["issue", "root_cause"],
  ["root_cause", "risk_theme"],
  ["risk_theme", "or_category"],
];

function emptySeverityCounts(): Record<Severity, number> {
  return { Low: 0, Moderate: 0, High: 0 };
}

/**
 * Builds the default high-level relationship chain — Organisation -> Issue
 * -> Root Cause -> Risk Theme -> OR Category — aggregated over the current
 * filtered event scope. One pass over filteredEventIds computes all four
 * link types at once. Recomputed on every filter change; never cached
 * across scopes, since the aggregation is only valid for the exact scope
 * it was built from.
 */
export function buildDerivedAggregateEdges(data: BrainDataModel, filteredEventIds: Set<string>): DerivedAggregateEdge[] {
  const aggregates = new Map<string, DerivedAggregateEdge>();

  for (const eventId of filteredEventIds) {
    const roleMap = data.eventToNodes.get(eventId);
    const event = data.eventsById.get(eventId);
    if (!roleMap || !event) continue;

    for (const [fromRole, toRole] of ROLE_PAIRS) {
      const fromId = roleMap[fromRole];
      const toId = roleMap[toRole];
      if (!fromId || !toId) continue;

      const key = `${fromId}->${toId}`;
      let aggregate = aggregates.get(key);
      if (!aggregate) {
        aggregate = { id: `derived::${key}`, from: fromId, to: toId, eventIds: [], severityCounts: emptySeverityCounts() };
        aggregates.set(key, aggregate);
      }
      aggregate.eventIds.push(eventId);
      aggregate.severityCounts[event.severity] += 1;
    }
  }

  return Array.from(aggregates.values());
}
