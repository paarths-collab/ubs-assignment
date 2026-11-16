/**
 * Sums only non-null/non-undefined numeric values. Missing values are ignored
 * rather than treated as zero — required so Non-Financial events (which
 * structurally lack Gross/Net/Recovery) never drag a filtered sum toward zero.
 */
export function sumValid(values: ReadonlyArray<number | null | undefined>): number {
  return values.reduce<number>((total, value) => (value == null ? total : total + value), 0);
}

/** True if at least one value in the list is a real (non-null) number. */
export function hasAnyValid(values: ReadonlyArray<number | null | undefined>): boolean {
  return values.some((value) => value != null);
}

export function countWhere<T>(items: readonly T[], predicate: (item: T) => boolean): number {
  return items.reduce((count, item) => (predicate(item) ? count + 1 : count), 0);
}

export function groupCounts<T>(items: readonly T[], keyOf: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = keyOf(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export function uniqueValues<T>(items: readonly T[], keyOf: (item: T) => string): string[] {
  return Array.from(new Set(items.map(keyOf))).sort();
}
