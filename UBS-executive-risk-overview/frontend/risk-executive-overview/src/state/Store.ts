export type Listener<T> = (state: T) => void;

/** A minimal reactive container. UI components subscribe and re-render on every state change. */
export class Store<T extends object> {
  private state: T;
  private readonly listeners = new Set<Listener<T>>();

  constructor(initialState: T) {
    this.state = initialState;
  }

  getState(): T {
    return this.state;
  }

  setState(patch: Partial<T>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
  }

  subscribe(listener: Listener<T>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
