import * as api from "../services/apiClient";
import { ApiError } from "../services/apiClient";
import type { FilterInput, ScenarioSignal } from "../types";
import { Store } from "./Store";
import { createInitialState, DEFAULT_FILTERS, type AppState } from "./AppState";

/** Orchestrates every backend call and holds the single source of UI state. */
export class AppContext {
  readonly store = new Store<AppState>(createInitialState());

  getState(): AppState {
    return this.store.getState();
  }

  subscribe(listener: (state: AppState) => void): () => void {
    return this.store.subscribe(listener);
  }

  /** The scenario the Risk Brief is currently showing, resolved against the live list. */
  getSelectedScenario(): ScenarioSignal | null {
    const { priority, selectedScenarioId } = this.getState();
    if (!priority || !selectedScenarioId) return null;
    return priority.items.find((item) => item.scenarioId === selectedScenarioId) ?? null;
  }

  async init(): Promise<void> {
    try {
      const metadata = await api.getMetadata();
      this.store.setState({ metadata });
    } catch (err) {
      this.store.setState({ loadError: describeError(err) });
      return;
    }
    await this.refresh();
  }

  setFilter<K extends keyof FilterInput>(key: K, value: FilterInput[K]): void {
    this.store.setState({ filters: { ...this.getState().filters, [key]: value } });
    void this.refresh();
  }

  resetFilters(): void {
    this.store.setState({ filters: { ...DEFAULT_FILTERS } });
    void this.refresh();
  }

  private async refresh(): Promise<void> {
    const filters = this.getState().filters;
    this.store.setState({ loading: true, loadError: null });

    try {
      const [overview, priority] = await Promise.all([
        api.postOverview(filters),
        api.postPrioritySignals(filters),
      ]);

      // A scenario can vanish from the filtered population entirely; drop the
      // selection rather than leaving the brief pinned to something that is
      // no longer part of what the manager is looking at.
      const selectedScenarioId = this.getState().selectedScenarioId;
      const stillPresent = priority.items.some((item) => item.scenarioId === selectedScenarioId);

      // Default to the top-ranked scenario. Leaving the brief empty hid the
      // whole analysis capability behind a click nobody knew to make — and
      // the highest-ranked issue is the one the page is arguing for anyway.
      const fallbackId = priority.items[0]?.scenarioId ?? null;

      this.store.setState({
        overview,
        priority,
        loading: false,
        selectedScenarioId: stillPresent ? selectedScenarioId : fallbackId,
        selectedKpiId: null,
        kpiDetail: null,
        aiInsight: stillPresent ? this.getState().aiInsight : null,
        actionFeedback: null,
      });
    } catch (err) {
      this.store.setState({ loading: false, loadError: describeError(err) });
    }
  }

  /** Opens (or closes) the drill-down behind a KPI headline figure. */
  async selectKpi(kpiId: string): Promise<void> {
    if (this.getState().selectedKpiId === kpiId) {
      this.store.setState({ selectedKpiId: null, kpiDetail: null });
      return;
    }

    this.store.setState({ selectedKpiId: kpiId, kpiDetail: null, loadingKpiDetail: true });
    try {
      const { detail } = await api.postRiskDetail(this.getState().filters, { type: "kpi", kpiId });
      // A slower earlier request must not overwrite a newer selection.
      if (this.getState().selectedKpiId !== kpiId) return;
      this.store.setState({ kpiDetail: detail, loadingKpiDetail: false });
    } catch {
      if (this.getState().selectedKpiId !== kpiId) return;
      this.store.setState({ kpiDetail: null, loadingKpiDetail: false, selectedKpiId: null });
    }
  }

  selectScenario(scenarioId: string): void {
    const alreadySelected = this.getState().selectedScenarioId === scenarioId;
    this.store.setState({
      selectedScenarioId: alreadySelected ? null : scenarioId,
      aiInsight: null,
      actionFeedback: null,
    });
  }

  async loadAiInsight(): Promise<void> {
    const scenario = this.getSelectedScenario();
    if (!scenario) return;

    const selection = scenario.patternId
      ? ({ type: "pattern", patternId: scenario.patternId } as const)
      : ({ type: "issue", issueDetail: scenario.issueDetail } as const);

    this.store.setState({ loadingAi: true });
    try {
      const insight = await api.postManagerInsight(this.getState().filters, selection);
      this.store.setState({ aiInsight: insight, loadingAi: false });
    } catch (err) {
      this.store.setState({ loadingAi: false, aiInsight: { available: false, reason: describeError(err) } });
    }
  }

}

function describeError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "An unexpected error occurred.";
}
