import { invalid } from '../errors/error.js';

/** Private host seam. Scheduling must enqueue a task, never call inline. */
export interface ExecutionHost {
  now(): number;
  schedule(callback: () => void, delayMs: number): () => void;
  continuation?(callback: () => void): () => void;
  dispose?(): void;
}

interface TaskPort {
  onmessage: ((event: { data: unknown }) => void) | null;
  postMessage(value: number): void;
  close(): void;
}
interface TaskChannel { readonly port1: TaskPort; readonly port2: TaskPort }
interface TimerHost {
  performance: { now(): number };
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
  setImmediate?: (callback: () => void) => unknown;
  clearImmediate?: (handle: unknown) => void;
  MessageChannel?: new () => TaskChannel;
}

/** Read host handles only when an engine is explicitly created. No DOM needed. */
export function directHost(): ExecutionHost {
  const host = globalThis as unknown as TimerHost;
  if (typeof host.performance?.now !== 'function' || typeof host.setTimeout !== 'function' || typeof host.clearTimeout !== 'function') invalid('INTERNAL_ERROR', 'execution.host');
  const now = host.performance.now.bind(host.performance);
  const schedule = host.setTimeout.bind(host), cancel = host.clearTimeout.bind(host);
  let immediate: TimerHost['setImmediate'], clearImmediate: TimerHost['clearImmediate'], Channel: TimerHost['MessageChannel'];
  // Optional host primitives may be absent or unavailable in a restricted realm.
  // Capture them once, without importing Node modules or requiring a DOM.
  try {
    const make = host.setImmediate, clear = host.clearImmediate;
    if (typeof make === 'function' && typeof clear === 'function') { immediate = make.bind(host); clearImmediate = clear.bind(host); }
  } catch { /* The captured timer path remains available. */ }
  if (!immediate) try { const Constructor = host.MessageChannel; if (typeof Constructor === 'function') Channel = Constructor; }
  catch { /* The captured timer path remains available. */ }
  const pending = new Set<() => void>();
  let disposed = false, fastCount = 0;
  let channel: { ports: TaskChannel; post(value: number): void; close(): void; callbacks: Map<number, () => void>; sequence: number } | undefined;
  function closeChannel(current: NonNullable<typeof channel>): void {
    if (channel !== current) return;
    channel = undefined; current.callbacks.clear();
    try { current.ports.port1.onmessage = null; } catch { /* Ownership is already invalidated. */ }
    current.close();
  }
  function message(callback: () => void): (() => void) | undefined {
    if (!channel) {
      let ports: TaskChannel | undefined;
      try {
        ports = new Channel!();
        const first = ports.port1, second = ports.port2;
        const closeFirst = first.close.bind(first), closeSecond = second.close.bind(second);
        const current = { ports, post: second.postMessage.bind(second), close() {
          for (const close of [closeFirst, closeSecond]) try { close(); } catch { /* Cleanup cannot replace the callback's outcome. */ }
        }, callbacks: new Map<number, () => void>(), sequence: 0 };
        first.onmessage = event => {
          if (disposed || channel !== current) return;
          const id = event.data;
          if (typeof id !== 'number') return;
          const run = current.callbacks.get(id); current.callbacks.delete(id);
          try { run?.(); } finally { if (!current.callbacks.size) closeChannel(current); }
        };
        channel = current;
      } catch {
        Channel = undefined;
        for (const port of [ports?.port1, ports?.port2]) if (port) {
          try { port.onmessage = null; } catch { /* Release each partial resource independently. */ }
          try { port.close(); } catch { /* Preserve fallback availability. */ }
        }
        return undefined;
      }
    }
    const current = channel, id = ++current.sequence;
    current.callbacks.set(id, callback);
    try { current.post(id); }
    catch (error) { current.callbacks.delete(id); if (!current.callbacks.size) closeChannel(current); throw error; }
    return () => { current.callbacks.delete(id); if (!current.callbacks.size) closeChannel(current); };
  }
  return Object.freeze({ now, schedule(callback: () => void, delayMs: number) {
    const handle = schedule(callback, delayMs);
    return () => cancel(handle);
  }, continuation(input: () => void) {
    if (disposed) invalid('INTERNAL_ERROR', 'execution.host');
    let callback: (() => void) | undefined = input, handle: (() => void) | undefined;
    const remove = (): void => { pending.delete(stop); };
    const run = (): void => {
      const invoke = callback; callback = undefined; handle = undefined; remove();
      if (!disposed) invoke?.();
    };
    const stop = (): void => { callback = undefined; const cancelHandle = handle; handle = undefined; remove(); cancelHandle?.(); };
    pending.add(stop);
    try {
      // Keep regular timer opportunities even when a host prioritizes its fast
      // task source. Cancelled/idle work owns no referenced ports or callbacks.
      const timerTurn = ++fastCount === 8; if (timerTurn) fastCount = 0;
      if (!timerTurn && immediate) { const id = immediate(run); handle = () => clearImmediate!(id); }
      else if (!timerTurn && Channel) handle = message(run);
      if (!handle) { const id = schedule(run, 0); handle = () => cancel(id); }
    } catch (error) { stop(); throw error; }
    return stop;
  }, dispose() {
    if (disposed) return;
    disposed = true;
    for (const stop of [...pending]) try { stop(); } catch { /* Continue releasing owned handles. */ }
    if (channel) closeChannel(channel);
  } });
}
