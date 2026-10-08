import { captureConfiguration } from '../../core/contracts/schema.js';
import { Admission, keysOnly, ownArray, ownObject } from '../../core/contracts/data.js';
import type { Configuration, MutationOptions, OwnedConfiguration, Query, SearchOptions } from '../../core/contracts/types.js';
import type { AddonRegistration } from '../../core/capabilities/types.js';
import { initializeParticipants } from '../../core/capabilities/participants.js';
import { directHost } from '../../core/execution/host.js';
import { emptyRoot, ExecutionOwner } from '../../core/execution/engine.js';
import type { MutationKind } from '../../core/mutations/capture.js';
import { RaveldexError } from '../../core/errors/error.js';
import { WorkerAdapterError } from './error.js';
import { cap, canonical, captureMessage, fail, IMPLEMENTATION, integer, MAX_PENDING, monotonicEpoch, mutation, object, OPERATIONS, PROTOCOL, RECEIPT_WINDOW, sessionValue, wireError } from './protocol.js';
import type { Data, Operation } from './protocol.js';
import type { MutationReceipt, WorkerHostOptions, WorkerScope } from './types.js';

export type { WorkerScope, WorkerHostOptions } from './types.js';
export interface WorkerHostHandle { dispose(): Promise<void> }
const liveScopes = new WeakSet<WorkerScope>();

/** Called explicitly by the consumer's own module worker. The consumer imports
 * trusted local addon factories; executable handles never cross the boundary. */
export function serveRaveldexWorker(scope: WorkerScope, options: WorkerHostOptions = {}): WorkerHostHandle {
  if (liveScopes.has(scope)) throw new WorkerAdapterError('INCOMPATIBLE_WORKER', { path: 'worker.owner' });
  // Reserve ownership before any trusted live-handle access can reenter setup.
  liveScopes.add(scope);
  try { return installWorkerHost(scope, options); }
  catch (error) { liveScopes.delete(scope); throw error; }
}

function installWorkerHost(scope: WorkerScope, options: WorkerHostOptions): WorkerHostHandle {
  const data = ownObject(options, 'INVALID_OPTIONS', 'worker.host', new Admission(64));
  keysOnly(data, ['addons', 'maxMessageBytes'], 'INVALID_OPTIONS', 'worker.host');
  const addons = Object.hasOwn(data, 'addons') ? ownArray(data.addons, 32, 'INVALID_OPTIONS', 'worker.host.addons', new Admission(64)) as AddonRegistration[] : [];
  const hostMaximum = cap(data.maxMessageBytes);
  const post = scope.postMessage.bind(scope), addListener = scope.addEventListener.bind(scope), removeListener = scope.removeEventListener.bind(scope);
  let maximum = hostMaximum, session: string | undefined, lastId = 0;
  let owner: ExecutionOwner | undefined, configuration: OwnedConfiguration | undefined;
  let initialized = false, closing = false, cleaned = false, disposal: Promise<void> | undefined;
  const active = new Map<number, AbortController>();
  const receipts = new Map<string, MutationReceipt>();
  const inflight = new Map<number, Promise<void>>();

  function record(value: MutationReceipt): void {
    receipts.set(value.operationId, value);
    // Pending operations cannot lose their receipt before their native outcome;
    // at most MAX_PENDING pending entries exist independently of this window.
    while (receipts.size > RECEIPT_WINDOW) {
      const victim = [...receipts].find(([, receipt]) => receipt.status !== 'pending');
      if (!victim) break;
      receipts.delete(victim[0]);
    }
  }
  function send(request: Data, kind: 'result' | 'error', value: unknown): void {
    const envelope = { protocol: PROTOCOL, session: request.session, id: request.id, operation: request.operation, kind, value };
    try { post(captureMessage(envelope, maximum)); }
    catch (error) {
      // A lost/oversized post-commit result does not undo the receipt. A bounded
      // error response may succeed; otherwise the client times out honestly.
      const failure = mutation(request.operation as string) ? new WorkerAdapterError('OUTCOME_UNKNOWN', { operationId: `${request.session as string}:${request.id as number}` }) : error instanceof WorkerAdapterError ? error : new WorkerAdapterError('TERMINATED');
      try { post(captureMessage({ ...envelope, kind: 'error', value: wireError(failure) }, maximum)); } catch { /* No transport inference about rollback. */ }
    }
  }
  function identity(value: OwnedConfiguration): unknown {
    return { schema: value.schema, limits: value.limits, analyzer: value.analyzer };
  }
  async function execute(request: Data): Promise<void> {
    const id = request.id as number, operation = request.operation as Operation;
    const operationId = `${request.session as string}:${id}`;
    let trackedMutation = false;
    try {
      const payload = object(request.payload);
      if (operation === 'init') {
        if (initialized || closing) throw new WorkerAdapterError('INCOMPATIBLE_WORKER', { path: 'worker.initialized' });
        initialized = true;
        object(payload, ['implementation', 'model', 'configuration', 'identity', 'hasAddons', 'manifests', 'sameHost', 'maxMessageBytes']);
        if (payload.implementation !== IMPLEMENTATION || payload.model !== 'raveldex-bm25-v1' || payload.sameHost !== true || typeof payload.hasAddons !== 'boolean') throw new WorkerAdapterError('INCOMPATIBLE_WORKER', { path: 'worker.sameHost' });
        const incomingConfiguration = object(payload.configuration, ['schema', 'limits', 'analyzer']);
        maximum = Math.min(hostMaximum, cap(payload.maxMessageBytes));
        const captured = captureConfiguration({ ...incomingConfiguration, ...(payload.hasAddons || addons.length ? { addons } : {}) });
        const manifests = (captured.capabilities?.ordered ?? []).map(registration => registration.manifest);
        if (manifests.some(manifest => !manifest.execution.worker || !manifest.execution.workerRegistration) || canonical(identity(captured)) !== canonical(payload.identity) || canonical(manifests) !== canonical(payload.manifests)) throw new WorkerAdapterError('INCOMPATIBLE_WORKER', { path: 'worker.configuration' });
        const installed = initializeParticipants(captured);
        // Exactly one complete root and one FIFO owner. No per-field/shard engine.
        configuration = captured; owner = new ExecutionOwner(emptyRoot(captured, installed.states), directHost(), installed.participants);
        send(request, 'result', { implementation: IMPLEMENTATION, model: 'raveldex-bm25-v1', analyzer: captured.analyzer, identity: identity(captured), manifests, maxMessageBytes: maximum, receipts: RECEIPT_WINDOW });
        return;
      }
      if (!owner || !configuration) throw new WorkerAdapterError('STARTUP_FAILED');
      if (closing) throw new WorkerAdapterError('DISPOSED');
      if (operation === 'reconcile') {
        object(payload, ['operationId']);
        if (typeof payload.operationId !== 'string' || !payload.operationId.startsWith(`${session}:`) || !/^[1-9][0-9]*$/.test(payload.operationId.slice(session!.length + 1))) fail('transport.operationId');
        integer(Number(payload.operationId.slice(session!.length + 1)), lastId, 1);
        send(request, 'result', receipts.get(payload.operationId) ?? { operationId: payload.operationId, status: 'expired' });
        return;
      }
      if (operation === 'dispose') {
        object(payload, []); closing = true;
        await owner.dispose();
        // Native promises settle before acknowledgement; publish their receipts
        // and responses before removing the host listener.
        await Promise.all([...inflight].filter(([requestId]) => requestId !== id).map(([, promise]) => promise));
        send(request, 'result', null); cleanup(); return;
      }
      if (active.size >= MAX_PENDING) throw new WorkerAdapterError('TRANSPORT_LIMIT', { path: 'transport.pending', limit: MAX_PENDING, actual: active.size + 1 });
      object(payload, operation === 'search' ? ['query', 'options', 'admittedAt'] : ['input', 'options', 'admittedAt']);
      const requestOptions = object(payload.options, operation === 'search' ? ['deadlineMs', 'limit', 'offset', 'extensions'] : ['deadlineMs']);
      if (typeof payload.admittedAt !== 'number' || !Number.isFinite(payload.admittedAt) || payload.admittedAt < 0) fail('transport.admission');
      const controller = new AbortController(); active.set(id, controller);
      const control = { signal: controller.signal, elapsedMs: Math.max(0, monotonicEpoch() - payload.admittedAt) };
      if (mutation(operation)) { trackedMutation = true; record(Object.freeze({ operationId, status: 'pending' })); }
      const result = operation === 'search' ? await owner.searchControlled(payload.query as string | Query, requestOptions as SearchOptions, control) : await owner.mutateControlled(operation as MutationKind, payload.input, requestOptions as MutationOptions, control);
      if (trackedMutation) record(Object.freeze({ operationId, status: 'committed', result: result as Extract<MutationReceipt, { status: 'committed' }>['result'] }));
      send(request, 'result', result);
    } catch (error) {
      const failure = wireError(error);
      // Once an accepted mutation can be conclusively rejected before commit,
      // retain that error. Frames rejected before mutation admission have no
      // receipt and reconciliation remains expired/unknown, never rollback.
      if (trackedMutation) record(Object.freeze({ operationId, status: 'rejected', error: failure }));
      send(request, 'error', failure);
    } finally { active.delete(id); }
  }
  function receive(raw: unknown): void {
    if (closing) return;
    let request: Data | undefined;
    try {
      request = object(captureMessage(raw, maximum), ['protocol', 'session', 'id', 'operation', 'payload']);
      if (request.protocol !== PROTOCOL) fail('transport.protocol');
      const incomingSession = sessionValue(request.session), id = integer(request.id, Number.MAX_SAFE_INTEGER, 1);
      if (session !== undefined && incomingSession !== session || id <= lastId) fail('transport.identity');
      if (request.operation !== 'cancel' && !(OPERATIONS as readonly unknown[]).includes(request.operation)) fail('transport.operation');
      if (session === undefined) {
        if (request.operation !== 'init') throw new WorkerAdapterError('STARTUP_FAILED');
        session = incomingSession;
      }
      lastId = id;
      if (request.operation === 'cancel') {
        const payload = object(request.payload, ['targetId']); active.get(integer(payload.targetId, id - 1, 1))?.abort(); return;
      }
      const running = execute(request);
      inflight.set(id, running); void running.finally(() => inflight.delete(id));
    } catch (error) {
      // Never send a replay rejection against the original operation's ID: that
      // could replace its still-pending authoritative outcome on the client.
      if (request && request.protocol === PROTOCOL && request.session === session && typeof request.id === 'number' && Number.isSafeInteger(request.id) && request.id > lastId && (OPERATIONS as readonly unknown[]).includes(request.operation)) send(request, 'error', wireError(error));
    }
  }
  const message: EventListener = event => receive((event as MessageEvent<unknown>).data);
  const failure: EventListener = () => { void dispose(); };
  function cleanup(): void {
    if (cleaned) return;
    cleaned = true;
    closing = true;
    for (const [type, listener] of [['message', message], ['messageerror', failure]] as const) { try { removeListener(type, listener); } catch { /* Continue cleanup. */ } }
    active.clear(); receipts.clear(); owner = undefined; configuration = undefined;
    liveScopes.delete(scope);
  }
  function dispose(): Promise<void> {
    if (disposal) return disposal;
    if (cleaned) return Promise.resolve();
    closing = true;
    disposal = (async () => { try { await owner?.dispose(); await Promise.all([...inflight.values()]); } finally { cleanup(); } })();
    return disposal;
  }
  try { addListener('message', message); addListener('messageerror', failure); }
  catch (error) { cleanup(); throw error; }
  return Object.freeze({ dispose });
}
