import { bindSnapshotChannel } from './snapshot-channel.js';
import type { SnapshotOperation } from './snapshot-channel.js';
import { captureConfiguration } from '../../core/contracts/schema.js';
import { captureOptions } from '../../core/contracts/options.js';
import { Admission, ownObject, keysOnly } from '../../core/contracts/data.js';
import { captureQuery } from '../../core/contracts/query.js';
import { captureMutation } from '../../core/mutations/capture.js';
import type { MutationKind } from '../../core/mutations/capture.js';
import type { CancellationSignal, MutationOptions, MutationResult, OwnedConfiguration, OwnedSearchOptions, Query, RecordInput, SearchOptions, SearchResult } from '../../core/contracts/types.js';
import { RaveldexError } from '../../core/errors/error.js';
import { WorkerAdapterError } from './error.js';
import { cap, canonical, captureMessage, fail, IMPLEMENTATION, inflateError, integer, MAX_PENDING, monotonicEpoch, mutation, mutationResult, object, OPERATIONS, PROTOCOL, receipt, searchResult, sessionValue, validateError } from './protocol.js';
import type { Operation } from './protocol.js';
import type { MutationPromise, MutationReceipt, WorkerEndpoint, WorkerOptions, WorkerRaveldex } from './types.js';

interface Pending {
  readonly operation: Operation; readonly operationId: string;
  readonly resolve: (value: unknown) => void; readonly reject: (error: unknown) => void;
  readonly timer: ReturnType<typeof setTimeout>;
  readonly detach?: () => void;
  readonly validate: (value: unknown) => unknown;
  dispatched: boolean;
  cancelRequested: boolean;
}
interface Dispatch { ready: boolean; message?: unknown }
const liveEndpoints = new WeakSet<WorkerEndpoint>();
function nativeFailure(error: unknown): Error { return error instanceof RaveldexError || error instanceof WorkerAdapterError ? error : new RaveldexError('INTERNAL_ERROR'); }
function transportFailure(error: unknown): Error { return error instanceof WorkerAdapterError ? error : new WorkerAdapterError('TERMINATED'); }

class Client implements WorkerRaveldex {
  readonly #worker: WorkerEndpoint; readonly #owned: boolean; readonly #session: string;
  readonly #configuration: OwnedConfiguration; #maximum: number; readonly #timeout: number;
  readonly #wireConfiguration: unknown; readonly #hasAddons: boolean;
  #sequence = 0; #pending = new Map<number, Pending>(); #closing = false; #closed = false; #ready = false;
  #dispatches = new Map<number, Dispatch>(); #flushedThrough = 0; #flushing = false;
  readonly #releaseEndpoint: () => void;
  #disposal: Promise<void> | undefined;
  readonly #message: EventListener;
  readonly #failure: EventListener;
  constructor(worker: WorkerEndpoint, owned: boolean, configuration: OwnedConfiguration, wireConfiguration: unknown, hasAddons: boolean, maximum: number, timeout: number, releaseEndpoint: () => void) {
    this.#worker = worker; this.#owned = owned; this.#configuration = configuration; this.#maximum = maximum; this.#timeout = timeout;
    this.#session = sessionValue(crypto.randomUUID());
    this.#wireConfiguration = wireConfiguration; this.#hasAddons = hasAddons;
    this.#releaseEndpoint = releaseEndpoint;
    this.#message = event => this.receive((event as MessageEvent<unknown>).data);
    this.#failure = () => this.close(new WorkerAdapterError(this.#ready ? 'TERMINATED' : 'STARTUP_FAILED'));
    try {
      worker.addEventListener('message', this.#message);
      worker.addEventListener('messageerror', this.#failure);
      worker.addEventListener('error', this.#failure);
    } catch (error) {
      for (const [type, listener] of [['message', this.#message], ['messageerror', this.#failure], ['error', this.#failure]] as const) { try { worker.removeEventListener(type, listener); } catch { /* Continue cleanup. */ } }
      throw error;
    }
  }
  async start(): Promise<void> {
    try {
      await this.request('init', {
        implementation: IMPLEMENTATION, model: 'raveldex-bm25-v1',
        configuration: this.#wireConfiguration, hasAddons: this.#hasAddons,
        identity: { schema: this.#configuration.schema, limits: this.#configuration.limits, analyzer: this.#configuration.analyzer },
        manifests: (this.#configuration.capabilities?.ordered ?? []).map(registration => registration.manifest),
        sameHost: true, maxMessageBytes: this.#maximum,
      }, value => {
        const result = object(value, ['implementation', 'model', 'analyzer', 'identity', 'manifests', 'maxMessageBytes', 'receipts']);
        if (result.implementation !== IMPLEMENTATION || result.model !== 'raveldex-bm25-v1' || cap(result.maxMessageBytes) > this.#maximum || result.receipts !== 256) fail('transport.init');
        const analyzer = object(result.analyzer, ['id', 'environmentProfile']);
        if (analyzer.id !== this.#configuration.analyzer.id || analyzer.environmentProfile !== this.#configuration.analyzer.environmentProfile) fail('transport.init');
        if (canonical(result.identity) !== canonical({ schema: this.#configuration.schema, limits: this.#configuration.limits, analyzer: this.#configuration.analyzer }) || canonical(result.manifests) !== canonical((this.#configuration.capabilities?.ordered ?? []).map(registration => registration.manifest))) fail('transport.init');
        this.#maximum = result.maxMessageBytes as number;
        return undefined;
      });
      this.#ready = true;
    } catch (error) { this.close(error); throw error; }
  }
  private next(): number {
    if (this.#sequence === Number.MAX_SAFE_INTEGER) throw new WorkerAdapterError('TRANSPORT_LIMIT', { path: 'transport.ids' });
    if (this.#dispatches.size >= MAX_PENDING * 2) throw new WorkerAdapterError('TRANSPORT_LIMIT', { path: 'transport.dispatch', limit: MAX_PENDING * 2, actual: this.#dispatches.size + 1 });
    const id = ++this.#sequence; this.#dispatches.set(id, { ready: false }); return id;
  }
  private release(id: number): void {
    const dispatch = this.#dispatches.get(id); if (dispatch) { dispatch.ready = true; delete dispatch.message; }
    this.flush();
  }
  private flush(): void {
    if (this.#flushing) return;
    this.#flushing = true;
    try {
      if (this.#closed) { this.#dispatches.clear(); this.#flushedThrough = this.#sequence; return; }
      while (true) {
        const id = this.#flushedThrough + 1, dispatch = this.#dispatches.get(id);
        if (!dispatch?.ready) break;
        this.#dispatches.delete(id); this.#flushedThrough = id;
        if (dispatch.message === undefined) continue;
        const pending = this.#pending.get(id);
        if (pending && this.#closing && pending.operation !== 'dispose') { this.settle(id, undefined, new WorkerAdapterError('DISPOSED')); continue; }
        try {
          if (pending) pending.dispatched = true;
          this.#worker.postMessage(dispatch.message);
        } catch (error) {
          if (pending) this.settle(id, undefined, mutation(pending.operation) ? new WorkerAdapterError('OUTCOME_UNKNOWN', { operationId: pending.operationId }) : transportFailure(error));
          else this.close(transportFailure(error));
        }
        if (this.#closed) break;
      }
    } finally { this.#flushing = false; }
  }
  private request(operation: Operation, payload: unknown, validate: (value: unknown) => unknown, signal?: CancellationSignal, identifier?: number): Promise<unknown> {
    let id = identifier ?? this.next();
    if (this.#closed || this.#closing && operation !== 'dispose') { this.release(id); return Promise.reject(new WorkerAdapterError('DISPOSED')); }
    if (this.#pending.size >= MAX_PENDING) { this.release(id); return Promise.reject(new WorkerAdapterError('TRANSPORT_LIMIT', { path: 'transport.pending', limit: MAX_PENDING, actual: this.#pending.size + 1 })); }
    let message: unknown;
    try { message = captureMessage({ protocol: PROTOCOL, session: this.#session, id, operation, payload }, this.#maximum); }
    catch (error) { this.release(id); return Promise.reject(error instanceof WorkerAdapterError ? error : new WorkerAdapterError('INVALID_TRANSPORT')); }
    return new Promise((resolve, reject) => {
      const operationId = `${this.#session}:${id}`;
      const timer = setTimeout(() => {
        const pending = this.#pending.get(id); if (!pending) return;
        this.settle(id, undefined, mutation(operation) && pending.dispatched ? new WorkerAdapterError('OUTCOME_UNKNOWN', { operationId }) : new WorkerAdapterError('TIMEOUT'));
      }, this.#timeout);
      const cancel = (): void => {
        const pending = this.#pending.get(id); if (!pending || pending.cancelRequested) return;
        pending.cancelRequested = true;
        try {
          const cancelId = this.next(), dispatch = this.#dispatches.get(cancelId)!;
          dispatch.message = captureMessage({ protocol: PROTOCOL, session: this.#session, id: cancelId, operation: 'cancel', payload: { targetId: id } }, this.#maximum);
          dispatch.ready = true; this.flush();
        }
        catch (error) { this.close(transportFailure(error)); }
      };
      const pending: Pending = { operation, operationId, resolve, reject, timer, validate, dispatched: false, cancelRequested: false,
        ...(signal ? { detach: () => signal.removeEventListener('abort', cancel) } : {}) };
      this.#pending.set(id, pending);
      try {
        if (signal) {
          signal.addEventListener('abort', cancel, { once: true });
          if (!this.#pending.has(id)) { try { signal.removeEventListener('abort', cancel); } catch { /* Reentrant registration cleanup. */ } this.release(id); return; }
          if (this.#closed || this.#closing) { this.settle(id, undefined, new WorkerAdapterError('DISPOSED')); return; }
          if (signal.aborted || pending.cancelRequested) { this.settle(id, undefined, new RaveldexError('CANCELLED', { path: 'options.signal' })); return; }
        }
        // A custom endpoint may forward and then throw: after entering this call
        // an exception cannot establish a mutation's rollback.
        const dispatch = this.#dispatches.get(id)!; dispatch.message = message; dispatch.ready = true; this.flush();
      } catch (error) { this.settle(id, undefined, mutation(operation) && pending.dispatched ? new WorkerAdapterError('OUTCOME_UNKNOWN', { operationId }) : pending.dispatched ? transportFailure(error) : nativeFailure(error)); }
    });
  }
  private settle(id: number, value?: unknown, error?: unknown): void {
    const pending = this.#pending.get(id); if (!pending) return;
    this.#pending.delete(id); clearTimeout(pending.timer);
    this.release(id);
    try { pending.detach?.(); } catch { /* Host signal cleanup cannot change outcome. */ }
    if (error !== undefined) pending.reject(error); else pending.resolve(value);
  }
  private receive(raw: unknown): void {
    if (this.#closed) return;
    try {
      const response = object(captureMessage(raw, this.#maximum), ['protocol', 'session', 'id', 'operation', 'kind', 'value']);
      if (response.protocol !== PROTOCOL || response.session !== this.#session || !(OPERATIONS as readonly unknown[]).includes(response.operation)) fail('transport.identity');
      const id = integer(response.id, this.#sequence, 1), pending = this.#pending.get(id);
      if (response.kind !== 'result' && response.kind !== 'error') fail('transport.response');
      // Validate even late frames, then discard; a late native result remains in
      // the worker's authoritative reconciliation window.
      if (response.kind === 'error') validateError(response.value);
      if (!pending) return;
      if (pending.operation !== response.operation) fail('transport.operation');
      if (response.kind === 'error') this.settle(id, undefined, inflateError(validateError(response.value)));
      else this.settle(id, pending.validate(response.value));
    } catch (error) { this.close(error instanceof WorkerAdapterError ? error : new WorkerAdapterError('INVALID_TRANSPORT')); }
  }
  private close(error: unknown): void {
    if (this.#closed) return;
    this.#closed = true; this.#closing = true;
    for (const [id, pending] of this.#pending) this.settle(id, undefined, mutation(pending.operation) && pending.dispatched ? new WorkerAdapterError('OUTCOME_UNKNOWN', { operationId: pending.operationId }) : error);
    for (const [type, listener] of [['message', this.#message], ['messageerror', this.#failure], ['error', this.#failure]] as const) {
      try { this.#worker.removeEventListener(type, listener); } catch { /* Continue releasing other resources. */ }
    }
    if (this.#owned) { try { this.#worker.terminate(); } catch { /* Already dead worker. */ } }
    this.#dispatches.clear(); this.#releaseEndpoint();
  }
  private options(input: MutationOptions | SearchOptions | undefined, search: boolean, admission = new Admission(this.#configuration.limits.maxAdmissionEntries)): { options: unknown; signal?: CancellationSignal; admittedAt: number; search?: OwnedSearchOptions } {
    const admittedAt = monotonicEpoch();
    const captured = search ? captureOptions(input, this.#configuration.limits, true, admission, this.#configuration.capabilities) : captureOptions(input, this.#configuration.limits, false, admission);
    const { signal } = captured;
    const data = ownObject(input === undefined ? {} : input, 'INVALID_OPTIONS', 'options', new Admission(this.#configuration.limits.maxAdmissionEntries));
    delete data.signal;
    if (signal?.aborted) throw new RaveldexError('CANCELLED', { path: 'options.signal' });
    return { options: data, admittedAt, ...(signal ? { signal } : {}), ...(search ? { search: captured as OwnedSearchOptions } : {}) };
  }
  search(query: string | Query, options?: SearchOptions): Promise<SearchResult> {
    if (this.#closed || this.#closing) return Promise.reject(new WorkerAdapterError('DISPOSED'));
    try {
      const admission = new Admission(this.#configuration.limits.maxAdmissionEntries);
      const captured = this.options(options, true, admission), page = captured.search!;
      captureQuery(query, this.#configuration.schema, this.#configuration.limits, admission, this.#configuration.capabilities);
      if (captured.signal?.aborted) throw new RaveldexError('CANCELLED', { path: 'options.signal' });
      return this.request('search', { query, options: captured.options, admittedAt: captured.admittedAt }, value => searchResult(value, this.#configuration.limits.maxDocuments, page.offset, page.limit, Object.keys(page.extensions ?? {})), captured.signal) as Promise<SearchResult>;
    } catch (error) { return Promise.reject(nativeFailure(error)); }
  }
  private mutate(operation: Operation, input: unknown, options?: MutationOptions): MutationPromise {
    let id: number | undefined;
    let promise: Promise<unknown>;
    try {
      if (this.#closed || this.#closing) throw new WorkerAdapterError('DISPOSED');
      const admittedAt = monotonicEpoch();
      const admitted = captureMutation(this.#configuration, operation as MutationKind, input, options);
      const signal = admitted.options.signal;
      if (signal?.aborted) throw new RaveldexError('CANCELLED', { path: 'options.signal' });
      const wireOptions = ownObject(options === undefined ? {} : options, 'INVALID_OPTIONS', 'options', new Admission(this.#configuration.limits.maxAdmissionEntries));
      delete wireOptions.signal;
      const maximumChanged = operation === 'clear' ? this.#configuration.limits.maxDocuments : operation === 'remove' ? admitted.ids.length : admitted.records.length;
      id = this.next();
      promise = this.request(operation, { ...(input === undefined ? {} : { input }), options: wireOptions, admittedAt }, value => mutationResult(value, this.#configuration.limits.maxDocuments, operation, maximumChanged), signal, id);
    } catch (error) {
      promise = Promise.reject(nativeFailure(error));
      if (id === undefined) { try { id = this.next(); } catch { /* No ID was admitted at the dispatch ceiling. */ } }
      if (id !== undefined) this.release(id);
    }
    Object.defineProperty(promise, 'operationId', { value: id === undefined ? '' : `${this.#session}:${id}`, enumerable: true });
    return promise as MutationPromise;
  }
  add(record: RecordInput, options?: MutationOptions): MutationPromise { return this.mutate('add', record, options); }
  addMany(records: readonly RecordInput[], options?: MutationOptions): MutationPromise { return this.mutate('addMany', records, options); }
  replace(record: RecordInput, options?: MutationOptions): MutationPromise { return this.mutate('replace', record, options); }
  remove(ids: string | readonly string[], options?: MutationOptions): MutationPromise { return this.mutate('remove', ids, options); }
  clear(options?: MutationOptions): MutationPromise { return this.mutate('clear', undefined, options); }
  reconcile(operationId: string): Promise<MutationReceipt> {
    if (this.#closed || this.#closing) return Promise.reject(new WorkerAdapterError('DISPOSED'));
    try {
      if (typeof operationId !== 'string' || !operationId.startsWith(`${this.#session}:`) || !/^[1-9][0-9]*$/.test(operationId.slice(this.#session.length + 1))) fail('transport.operationId');
      integer(Number(operationId.slice(this.#session.length + 1)), this.#sequence, 1);
      return this.request('reconcile', { operationId }, value => receipt(value, operationId, this.#configuration.limits.maxDocuments)) as Promise<MutationReceipt>;
    } catch (error) { return Promise.reject(nativeFailure(error)); }
  }
  snapshot(operation: SnapshotOperation, input: unknown, options: MutationOptions | undefined, validate: (value: unknown) => unknown): Promise<unknown> & { readonly operationId?: string } {
    let id: number | undefined, promise: Promise<unknown>;
    try {
      if (this.#closed || this.#closing) throw new WorkerAdapterError('DISPOSED');
      const captured = this.options(options, false);
      if (operation === 'snapshotRestore' && typeof input !== 'string') throw new WorkerAdapterError('INVALID_TRANSPORT', { path: 'snapshot.encoded' });
      id = this.next();
      promise = this.request(operation, { ...(operation === 'snapshotRestore' ? { input } : {}), options: captured.options, admittedAt: captured.admittedAt }, validate, captured.signal, id);
    } catch (error) { promise = Promise.reject(nativeFailure(error)); if (id !== undefined) this.release(id); }
    if (operation === 'snapshotRestore') Object.defineProperty(promise, 'operationId', { value: id === undefined ? '' : `${this.#session}:${id}`, enumerable: true });
    return promise;
  }
  snapshotReconcile(operationId: string, validate: (value: unknown) => unknown): Promise<unknown> {
    if (this.#closed || this.#closing) return Promise.reject(new WorkerAdapterError('DISPOSED'));
    try {
      if (typeof operationId !== 'string' || !operationId.startsWith(`${this.#session}:`) || !/^[1-9][0-9]*$/.test(operationId.slice(this.#session.length + 1))) fail('transport.operationId');
      integer(Number(operationId.slice(this.#session.length + 1)), this.#sequence, 1);
      return this.request('snapshotReconcile', { operationId }, validate);
    } catch (error) { return Promise.reject(nativeFailure(error)); }
  }
  dispose(): Promise<void> {
    if (this.#disposal) return this.#disposal;
    if (this.#closed) return Promise.resolve();
    this.#closing = true;
    this.#disposal = (async () => {
      try { await this.request('dispose', {}, value => { if (value !== null) fail('transport.dispose'); return undefined; }); }
      finally { this.close(new WorkerAdapterError('DISPOSED')); }
    })();
    return this.#disposal;
  }
  destroy(): Promise<void> { return this.dispose(); }
  facade(): WorkerRaveldex {
    const facade = Object.freeze({ search: this.search.bind(this), add: this.add.bind(this), addMany: this.addMany.bind(this), replace: this.replace.bind(this), remove: this.remove.bind(this), clear: this.clear.bind(this), reconcile: this.reconcile.bind(this), dispose: this.dispose.bind(this), destroy: this.destroy.bind(this) });
    bindSnapshotChannel(facade, Object.freeze({ invoke: this.snapshot.bind(this), reconcile: this.snapshotReconcile.bind(this) }));
    return facade;
  }
}

/** Explicitly adapts an already constructed module Worker. */
export async function createWorkerRaveldex(options: WorkerOptions): Promise<WorkerRaveldex> {
  const data = ownObject(options, 'INVALID_OPTIONS', 'worker.options', new Admission(64));
  keysOnly(data, ['worker', 'configuration', 'ownership', 'sameHost', 'maxMessageBytes', 'responseTimeoutMs'], 'INVALID_OPTIONS', 'worker.options');
  const worker = data.worker as WorkerEndpoint;
  if (!worker || typeof worker.postMessage !== 'function' || typeof worker.addEventListener !== 'function' || typeof worker.removeEventListener !== 'function' || typeof worker.terminate !== 'function') throw new RaveldexError('INVALID_OPTIONS', { path: 'worker.options.worker' });
  if (data.ownership !== 'owned' && data.ownership !== 'external') throw new RaveldexError('INVALID_OPTIONS', { path: 'worker.options.ownership' });
  if (liveEndpoints.has(worker)) throw new WorkerAdapterError('INCOMPATIBLE_WORKER', { path: 'worker.owner' });
  liveEndpoints.add(worker);
  let client: Client | undefined;
  try {
    if (data.sameHost !== true) throw new WorkerAdapterError('INCOMPATIBLE_WORKER', { path: 'worker.sameHost' });
    const configuration = captureConfiguration(data.configuration);
    for (const registration of configuration.capabilities?.ordered ?? []) if (!registration.manifest.execution.worker || !registration.manifest.execution.workerRegistration) throw new WorkerAdapterError('INCOMPATIBLE_WORKER', { path: 'worker.addons' });
    const maximum = cap(data.maxMessageBytes), timeout = data.responseTimeoutMs === undefined ? 65_000 : integer(data.responseTimeoutMs, 120_000, 1);
    const wireConfiguration = ownObject(data.configuration, 'INVALID_OPTIONS', 'config', new Admission(configuration.limits.maxAdmissionEntries));
    const hasAddons = Object.hasOwn(wireConfiguration, 'addons'); delete wireConfiguration.addons;
    const boundWorker: WorkerEndpoint = { postMessage: worker.postMessage.bind(worker), addEventListener: worker.addEventListener.bind(worker), removeEventListener: worker.removeEventListener.bind(worker), terminate: worker.terminate.bind(worker) };
    client = new Client(boundWorker, data.ownership === 'owned', configuration, captureMessage(wireConfiguration, maximum), hasAddons, maximum, timeout, () => liveEndpoints.delete(worker));
    // Client.start owns cleanup after listeners have been installed.
    await client.start(); return client.facade();
  } catch (error) {
    if (!client && data.ownership === 'owned') { try { worker.terminate(); } catch { /* Preserve startup error. */ } }
    liveEndpoints.delete(worker);
    throw error instanceof RaveldexError || error instanceof WorkerAdapterError ? error : new WorkerAdapterError('STARTUP_FAILED');
  }
}
