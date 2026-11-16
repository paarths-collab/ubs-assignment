import { describe, expect, it } from 'vitest';
import { RiskRepository } from '../../../../../../backend/risk-executive-overview/src/repositories/RiskRepository';
import { filterSource, initialFilters } from '../overview/data';
import { periodEvents, timelineMonths, timelineRangeError } from './timeline-data';

const repository = new RiskRepository();
const events = [...repository.getEvents()];

describe('canonical event timeline', () => {
  it('reconciles every month and selected period with source records under all severity scopes', () => {
    const { min, max } = repository.getConfig().dateRange;
    for (const severity of ['All', 'High', 'Moderate', 'Low']) {
      const scoped = filterSource(events, { ...initialFilters, severity });
      const months = timelineMonths(scoped, min, max);
      expect(months.reduce((sum, month) => sum + month.events, 0)).toBe(scoped.length);
      for (const month of months) {
        const records = periodEvents(scoped, month.month);
        expect(records).toHaveLength(month.events);
        expect(records.filter(event => event.severity === 'High')).toHaveLength(month.high);
        expect(records.every(event => event.occurrenceDate.startsWith(month.month))).toBe(true);
      }
    }
  });
  it('retains empty calendar months and distinguishes missing financial values from zero', () => {
    const sample = [
      { ...events[0], eventId: 'A', occurrenceDate: '2024-01-31', netAmountUsd: null },
      { ...events[0], eventId: 'B', occurrenceDate: '2024-03-01', netAmountUsd: 0 },
    ];
    const months = timelineMonths(sample, '2024-01-01', '2024-03-31');
    expect(months.map(month => [month.month, month.events, month.netExposure])).toEqual([
      ['2024-01', 1, null], ['2024-02', 0, null], ['2024-03', 1, 0],
    ]);
    expect(periodEvents(sample, '2024-02')).toEqual([]);
  });
  it('includes boundary days, excludes out-of-range rows, and sorts drilldown deterministically', () => {
    const sample = [
      { ...events[0], eventId: 'B', occurrenceDate: '2024-02-15' },
      { ...events[0], eventId: 'A', occurrenceDate: '2024-02-15' },
      { ...events[0], eventId: 'C', occurrenceDate: '2024-02-29' },
      { ...events[0], eventId: 'D', occurrenceDate: '2024-03-01' },
    ];
    expect(timelineMonths(sample, '2024-02-15', '2024-02-29')[0].events).toBe(3);
    expect(periodEvents(sample, '2024-02').map(event => event.eventId)).toEqual(['C', 'A', 'B']);
    expect(timelineMonths(sample, '2024-03-01', '2024-02-01')).toEqual([]);
  });
  it('bounds expanded-year ranges and safely ends December of year 9999', () => {
    expect(timelineMonths([], '2024-01-01', '9999-12-31')).toEqual([]);
    expect(timelineRangeError('2024-01-01', '9999-12-31')).toContain('120 calendar months');
    expect(timelineMonths([], '9999-12-01', '9999-12-31').map(month => month.month)).toEqual(['9999-12']);
    expect(timelineMonths([], '9999-01-01', '9999-12-31')).toHaveLength(12);
    expect(timelineMonths([], '2020-01-01', '2029-12-31')).toHaveLength(120);
    expect(timelineMonths([], '2020-01-01', '2030-01-01')).toEqual([]);
  });
  it('rejects impossible calendar dates without normalizing them into another month', () => {
    for (const date of ['2024-02-30', '2023-02-29', '2024-04-31', '2024-13-01', '0000-01-01', '10000-01-01']) {
      expect(timelineRangeError(date, date)).toContain('valid calendar dates');
      expect(timelineMonths([], date, date)).toEqual([]);
    }
    expect(timelineRangeError('2024-02-29', '2024-02-29')).toBeNull();
    expect(timelineRangeError('2000-02-29', '2000-02-29')).toBeNull();
    expect(timelineRangeError('1900-02-29', '1900-02-29')).toContain('valid calendar dates');
  });

});
