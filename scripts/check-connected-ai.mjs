import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { standaloneAppDirectory } from '../frontend/back-office/scripts/standalone-path.mjs';

// Production transport check with an isolated fixture provider, never a real key.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let providerCalls = 0;
let rejectProvider = false;
const question = 'What should I review in this portfolio?';
const provider = createServer(async (request, response) => {
  let body = '';
  for await (const chunk of request) body += chunk;
  providerCalls++;
  try {
    assert.equal(request.url, '/chat/completions');
    assert.equal(request.headers.authorization, 'Bearer local-transport-fixture');
    const payload = JSON.parse(body);
    assert.equal(payload.stream, true);
    assert.ok(JSON.stringify(payload.messages).includes(question));
    if (rejectProvider) {
      response.writeHead(401, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: { message: 'Fixture provider rejected the request.' } }));
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.end(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Review the recorded evidence before deciding which events to investigate.' } }] })}\n\ndata: [DONE]\n\n`);
  } catch {
    response.writeHead(400);
    response.end('Invalid fixture provider request');
  }
});

await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));
const reservation = createServer();
await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const standalone = standaloneAppDirectory(path.join(root, 'frontend/back-office/.next/standalone'));
const child = spawn(process.execPath, [path.join(standalone, 'server.js')], {
  cwd: standalone,
  env: { ...process.env, NODE_ENV: 'production', PORT: String(port), HOSTNAME: '127.0.0.1', LLM_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'local-transport-fixture', OPENROUTER_BASE_URL: `http://127.0.0.1:${provider.address().port}` },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
child.stdout.on('data', chunk => { logs += chunk; });
child.stderr.on('data', chunk => { logs += chunk; });
const base = `http://127.0.0.1:${port}`;
const filters = { organisation: 'Enterprise-wide', eventType: 'All', severity: 'All' };
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { ready = (await fetch(`${base}/api/operational/health`)).ok; } catch { /* Starting. */ }
    if (ready) break;
    if (child.exitCode !== null) throw new Error('Standalone process exited before startup.');
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok(ready, 'Standalone server did not become ready.');
  const health = await (await fetch(`${base}/api/operational/health`)).json();
  assert.equal(health.aiConfigured, true);
  assert.equal(health.dataLoaded, true);
  for (const resource of ['metadata', 'source-events', 'issues', 'patterns/priority']) {
    const response = await fetch(`${base}/api/operational/${resource}`);
    assert.equal(response.status, 200, `Packaged source unavailable: ${resource}`);
  }
  async function analyse() {
    const response = await fetch(`${base}/api/operational/ai/follow-up/stream`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filters, context: 'ai-analysis', question }),
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/event-stream/);
    return response.text();
  }
  const answer = await analyse();
  assert.match(answer, /analysis_start/);
  assert.match(answer, /section_delta/);
  assert.match(answer, /analysis_complete/);
  assert.doesNotMatch(answer, /analysis_error/);
  assert.match(answer, /Review the recorded evidence/);
  assert.equal(providerCalls, 1);
  rejectProvider = true;
  const failure = await analyse();
  assert.match(failure, /analysis_error/);
  assert.doesNotMatch(failure, /analysis_complete/);
  assert.ok(providerCalls >= 2);
  console.log('PASS: packaged sources, server-side provider configuration, question forwarding, validated SSE answer, and provider failure handling. Fixture provider only; no live credentials used.');
} catch (error) {
  console.error(logs.slice(-6000));
  throw error;
} finally {
  if (child.exitCode === null) { child.kill('SIGTERM'); await once(child, 'exit'); }
  await new Promise(resolve => provider.close(resolve));
}
