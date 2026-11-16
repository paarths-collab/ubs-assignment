import { existsSync } from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { resolveBackend, type Backend } from '../../../../api/routes';

const reads = new Set(['metadata', 'health', 'source-events', 'issues', 'patterns/priority']);
const details = new Set(['issues', 'patterns', 'investigations', 'events']);
const writes = new Set(['overview', 'priority-signals', 'risk-detail', 'actions', 'ai/dossier', 'ai/manager-insight', 'ai/portfolio/stream', 'ai/follow-up/stream', 'ai/deep-analysis/stream', 'ai/investigation-plan/stream', 'ai/enterprise-comparison/stream']);
const safeSegment = /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/;

export function operationalPath(method: string | undefined, segments: string[]): string | null {
  if (!segments.length || !segments.every(segment => safeSegment.test(segment))) return null;
  const route = segments.join('/');
  const allowed = method === 'GET' ? reads.has(route) || (segments.length === 2 && details.has(segments[0] ?? '')) : method === 'POST' && writes.has(route);
  return allowed ? `/api/${segments.map(segment => encodeURIComponent(segment)).join('/')}` : null;
}

/** Standalone and hosted bundles retain these traced repository-relative assets. */
export function findOperationalRoot(start = process.cwd()): string {
  let directory = path.resolve(start);
  for (;;) {
    if (existsSync(path.join(directory, 'backend/risk-executive-overview/data/risk_events_overview.json'))) return directory;
    const parent = path.dirname(directory);
    if (parent === directory) throw new Error('Operational source data is missing from this server bundle.');
    directory = parent;
  }
}

const apps: Partial<Record<Backend, Promise<FastifyInstance>>> = {};
async function getApp(backend: Backend): Promise<FastifyInstance> {
  if (apps[backend]) return apps[backend];
  const started = (async () => {
    const root = findOperationalRoot();
    let app: FastifyInstance;
    if (backend === 'kpi') {
      const [{ buildApp }, { RiskRepository }] = await Promise.all([
        import('../../../../backend/risk-executive-overview/src/app'),
        import('../../../../backend/risk-executive-overview/src/repositories/RiskRepository'),
      ]);
      const directory = path.join(root, 'backend/risk-executive-overview/data');
      app = buildApp({ repository: new RiskRepository({
        events: path.join(directory, 'risk_events_overview.json'), config: path.join(directory, 'risk_config_overview.json'),
        patterns: path.join(directory, 'risk_patterns_overview.json'), aiConfig: path.join(directory, 'risk_ai_config_overview.json'),
      }) });
    } else {
      const { buildApp } = await import('../../../../backend/risk-stream-explorer/src/app');
      app = await buildApp({ serveBuiltFrontend: false, dataDir: path.join(root, 'backend/risk-stream-explorer/data'), graphDataDir: path.join(root, 'frontend/risk-stream-explorer/src/graph/data') });
    }
    await app.ready();
    return app;
  })();
  apps[backend] = started;
  try { return await started; } catch (error) { delete apps[backend]; throw error; }
}

type Dispatch = (request: IncomingMessage, response: ServerResponse) => Promise<void>;
async function dispatch(request: IncomingMessage, response: ServerResponse) {
  const app = await getApp(resolveBackend(request.url));
  if (!request.aborted && !response.destroyed) app.server.emit('request', request, response);
}

function errorResponse(response: ServerResponse, status: number, message: string) {
  if (response.destroyed || response.writableEnded) return;
  if (response.headersSent) { response.destroy(); return; }
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify({ error: { message } }));
}

/** Raw Node handoff preserves SSE delivery and the backend's disconnect cancellation.
 * Every allowed POST is owned by the KPI app, whose parser enforces 1,000,000 bytes.
 */
export function createOperationalBridge(forward: Dispatch = dispatch) {
  return async (request: IncomingMessage, response: ServerResponse, segments: string[]): Promise<void> => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Accel-Buffering', 'no');
    const url = operationalPath(request.method, segments);
    if (!url) { errorResponse(response, 404, 'Resource not found.'); return; }
    const contentLength = request.headers['content-length'];
    if (contentLength && Number(contentLength) > 1_000_000) { errorResponse(response, 413, 'Request exceeds the analysis limit.'); request.resume(); return; }

    // Operational routes never receive private account sessions or browser credentials.
    const headers: IncomingMessage['headers'] = {};
    for (const name of ['content-type', 'content-length', 'transfer-encoding', 'accept', 'host']) {
      if (request.headers[name] !== undefined) headers[name] = request.headers[name];
    }
    request.headers = headers;
    request.rawHeaders = Object.entries(headers).flatMap(([name, value]) => (Array.isArray(value) ? value : [value ?? '']).flatMap(item => [name, item]));
    request.url = url;

    // Account cookies and provider headers cannot escape through this bridge.
    const allowedHeaders = new Set(['content-type', 'content-length', 'x-request-id', 'retry-after', 'cache-control', 'x-content-type-options', 'x-accel-buffering']);
    const originalSetHeader = response.setHeader;
    response.setHeader = function (name, value) {
      if (!allowedHeaders.has(name.toLowerCase())) return this;
      return originalSetHeader.call(this, name, name.toLowerCase() === 'cache-control' ? 'no-store' : value);
    };
    const originalWriteHead = response.writeHead;
    response.writeHead = function (statusCode: number, statusMessageOrHeaders?: string | import('node:http').OutgoingHttpHeaders | import('node:http').OutgoingHttpHeader[], suppliedHeaders?: import('node:http').OutgoingHttpHeaders | import('node:http').OutgoingHttpHeader[]) {
      const head = typeof statusMessageOrHeaders === 'string' ? suppliedHeaders : statusMessageOrHeaders;
      if (Array.isArray(head)) {
        for (let index = 0; index < head.length; index += 2) this.setHeader(String(head[index]), head[index + 1] as string);
      } else if (head) {
        for (const [name, value] of Object.entries(head)) if (value !== undefined) this.setHeader(name, value);
      }
      if (typeof statusMessageOrHeaders === 'string') this.statusMessage = statusMessageOrHeaders;
      return originalWriteHead.call(this, statusCode);
    };

    // Keep the function invocation alive through the final SSE frame. The
    // backend's 50s budget remains inside this route's 60s hosting duration.
    await new Promise<void>(resolve => {
      const done = () => { response.off('finish', done); response.off('close', done); resolve(); };
      response.once('finish', done); response.once('close', done);
      void forward(request, response).catch(() => errorResponse(response, 503, 'The analysis service is unavailable. Please retry.'));
    });
  };
}

export const operationalBridge = createOperationalBridge();
