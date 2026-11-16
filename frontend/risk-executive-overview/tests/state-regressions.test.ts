import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../src/services/apiClient';
import { AppContext } from '../src/state/AppContext';
import { renderRiskBrief } from '../src/components/RiskBrief';
import { renderAIAnalysisPanel } from '../src/components/AIAnalysisPanel';
import { renderStreamingPanel } from '../src/components/StreamingAnalysisPanel';
import type { OverviewResponse, PriorityResponse } from '../src/types';
import { RiskRepository } from '../../../backend/risk-executive-overview/src/repositories/RiskRepository';
import { buildScenarioSignals, rankScenarioSignals } from '../../../backend/risk-executive-overview/src/services/ScenarioService';
import { filterEvents, normalizeFilters } from '../../../backend/risk-executive-overview/src/services/FilterService';

vi.mock('../src/services/apiClient', () => ({ postOverview: vi.fn(), postPrioritySignals: vi.fn(), postRiskDetail: vi.fn(), postManagerInsight: vi.fn(), getMetadata: vi.fn(), ApiError: class extends Error {} }));
vi.mock('../src/components/StreamingAnalysisPanel', () => ({ renderStreamingPanel: vi.fn(() => ({ root: document.createElement('div'), bindAction: vi.fn(), reset: vi.fn() })) }));

// Rendering adapter; only text and child operations used by these components.
class Element {
  children: Array<Element | string> = [];
  private text = '';
  classList = { add: () => {} };
  append(...nodes: Array<Element | string>) { this.children.push(...nodes); }
  replaceChildren(...nodes: Array<Element | string>) { this.children = nodes; this.text = ''; }
  set textContent(value: string) { this.text = value; this.children = []; }
  get textContent(): string { return this.text + this.children.map((n) => typeof n === 'string' ? n : n.textContent).join(''); }
  private listeners = new Map<string, Array<() => void>>();
  addEventListener(type: string, listener: () => void) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]); }
  click() { for (const listener of this.listeners.get('click') ?? []) listener(); }
  setAttribute() {}
  insertBefore(node: Element, before: Element | null) { const index = before === null ? -1 : this.children.indexOf(before); if (index < 0) this.children.push(node); else this.children.splice(index, 0, node); }
  querySelectorAll() { return []; }
}
const host = () => new Element() as unknown as HTMLElement;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}
const flush = async () => { await new Promise((resolve) => setTimeout(resolve, 0)); };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('document', { createElement: () => new Element(), createTextNode: (text: string) => { const node = new Element(); node.textContent = text; return node; } });
});
afterEach(() => { vi.unstubAllGlobals(); });

function refreshes() {
  const oldOverview = deferred<OverviewResponse>(), newOverview = deferred<OverviewResponse>();
  const oldPriority = deferred<PriorityResponse>(), newPriority = deferred<PriorityResponse>();
  vi.mocked(api.postOverview).mockReturnValueOnce(oldOverview.promise).mockReturnValueOnce(newOverview.promise);
  vi.mocked(api.postPrioritySignals).mockReturnValueOnce(oldPriority.promise).mockReturnValueOnce(newPriority.promise);
  const ctx = new AppContext();
  ctx.setFilter('severity', 'High');
  ctx.setFilter('severity', 'Low');
  newOverview.resolve({ eventCount: 705, filters: { severity: 'Low' } } as OverviewResponse);
  newPriority.resolve({ items: [] } as unknown as PriorityResponse);
  return { ctx, oldOverview, oldPriority };
}

describe('overlapping filter refreshes', () => {
  it('keeps the latest population when an earlier success arrives last', async () => {
    const { ctx, oldOverview, oldPriority } = refreshes();
    await flush();
    oldOverview.resolve({ eventCount: 51, filters: { severity: 'High' } } as OverviewResponse);
    oldPriority.resolve({ items: [] } as unknown as PriorityResponse);
    await flush();
    expect(ctx.getState().filters.severity).toBe('Low');
    expect(ctx.getState().overview!.eventCount).toBe(705);
    expect(ctx.getState().overview!.filters.severity).toBe('Low');
  });
  it('ignores an earlier failure after the latest refresh succeeds', async () => {
    const { ctx, oldOverview } = refreshes();
    await flush();
    oldOverview.reject(new Error('stale request failed'));
    await flush();
    expect(ctx.getState().loadError).toBeNull();
    expect(ctx.getState().loading).toBe(false);
    expect(ctx.getState().overview!.eventCount).toBe(705);
  });
});

describe('same scenario, changed evidence', () => {
  const repository = new RiskRepository();
  function population(severity: 'All' | 'Low') {
    const filters = normalizeFilters({ organisation: 'Enterprise-wide', eventType: 'All', severity }, repository.getConfig());
    const items = rankScenarioSignals(buildScenarioSignals(filterEvents(repository.getEvents(), filters), repository.getPatterns(), repository.getConfig(), filters));
    return { filters, items };
  }
  it('rerenders the brief when the same scenario shrinks under a severity filter', () => {
    const all = population('All'), low = population('Low');
    const selected = all.items[0]!;
    const ctx = new AppContext();
    ctx.store.setState({ filters: all.filters, priority: all as unknown as PriorityResponse, selectedScenarioId: selected.scenarioId });
    const element = host();
    renderRiskBrief(ctx, element);
    const before = element.textContent;
    ctx.store.setState({ filters: low.filters, priority: low as unknown as PriorityResponse });
    expect(ctx.getSelectedScenario()!.scenarioId).toBe(selected.scenarioId);
    expect(ctx.getSelectedScenario()!.eventCount).toBe(46);
    expect(element.textContent).not.toBe(before);
    expect(element.textContent).toContain('46Events0High');
  });
  it('clears prior AI analysis when filters change but the scenario ID persists', () => {
    const all = population('All'), low = population('Low');
    const ctx = new AppContext();
    ctx.store.setState({ filters: all.filters, priority: all as unknown as PriorityResponse, selectedScenarioId: all.items[0]!.scenarioId });
    renderAIAnalysisPanel(ctx, host());
    const panel = vi.mocked(renderStreamingPanel).mock.results.at(-1)!.value;
    ctx.store.setState({ filters: all.filters });
    const calls = vi.mocked(panel.reset).mock.calls.length;
    ctx.store.setState({ filters: low.filters, priority: low as unknown as PriorityResponse });
    expect(vi.mocked(panel.reset).mock.calls.length).toBe(calls + 1);
  });
});


describe('stream invalidation', () => {
  it('ignores late callbacks from an aborted run after a new run starts', async () => {
    const { renderStreamingPanel: renderRealPanel } = await vi.importActual<typeof import('../src/components/StreamingAnalysisPanel')>('../src/components/StreamingAnalysisPanel');
    const panel = renderRealPanel('Analysis');
    const runs: Array<{ handlers: import('../src/services/aiStreamClient').StreamHandlers; signal: AbortSignal }> = [];
    const button = document.createElement('button');
    panel.bindAction(button, (handlers, signal) => { runs.push({ handlers, signal }); return Promise.resolve(); });
    button.click();
    panel.reset();
    expect(runs[0]!.signal.aborted).toBe(true);
    button.click();
    const info = { title: 'Current selection', eventCount: 2, organisationCount: 1, sections: [{ id: 'analysis', title: 'Current section' }] };
    runs[1]!.handlers.onStart(info);
    runs[1]!.handlers.onSectionStart('analysis', 'Current section');
    runs[0]!.handlers.onStart({ ...info, title: 'Obsolete selection' });
    runs[0]!.handlers.onDelta('analysis', 'Obsolete text');
    runs[0]!.handlers.onError('Obsolete failure');
    runs[0]!.handlers.onComplete({ durationMs: 100, evidence: { eventCount: 999 } });
    expect(panel.root.textContent).toContain('Current selection');
    expect(panel.root.textContent).not.toContain('Obsolete');
    expect(panel.root.textContent).not.toContain('999');
    runs[1]!.handlers.onDelta('analysis', 'Current explanation');
    expect(panel.root.textContent).toContain('Current explanation');
  });
});
