import { createServer, request as httpRequest, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOperationalBridge, findOperationalRoot, operationalPath, operationalBridge } from '../../frontend/back-office/src/server/operational';
import { config, maxDuration } from '../../frontend/back-office/src/pages/api/operational/[...path]';
import { resolveBackend } from '../routes';

vi.mock('dotenv/config', () => ({}));
vi.mock('../../backend/risk-executive-overview/src/services/LlmService', () => ({
  isAiConfigured: () => false,
  generateManagerInsight: vi.fn(() => { throw new Error('Unexpected provider call'); }),
  streamCompletion: vi.fn(() => { throw new Error('Unexpected provider call'); }),
}));

const readPaths = ['metadata', 'health', 'source-events', 'issues', 'patterns/priority', 'issues/late-trade-settlement', 'patterns/PAT-0067', 'investigations/PAT-0001', 'events/SIM-0000001'];
const writePaths = ['overview', 'priority-signals', 'risk-detail', 'actions', 'ai/dossier', 'ai/manager-insight', 'ai/portfolio/stream', 'ai/follow-up/stream', 'ai/deep-analysis/stream', 'ai/investigation-plan/stream', 'ai/enterprise-comparison/stream'];
const forbidden: [string, string][] = [['GET', 'auth/me'], ['POST', 'auth/login'], ['GET', 'datasets'], ['GET', 'actions'], ['GET', '../metadata'], ['GET', 'overview'], ['POST', 'health'], ['POST', 'source-events'], ['POST', 'issues'], ['POST', 'issues/late-trade-settlement'], ['POST', 'patterns/PAT-0001'], ['GET', 'patterns'], ['GET', 'investigations'], ['GET', 'events'], ['GET', 'actions/123'], ['GET', 'issues/example/private'], ['GET', 'patterns/PAT-0001/export']];

describe('operational route allowlist', () => {
  it.each(readPaths)('permits the exact read path %s', route => {
    expect(operationalPath('GET', route.split('/'))).toBe(`/api/${route}`);
  });
  it.each(writePaths)('permits the exact POST %s only on the backend with the one-million-byte body limit', route => {
    const target = operationalPath('POST', route.split('/'));
    expect(target).toBe(`/api/${route}`);
    expect(resolveBackend(target!)).toBe('kpi');
  });
  it.each(forbidden)('rejects %s %s', (method, route) => {
    expect(operationalPath(method, route.split('/'))).toBeNull();
  });
  it.each(['', '.', '..', '../auth/me', 'a/b', 'a\\b', 'a?admin=true', 'a#private', '%2f', '%2e%2e', '%252f', 'a%3fb', 'a b', 'a\u0000b', 'x'.repeat(201)])('rejects unsafe identifier %j', identifier => {
    for (const resource of ['issues', 'patterns', 'investigations', 'events']) expect(operationalPath('GET', [resource, identifier])).toBeNull();
  });
  it('does not allow a complete route smuggled into one segment', () => {
    expect(operationalPath('GET', ['patterns/priority'])).toBeNull();
  });
  it.each(['DELETE', 'PATCH', 'PUT'])('rejects unsupported method %s', method => {
    expect(operationalPath(method, ['actions'])).toBeNull();
  });
  it('disables Next body parsing and retains the server-side streaming duration', () => {
    expect(config.api).toEqual({ bodyParser: false, externalResolver: true, responseLimit: false });
    expect(maxDuration).toBe(60);
  });
  it('locates canonical assets from either the repository root or the nested Next application', () => {
    const root = findOperationalRoot();
    expect(findOperationalRoot(`${root}/frontend/back-office`)).toBe(root);
  });
});

function segments(request: IncomingMessage) {
  return new URL(request.url!, 'http://workspace.test').pathname.replace(/^\/api\/operational\//, '').split('/').map(decodeURIComponent);
}
async function listen(server: Server): Promise<string> {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/operational`;
}
async function close(server: Server) {
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
}

describe('raw Node operational bridge', () => {
  let app: FastifyInstance;
  let server: Server;
  let base: string;
  let mode: 'echo' | 'provider-error' | 'missing' | 'sse' | 'throw';
  let forwarded: { url: string; headers: IncomingMessage['headers']; rawHeaders: string[]; body: string }[];
  let finishStream: (() => void) | undefined;
  let streamCancelled: boolean;
  let settled: number;
  const forward = vi.fn(async (request: IncomingMessage, response: ServerResponse) => {
    if (mode === 'throw') throw new Error('sensitive server configuration');
    app.server.emit('request', request, response);
  });
  beforeAll(async () => {
    app = Fastify({ bodyLimit: 1_000_000 });
    app.removeAllContentTypeParsers();
    app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));
    app.all('/api/*', async (request, reply) => {
      forwarded.push({ url: request.url, headers: request.raw.headers, rawHeaders: request.raw.rawHeaders, body: Buffer.isBuffer(request.body) ? request.body.toString() : '' });
      if (mode === 'sse') {
        reply.hijack();
        reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Set-Cookie': 'session=private' });
        reply.raw.write('data: {"type":"analysis_start"}\n\n');
        finishStream = () => reply.raw.end('data: {"type":"analysis_complete"}\n\n');
        reply.raw.once('close', () => { streamCancelled = true; });
        return;
      }
      reply.header('Set-Cookie', 'session=private').header('X-Provider-Key', 'private');
      if (mode === 'provider-error') return reply.code(503).send({ error: { code: 'AI_UNAVAILABLE', message: 'AI assistant is not configured.' } });
      if (mode === 'missing') return reply.code(404).send({ error: { code: 'EVENT_NOT_FOUND', message: 'Event not found.' } });
      if (request.url === '/api/actions') return reply.code(201).send({ action: { status: 'SIMULATED', actionId: 'simulation-id' } });
      return { data: 'verified', body: forwarded.at(-1)!.body };
    });
    await app.ready();
    const bridge = createOperationalBridge(forward);
    server = createServer((request, response) => { void bridge(request, response, segments(request)).then(() => { settled++; }); });
    base = await listen(server);
  });
  beforeEach(() => { mode = 'echo'; forwarded = []; forward.mockClear(); finishStream = undefined; streamCancelled = false; settled = 0; });
  afterAll(async () => { await close(server); await app.close(); });

  it('rewrites only the allowlisted path, discards query parameters, and strips credentials before dispatch', async () => {
    const response = await fetch(`${base}/metadata?backend=https://untrusted.invalid`, { headers: { Cookie: 'account_session=private', Authorization: 'Bearer private', 'X-CSRF-Token': 'private', Origin: 'https://external.invalid' } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: 'verified', body: '' });
    expect(forwarded[0]!.url).toBe('/api/metadata');
    for (const name of ['cookie', 'authorization', 'x-csrf-token', 'origin']) expect(forwarded[0]!.headers).not.toHaveProperty(name);
    expect(forwarded[0]!.rawHeaders.join(' ')).not.toContain('private');
    expect(response.headers.has('set-cookie')).toBe(false);
    expect(response.headers.has('x-provider-key')).toBe(false);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });
  it('rejects account routes before backend initialization', async () => {
    expect((await fetch(`${base}/auth/me`)).status).toBe(404);
    expect(forward).not.toHaveBeenCalled();
  });
  it('forwards the exact request body without Next JSON parsing', async () => {
    const body = '{ "filters": { "severity": "High" } }';
    const response = await fetch(`${base}/overview`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    expect((await response.json()).body).toBe(body);
    expect(forwarded[0]!.body).toBe(body);
  });
  it('preserves backend simulated action creation status', async () => {
    const response = await fetch(`${base}/actions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actionType: 'OPEN_INVESTIGATION', eventIds: ['SIM-0000001'] }) });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ action: { status: 'SIMULATED', actionId: 'simulation-id' } });
  });
  it.each([['provider-error', 503, 'AI_UNAVAILABLE'], ['missing', 404, 'EVENT_NOT_FOUND']] as const)('preserves %s status and JSON error', async (state, status, code) => {
    mode = state;
    const response = await fetch(`${base}/health`);
    expect(response.status).toBe(status);
    expect((await response.json()).error.code).toBe(code);
  });
  it('delivers an SSE frame before the backend finishes and keeps the invocation alive until completion', async () => {
    mode = 'sse';
    const response = await fetch(`${base}/ai/portfolio/stream`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-accel-buffering')).toBe('no');
    expect(response.headers.has('set-cookie')).toBe(false);
    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('analysis_start');
    expect(settled).toBe(0);
    finishStream!();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('analysis_complete');
    await reader.read();
    await vi.waitFor(() => expect(settled).toBe(1));
  });
  it('propagates client disconnect to the raw response close event used by backend model cancellation', async () => {
    mode = 'sse';
    const controller = new AbortController();
    const response = await fetch(`${base}/ai/portfolio/stream`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: controller.signal });
    await response.body!.getReader().read();
    controller.abort();
    await vi.waitFor(() => expect(streamCancelled).toBe(true));
    await vi.waitFor(() => expect(settled).toBe(1));
  });
  it('accepts exactly one million bytes', async () => {
    const body = JSON.stringify({ p: 'a'.repeat(999_992) });
    expect(Buffer.byteLength(body)).toBe(1_000_000);
    const response = await fetch(`${base}/overview`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    expect(response.status).toBe(200);
    await response.arrayBuffer();
    expect(forwarded[0]!.body).toHaveLength(1_000_000);
  });
  it('rejects a declared oversized body before dispatch', async () => {
    const response = await fetch(`${base}/overview`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'a'.repeat(1_000_001) });
    expect(response.status).toBe(413);
    expect(forward).not.toHaveBeenCalled();
  });
  it('enforces the same bound for chunked requests without Content-Length', async () => {
    const status = await new Promise<number>((resolve, reject) => {
      const request = httpRequest(`${base}/overview`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' } }, response => { response.resume(); response.once('end', () => resolve(response.statusCode!)); });
      request.on('error', reject); request.write('a'.repeat(600_000)); request.end('a'.repeat(400_001));
    });
    expect(status).toBe(413);
    expect(forwarded).toHaveLength(0);
  });
  it('fails safely on startup errors without leaking configuration', async () => {
    mode = 'throw';
    const response = await fetch(`${base}/health`);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('sensitive');
  });
});

describe('in-process operational backend assets and deterministic routes', () => {
  let server: Server;
  let base: string;
  beforeAll(async () => {
    server = createServer((request, response) => { void operationalBridge(request, response, segments(request)); });
    base = await listen(server);
  });
  afterAll(async () => { await close(server); });
  it('loads health and all source rows without any loopback backend service', async () => {
    const health = await fetch(`${base}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ dataLoaded: true, aiConfigured: false, eventCount: 1000 });
    const source = await fetch(`${base}/source-events`);
    expect(source.status).toBe(200);
    const body = await source.json();
    expect(body.synthetic).toBe(true);
    expect(body.events).toHaveLength(body.totalRows);
    expect(body.totalRows).toBe(1000);
  }, 30_000);
  it('resolves legacy evidence routes using explicitly located source assets', async () => {
    const response = await fetch(`${base}/patterns/priority`);
    expect(response.status).toBe(200);
    expect((await response.json()).patterns.length).toBeGreaterThan(0);
  }, 30_000);
  it('preserves the real unconfigured-provider error without attempting model generation', async () => {
    const response = await fetch(`${base}/ai/portfolio/stream`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filters: { organisation: 'Enterprise-wide', eventType: 'All', severity: 'All' }, lens: 'analyse' }) });
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('AI_UNAVAILABLE');
  });
});
