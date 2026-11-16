import { checkModelGrounding, collectResultTexts } from '../../../risk-stream-explorer/src/services/aiGrounding.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

export interface LlmCallOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** Covers headers AND body consumption, including clients which ignore abort. */
export async function withLlmDeadline<T>(call: (signal: AbortSignal) => Promise<T>, options: LlmCallOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = Math.max(1, Math.min(env.GROQ_TIMEOUT_MS, options.timeoutMs ?? env.GROQ_TIMEOUT_MS));
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: () => void = () => {};
  const deadline = new Promise<never>((_resolve, reject) => {
    const stop = (message: string) => {
      controller.abort();
      reject(new AppError('AI_UNAVAILABLE', message));
    };
    cancel = () => stop('Analysis request was cancelled.');
    timer = setTimeout(() => stop('Analysis provider deadline exceeded.'), timeoutMs);
    if (options.signal?.aborted) cancel();
    else options.signal?.addEventListener('abort', cancel, { once: true });
  });
  try {
    if (controller.signal.aborted) return await deadline;
    return await Promise.race([call(controller.signal), deadline]);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
  }
}

/** Questions/instructions are deliberately excluded: only server evidence vouches for IDs. */
export function assertGroundedAnalysis(texts: readonly string[], evidence: unknown): void {
  const strings = collectResultTexts(evidence);
  const ids = strings.flatMap((text) => text.match(/\bSIM-(?:[A-Z]+-)?[A-Za-z0-9]+\b/g) ?? []);
  const patterns = strings.flatMap((text) => text.match(/\bPAT-\d+\b/g) ?? []);
  const result = checkModelGrounding(texts, { evidence, knownEventIds: ids, allowedEventIds: ids, knownPatternIds: patterns, allowedPatternIds: patterns });
  if (!result.ok) throw new AppError('AI_INVALID_RESPONSE', 'The model returned claims that could not be verified.');
}
