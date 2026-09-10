import type { Granularity } from "./Filters.js";

/**
 * A time bucket over which events are aggregated. `pointDate` is where the
 * bucket is plotted on the timeline (month-end for monthly, the ISO week's
 * Sunday for weekly); `startDate`/`endDate` are inclusive bucket bounds.
 */
export interface Period {
  id: string;
  granularity: Granularity;
  startDate: string;
  endDate: string;
  pointDate: string;
  label: string;
}

/** One plotted point on the streamgraph: a period's total plus its per-series breakdown. */
export interface StreamPoint {
  periodId: string;
  pointDate: string;
  label: string;
  total: number;
  series: Record<string, number>;
}

export interface StreamSeriesData {
  seriesKeys: string[];
  points: StreamPoint[];
}
