export type Listener<T> = (state: T) => void;
export type Unsubscribe = () => void;

/**
 * Minimal observable store. Every widget in the app reads from and writes
 * to the same instance so there is exactly one source of truth for filters,
 * selection, and graph state — no widget is allowed to keep its own copy.
 */
export class Store<T> {
  private state: T;
  private readonly listeners = new Set<Listener<T>>();

  constructor(initialState: T) {
    this.state = initialState;
  }

  getState(): T {
    return this.state;
  }

  setState(updater: Partial<T> | ((state: T) => T)): void {
    this.state = typeof updater === "function" ? (updater as (state: T) => T)(this.state) : { ...this.state, ...updater };
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  subscribe(listener: Listener<T>): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
