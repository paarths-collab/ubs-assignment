import { describe, expect, it, vi } from 'vitest';
import { consumeAnalysis, type AnalysisEvent } from './stream';

const frame = (event: Record<string, unknown>) => `data: ${JSON.stringify(event)}\n\n`;
const complete = { type: 'analysis_complete', durationMs: 45, evidence: { eventCount: 12 } };
function response(parts: string[], close = true) {
  const cancel = vi.fn();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) { parts.forEach(part => controller.enqueue(new TextEncoder().encode(part))); if (close) controller.close(); },
    cancel,
  });
  return { response: new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } }), cancel };
}

describe('connected operational analysis transport', () => {
  it('handles fragmented frames and CRLF, stopping at completion even if transport stays open', async () => {
    const events: AnalysisEvent[] = [];
    const text = (frame({ type: 'analysis_start', title: 'Current scope', eventCount: 12 }) + frame({ type: 'section_delta', sectionId: 'portfolio', delta: 'Review the evidence.' }) + frame(complete) + frame({ type: 'analysis_error', message: 'Late event' })).replaceAll('\n', '\r\n');
    const source = response([text.slice(0, 17), text.slice(17, 31), text.slice(31)], false);
    await consumeAnalysis(source.response, event => events.push(event), new AbortController().signal);
    expect(events.map(event => event.type)).toEqual(['analysis_start', 'section_delta', 'analysis_complete']);
    expect(source.cancel).toHaveBeenCalledOnce();
  });

  it('reports premature EOF instead of treating a partial answer as complete', async () => {
    const source = response([frame({ type: 'section_delta', sectionId: 'portfolio', delta: 'Partial answer' })]);
    await expect(consumeAnalysis(source.response, vi.fn(), new AbortController().signal)).rejects.toThrow('ended before completion');
  });

  it('ends on server analysis_error and ignores later text', async () => {
    const receive = vi.fn();
    const source = response([frame({ type: 'analysis_error', message: 'The assistant returned an unusable response.' }) + frame(complete)], false);
    await consumeAnalysis(source.response, receive, new AbortController().signal);
    expect(receive).toHaveBeenCalledOnce();
    expect(receive).toHaveBeenCalledWith({ type: 'analysis_error', message: 'The assistant returned an unusable response.' });
    expect(source.cancel).toHaveBeenCalledOnce();
  });

  it('preserves the backend unconfigured-provider error', async () => {
    const source = new Response(JSON.stringify({ error: { code: 'AI_UNAVAILABLE', message: 'AI assistant is not configured.' } }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    await expect(consumeAnalysis(source, vi.fn(), new AbortController().signal)).rejects.toThrow('AI assistant is not configured.');
  });

  it.each([
    ['malformed JSON', 'data: {broken\n\n'],
    ['invalid completion', frame({ type: 'analysis_complete', evidence: 'not evidence' })],
    ['unknown type', frame({ type: 'pretend_success' })],
  ])('does not accept %s as a successful analysis', async (_name, text) => {
    const receive = vi.fn();
    await expect(consumeAnalysis(response([text]).response, receive, new AbortController().signal)).rejects.toThrow();
    expect(receive).not.toHaveBeenCalled();
  });

  it('rejects an HTML response instead of showing it as model prose', async () => {
    await expect(consumeAnalysis(new Response('<html>Login</html>', { headers: { 'Content-Type': 'text/html' } }), vi.fn(), new AbortController().signal)).rejects.toThrow('unexpected response');
  });

  it('cancels a pending reader when the user stops the analysis', async () => {
    const controller = new AbortController();
    const source = response([], false);
    const receive = vi.fn();
    const pending = consumeAnalysis(source.response, receive, controller.signal);
    controller.abort();
    await pending;
    expect(source.cancel).toHaveBeenCalledOnce();
    expect(receive).not.toHaveBeenCalled();
  });

  it('never dispatches events if the request was already cancelled', async () => {
    const controller = new AbortController(); controller.abort();
    const receive = vi.fn();
    await consumeAnalysis(response([frame(complete)]).response, receive, controller.signal);
    expect(receive).not.toHaveBeenCalled();
  });
});
