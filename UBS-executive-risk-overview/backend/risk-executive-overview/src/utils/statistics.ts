export interface DelayStats {
  min: number;
  max: number;
  mean: number;
  median: number;
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

export function computeDelayStats(values: number[]): DelayStats | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((total, value) => total + value, 0);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2 : (sorted[mid] as number);

  return {
    min: sorted[0] as number,
    max: sorted[sorted.length - 1] as number,
    mean: round1(sum / sorted.length),
    median: round1(median),
  };
}
