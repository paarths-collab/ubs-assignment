import type { MoneyAggregate } from "../types/Issue";

/** Mean of the non-null values only. Returns null when nothing is populated — never 0. */
export function meanNullable(values: Array<number | null | undefined>): number | null {
  const populated = values.filter((v): v is number => v !== null && v !== undefined);
  if (populated.length === 0) return null;
  return populated.reduce((a, b) => a + b, 0) / populated.length;
}

/** Median of the non-null values only. Returns null when nothing is populated. */
export function medianNullable(values: Array<number | null | undefined>): number | null {
  const populated = values.filter((v): v is number => v !== null && v !== undefined).sort((a, b) => a - b);
  if (populated.length === 0) return null;
  const mid = Math.floor(populated.length / 2);
  if (populated.length % 2 === 0) {
    const lower = populated[mid - 1] as number;
    const upper = populated[mid] as number;
    return (lower + upper) / 2;
  }
  return populated[mid] as number;
}

/**
 * Null-safe money aggregate over one field selector: sums only the events
 * that actually carry a value for this field (typically Financial events;
 * Non-Financial events legitimately have `null` here) and reports how many
 * of the group's events were populated, so a small `populated_count` next
 * to a total is always visible rather than silently treating missing data
 * as zero exposure.
 */
export function aggregateMoney<T>(events: T[], selector: (e: T) => number | null): MoneyAggregate {
  let total = 0;
  let populatedCount = 0;
  for (const event of events) {
    const value = selector(event);
    if (value !== null && value !== undefined) {
      total += value;
      populatedCount += 1;
    }
  }
  return {
    total: populatedCount > 0 ? round2(total) : null,
    populated_count: populatedCount,
    event_count: events.length,
  };
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Groups items by a string key, preserving first-seen key order. */
export function groupBy<T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(item);
    } else {
      groups.set(key, [item]);
    }
  }
  return groups;
}
