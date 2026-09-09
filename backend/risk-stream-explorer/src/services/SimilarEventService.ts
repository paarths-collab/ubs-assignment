import type { StreamEvent } from "../types/Event";
import type { SimilarEventMatch } from "../types/AIInsight";
import { SIMILAR_EVENTS_LIMIT } from "../config/constants";

interface ScoredMatch {
  event: StreamEvent;
  score: number;
  matchedOn: string[];
}

/**
 * Deterministic similarity scoring — no LLM involved. Weights favour the most
 * specific signal (identical issue narrative) down to the broadest
 * (same owning organisation), so the ranking is fully auditable: every point
 * on the score traces to one matched field.
 */
export function findSimilarEvents(target: StreamEvent, candidates: StreamEvent[], limit = SIMILAR_EVENTS_LIMIT): SimilarEventMatch[] {
  const scored: ScoredMatch[] = [];

  for (const candidate of candidates) {
    if (candidate.eventId === target.eventId) continue;

    let score = 0;
    const matchedOn: string[] = [];

    if (candidate.issueDetail === target.issueDetail) {
      score += 4;
      matchedOn.push("Issue Detail");
    }
    if (candidate.rootCause === target.rootCause) {
      score += 3;
      matchedOn.push("Root Cause");
    }
    if (candidate.riskTheme === target.riskTheme) {
      score += 2;
      matchedOn.push("Risk Theme");
    }
    if (candidate.eventType === target.eventType) {
      score += 1;
      matchedOn.push("Event Type");
    }
    if (candidate.ownerOrganisation === target.ownerOrganisation) {
      score += 1;
      matchedOn.push("Organisation");
    }

    if (score > 0) {
      scored.push({ event: candidate, score, matchedOn });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score || a.event.eventId.localeCompare(b.event.eventId))
    .slice(0, limit)
    .map((m) => ({
      eventId: m.event.eventId,
      eventTitle: m.event.eventTitle,
      score: m.score,
      matchedOn: m.matchedOn,
    }));
}
