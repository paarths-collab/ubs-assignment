import type { BrainDataModel, SearchEntry } from "./types";

export interface SearchResult {
  entry: SearchEntry;
  /** Whether this entity has at least one event in the current filtered scope. */
  activeInScope: boolean;
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
  }));
}
