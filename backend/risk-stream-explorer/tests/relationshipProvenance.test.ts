import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { loadEnv } from '../src/config/env';
import { GroqService, type GroqClientLike } from '../src/services/GroqService';

const apps: FastifyInstance[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });
const eventId = (JSON.parse(readFileSync(new URL('../../../frontend/risk-stream-explorer/src/graph/data/events_brain.json', import.meta.url), 'utf8')) as { events: { event_id: string }[] }).events[0]!.event_id;
const payload = { selectedNodeId: null, eventIds: [eventId] };
const validAnalysis = {
  summary: 'The selected records warrant workflow review.',
  observations: [{ statement: 'The records share a selected scope.', evidenceEventIds: [eventId] }],
  interpretations: [{ statement: 'A workflow condition may matter.', confidence: 'low' }],
  investigationQuestions: ['What changed?', 'Which evidence would challenge this?'],
  recommendedActions: [{ action: 'Review the workflow.', reason: 'Test the hypothesis.' }],
  limitations: ['Synthetic observational data.'],
};
const completion = (content: string) => ({ choices: [{ message: { content } }] });

async function fixture(apiKey = 'test-key') {
  const create = vi.fn().mockResolvedValue(completion(JSON.stringify(validAnalysis)));
  const client: GroqClientLike = { chat: { completions: { create } } };
  const app = await buildApp({ env: loadEnv({ NODE_ENV: 'test', LLM_API_KEY: apiKey, LLM_MODEL: 'test-model' }), groqService: new GroqService(apiKey, 'test-model', 1000, client), serveBuiltFrontend: false });
  apps.push(app);
  const analyse = () => app.inject({ method: 'POST', url: '/api/ai/analyse', payload });
  return { create, analyse };
}

describe('relationship analysis source provenance', () => {
  it('preserves the configured model for validated model output and marks computed evidence', async () => {
    const { analyse } = await fixture();
    const response = await analyse();
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.model).toBe('test-model');
    expect(body.analysis).toEqual(validAnalysis);
    expect(body.verifiedFacts.evidenceEventIds).toEqual([eventId]);
    expect(body.provenance).toMatchObject({ analysis: 'ai-generated', evidence: 'computed', cached: false, validation: { rejectedAttempts: 0, checks: expect.arrayContaining(['schema', 'event-ids', 'pattern-ids', 'numeric-grounding', 'citation-scope']) } });
    expect(body.provenance.fallbackReason).toBeUndefined();
  });

  it('identifies missing-provider fallback without calling a provider', async () => {
    const { create, analyse } = await fixture('');
    const response = await analyse();
    expect(response.statusCode).toBe(200);
    expect(create).not.toHaveBeenCalled();
    expect(response.json()).toMatchObject({ model: 'verified-deterministic-fallback', provenance: { analysis: 'deterministic-fallback', evidence: 'computed', cached: false, fallbackReason: 'provider-not-configured', validation: { rejectedAttempts: 0 } } });
  });

  it.each([
    ['provider-timeout', Object.assign(new Error('Request timed out'), { name: 'APIConnectionTimeoutError' })],
    ['provider-error', new Error('Provider refused the request')],
  ])('identifies %s without counting it as rejected model prose', async (reason, error) => {
    const { create, analyse } = await fixture();
    create.mockRejectedValue(error);
    const response = await analyse();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ model: 'verified-deterministic-fallback', provenance: { analysis: 'deterministic-fallback', evidence: 'computed', cached: false, fallbackReason: reason, validation: { rejectedAttempts: 0 } } });
    expect(response.json().provenance.validation.lastRejection).toBeUndefined();
  });

  it.each([
    ['invalid JSON', '{broken', 'unusable-output:invalid-json'],
    ['invalid shape', JSON.stringify({ summary: 'Incomplete analysis.' }), 'schema-invalid:observations'],
    ['unsupported quantity', JSON.stringify({ ...validAnalysis, summary: 'The rate is .5%.' }), 'ungrounded-number:.5%'],
    ['out-of-scope citation', JSON.stringify({ ...validAnalysis, observations: [{ statement: 'Review the workflow.', evidenceEventIds: ['SIM-9999999'] }] }), 'unsupported-citation:SIM-9999999'],
  ])('reports validation fallback for %s and serves computed facts', async (_label, content, rejection) => {
    const { create, analyse } = await fixture();
    create.mockResolvedValue(completion(content));
    const response = await analyse();
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({ model: 'verified-deterministic-fallback', provenance: { analysis: 'deterministic-fallback', evidence: 'computed', cached: false, fallbackReason: 'validation-failed', validation: { rejectedAttempts: 1 } } });
    expect(body.provenance.validation.lastRejection).toEqual(expect.arrayContaining([expect.stringContaining(rejection)]));
    expect(body.verifiedFacts.evidenceEventIds).toEqual([eventId]);
    expect(body.analysis.summary).toContain('Verified relationship scope');
  });

  it('does not cache a fallback or carry its provenance into a later valid response', async () => {
    const { create, analyse } = await fixture();
    create.mockResolvedValueOnce(completion('{broken'));
    const fallback = await analyse();
    const recovered = await analyse();
    expect(create).toHaveBeenCalledTimes(2);
    expect(fallback.json().provenance.analysis).toBe('deterministic-fallback');
    expect(recovered.json()).toMatchObject({ model: 'test-model', analysis: validAnalysis, provenance: { analysis: 'ai-generated', cached: false, validation: { rejectedAttempts: 0 } } });
    expect(recovered.json().provenance.fallbackReason).toBeUndefined();
    expect(recovered.json().provenance.validation.lastRejection).toBeUndefined();
  });
});
