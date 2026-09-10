import type { PatternRepository } from "../repositories/PatternRepository.js";
import type { RiskEventRepository } from "../repositories/RiskEventRepository.js";
import type { Investigation, ObservedFacts } from "../types/Investigation.js";
import type { Pattern } from "../types/Pattern.js";

/**
 * Composes a pattern -> matching events -> enterprise comparison -> graph
 * filter into the response for `GET /api/investigations/:patternId`. Every
 * number here is read straight off the pre-computed pattern object — this
 * service does no statistics of its own, so its output is correct by
 * construction and never depends on Groq being reachable.
 */
export class InvestigationService {
  constructor(
    private readonly patternRepository: PatternRepository,
    private readonly eventRepository: RiskEventRepository,
  ) {}

  getInvestigation(patternId: string): Investigation | null {
    const pattern = this.patternRepository.getById(patternId);
    if (!pattern) return null;

    return {
      pattern,
      enterpriseComparison: pattern.compared_with_enterprise,
      graphFilter: pattern.graph_filter,
      deterministicSummary: buildDeterministicSummary(pattern),
      matchingEvents: this.eventRepository.getByIds(pattern.matching_event_ids),
      enterprise: this.patternRepository.getEnterpriseBaseline(),
    };
  }
}

/** The facts-only summary shown for both the deterministic panel and the AI panel's "OBSERVED" section. */
export function buildObservedFacts(pattern: Pattern): ObservedFacts {
  return {
    patternId: pattern.pattern_id,
    title: pattern.title,
    priorityLevel: pattern.priority_level,
    priorityReasons: pattern.priority_reasons,
    observed: pattern.observed,
    comparedWithEnterprise: pattern.compared_with_enterprise,
  };
}

/**
 * A short paragraph composed purely from the pattern's already-computed
 * `observed`/`compared_with_enterprise` fields — no Groq call involved, so
 * it renders even when the AI panel is unavailable.
 */
export function buildDeterministicSummary(pattern: Pattern): string {
  const o = pattern.observed;
  const highCount = o.severity["High"] ?? 0;

  const sentences = [
    `${o.event_count} event${o.event_count === 1 ? "" : "s"} match this pattern.`,
    `${highCount} ${highCount === 1 ? "is" : "are"} High-classified.`,
    `High rate is ${o.high_rate_pct.toFixed(1)}% vs ${o.enterprise_high_rate_pct.toFixed(1)}% enterprise-wide (${o.high_rate_lift.toFixed(2)}x concentration).`,
    `${o.open_events} of ${o.event_count} matching events ${o.open_events === 1 ? "is" : "are"} open.`,
  ];

  return sentences.join(" ");
}
