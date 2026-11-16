interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * A minimal in-memory TTL cache for successful AI pattern-analysis results.
 * Deliberately not a database/Redis (explicit non-goal) — this is a single
 * Node process, so a Map is enough. Keyed by `patternId:promptVersion:model`
 * so a prompt or model change naturally invalidates old entries.
 */
export class AICacheService {
  private readonly store = new Map<string, CacheEntry<unknown>>();

  constructor(private readonly ttlMs: number) {}

  key(patternId: string, model: string, promptVersion: string): string {
    return `${patternId}:${promptVersion}:${model}`;
  }

  get<T>(cacheKey: string): T | null {
    const entry = this.store.get(cacheKey);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(cacheKey);
      return null;
    }
    return entry.value as T;
  }

  set<T>(cacheKey: string, value: T): void {
    this.store.set(cacheKey, { value, expiresAt: Date.now() + this.ttlMs });
  }

  has(cacheKey: string): boolean {
    return this.get(cacheKey) !== null;
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }
}
