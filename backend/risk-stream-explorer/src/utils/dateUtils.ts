/**
 * All dates in the dataset are plain "YYYY-MM-DD" strings with no time-of-day
 * or timezone component. Every parse here treats them as UTC calendar dates
 * so bucketing is stable regardless of the host machine's local timezone.
 *
 * Weekly bucketing definition (locked): ISO-style Monday→Sunday weeks. A week
 * bucket's id is anchored to its Monday; its point date (where it plots on the
 * timeline) is the Sunday that closes it. This avoids the ISO week-numbering
 * system's year-boundary edge cases while keeping the "Monday start" convention.
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE_RE.test(value)) return false;
  const d = parseIsoDate(value);
  return !Number.isNaN(d.getTime()) && formatIsoDate(d) === value;
}

export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatIsoDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

export function compareIsoDate(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** "DD-Mon-YYYY" (e.g. "13-Oct-2024") — the only field using this format is "Modified On". */
const DMY_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function parseDmyDate(value: string): Date | null {
  const match = /^(\d{2})-([A-Za-z]{3})-(\d{4})$/.exec(value);
  if (!match) return null;
  const [, dd, mon, yyyy] = match;
  const monthIndex = DMY_MONTHS.indexOf(mon as (typeof DMY_MONTHS)[number]);
  if (monthIndex === -1) return null;
  return new Date(Date.UTC(Number(yyyy), monthIndex, Number(dd)));
}

export interface MonthBounds {
  monthId: string;
  startDate: string;
  endDate: string;
}

export function getMonthBounds(date: Date): MonthBounds {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1));
  const end = new Date(Date.UTC(y, m + 1, 0));
  const monthId = `${y}-${String(m + 1).padStart(2, "0")}`;
  return { monthId, startDate: formatIsoDate(start), endDate: formatIsoDate(end) };
}

export function formatMonthLabel(monthId: string): string {
  const [y, m] = monthId.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, 1));
  return date.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}

export interface WeekBounds {
  mondayDate: string;
  startDate: string;
  endDate: string;
}

export function getWeekBounds(date: Date): WeekBounds {
  const dayOfWeek = date.getUTCDay(); // 0 = Sunday .. 6 = Saturday
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  const monday = addDays(date, -daysSinceMonday);
  const sunday = addDays(monday, 6);
  return {
    mondayDate: formatIsoDate(monday),
    startDate: formatIsoDate(monday),
    endDate: formatIsoDate(sunday),
  };
}

export function formatWeekLabel(startDate: string, endDate: string): string {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  const sameMonth = start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear();
  const startDay = start.getUTCDate();
  const endLabel = end.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  if (sameMonth) {
    return `${startDay}–${endLabel}`;
  }
  const startLabel = start.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${startLabel}–${endLabel}`;
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const midVal = sorted[mid];
  if (midVal === undefined) return null;
  if (sorted.length % 2 === 0) {
    const lower = sorted[mid - 1];
    return lower === undefined ? midVal : (lower + midVal) / 2;
  }
  return midVal;
}
