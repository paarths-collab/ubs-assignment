import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { networks } = vi.hoisted(() => ({ networks: [] as any[] }));

vi.mock("vis-network/standalone/esm/vis-network.js", () => ({
  DataSet: class {
    private values = new Map<string, { id: string }>();
    get(id?: string) { return id === undefined ? [...this.values.values()] : this.values.get(id) ?? null; }
    update(values: { id: string }[]) { values.forEach((value) => this.values.set(value.id, value)); }
    remove(id: string) { this.values.delete(id); }
    get length() { return this.values.size; }
  },
  Network: class {
    callbacks = new Map<string, (...args: any[]) => void>();
    setOptions = vi.fn();
    setSize = vi.fn();
    redraw = vi.fn();
    fit = vi.fn();
    destroy = vi.fn();
    on(name: string, callback: (...args: any[]) => void) { this.callbacks.set(name, callback); }
    constructor() { networks.push(this); }
  },
}));

import { GraphEngine } from "../src/graph/graph-engine";

const observers: { notify: (entries: any[]) => void; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  networks.length = 0;
  observers.length = 0;
  vi.stubGlobal("ResizeObserver", class {
    observe = vi.fn();
    disconnect = vi.fn();
    constructor(readonly notify: (entries: any[]) => void) { observers.push(this); }
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("relationship graph page resources", () => {
  it("disconnects the observer, cancels the pending fit and destroys the network exactly once", () => {
    const engine = new GraphEngine();
    const container = {} as HTMLElement;
    engine.mount(container);
    engine.setGraph({ nodes: [], edges: [] });
    expect(observers[0].observe).toHaveBeenCalledWith(container);
    expect(vi.getTimerCount()).toBe(1);

    engine.destroy();
    engine.destroy();
    expect(observers[0].disconnect).toHaveBeenCalledTimes(1);
    expect(networks[0].destroy).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    vi.runAllTimers();
    expect(networks[0].fit).not.toHaveBeenCalled();
  });

  it("ignores queued callbacks from the destroyed network after mounting a new one", () => {
    const engine = new GraphEngine();
    engine.mount({} as HTMLElement);
    const onSelect = vi.fn();
    engine.onSelectNode(onSelect);
    const oldNetwork = networks[0];
    const oldObserver = observers[0];
    engine.destroy();
    engine.mount({} as HTMLElement);
    engine.setGraph({ nodes: [], edges: [] });
    const newNetwork = networks[1];
    newNetwork.redraw.mockClear();
    newNetwork.setOptions.mockClear();

    oldObserver.notify([{ contentRect: { width: 800, height: 600 } }]);
    oldNetwork.callbacks.get("stabilizationIterationsDone")!();
    oldNetwork.callbacks.get("selectNode")!({ nodes: ["event::old"] });
    expect(newNetwork.setSize).not.toHaveBeenCalled();
    expect(newNetwork.setOptions).not.toHaveBeenCalled();
    expect(newNetwork.redraw).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();

    // Stale callbacks must also leave the new page's pending camera fit intact.
    vi.advanceTimersByTime(400);
    expect(newNetwork.fit).toHaveBeenCalledTimes(1);
    engine.destroy();
  });

  it("keeps normal resize and selection behavior while mounted", () => {
    const engine = new GraphEngine();
    engine.mount({} as HTMLElement);
    const onSelect = vi.fn();
    engine.onSelectNode(onSelect);
    observers[0].notify([{ contentRect: { width: 800, height: 600 } }]);
    networks[0].callbacks.get("selectNode")!({ nodes: ["event::active"] });
    expect(networks[0].setSize).toHaveBeenCalledWith("100%", "100%");
    expect(networks[0].fit).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("event::active");
    engine.destroy();
  });
});
