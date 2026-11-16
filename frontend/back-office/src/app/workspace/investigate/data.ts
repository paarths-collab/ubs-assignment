import type { ScenarioSignal } from '../../../../../../backend/risk-executive-overview/src/types/Scenario';
import type { RiskDetailResponse } from '../../../../../../backend/risk-executive-overview/src/types/RiskDetail';
export type { ScenarioSignal, RiskDetailResponse };
export type Signals = { items: ScenarioSignal[]; totalCandidates: number };
// A scenario can contain several patterns. Its exact evidence IDs preserve the selected scope.
export function selectionFor(signal: Pick<ScenarioSignal, 'eventIds'>) {
  return { type: 'eventIds' as const, eventIds: [...new Set(signal.eventIds)] };
}
export function searchSignals(items: ScenarioSignal[], query: string) {
  const term = query.trim().toLowerCase();
  return items.filter(item => `${item.title} ${item.issueDetail} ${item.contextLine}`.toLowerCase().includes(term));
}
