import { describe, expect, it } from 'vitest';
import { RiskRepository } from '../../../../../../backend/risk-executive-overview/src/repositories/RiskRepository';
import { filterEvents, normalizeFilters } from '../../../../../../backend/risk-executive-overview/src/services/FilterService';
import { filterSource, initialFilters, money, monthlyCounts } from './data';

const repository = new RiskRepository();
const events = [...repository.getEvents()];

describe('workspace analysis source agreement', () => {
  it('matches backend population across organisation, severity, type, and date scopes', () => {
    const config = repository.getConfig();
    for (const organisation of ['Enterprise-wide', ...config.filters.organisations]) {
      for (const severity of ['All', 'Low', 'Moderate', 'High'] as const) {
        for (const eventType of ['All', 'Financial', 'Non-Financial'] as const) {
          const filters = { organisation, severity, eventType, dateFrom: config.dateRange.min, dateTo: config.dateRange.max };
          expect(filterSource(events, filters).map(event => event.eventId)).toEqual(filterEvents(events, normalizeFilters(filters, config)).map(event => event.eventId));
        }
      }
    }
    const day = events[0].occurrenceDate;
    const filters = { ...initialFilters, severity: 'All' as const, eventType: 'All' as const, dateFrom: day, dateTo: day };
    expect(filterSource(events, filters).map(event => event.eventId)).toEqual(filterEvents(events, normalizeFilters(filters, config)).map(event => event.eventId));
  });
  it('accounts for every source event exactly once in chronological monthly buckets', () => {
    const monthly = monthlyCounts(events);
    expect(monthly.reduce((sum, month) => sum + month.value, 0)).toBe(events.length);
    expect(monthly.map(month => month.month)).toEqual([...new Set(events.map(event => event.occurrenceDate.slice(0, 7)))].sort());
    expect(monthlyCounts([])).toEqual([]);
  });
  it('preserves non-applicable financial values rather than displaying zero exposure', () => {
    expect(money(null)).toBe('Not applicable');
    expect(money(0)).toBe('$0');
  });
});
