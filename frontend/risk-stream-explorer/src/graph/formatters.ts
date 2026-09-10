import type { AmountSummary, DelaySummary } from "./metrics";

const MONEY_FORMAT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const NUMBER_FORMAT = new Intl.NumberFormat("en-US");

export const NOT_APPLICABLE = "N/A";

/**
 * Formats a money value. A structurally absent amount (a Non-Financial
 * event has no gross/net/recovery) renders as N/A; a real zero renders as
 * $0. Collapsing those two into one value would misrepresent the data.
 */
export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return NOT_APPLICABLE;
  return MONEY_FORMAT.format(value);
}

export function formatAmountSummary(summary: AmountSummary): string {
  return formatMoney(summary.total);
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return NOT_APPLICABLE;
  return NUMBER_FORMAT.format(value);
}

export function formatCountSummary(summary: AmountSummary): string {
  return formatNumber(summary.total);
}

export function formatPercent(value: number | null | undefined, fractionDigits = 1): string {
  if (value === null || value === undefined) return NOT_APPLICABLE;
  return `${value.toFixed(fractionDigits)}%`;
}

export function formatDays(value: number | null | undefined): string {
  if (value === null || value === undefined) return NOT_APPLICABLE;
  const rounded = Math.round(value * 10) / 10;
  return `${rounded} day${rounded === 1 ? "" : "s"}`;
}

export function formatDelaySummary(summary: DelaySummary): string {
  if (summary.average === null) return NOT_APPLICABLE;
  return `${formatDays(summary.average)} avg · ${formatDays(summary.median)} median`;
}

/** Dataset dates are ISO `YYYY-MM-DD` strings; parsed as UTC to avoid timezone drift. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return NOT_APPLICABLE;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export function formatText(value: string | null | undefined): string {
  if (value === null || value === undefined || value.trim() === "") return NOT_APPLICABLE;
  return value;
}
