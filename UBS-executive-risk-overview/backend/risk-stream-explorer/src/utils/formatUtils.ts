export function formatMoney(value: number | null): string {
  if (value === null) return "Not available";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPercent(share: number | null, decimals = 1): string {
  if (share === null) return "Not available";
  return `${(share * 100).toFixed(decimals)}%`;
}

export function formatPercentagePoints(deltaPP: number | null, decimals = 1): string {
  if (deltaPP === null) return "Not available";
  const sign = deltaPP > 0 ? "+" : "";
  return `${sign}${deltaPP.toFixed(decimals)}pp`;
}

export function formatDays(value: number | null, decimals = 1): string {
  if (value === null) return "Not available";
  return `${value.toFixed(decimals)} days`;
}

export function formatSignedPercent(percentChange: number | null, decimals = 0): string {
  if (percentChange === null) return "Not available";
  const sign = percentChange > 0 ? "+" : "";
  return `${sign}${(percentChange * 100).toFixed(decimals)}%`;
}
