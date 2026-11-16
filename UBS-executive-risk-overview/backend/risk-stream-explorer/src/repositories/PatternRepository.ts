import type { EnterpriseBaseline } from "../types/RiskEvent";
import type { Pattern, RiskPatternsDataset } from "../types/Pattern";

/**
 * Owns the pattern list and its indexes. Built once at startup from the
 * validated `risk_patterns_final.json` payload; all downstream services read
 * through this rather than re-scanning the raw array.
 */
export class PatternRepository {
  private readonly patterns: Pattern[];
  private readonly byId: Map<string, Pattern>;
  private readonly priorityQueueIds: string[];
  private readonly enterprise: EnterpriseBaseline;
  private readonly patternCount: number;

  constructor(dataset: RiskPatternsDataset) {
    this.patterns = dataset.patterns;
    this.byId = new Map(this.patterns.map((pattern) => [pattern.pattern_id, pattern]));
    this.priorityQueueIds = dataset.priority_queue;
    this.enterprise = dataset.enterprise;
    this.patternCount = dataset.pattern_count;
  }

  getAll(): Pattern[] {
    return this.patterns;
  }

  getById(patternId: string): Pattern | null {
    return this.byId.get(patternId) ?? null;
  }

  /** Resolves the 22-entry priority queue (an ordered list of pattern_id strings) into full Pattern objects, in queue order. */
  getPriorityQueue(): Pattern[] {
    const resolved: Pattern[] = [];
    for (const id of this.priorityQueueIds) {
      const pattern = this.byId.get(id);
      if (pattern) resolved.push(pattern);
    }
    return resolved;
  }

  count(): number {
    return this.patternCount;
  }

  getEnterpriseBaseline(): EnterpriseBaseline {
    return this.enterprise;
  }
}
