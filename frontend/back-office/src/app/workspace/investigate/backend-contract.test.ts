import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../../../../backend/risk-executive-overview/src/app';
import { RiskRepository } from '../../../../../../backend/risk-executive-overview/src/repositories/RiskRepository';
import { generateManagerInsight, streamCompletion } from '../../../../../../backend/risk-executive-overview/src/services/LlmService';
import { selectionFor, type Signals, type RiskDetailResponse } from './data';
import type { Filters } from '../overview/data';
import type { RiskDossier } from '../../../../../../backend/risk-executive-overview/src/types/Dossier';

// These contract checks execute the real deterministic routes and datasets.
// Neither local credentials nor a model provider can participate in the test.
vi.mock('dotenv/config', () => ({}));
vi.mock('../../../../../../backend/risk-executive-overview/src/services/LlmService', () => ({
  isAiConfigured: () => false,
  generateManagerInsight: vi.fn(() => { throw new Error('Unexpected AI call'); }),
  streamCompletion: vi.fn(() => { throw new Error('Unexpected AI stream'); }),
}));

const repository = new RiskRepository();
const source = repository.getEvents();
const dates = source.map(event => event.occurrenceDate).sort();
const organisation = source[0]!.ownerOrganisation;
const all: Filters = { organisation: 'Enterprise-wide', eventType: 'All', severity: 'All' };
const scopes: { name: string; filters: Filters }[] = [
  { name: 'full enterprise', filters: all },
  { name: 'High Financial events', filters: { ...all, eventType: 'Financial', severity: 'High' } },
  { name: 'Non-Financial events', filters: { ...all, eventType: 'Non-Financial' } },
  { name: 'organisation and later date window', filters: { ...all, organisation, dateFrom: dates[Math.floor(dates.length / 2)]!, dateTo: dates[dates.length - 1]! } },
];
const nullableSum = (values: (number | null)[]) => {
  const recorded = values.filter((value): value is number => value !== null);
  return recorded.length ? recorded.reduce((sum, value) => sum + value, 0) : null;
};
function assertAmount(actual: number | null, expected: number | null) {
  if (expected === null) expect(actual).toBeNull();
  else expect(actual).toBeCloseTo(expected, 6);
}

describe('investigation selection against real operational routes', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = buildApp({ repository }); await app.ready(); });
  afterAll(async () => {
    await app.close();
    expect(generateManagerInsight).not.toHaveBeenCalled();
    expect(streamCompletion).not.toHaveBeenCalled();
  });

  it.each(scopes)('keeps the selected scenario evidence and financial counts exact for $name', async ({ filters }) => {
    const priorities = await app.inject({ method: 'POST', url: '/api/priority-signals', payload: { filters, limit: 50 } });
    expect(priorities.statusCode).toBe(200);
    const signals = priorities.json<Signals>();
    expect(signals.items.length).toBeGreaterThan(0);
    const allowed = source.filter(event =>
      (filters.organisation === 'Enterprise-wide' || event.ownerOrganisation === filters.organisation) &&
      (filters.eventType === 'All' || event.eventType === filters.eventType) &&
      (filters.severity === 'All' || event.severity === filters.severity) &&
      (!filters.dateFrom || event.occurrenceDate >= filters.dateFrom) &&
      (!filters.dateTo || event.occurrenceDate <= filters.dateTo));
    const allowedIds = new Set(allowed.map(event => event.eventId));
    if (filters !== all) expect(allowed.length).toBeLessThan(source.length);
    const excludedStatuses = new Set(repository.getConfig().businessRules.openBacklog.excludedStatuses);

    for (const signal of signals.items) {
      const selection = selectionFor(signal);
      expect(selection.type).toBe('eventIds');
      expect(selection.eventIds.length).toBe(signal.eventCount);
      expect(selection.eventIds.every(id => allowedIds.has(id))).toBe(true);
      const response = await app.inject({ method: 'POST', url: '/api/risk-detail', payload: { filters, selection } });
      expect(response.statusCode).toBe(200);
      const { detail } = response.json<{ detail: RiskDetailResponse }>();
      expect([...detail.evidence.eventIds].sort()).toEqual([...selection.eventIds].sort());
      expect(detail.summary.eventCount).toBe(signal.eventCount);
      expect(detail.evidence.patternId).toBeNull();
      expect(detail.severity).toEqual(signal.analytics.severity.counts);
      expect(detail.severity.High ?? 0).toBe(signal.highSeverityCount);
      expect(detail.workflow.openEventCount).toBe(signal.openEventCount);

      const ids = new Set(selection.eventIds);
      const selected = allowed.filter(event => ids.has(event.eventId));
      const financial = selected.filter(event => event.eventType === 'Financial');
      expect(signal.analytics.volume.financialCount).toBe(financial.length);
      expect(signal.analytics.volume.nonFinancialCount).toBe(selected.length - financial.length);
      expect(detail.workflow.openEventCount).toBe(selected.filter(event => !excludedStatuses.has(event.status)).length);
      expect(detail.operationalImpact.remediationHours).toBe(selected.reduce((sum, event) => sum + event.remediationHours, 0));
      assertAmount(detail.financial.grossAmountUsd, nullableSum(financial.map(event => event.grossAmountUsd)));
      assertAmount(detail.financial.recoveryAmountUsd, nullableSum(financial.map(event => event.recoveryAmountUsd)));
      assertAmount(detail.financial.netAmountUsd, nullableSum(financial.map(event => event.netAmountUsd)));
      assertAmount(detail.financial.netAmountUsd, signal.netAmountUsd);
      assertAmount(detail.financial.potentialImpactUsd, nullableSum(selected.map(event => event.potentialImpactUsd)));
      assertAmount(detail.financial.potentialImpactUsd, signal.potentialImpactUsd);
      expect(signal.analytics.organisations.reduce((sum, row) => sum + row.eventCount, 0)).toBe(signal.eventCount);
    }
  });

  it('retains the entire scenario when multiple contributing patterns overlap and deduplicates selection IDs', async () => {
    const priorities = (await app.inject({ method: 'POST', url: '/api/priority-signals', payload: { filters: all, limit: 50 } })).json<Signals>();
    const scenario = priorities.items.find(item => item.contributingPatternIds.length > 1)!;
    expect(scenario).toBeDefined();
    const selection = selectionFor({ eventIds: [...scenario.eventIds, ...scenario.eventIds] });
    const response = await app.inject({ method: 'POST', url: '/api/risk-detail', payload: { filters: all, selection } });
    expect(response.statusCode).toBe(200);
    const { detail } = response.json<{ detail: RiskDetailResponse }>();
    expect(detail.summary.eventCount).toBe(scenario.eventCount);
    expect(new Set(detail.evidence.eventIds)).toEqual(new Set(scenario.eventIds));
    expect(detail.evidence.eventIds).toHaveLength(new Set(scenario.eventIds).size);
  });

  it.each(scopes)('resolves an exact scenario dossier for $name, independent of request order or duplicate IDs', async ({ filters }) => {
    const signals = (await app.inject({ method: 'POST', url: '/api/priority-signals', payload: { filters, limit: 50 } })).json<Signals>();
    const scenario = signals.items[0]!;
    expect(scenario).toBeDefined();
    const eventIds = [...scenario.eventIds].reverse();
    eventIds.push(eventIds[0]!);
    const response = await app.inject({ method: 'POST', url: '/api/ai/dossier', payload: { filters, selection: { type: 'eventIds', eventIds } } });
    expect(response.statusCode).toBe(200);
    const { dossier } = response.json<{ dossier: RiskDossier }>();
    expect(dossier.scenarioId).toBe(scenario.scenarioId);
    expect(dossier.evidence.eventIds).toEqual(scenario.eventIds);
    expect(dossier.evidence.eventCount).toBe(scenario.eventCount);
    expect(dossier.financial.netAmountUsd).toBe(scenario.netAmountUsd);
    expect(dossier.financial.potentialImpactUsd).toBe(scenario.potentialImpactUsd);
    expect(dossier.volume).toEqual(scenario.analytics.volume);
    expect(dossier.severity).toEqual(scenario.analytics.severity);
  });

  it.each(['unknown', 'subset', 'superset', 'out-of-scope'])('rejects %s event sets rather than substituting another evidence scope', async kind => {
    const filters = { ...all, severity: 'High' };
    const signals = (await app.inject({ method: 'POST', url: '/api/priority-signals', payload: { filters, limit: 50 } })).json<Signals>();
    const scenario = signals.items.find(item => item.eventIds.length > 1)!;
    expect(scenario).toBeDefined();
    const extra = source.find(event => event.severity === 'High' && !scenario.eventIds.includes(event.eventId))!;
    const outside = source.find(event => event.severity !== 'High')!;
    const eventIds = kind === 'unknown' ? [...scenario.eventIds.slice(1), 'SIM-9999999']
      : kind === 'subset' ? scenario.eventIds.slice(1)
      : kind === 'superset' ? [...scenario.eventIds, extra.eventId]
      : [...scenario.eventIds, outside.eventId];
    const response = await app.inject({ method: 'POST', url: '/api/ai/dossier', payload: { filters, selection: { type: 'eventIds', eventIds } } });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('NO_EVENTS_MATCH');
    expect(response.json()).not.toHaveProperty('dossier');
  });

  it.each(['deep-analysis', 'investigation-plan', 'enterprise-comparison'])('accepts a valid exact selection at the %s stream boundary without a model call', async endpoint => {
    const signals = (await app.inject({ method: 'POST', url: '/api/priority-signals', payload: { filters: all, limit: 1 } })).json<Signals>();
    const selection = selectionFor(signals.items[0]!);
    const response = await app.inject({ method: 'POST', url: `/api/ai/${endpoint}/stream`, payload: { filters: all, selection } });
    // A missing provider is honest here; NO_EVENTS_MATCH would expose a
    // broken UI/backend selection contract before the provider check.
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe('AI_UNAVAILABLE');
    expect(streamCompletion).not.toHaveBeenCalled();
  });
});
