import { ERROR_CODES } from '../../core/errors/error.js';
import type { ErrorCode } from '../../core/errors/error.js';
import type { DirectoryChange, DirectoryHandle, DirectoryOptions, DirectorySnapshot, DirectoryState } from './directory-types.js';
import { captureDirectory, capturePage, captureState, directoryConfigurations, directoryQuery, failDirectory, object, queryKey, stateKey } from './directory-state.js';

/** Nonvisual, bounded native directory state. The engine always stays borrowed. */
export function createDirectory(options: DirectoryOptions): DirectoryHandle {
  const captured = captureDirectory(options), config = captured.config;
  if (typeof AbortController !== 'function') failDirectory('abort', 'UNSUPPORTED_ENVIRONMENT');
  let search: typeof captured.search | undefined = captured.search;
  let snapshot: DirectorySnapshot = Object.freeze({ status: 'idle', change: 'initial', state: captureState(config, { text: '', filters: {}, page: 1 }) });
  let ended = false, sequence = 0, active: AbortController | undefined;
  let pending: { key: string; readonly promise: Promise<void> } | undefined;
  let baseline: { readonly query: string; readonly revision: number } | undefined;
  const listeners = new Set<(snapshot: DirectorySnapshot) => void>();
  const notify = (): void => {
    const value = snapshot;
    for (const listener of [...listeners]) {
      if (snapshot !== value) break;
      if (!listeners.has(listener)) continue;
      try { listener(value); } catch { /* Observers do not own the transaction. */ }
    }
  };
  function execute(state: DirectoryState, change: DirectoryChange, force = false): Promise<void> {
    if (ended) return Promise.resolve();
    const key = stateKey(state);
    if (!force && snapshot.status === 'loading' && pending?.key === key) return pending.promise;
    if (!force && snapshot.status === 'ready' && stateKey(snapshot.state) === key) return Promise.resolve();
    const expected = (change === 'page' || change === 'restore') && baseline?.query === queryKey(state) ? baseline.revision : undefined;
    const old = active, controller = new AbortController(), ticket = ++sequence;
    let finish!: () => void;
    const promise = new Promise<void>(resolve => { finish = resolve; });
    const job = { key, promise }; pending = job; active = controller;
    snapshot = Object.freeze({ status: 'loading', state, change });
    const current = (): boolean => !ended && sequence === ticket && active === controller && !controller.signal.aborted;
    const stale = (state: DirectoryState): void => {
      baseline = undefined; job.key = stateKey(state);
      snapshot = Object.freeze({ status: 'stale', state, change: 'recovery', error: 'REVISION_MISMATCH' }); notify();
    };
    // Work and its completion Promise exist before abort/observer callbacks.
    void Promise.resolve().then(async () => {
      try {
        if (!current() || !search) return;
        let selected = state, revision = expected;
        for (let attempt = 0; attempt < 2; attempt++) {
          const offset = (selected.page - 1) * config.pageSize, limit = Math.min(config.pageSize, 10_000 - offset);
          const extensions = config.groups.length ? { facets: { fields: config.groups.map(group => ({ field: group.field, limit: group.limit, missing: true })) } } : undefined;
          const raw = await search(directoryQuery(config, selected), { offset, limit, signal: controller.signal, ...(extensions ? { extensions } : {}) });
          if (!current()) return;
          const result = capturePage(config, selected, raw, limit, offset);
          if (!current()) return;
          if (revision !== undefined && result.revision !== revision) { stale(Object.freeze({ ...selected, page: 1 })); return; }
          if (selected.page > 1 && offset >= result.total) {
            selected = Object.freeze({ ...selected, page: 1 }); revision = result.revision; job.key = stateKey(selected);
            snapshot = Object.freeze({ status: 'loading', state: selected, change: 'recovery' }); notify();
            if (!current()) return;
            continue;
          }
          baseline = { query: queryKey(selected), revision: result.revision };
          snapshot = Object.freeze({ status: 'ready', state: selected, change: attempt ? 'recovery' : change, result }); notify();
          return;
        }
      } catch (reason) {
        if (!current()) return;
        let code: ErrorCode = 'INTERNAL_ERROR';
        try {
          const descriptor = typeof reason === 'object' && reason !== null ? Object.getOwnPropertyDescriptor(reason, 'code') : undefined;
          if (descriptor && 'value' in descriptor && (ERROR_CODES as readonly unknown[]).includes(descriptor.value)) code = descriptor.value as ErrorCode;
        } catch { /* A foreign error cannot escape or replace a newer operation. */ }
        if (!current()) return;
        baseline = undefined;
        snapshot = Object.freeze({ status: 'error', state: snapshot.state, change: snapshot.change, error: code }); notify();
      } finally {
        if (pending === job) pending = undefined;
        if (active === controller) active = undefined;
        finish();
      }
    });
    old?.abort();
    if (current()) notify();
    return promise;
  }
  const handle: DirectoryHandle = Object.freeze({
    getSnapshot: () => snapshot,
    subscribe: (listener: (snapshot: DirectorySnapshot) => void): (() => void) => {
      if (ended) return () => {};
      if (typeof listener !== 'function') failDirectory('listener');
      if (!listeners.has(listener) && listeners.size >= 64) failDirectory('listeners', 'LIMIT_EXCEEDED');
      listeners.add(listener); return () => { listeners.delete(listener); };
    },
    update: (patch: { readonly text?: string; readonly filters?: DirectoryState['filters'] }): Promise<void> => {
      if (ended) return Promise.resolve();
      const data = object(patch, ['text', 'filters'], 'update');
      const next = captureState(config, { text: Object.hasOwn(data, 'text') ? data.text : snapshot.state.text,
        filters: Object.hasOwn(data, 'filters') ? data.filters : snapshot.state.filters, page: 1 });
      return execute(queryKey(next) === queryKey(snapshot.state) ? snapshot.state : next, 'update');
    },
    setPage: (page: number): Promise<void> => {
      if (ended) return Promise.resolve();
      return execute(captureState(config, { ...snapshot.state, page }), 'page');
    },
    restore: (state: DirectoryState): Promise<void> => ended ? Promise.resolve() : execute(captureState(config, state), 'restore'),
    refresh: (): Promise<void> => ended ? Promise.resolve() : execute(Object.freeze({ ...snapshot.state, page: 1 }), 'refresh', true),
    destroy: (): void => {
      if (ended) return;
      ended = true; sequence++; search = undefined; baseline = undefined; pending = undefined;
      const previous = active; active = undefined;
      snapshot = Object.freeze({ status: 'destroyed', state: snapshot.state, change: 'destroy' });
      directoryConfigurations.delete(handle);
      previous?.abort(); notify(); listeners.clear();
    },
  });
  directoryConfigurations.set(handle, config);
  return handle;
}
