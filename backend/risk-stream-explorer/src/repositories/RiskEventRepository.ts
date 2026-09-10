import type { RiskEvent } from "../types/RiskEvent";

/**
 * Owns the Component 4 event list (`risk_events_final.json`) and its id
 * index. Distinct from the Component 2/3 `EventRepository`, which indexes a
 * different dataset with a different shape.
 */
export class RiskEventRepository {
  private readonly events: RiskEvent[];
  private readonly byId: Map<string, RiskEvent>;

  constructor(events: RiskEvent[]) {
    this.events = events;
    this.byId = new Map(events.map((event) => [event.event_id, event]));
  }

  getAll(): RiskEvent[] {
    return this.events;
  }

  getById(eventId: string): RiskEvent | null {
    return this.byId.get(eventId) ?? null;
  }

  /** Resolves a list of event IDs to full records, silently dropping any that don't resolve. */
  getByIds(eventIds: string[]): RiskEvent[] {
    const resolved: RiskEvent[] = [];
    for (const id of eventIds) {
      const event = this.byId.get(id);
      if (event) resolved.push(event);
    }
    return resolved;
  }

  count(): number {
    return this.events.length;
  }
}
