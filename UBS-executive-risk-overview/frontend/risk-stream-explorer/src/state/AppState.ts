import type { FilterState, Granularity, GroupByDimension } from "@backend/types";

export interface AppState {
  filters: FilterState;
  granularity: Granularity;
  groupBy: GroupByDimension;

  selectedPeriodId: string | null;
  selectedDay: string | null;
  selectedEventId: string | null;

  eventDrawerOpen: boolean;
  dimmedSeriesKey: string | null;
}

export function createInitialState(): AppState {
  return {
    filters: {
      organisation: null,
      severity: null,
      eventType: null,
      riskTheme: null,
      dateStart: null,
      dateEnd: null,
    },
    granularity: "month",
    groupBy: "riskTheme",
    selectedPeriodId: null,
    selectedDay: null,
    selectedEventId: null,
    eventDrawerOpen: false,
    dimmedSeriesKey: null,
  };
}
