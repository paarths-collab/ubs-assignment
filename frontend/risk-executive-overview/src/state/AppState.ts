import type {
  FilterInput,
  ManagerInsightApiResponse,
  Metadata,
  OverviewResponse,
  PriorityResponse,
} from "../types";

export interface AppState {
  metadata: Metadata | null;
  filters: FilterInput;

  overview: OverviewResponse | null;
  priority: PriorityResponse | null;
  loading: boolean;
  loadError: string | null;

  /** Drives the inline "Selected Risk Brief" section; null shows its empty prompt. */
  selectedScenarioId: string | null;

  aiInsight: ManagerInsightApiResponse | null;
  loadingAi: boolean;

  actionFeedback: string | null;
}

export const DEFAULT_FILTERS: FilterInput = {
  organisation: "Enterprise-wide",
  dateFrom: null,
  dateTo: null,
  eventType: "All",
  severity: "All",
};

export function createInitialState(): AppState {
  return {
    metadata: null,
    filters: { ...DEFAULT_FILTERS },

    overview: null,
    priority: null,
    loading: false,
    loadError: null,

    selectedScenarioId: null,

    aiInsight: null,
    loadingAi: false,

    actionFeedback: null,
  };
}
