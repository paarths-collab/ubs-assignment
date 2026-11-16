export type SourceEvent = {
  eventId: string; title: string; description: string; eventType: string; severity: string;
  status: string; stage: string; occurrenceDate: string; ownerOrganisation: string;
  riskTheme: string; rootCause: string; issueDetail: string;
  grossAmountUsd: number | null; netAmountUsd: number | null; recoveryAmountUsd: number | null;
  potentialImpactUsd: number | null; remediationHours: number;
};
export type Source = { source: string; synthetic: boolean; totalRows: number; events: SourceEvent[] };
export type Filters = { organisation: string; eventType: string; severity: string; dateFrom?: string; dateTo?: string };
export const initialFilters: Filters = { organisation: 'Enterprise-wide', eventType: 'All', severity: 'All' };
export type Metadata = { recordCount: number; dateRange: { min: string; max: string }; organisations: string[]; eventTypes: string[]; severities: string[] };
export type Overview = {
  eventCount: number; datasetEventCount: number;
  kpis: Record<string, { value: number | null; applicable: boolean; unit: string }>;
  composition: { severity: Record<string, number>; eventType: Record<string, number>; workflow: { open: number; closed: number; cancelled: number; highStillOpen: number }; organisations: { key: string; eventCount: number }[] };
  exposure: { realised: { grossAmountUsd: number | null; netAmountUsd: number | null; recoveryAmountUsd: number | null; recoveryRate: number | null }; potential: { totalUsd: number | null }; operational: { totalRemediationHours: number; averagePerEvent: number } };
};
export async function operational<T>(path: string, signal: AbortSignal, body?: unknown): Promise<T> {
  const response = await fetch(`/api/operational/${path}`, { signal, ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  if (!response.ok) {
    const details = await response.json().catch(() => null);
    throw new Error(details?.error?.message ?? `The data service returned ${response.status}. Please retry.`);
  }
  return response.json() as Promise<T>;
}
export function filterSource(events: SourceEvent[], filters: Filters): SourceEvent[] {
  return events.filter(event => (filters.organisation === 'Enterprise-wide' || event.ownerOrganisation === filters.organisation)
    && (filters.eventType === 'All' || event.eventType === filters.eventType)
    && (filters.severity === 'All' || event.severity === filters.severity)
    && (!filters.dateFrom || event.occurrenceDate >= filters.dateFrom)
    && (!filters.dateTo || event.occurrenceDate <= filters.dateTo));
}
export const count = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 0 });
export const money = (value: number | null, compact = false) => value === null ? 'Not applicable' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: compact ? 2 : 0, ...(compact ? { notation: 'compact' as const } : {}) }).format(value);
export function monthlyCounts(events: SourceEvent[]) {
  const grouped = new Map<string, number>();
  events.forEach(event => { const month = event.occurrenceDate.slice(0, 7); grouped.set(month, (grouped.get(month) ?? 0) + 1); });
  return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, value]) => ({ month, value }));
}
