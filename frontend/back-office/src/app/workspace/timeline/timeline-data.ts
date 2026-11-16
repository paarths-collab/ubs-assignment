import type { SourceEvent } from '../overview/data';

export type MonthSummary = { month: string; events: number; high: number; financial: number; netExposure: number | null; remediationHours: number };
export const MAX_TIMELINE_MONTHS = 120;
function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}
function monthIndex(value: string): number {
  return Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7)) - 1;
}
export function timelineRangeError(from: string, to: string): string | null {
  if (!validDate(from) || !validDate(to)) return 'Enter valid calendar dates between years 0001 and 9999.';
  if (from > to) return 'Choose an end date on or after the start date.';
  if (monthIndex(to) - monthIndex(from) + 1 > MAX_TIMELINE_MONTHS) return `Choose a range covering no more than ${MAX_TIMELINE_MONTHS} calendar months.`;
  return null;
}
/** Include zero-event months, with a bounded range even at the maximum supported year. */
export function timelineMonths(events: readonly SourceEvent[], from: string, to: string): MonthSummary[] {
  if (timelineRangeError(from, to)) return [];
  const start = monthIndex(from);
  const length = monthIndex(to) - start + 1;
  const buckets = new Map<string, MonthSummary>();
  for (let offset = 0; offset < length; offset++) {
    const index = start + offset;
    const month = `${String(Math.floor(index / 12)).padStart(4, '0')}-${String(index % 12 + 1).padStart(2, '0')}`;
    buckets.set(month, { month, events: 0, high: 0, financial: 0, netExposure: null, remediationHours: 0 });
  }
  for (const event of events) {
    if (event.occurrenceDate < from || event.occurrenceDate > to) continue;
    const bucket = buckets.get(event.occurrenceDate.slice(0, 7));
    if (!bucket) continue;
    bucket.events++;
    if (event.severity === 'High') bucket.high++;
    if (event.eventType === 'Financial') bucket.financial++;
    if (event.netAmountUsd !== null) bucket.netExposure = (bucket.netExposure ?? 0) + event.netAmountUsd;
    bucket.remediationHours += event.remediationHours;
  }
  return [...buckets.values()];
}
export function periodEvents(events: readonly SourceEvent[], month: string): SourceEvent[] {
  return events.filter(event => !month || event.occurrenceDate.startsWith(`${month}-`))
    .sort((a, b) => b.occurrenceDate.localeCompare(a.occurrenceDate) || a.eventId.localeCompare(b.eventId));
}
export function monthLabel(month: string): string {
  return new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}
