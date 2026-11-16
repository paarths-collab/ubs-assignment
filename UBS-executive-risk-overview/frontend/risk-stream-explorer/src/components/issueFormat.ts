/** Shared formatters for the issue-intelligence components — kept in one place so the deterministic panel and the AI panel render numbers identically. */

export function formatMoney(value: number | null): string {
  if (value === null) return "N/A";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export function formatDays(value: number | null): string {
  if (value === null) return "N/A";
  return `${value.toFixed(1)}d`;
}

export function formatPct(value: number | null): string {
  if (value === null) return "N/A";
  return `${value.toFixed(1)}%`;
}

export function formatSignedPct(value: number | null): string {
  if (value === null) return "N/A";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export function formatSignedDays(value: number | null): string {
  if (value === null) return "N/A";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}d`;
}
