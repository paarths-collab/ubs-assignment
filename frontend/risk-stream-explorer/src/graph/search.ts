import type { BrainDataModel, SearchEntry } from "./types";

export interface SearchResult {
  entry: SearchEntry;
  /** Whether this entity has at least one event in the current filtered scope. */
  activeInScope: boolean;
  /**
   * Extra context shown alongside the label — e.g. a person's most common
   * owner organisation — so results with similar names are tellable apart
   * without opening each one.
   */
  contextLabel: string | null;
}

function normalize(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, " ");
}

function rawEventIdFromNodeId(nodeId: string): string {
  return nodeId.startsWith("event::") ? nodeId.slice("event::".length) : nodeId;
}

function isActiveInScope(data: BrainDataModel, filteredEventIds: Set<string>, entry: SearchEntry): boolean {
  if (entry.type === "enterprise") return true;
  if (entry.type === "event") return filteredEventIds.has(rawEventIdFromNodeId(entry.id));
  const events = data.nodeToEvents.get(entry.id) ?? [];
  return events.some((eventId) => filteredEventIds.has(eventId));
}

/** Organisation names repeat the same "→ Fictional Enterprise Operations" suffix; only the prefix identifies them. */
export function shortOrgName(label: string): string {
  const [primary] = label.split("→");
  return (primary ?? label).trim();
}

/**
 * A short second line for a result, so entries with similar names are
 * tellable apart in the dropdown without opening each one: a person shows
 * the organisation they most often own events under, an event shows its
 * owner organisation too.
 */
function contextLabelFor(data: BrainDataModel, entry: SearchEntry): string | null {
  if (entry.type === "person") {
    const counts = new Map<string, number>();
    for (const eventId of data.nodeToEvents.get(entry.id) ?? []) {
      const org = data.eventsById.get(eventId)?.owner_organisation;
      if (org) counts.set(org, (counts.get(org) ?? 0) + 1);
    }
    let top: string | null = null;
    let topCount = 0;
    for (const [org, count] of counts) {
      if (count > topCount) {
        top = org;
        topCount = count;
      }
    }
    return top ? shortOrgName(top) : null;
  }
  if (entry.type === "event") {
    const org = data.eventsById.get(rawEventIdFromNodeId(entry.id))?.owner_organisation;
    return org ? shortOrgName(org) : null;
  }
  return null;
}

/** Ranks a match: 0 = exact, 1 = starts-with, 2 = token starts-with, 3 = substring. */
function matchRank(normalizedQuery: string, entry: SearchEntry): number | null {
  const haystack = entry.search_text;
  if (haystack === normalizedQuery) return 0;
  if (haystack.startsWith(normalizedQuery)) return 1;
  if (haystack.split(/\s+/).some((token) => token.startsWith(normalizedQuery))) return 2;
  if (haystack.includes(normalizedQuery)) return 3;
  return null;
}

/**
 * Searches Event/Person/Organisation/Issue/Root Cause/Risk Theme/OR Category
 * entities. Respects the current filtered scope by flagging (not hiding)
 * entities with no events in scope, per the "available outside current
 * filters" UX requirement.
 */
export function searchEntities(
  data: BrainDataModel,
  filteredEventIds: Set<string>,
  query: string,
  limit = 20,
): SearchResult[] {
  const normalizedQuery = normalize(query);
  if (normalizedQuery.length === 0) return [];

  const ranked: Array<{ entry: SearchEntry; rank: number }> = [];
  for (const entry of data.searchIndex) {
    const rank = matchRank(normalizedQuery, entry);
    if (rank !== null) ranked.push({ entry, rank });
  }

  ranked.sort((a, b) => a.rank - b.rank || a.entry.label.localeCompare(b.entry.label));

  return ranked.slice(0, limit).map(({ entry }) => ({
    entry,
    activeInScope: isActiveInScope(data, filteredEventIds, entry),
    contextLabel: contextLabelFor(data, entry),
  }));
}
