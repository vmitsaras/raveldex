import { Admission, keysOnly, ownObject } from '../../core/contracts/data.js';
import type { CancellationSignal, MutationOptions } from '../../core/contracts/types.js';
import { SnapshotAdapterError } from '../snapshots/error.js';
import { IndexedDBAdapterError } from './error.js';
import type { IndexedDBErrorDetails } from './error.js';
import type { IndexedDBOptions, IndexedDBPersistence, PersistenceSnapshots, PersistenceOptions, PersistenceWriteOptions, PersistenceSaveResult, PersistenceLoadResult, PersistenceEraseResult } from './types.js';
const STORES = ['snapshots', 'metadata'] as const, VERSION = 1, MAX_BYTES = 64 * 1024 * 1024, MAX_PENDING = 64;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
type Phase = NonNullable<IndexedDBErrorDetails['phase']>;
interface Operation {
  readonly controller: AbortController; readonly deadline: number; readonly expected: string | null | undefined;
  readonly stop: Set<() => void>; stopped?: IndexedDBAdapterError; phase: Phase;
  timer?: ReturnType<typeof setTimeout>; detach?: () => void; pendingRestore?: string;
}
interface Stored { namespace: string; version: 1; generation: string; encoded: string }
interface Metadata { namespace: string; version: 1; generation: string; format: 'raveldex-source' | 'raveldex-native'; encodedBytes: number }
function invalid(): never { throw new IndexedDBAdapterError('INVALID_OPTIONS', { phase: 'admission' }); }
function bounded(value: unknown, fallback: number, maximum: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > maximum) invalid(); return value;
}
function name(value: unknown): string {
  if (typeof value !== 'string' || !value.length || value.length > 256 || /[\u0000-\u001f\u007f]/.test(value)) invalid();
  for (let i = 0; i < value.length; i++) { const c = value.charCodeAt(i); if (c >= 0xd800 && c <= 0xdbff) { const next = value.charCodeAt(++i); if (!(next >= 0xdc00 && next <= 0xdfff)) invalid(); } else if (c >= 0xdc00 && c <= 0xdfff) invalid(); }
  return value;
}
function storageError(error: unknown, phase: Phase): IndexedDBAdapterError {
  if (error instanceof IndexedDBAdapterError) return error;
  const reason = error && typeof error === 'object' && 'name' in error ? error.name : undefined;
  return new IndexedDBAdapterError(reason === 'QuotaExceededError' ? 'QUOTA_EXCEEDED' : reason === 'SecurityError' || reason === 'NotAllowedError' || reason === 'InvalidStateError' && phase === 'open' ? 'UNAVAILABLE' : reason === 'VersionError' ? 'INCOMPATIBLE_DATABASE' : 'TRANSACTION_FAILED', { phase });
}
function data(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key))) throw new IndexedDBAdapterError('CORRUPT_DATA', { phase: 'read' });
  return value as Record<string, unknown>;
}

function pair(raw: unknown, rawMeta: unknown, namespace: string): { stored: Stored; metadata: Metadata } | undefined {
  if (raw === undefined && rawMeta === undefined) return undefined;
  const value = data(raw, ['namespace', 'version', 'generation', 'encoded']), meta = data(rawMeta, ['namespace', 'version', 'generation', 'format', 'encodedBytes']);
  if (value.namespace !== namespace || meta.namespace !== namespace || value.version !== 1 || meta.version !== 1 || typeof value.generation !== 'string' || !uuid.test(value.generation) || value.generation !== meta.generation || typeof value.encoded !== 'string' || (meta.format !== 'raveldex-source' && meta.format !== 'raveldex-native') || value.encoded.length > MAX_BYTES || typeof meta.encodedBytes !== 'number' || !Number.isSafeInteger(meta.encodedBytes) || meta.encodedBytes < 1 || meta.encodedBytes > MAX_BYTES) throw new IndexedDBAdapterError('CORRUPT_DATA', { phase: 'read' });
  return { stored: value as unknown as Stored, metadata: meta as unknown as Metadata };
}

/** Borrows explicit validated snapshot handles; owns only its named storage connections/actions. */
export function createIndexedDBPersistence(snapshots: PersistenceSnapshots, options: IndexedDBOptions): IndexedDBPersistence {
  let input: Record<string, unknown>;
  try { input = ownObject(options, 'INVALID_OPTIONS', 'indexeddb.options', new Admission(64)); keysOnly(input, ['databaseName', 'namespace', 'indexedDB', 'format', 'openTimeoutMs', 'operationTimeoutMs'], 'INVALID_OPTIONS', 'indexeddb.options'); } catch { invalid(); }
  const databaseName = name(input.databaseName), namespace = name(input.namespace), format = input.format === undefined ? 'source' : input.format;
  if (format !== 'source' && format !== 'native' || !snapshots || typeof snapshots.restore !== 'function' || typeof snapshots.exportSource !== 'function' || format === 'native' && typeof snapshots.exportNative !== 'function') invalid();
  const exporter = (format === 'source' ? snapshots.exportSource : snapshots.exportNative!).bind(snapshots), restore = snapshots.restore.bind(snapshots);
  const injected = input.indexedDB as IDBFactory | undefined;
  if (Object.hasOwn(input, 'indexedDB') && (!injected || typeof injected.open !== 'function')) invalid();
  const openTimeout = bounded(input.openTimeoutMs, 5_000, 30_000), timeout = bounded(input.operationTimeoutMs, 30_000, 60_000);
  let disposed = false, connection: IDBDatabase | undefined, tail = Promise.resolve(), disposal: Promise<void> | undefined;
  const operations = new Set<Operation>();
  function check(op: Operation): void {
    if (disposed && !op.stopped) stop(op, new IndexedDBAdapterError('DISPOSED', { phase: op.phase }));
    if (!op.stopped && performance.now() >= op.deadline) stop(op, new IndexedDBAdapterError('TIMEOUT', { phase: op.phase }));
    if (op.stopped) throw op.stopped;
  }
  function stop(op: Operation, reason: IndexedDBAdapterError): void {
    if (op.stopped) return; op.stopped = reason;
    op.controller.abort(); for (const callback of [...op.stop]) callback();
  }
  function phase(op: Operation, value: Phase): void { op.phase = value; check(op); }
  async function utf8(op: Operation, value: string): Promise<number> {
    if (typeof value !== 'string' || value.length > MAX_BYTES) throw new IndexedDBAdapterError('CORRUPT_DATA', { phase: op.phase });
    let bytes = 0;
    for (let offset = 0; offset < value.length;) {
      check(op); const end = Math.min(value.length, offset + 16_384);
      for (; offset < end; offset++) {
        const c = value.charCodeAt(offset);
        if (c < 128) bytes++; else if (c < 2048) bytes += 2;
        else if (c >= 0xd800 && c <= 0xdbff) { const next = value.charCodeAt(++offset); if (!(next >= 0xdc00 && next <= 0xdfff)) throw new IndexedDBAdapterError('CORRUPT_DATA', { phase: op.phase }); bytes += 4; }
        else if (c >= 0xdc00 && c <= 0xdfff) throw new IndexedDBAdapterError('CORRUPT_DATA', { phase: op.phase }); else bytes += 3;
        if (bytes > MAX_BYTES) throw new IndexedDBAdapterError('CORRUPT_DATA', { phase: op.phase });
      }
      if (offset < value.length) await new Promise<void>((resolve, reject) => {
        const cancel = (): void => { clearTimeout(timer); op.stop.delete(cancel); reject(op.stopped); };
        const timer = setTimeout(() => { op.stop.delete(cancel); resolve(); }, 0); op.stop.add(cancel);
        if (op.stopped) cancel();
      });
    } check(op); return bytes;
  }
  function nativeOptions(op: Operation): MutationOptions { check(op); return { signal: op.controller.signal, deadlineMs: Math.max(1, Math.ceil(op.deadline - performance.now())) }; }
  function close(): void {
    const db = connection; connection = undefined;
    if (db) { db.onversionchange = null; db.onclose = null; try { db.close(); } catch { /* Best effort release. */ } }
  }
  function open(op: Operation): Promise<IDBDatabase> {
    phase(op, 'open'); if (connection) return Promise.resolve(connection);
    return new Promise((resolve, reject) => {
      let request: IDBOpenDBRequest | undefined, settled = false;
      const finish = (failure?: unknown, db?: IDBDatabase): void => {
        if (settled) { if (db) { try { db.close(); } catch { /* Late open must not leak. */ } } return; }
        settled = true; clearTimeout(timer); op.stop.delete(cancel);
        if (request) { request.onblocked = null; /* Guards abort late upgrades and close late successes after cancellation. */ }
        if (failure !== undefined) reject(failure); else resolve(db!);
      };
      const cancel = (): void => finish(op.stopped);
      const timer = setTimeout(() => finish(new IndexedDBAdapterError('TIMEOUT', { phase: 'open' })), Math.min(openTimeout, Math.max(1, op.deadline - performance.now())));
      op.stop.add(cancel);
      try {
        check(op);
        const factory = injected ?? globalThis.indexedDB;
        if (!factory || typeof factory.open !== 'function') throw new IndexedDBAdapterError('UNAVAILABLE', { phase: 'open' });
        request = factory.open(databaseName, VERSION);
        request.onerror = () => { finish(storageError(request!.error, 'open')); request!.onerror = null; request!.onupgradeneeded = null; request!.onsuccess = null; };
        request.onblocked = () => finish(new IndexedDBAdapterError('BLOCKED', { phase: 'open' }));
        request.onupgradeneeded = event => {
          if (settled || (event as IDBVersionChangeEvent).oldVersion !== 0) { request!.transaction?.abort(); finish(new IndexedDBAdapterError('INCOMPATIBLE_DATABASE', { phase: 'open' })); return; }
          try { for (const store of STORES) request!.result.createObjectStore(store, { keyPath: 'namespace' }); }
          catch (error) { request!.transaction?.abort(); finish(storageError(error, 'open')); }
        };
        request.onsuccess = () => {
          const db = request!.result;
          if (settled) { try { db.close(); } catch { /* Uncancellable late open. */ } request!.onsuccess = null; return; }
          try {
            check(op);
            if (db.version !== VERSION || db.objectStoreNames.length !== STORES.length || STORES.some(store => !db.objectStoreNames.contains(store))) throw new IndexedDBAdapterError('INCOMPATIBLE_DATABASE', { phase: 'open' });
            const tx = db.transaction([...STORES], 'readonly');
            for (const store of STORES) { const actual = tx.objectStore(store); if (actual.keyPath !== 'namespace' || actual.autoIncrement || actual.indexNames.length) { tx.abort(); throw new IndexedDBAdapterError('INCOMPATIBLE_DATABASE', { phase: 'open' }); } }
            db.onversionchange = () => { close(); for (const active of operations) stop(active, new IndexedDBAdapterError('VERSION_CHANGED', { phase: active.phase })); };
            db.onclose = () => { if (connection === db) { connection = undefined; for (const active of operations) stop(active, new IndexedDBAdapterError('UNAVAILABLE', { phase: active.phase })); } };
            connection = db; request!.onsuccess = null; finish(undefined, db);
          } catch (error) { try { db.close(); } catch { /* Continue failure. */ } request!.onsuccess = null; finish(storageError(error, 'open')); }
        };
      } catch (error) { finish(storageError(error, 'open')); }
    });
  }
  function transaction<T>(op: Operation, db: IDBDatabase, mode: IDBTransactionMode, body: (tx: IDBTransaction, complete: (value: T) => void) => void): Promise<T> {
    check(op);
    return new Promise((resolve, reject) => {
      let tx: IDBTransaction | undefined, result: T, failed: unknown, finished = false, ambiguous = false, resultReady = false;
      const cleanup = (): void => { clearTimeout(watchdog); op.stop.delete(cancel); if (tx) { tx.oncomplete = null; tx.onabort = null; tx.onerror = null; } };
      const done = (error?: unknown): void => { if (finished) return; finished = true; cleanup(); if (error !== undefined) reject(error); else resolve(result!); };
      const cancel = (): void => {
        if (finished) return; failed ??= op.stopped;
        try { tx?.abort(); } catch { ambiguous = true; /* Commit may precede its observed completion event. */ }
      };
      const watchdog = setTimeout(() => {
        if (finished) return;
        failed ??= new IndexedDBAdapterError('TIMEOUT', { phase: op.phase });
        try { tx?.abort(); } catch { ambiguous = true; }
        // A missing authoritative completion/abort event cannot establish write rollback.
        done(mode === 'readwrite' ? new IndexedDBAdapterError('OUTCOME_UNKNOWN', { phase: op.phase }) : failed);
      }, Math.max(1, op.deadline - performance.now()) + 250);
      op.stop.add(cancel);
      try {
        check(op); tx = db.transaction([...STORES], mode, mode === 'readwrite' ? { durability: 'strict' } : undefined);
        tx.oncomplete = () => resultReady ? done() : done(mode === 'readwrite' ? new IndexedDBAdapterError('OUTCOME_UNKNOWN', { phase: op.phase }) : failed ?? new IndexedDBAdapterError('TRANSACTION_FAILED', { phase: op.phase }));
        tx.onabort = () => done(failed ?? storageError(tx!.error, op.phase));
        tx.onerror = () => { failed ??= storageError(tx!.error, op.phase); };
        body(tx, value => { result = value; resultReady = true; });
      } catch (error) {
        failed = storageError(error, op.phase);
        if (tx) { try { tx.abort(); } catch { ambiguous = true; } if (ambiguous) done(mode === 'readwrite' ? new IndexedDBAdapterError('OUTCOME_UNKNOWN', { phase: op.phase }) : failed); }
        else done(failed);
      }
    });
  }
  async function read(op: Operation): Promise<ReturnType<typeof pair>> {
    const db = await open(op); phase(op, 'read');
    return transaction(op, db, 'readonly', (tx, complete) => {
      const snapshot = tx.objectStore('snapshots').get(namespace), metadata = tx.objectStore('metadata').get(namespace);
      let count = 0;
      const selected = (): void => { if (++count !== 2) return; try { complete(pair(snapshot.result, metadata.result, namespace)); } catch (error) { /* Abort preserves validation outcome. */ stop(op, storageError(error, 'read')); } };
      snapshot.onsuccess = selected; metadata.onsuccess = selected;
    });
  }
  function borrowed<T>(op: Operation, promise: Promise<T>, restoring: boolean): Promise<T> {
    return new Promise((resolve, reject) => {
      let finished = false, fallback: ReturnType<typeof setTimeout> | undefined;
      const cleanup = (): void => { op.stop.delete(cancel); clearTimeout(fallback); };
      const cancel = (): void => {
        if (finished) return;
        if (!restoring) { finished = true; cleanup(); reject(op.stopped); return; }
        // A normal direct owner settles a stop or a just-committed success in its
        // promise microtask. An unobserved transport/host reply remains unknown.
        fallback = setTimeout(() => {
          if (!finished) { finished = true; cleanup(); reject(new IndexedDBAdapterError('OUTCOME_UNKNOWN', { phase: 'restore', ...(op.pendingRestore ? { operationId: op.pendingRestore } : {}) })); }
        }, 0);
      };
      const operationId: unknown = (promise as Promise<T> & { operationId?: unknown }).operationId;
      if (restoring && typeof operationId === 'string' && operationId.length) op.pendingRestore = operationId;
      op.stop.add(cancel); if (op.stopped) cancel();
      promise.then(value => { if (!finished) { finished = true; cleanup(); resolve(value); } }, error => { if (!finished) { finished = true; cleanup(); reject(error); } });
    });
  }

  function enqueue<T>(input: PersistenceOptions | PersistenceWriteOptions | undefined, write: boolean, execute: (op: Operation) => Promise<T>): Promise<T> {
    try {
      if (disposed) throw new IndexedDBAdapterError('DISPOSED', { phase: 'admission' });
      if (operations.size >= MAX_PENDING) throw new IndexedDBAdapterError('QUEUE_FULL', { phase: 'admission' });
      let captured: Record<string, unknown>;
      try { captured = ownObject(input ?? {}, 'INVALID_OPTIONS', 'indexeddb.operation', new Admission(32)); keysOnly(captured, write ? ['expectedGeneration', 'signal', 'deadlineMs'] : ['signal', 'deadlineMs'], 'INVALID_OPTIONS', 'indexeddb.operation'); } catch { invalid(); }
      const expected = write ? captured.expectedGeneration : undefined;
      if (write && expected !== null && (typeof expected !== 'string' || !uuid.test(expected))) invalid();
      const deadline = bounded(captured.deadlineMs, timeout, 60_000), controller = new AbortController();
      const op: Operation = { controller, expected: expected as string | null | undefined, deadline: performance.now() + deadline, phase: 'admission', stop: new Set() };
      operations.add(op);
      let ready!: () => void, rejectQueue!: (error: unknown) => void, executing = false;
      const gate = new Promise<void>(resolve => { ready = resolve; });
      const stoppedWhileQueued = new Promise<never>((_, reject) => { rejectQueue = reject; });
      const release = (remove = true): void => { clearTimeout(op.timer); try { op.detach?.(); } catch { /* Preserve first outcome. */ } delete op.detach; op.stop.clear(); if (remove) operations.delete(op); };
      const queuedStop = (): void => { if (!executing) { release(false); rejectQueue(op.stopped); } };
      op.stop.add(queuedStop);
      // Reserve FIFO/disposal ownership before touching an explicit live signal.
      const running = tail.then(async () => {
        await gate; executing = true; op.stop.delete(queuedStop);
        try { check(op); return await execute(op); } finally { release(); }
      });
      tail = running.then(() => undefined, () => undefined);
      try {
        if (captured.signal !== undefined) {
          const signal = captured.signal as CancellationSignal;
          if (!signal || typeof signal.aborted !== 'boolean' || typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function') invalid();
          const cancel = (): void => stop(op, new IndexedDBAdapterError('CANCELLED', { phase: op.phase }));
          op.detach = () => signal.removeEventListener('abort', cancel);
          signal.addEventListener('abort', cancel, { once: true });
          // Reentrant disposal or cancellation may have released before registration returned.
          if (op.stopped) { try { signal.removeEventListener('abort', cancel); } catch { /* Reentrant cleanup. */ } }
          if (signal.aborted) cancel();
        }
        check(op);
        op.timer = setTimeout(() => stop(op, new IndexedDBAdapterError('TIMEOUT', { phase: op.phase })), Math.max(1, op.deadline - performance.now()));
      } catch (error) { stop(op, error instanceof IndexedDBAdapterError ? error : new IndexedDBAdapterError('INVALID_OPTIONS', { phase: 'admission' })); }
      finally { ready(); }
      return Promise.race([running, stoppedWhileQueued]);
    } catch (error) { return Promise.reject(error); }
  }

  function conflict(op: Operation, actual: string | null): void {
    if (actual !== op.expected) throw new IndexedDBAdapterError('GENERATION_CONFLICT', { phase: op.phase, expectedGeneration: op.expected!, actualGeneration: actual });
  }
  return Object.freeze({
    save(input: PersistenceWriteOptions): Promise<PersistenceSaveResult> {
      return enqueue(input, true, async op => {
        phase(op, 'serialization'); const encoded = await borrowed(op, exporter(nativeOptions(op)), false); check(op);
        const encodedBytes = await utf8(op, encoded), persistedFormat = format === 'source' ? 'raveldex-source' : 'raveldex-native';
        if (!encoded.startsWith(`{"format":"${persistedFormat}","formatVersion":1,`)) throw new IndexedDBAdapterError('INCOMPATIBLE_SNAPSHOT', { phase: 'serialization' });
        let generation: string;
        try { generation = crypto.randomUUID(); } catch { throw new IndexedDBAdapterError('UNAVAILABLE', { phase: 'serialization' }); }
        if (!uuid.test(generation)) throw new IndexedDBAdapterError('UNAVAILABLE', { phase: 'serialization' });
        const db = await open(op); phase(op, 'write');
        return transaction(op, db, 'readwrite', (tx, complete) => {
          const store = tx.objectStore('snapshots'), meta = tx.objectStore('metadata'), snapshot = store.get(namespace), metadata = meta.get(namespace); let count = 0;
          const selected = (): void => {
            if (++count !== 2) return;
            try { check(op); const old = pair(snapshot.result, metadata.result, namespace); conflict(op, old?.metadata.generation ?? null);
              if (old?.metadata.generation === generation) throw new IndexedDBAdapterError('UNAVAILABLE', { phase: 'write' });
              store.put({ namespace, version: 1, generation, encoded } satisfies Stored); meta.put({ namespace, version: 1, generation, format: persistedFormat, encodedBytes } satisfies Metadata);
              complete(Object.freeze({ generation, format: persistedFormat, encodedBytes, durable: true }));
            } catch (error) { stop(op, storageError(error, 'write')); }
          }; snapshot.onsuccess = selected; metadata.onsuccess = selected;
        });
      });
    },
    load(input?: PersistenceOptions): Promise<PersistenceLoadResult> {
      return enqueue(input, false, async op => {
        const current = await read(op); if (!current) return Object.freeze({ status: 'missing', generation: null });
        if (!current.stored.encoded.startsWith(`{"format":"${current.metadata.format}","formatVersion":1,`)) throw new IndexedDBAdapterError('CORRUPT_DATA', { phase: 'read' });
        if (await utf8(op, current.stored.encoded) !== current.metadata.encodedBytes) throw new IndexedDBAdapterError('CORRUPT_DATA', { phase: 'read' });
        phase(op, 'restore');
        try { const result = await borrowed(op, restore(current.stored.encoded, nativeOptions(op)), true); return Object.freeze({ status: 'restored', generation: current.metadata.generation, restore: result }); }
        catch (error) {
          if (error instanceof SnapshotAdapterError) throw new IndexedDBAdapterError(['MALFORMED_SNAPSHOT', 'INTEGRITY_MISMATCH', 'INVALID_NATIVE_STATE', 'ENCODED_LIMIT_EXCEEDED'].includes(error.reason) ? 'CORRUPT_DATA' : 'INCOMPATIBLE_SNAPSHOT', { phase: 'restore', snapshotReason: error.reason });
          if (error && typeof error === 'object' && 'code' in error && error.code === 'OUTCOME_UNKNOWN') {
            const operationId = 'operationId' in error && typeof error.operationId === 'string' ? error.operationId : op.pendingRestore;
            throw new IndexedDBAdapterError('OUTCOME_UNKNOWN', { phase: 'restore', selectedGeneration: current.metadata.generation, ...(operationId ? { operationId } : {}) });
          }
          // Native stop/work/transport errors keep their authoritative separate semantics.
          throw error;
        }
      });
    },
    erase(input: PersistenceWriteOptions): Promise<PersistenceEraseResult> {
      return enqueue(input, true, async op => {
        const db = await open(op); phase(op, 'erase');
        return transaction(op, db, 'readwrite', (tx, complete) => {
          const snapshots = tx.objectStore('snapshots'), metadata = tx.objectStore('metadata'), request = metadata.get(namespace), raw = snapshots.get(namespace); let count = 0;
          const selected = (): void => {
            if (++count !== 2) return;
            try {
              check(op);
              // Erase must remain a recovery route for corrupt payloads. A valid metadata generation is enough for CAS; orphan/corrupt generation requires explicit missing-token erasure.
              const value = request.result as Partial<Metadata> | undefined;
              const actual = value && typeof value.generation === 'string' && uuid.test(value.generation) ? value.generation : null;
              conflict(op, actual); snapshots.delete(namespace); metadata.delete(namespace);
              complete(Object.freeze({ erased: request.result !== undefined || raw.result !== undefined, generation: null, durable: true }));
            } catch (error) { stop(op, storageError(error, 'erase')); }
          }; request.onsuccess = selected; raw.onsuccess = selected;
        });
      });
    },
    dispose(): Promise<void> {
      if (disposal) return disposal; disposed = true;
      for (const op of operations) stop(op, new IndexedDBAdapterError('DISPOSED', { phase: op.phase }));
      disposal = tail.finally(close); return disposal;
    },
  });
}
