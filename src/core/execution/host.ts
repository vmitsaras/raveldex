import { invalid } from '../errors/error.js';

/** Private host seam. Scheduling must enqueue a task, never call inline. */
export interface ExecutionHost {
  now(): number;
  schedule(callback: () => void, delayMs: number): () => void;
}

interface TimerHost {
  performance: { now(): number };
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

/** Read host handles only when an engine is explicitly created. No DOM needed. */
export function directHost(): ExecutionHost {
  const host = globalThis as unknown as TimerHost;
  if (typeof host.performance?.now !== 'function' || typeof host.setTimeout !== 'function' || typeof host.clearTimeout !== 'function') invalid('INTERNAL_ERROR', 'execution.host');
  const now = host.performance.now.bind(host.performance);
  const schedule = host.setTimeout.bind(host), cancel = host.clearTimeout.bind(host);
  return Object.freeze({ now, schedule(callback: () => void, delayMs: number) {
    const handle = schedule(callback, delayMs);
    return () => cancel(handle);
  } });
}
