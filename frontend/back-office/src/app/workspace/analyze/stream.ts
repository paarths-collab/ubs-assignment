export type AnalysisEvent =
  | { type: 'analysis_start'; title: string; eventCount: number }
  | { type: 'section_start'; sectionId: string; title: string }
  | { type: 'section_delta'; sectionId: string; delta: string }
  | { type: 'section_complete'; sectionId: string }
  | { type: 'analysis_complete'; durationMs: number; evidence: { eventCount: number } }
  | { type: 'analysis_error'; message: string };

function parseEvent(raw: string): AnalysisEvent | null {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || !('type' in value)) return null;
  const event = value as Record<string, unknown>;
  const text = (key: string) => typeof event[key] === 'string';
  switch (event.type) {
    case 'analysis_start': return text('title') && Number.isFinite(event.eventCount) ? event as AnalysisEvent : null;
    case 'section_start': return text('sectionId') && text('title') ? event as AnalysisEvent : null;
    case 'section_delta': return text('sectionId') && text('delta') ? event as AnalysisEvent : null;
    case 'section_complete': return text('sectionId') ? event as AnalysisEvent : null;
    case 'analysis_error': return text('message') ? event as AnalysisEvent : null;
    case 'analysis_complete': {
      const evidence = event.evidence as { eventCount?: unknown } | undefined;
      return Number.isFinite(event.durationMs) && evidence && Number.isFinite(evidence.eventCount) ? event as AnalysisEvent : null;
    }
    default: return null;
  }
}

/** POST SSE transport adapted from the existing executive analysis client.
 * Only complete frames are dispatched; an explicit terminal frame is required.
 */
export async function consumeAnalysis(response: Response, receive: (event: AnalysisEvent) => void, signal: AbortSignal): Promise<void> {
  if (!response.ok || !response.body) {
    const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `Analysis unavailable (HTTP ${response.status}).`);
  }
  if (!response.headers.get('content-type')?.startsWith('text/event-stream')) throw new Error('The analysis service returned an unexpected response.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (signal.aborted) return;
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > 1_000_000) throw new Error('The analysis response exceeded its safe display limit.');
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? '';
      for (const block of blocks) {
        const lines = block.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, ''));
        if (!lines.length) continue;
        let event: AnalysisEvent | null;
        try { event = parseEvent(lines.join('\n')); } catch { throw new Error('The analysis stream contained an invalid event.'); }
        if (!event) throw new Error('The analysis stream contained an unsupported event.');
        if (signal.aborted) return;
        receive(event);
        if (event.type === 'analysis_complete' || event.type === 'analysis_error') return;
      }
    }
    if (!signal.aborted) throw new Error('The analysis stream ended before completion. Please retry.');
  } finally {
    signal.removeEventListener('abort', cancel);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
