import {
  applyFilters,
  AIInsightRepository,
  EventRepository,
  generatePeriods,
  type FilterState,
  type Granularity,
  type GroupByDimension,
  type Period,
  type StreamEvent,
} from "@backend/index";
import { Store } from "./Store";
import { createInitialState, type AppState } from "./AppState";

export class AppContext {
  readonly repository: EventRepository;
  readonly aiRepository: AIInsightRepository;
  readonly store: Store<AppState>;

  constructor(repository: EventRepository, aiData: unknown) {
    this.repository = repository;
    this.aiRepository = new AIInsightRepository(repository, aiData);
    this.store = new Store(createInitialState());
  }

  getState(): AppState {
    return this.store.getState();
  }

  subscribe(listener: (state: AppState) => void): () => void {
    return this.store.subscribe(listener);
  }

  getFilteredEvents(): StreamEvent[] {
    return applyFilters(this.repository.getAll(), this.getState().filters);
  }

  getPeriods(): Period[] {
    return generatePeriods(this.getFilteredEvents(), this.getState().granularity);
  }

  getSelectedPeriod(): Period | null {
    const { selectedPeriodId } = this.getState();
    if (!selectedPeriodId) return null;
    return this.getPeriods().find((p) => p.id === selectedPeriodId) ?? null;
  }

  private reconcileSelectionAfterChange(): void {
    const state = this.getState();
    if (!state.selectedPeriodId) return;

    const periods = this.getPeriods();
    const period = periods.find((p) => p.id === state.selectedPeriodId) ?? null;

    if (!period) {
      this.store.setState({ selectedPeriodId: null, selectedDay: null, selectedEventId: null, eventDrawerOpen: false });
      return;
    }

    if (state.selectedEventId) {
      const event = this.repository.getById(state.selectedEventId);
      const filtered = this.getFilteredEvents();
      const stillVisible = event && filtered.some((e) => e.eventId === event.eventId);
      if (!stillVisible) {
        this.store.setState({ selectedEventId: null, eventDrawerOpen: false });
      }
    }
  }

  setFilter<K extends keyof FilterState>(key: K, value: FilterState[K]): void {
    const filters = { ...this.getState().filters, [key]: value };
    this.store.setState({ filters });
    this.reconcileSelectionAfterChange();
  }

  resetFilters(): void {
    this.store.setState({
      filters: { organisation: null, severity: null, eventType: null, riskTheme: null, dateStart: null, dateEnd: null },
    });
    this.reconcileSelectionAfterChange();
  }

  setGranularity(granularity: Granularity): void {
    this.store.setState({ granularity, selectedPeriodId: null, selectedDay: null, selectedEventId: null, eventDrawerOpen: false });
  }

  setGroupBy(groupBy: GroupByDimension): void {
    this.store.setState({ groupBy });
  }

  selectPeriod(periodId: string): void {
    const current = this.getState().selectedPeriodId;
    if (current === periodId) {
      this.store.setState({ selectedPeriodId: null, selectedDay: null, selectedEventId: null, eventDrawerOpen: false });
      return;
    }
    this.store.setState({ selectedPeriodId: periodId, selectedDay: null, selectedEventId: null, eventDrawerOpen: false });
  }

  selectDay(day: string | null): void {
    this.store.setState({ selectedDay: day });
  }

  selectEvent(eventId: string): void {
    this.store.setState({ selectedEventId: eventId, eventDrawerOpen: true });
  }

  closeDrawer(): void {
    this.store.setState({ eventDrawerOpen: false });
  }

  toggleDimSeries(key: string | null): void {
    this.store.setState({ dimmedSeriesKey: key });
  }
}
