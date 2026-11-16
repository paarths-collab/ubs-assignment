import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { loadEnv } from '../src/config/env';
import { GroqService, type GroqClientLike } from '../src/services/GroqService';

const apps: FastifyInstance[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });
const graphIds = (JSON.parse(readFileSync(new URL('../../../frontend/risk-stream-explorer/src/graph/data/events_brain.json', import.meta.url), 'utf8')) as { events: { event_id: string }[] }).events.map((e) => e.event_id);
// The stream dataset's raw schema is resolved by the production loader below.
import { loadStreamgraphRepository } from '../src/services/StreamgraphAiService';
import { fileURLToPath } from 'node:url';
const streamRepo = loadStreamgraphRepository(fileURLToPath(new URL('../data', import.meta.url)));

async function appWith(content: string) {
  const client: GroqClientLike = { chat: { completions: { create: vi.fn().mockResolvedValue({ choices: [{ message: { content } }] }) } } };
  const app = await buildApp({ env: loadEnv({ NODE_ENV: 'test', LLM_API_KEY: 'test-key' }), groqService: new GroqService('test-key', 'test-model', 1000, client), serveBuiltFrontend: false });
  apps.push(app);
  return app;
}

describe('all legacy analyst surfaces reject fabricated prose', () => {
  describe.each(['The High rate is .5%.', 'The net exposure is ten million USD.', 'There were twenty affected transactions.'])('quantity guard: %s', (claim) => {
    it.each(['event', 'period'])('withholds the quantity from a complete streamgraph %s narrative', async (scope) => {
      const content = [`Observed: ${claim}`, 'Why it matters:', 'Drivers:', 'Investigate:', 'Control considerations:', 'Review the source evidence carefully. '.repeat(35)].join('\n');
      const app = await appWith(content);
      const event = streamRepo.getAll()[0]!;
      const selection = scope === 'event' ? { eventId: event.eventId, intent: 'summarise_event' } : { periodId: `month:${event.occurrenceDate.slice(0, 7)}`, granularity: 'month', intent: 'explain_period' };
      const res = await app.inject({ method: 'POST', url: `/api/ai/streamgraph/${scope}`, payload: { ...selection, filters: {} } });
      expect(res.statusCode).toBe(200);
      expect(res.json().text).not.toContain(claim);
      expect(res.json().text).toContain('Supporting evidence:');
    });
    it('rejects the relationship completion even when its citation is valid', async () => {
      const result = { summary: claim, observations: [{ statement: 'The records warrant review.', evidenceEventIds: [graphIds[0]!] }], interpretations: [{ statement: 'A workflow condition may matter.', confidence: 'low' }], investigationQuestions: ['What changed?', 'What evidence would challenge this?'], recommendedActions: [{ action: 'Review the workflow.', reason: 'Test the hypothesis.' }], limitations: ['Synthetic observational data.'] };
      const app = await appWith(JSON.stringify(result));
      const res = await app.inject({ method: 'POST', url: '/api/ai/analyse', payload: { selectedNodeId: null, eventIds: [graphIds[0]!] } });
      expect(res.statusCode).toBe(200);
      expect(JSON.stringify(res.json().analysis)).not.toContain(claim);
      expect(res.json().analysis.limitations.join(' ')).toContain('fallback');
    });
  });

  it.each(['event', 'period'])('withholds a complete-looking but fabricated streamgraph %s narrative', async (scope) => {
    const content = ['Observed: SIM-9999999 caused $999999999999 in losses.', 'Why it matters:', 'Drivers:', 'Investigate:', 'Control considerations:', 'Review the source evidence carefully. '.repeat(130)].join('\n');
    const app = await appWith(content);
    const event = streamRepo.getAll()[0]!;
    const selection = scope === 'event' ? { eventId: event.eventId, intent: 'summarise_event' } : { periodId: `month:${event.occurrenceDate.slice(0, 7)}`, granularity: 'month', intent: 'explain_period' };
    const res = await app.inject({ method: 'POST', url: `/api/ai/streamgraph/${scope}`, payload: { ...selection, filters: {} } });
    expect(res.statusCode).toBe(200);
    expect(res.json().text).not.toContain('SIM-9999999');
    expect(res.json().text).not.toContain('999999999999');
    expect(res.json().text).toContain('Supporting evidence:');
  });

  it.each(['SIM-9999999', graphIds[1]!])('rejects a relationship claim with an unsupported citation: %s', async (id) => {
    const claim = { summary: `Review ${id}.`, observations: [{ statement: 'The records warrant review.', evidenceEventIds: [id] }], interpretations: [{ statement: 'A workflow condition may matter.', confidence: 'low' }], investigationQuestions: ['What changed?', 'What evidence would challenge this?'], recommendedActions: [{ action: 'Review the workflow.', reason: 'Test the hypothesis.' }], limitations: ['Synthetic observational data.'] };
    const app = await appWith(JSON.stringify(claim));
    const res = await app.inject({ method: 'POST', url: '/api/ai/analyse', payload: { selectedNodeId: null, eventIds: [graphIds[0]!] } });
    expect(res.statusCode).toBe(200);
    expect(JSON.stringify(res.json().analysis)).not.toContain(id);
    expect(res.json().analysis.limitations.join(' ')).toContain('fallback');
  });
});
