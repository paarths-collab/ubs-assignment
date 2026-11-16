import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RiskRepository } from '../src/repositories/RiskRepository';
import { registerSourceEventsRoute } from '../src/routes/source-events.route';
import { resolveBackend } from '../../../api/routes';

describe('connected workspace source evidence', () => {
  let app: FastifyInstance;
  const repository = new RiskRepository();
  beforeAll(async () => { app = Fastify(); registerSourceEventsRoute(app, repository); await app.ready(); });
  afterAll(async () => { await app.close(); });

  it('routes the complete synthetic source through the operational backend without truncating or duplicating records', async () => {
    expect(resolveBackend('/api/source-events')).toBe('kpi');
    const response = await app.inject({ method: 'GET', url: '/api/source-events' });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.source).toBe('risk-events');
    expect(body.synthetic).toBe(true);
    expect(body.totalRows).toBe(repository.getEvents().length);
    expect(body.events).toHaveLength(body.totalRows);
    expect(body.events.map((event: { eventId: string }) => event.eventId)).toEqual(repository.getEvents().map(event => event.eventId));
    expect(new Set(body.events.map((event: { eventId: string }) => event.eventId)).size).toBe(body.totalRows);
  });

  it('preserves source money, dates, categories and authoritative remediation hours without manufacturing zeroes', async () => {
    const body = (await app.inject({ method: 'GET', url: '/api/source-events' })).json();
    const rows = new Map<string, Record<string, unknown>>(body.events.map((event: { eventId: string }) => [event.eventId, event]));
    const missing = repository.getEvents().find(event => event.netAmountUsd === null)!;
    expect(missing).toBeDefined();
    expect(rows.get(missing.eventId)?.netAmountUsd).toBeNull();
    for (const event of repository.getEvents()) {
      expect(rows.get(event.eventId)).toMatchObject({
        grossAmountUsd: event.grossAmountUsd,
        netAmountUsd: event.netAmountUsd,
        recoveryAmountUsd: event.recoveryAmountUsd,
        potentialImpactUsd: event.potentialImpactUsd,
        remediationHours: event.remediationHours,
        occurrenceDate: event.occurrenceDate,
        severity: event.severity,
        ownerOrganisation: event.ownerOrganisation,
      });
    }
  });

  it('limits public source fields to the evidence contract rather than exposing owner identities or conflicting narrative metrics', async () => {
    const body = (await app.inject({ method: 'GET', url: '/api/source-events' })).json();
    for (const event of body.events) {
      for (const key of ['ownerName', 'currentAssignee', 'creatorName', 'administratorName', 'modifiedByName', 'impactsRaw', 'remediationHoursFromImpactsField']) {
        expect(event).not.toHaveProperty(key);
      }
    }
  });

  it('provides a read-only endpoint', async () => {
    const before = repository.getEvents().length;
    const response = await app.inject({ method: 'POST', url: '/api/source-events', payload: { events: [] } });
    expect(response.statusCode).toBe(404);
    expect(repository.getEvents()).toHaveLength(before);
  });
});
