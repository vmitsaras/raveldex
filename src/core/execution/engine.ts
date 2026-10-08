import { captureConfiguration } from '../contracts/schema.js';
import { initializeParticipants } from '../capabilities/participants.js';
import type { Configuration, MutationOptions, MutationResult, OwnedConfiguration, OwnedOptions, Query, Raveldex, RecordInput, SearchOptions, SearchResult } from '../contracts/types.js';
import { invalid, RaveldexError } from '../errors/error.js';
import type { WorkStep } from '../index/directory.js';
import { emptyDirectory } from '../index/staging.js';
import type { DocumentEntry, FieldIndex, IndexRoot, TermEntry } from '../index/state.js';
import type { MutationKind } from '../mutations/capture.js';
import { MutationOwner } from '../mutations/owner.js';
import { captureSearch, executeOwnedSearch } from '../query/search.js';
import type { TransactionParticipant } from '../revision/participant.js';
import { directHost } from './host.js';
import type { ExecutionHost } from './host.js';

type Result = unknown;
/** Private adapter seam. Optional implementations prepare their complete owned
 * result/state inside the same admission, FIFO and stop lifecycle. */
export interface AdapterOperation<T> {
  readonly options: OwnedOptions;
  start(root: IndexRoot, check: (phase?: string) => void, publish: (root: IndexRoot) => void): Generator<WorkStep, T>;
}
/** Private trusted adapter control. Applied after caller admission so transport
 * signals and elapsed time do not consume the caller's data-entry allowance. */
export interface AdapterControl { readonly signal: NonNullable<MutationOptions['signal']>; readonly elapsedMs: number }
/** Optional private counted-work diagnostics, never public callbacks or heap bytes. */
export interface ExecutionMetrics {
  workUnits: number; steps: number; hostYields: number;
  maxTaskWorkUnits: number; maxStepWorkUnits: number; checks: number;
  phaseChecks: Record<string, number>;
}
interface Operation {
  options: OwnedOptions | undefined;
  start: (() => Generator<WorkStep, Result>) | undefined;
  cursor: Generator<WorkStep, Result> | undefined;
  resolve: ((result: Result) => void) | undefined;
  reject: ((error: unknown) => void) | undefined;
  deadline: number;
  detach: (() => void) | undefined;
  timer: (() => void) | undefined;
  resume: (() => void) | undefined;
  settled: boolean;
  executing: boolean;
  cancelled: boolean;
}

export function emptyRoot(configuration: OwnedConfiguration, states: Readonly<Record<string, unknown>> = Object.freeze(Object.create(null)) as Readonly<Record<string, unknown>>): IndexRoot {
  const fields: Record<string, FieldIndex> = Object.create(null) as typeof fields;
  for (const name of Object.keys(configuration.schema.text)) fields[name] = Object.freeze({ documents: 0, length: 0, terms: emptyDirectory<TermEntry>() });
  return Object.freeze({ configuration, revision: 0, documents: emptyDirectory<DocumentEntry>(), fields: Object.freeze(fields),
    counts: Object.freeze({ documents: 0, textCodeUnits: 0, tokens: 0, dictionaryEntries: 0, postingEntries: 0 }),
    participants: states });
}

/** Internal engine implementation. The factory exposes only bound ordinary methods. */
export class ExecutionOwner implements Raveldex {
  #owner: MutationOwner | undefined;
  readonly #configuration: OwnedConfiguration;
  readonly #host: ExecutionHost;
  readonly #metrics: ExecutionMetrics | undefined;
  #queue: Operation[] = [];
  #active: Operation | undefined;
  #closing = false;
  #pumping = false;
  #disposal: Promise<void> | undefined;
  #disposed: (() => void) | undefined;

  constructor(root: IndexRoot, host: ExecutionHost, participants: readonly TransactionParticipant[] = [], metrics?: ExecutionMetrics) {
    this.#owner = new MutationOwner(root, participants);
    this.#configuration = root.configuration;
    this.#metrics = metrics;
    // Trusted private host handles; caller changes cannot replace them later.
    this.#host = Object.freeze({ now: host.now.bind(host), schedule: host.schedule.bind(host) });
  }
  get root(): IndexRoot | undefined { return this.#owner?.root; }

  adapterOperation<T>(capture: (configuration: OwnedConfiguration) => AdapterOperation<T>): Promise<T> {
    return this.admit(() => {
      const request = capture(this.#configuration);
      return { options: request.options, start: check => {
        const owner = this.#owner!, previous = owner.root;
        return request.start(previous, check, root => owner.publishPrepared(root, previous));
      } };
    }) as Promise<T>;
  }

  search(query: string | Query, options?: SearchOptions): Promise<SearchResult> {
    return this.searchControlled(query, options);
  }
  searchControlled(query: string | Query, options?: SearchOptions, control?: AdapterControl): Promise<SearchResult> {
    return this.admit(() => {
      const request = captureSearch(this.#configuration, query, options);
      return { options: request.options, start: (check: (phase?: string) => void) => executeOwnedSearch(this.#owner!.root, request, { checkStop: check }) };
    }, control) as Promise<SearchResult>;
  }
  add(record: RecordInput, options?: MutationOptions): Promise<MutationResult> { return this.mutate('add', record, options); }
  addMany(records: readonly RecordInput[], options?: MutationOptions): Promise<MutationResult> { return this.mutate('addMany', records, options); }
  replace(record: RecordInput, options?: MutationOptions): Promise<MutationResult> { return this.mutate('replace', record, options); }
  remove(ids: string | readonly string[], options?: MutationOptions): Promise<MutationResult> { return this.mutate('remove', ids, options); }
  clear(options?: MutationOptions): Promise<MutationResult> { return this.mutate('clear', undefined, options); }

  private mutate(kind: MutationKind, input?: unknown, options?: MutationOptions): Promise<MutationResult> {
    return this.mutateControlled(kind, input, options);
  }
  mutateControlled(kind: MutationKind, input?: unknown, options?: MutationOptions, control?: AdapterControl): Promise<MutationResult> {
    return this.admit(() => {
      const request = this.#owner!.capture(kind, input, options);
      return { options: request.options, start: (check: (phase?: string) => void) => this.#owner!.execute(request, { checkStop: check }) };
    }, control) as Promise<MutationResult>;
  }

  private check(op: Operation, phase?: string): void {
    if (this.#metrics) {
      this.#metrics.checks++;
      if (phase) this.#metrics.phaseChecks[phase] = (this.#metrics.phaseChecks[phase] ?? 0) + 1;
    }
    if (this.#closing) invalid('DISPOSED', 'execution');
    const aborted = op.options?.signal?.aborted;
    const expired = this.#host.now() >= op.deadline;
    // Structural host handles may reenter; choose precedence after reading them.
    if (this.#closing) invalid('DISPOSED', 'execution');
    if (aborted || op.cancelled) invalid('CANCELLED', 'options.signal');
    if (expired) invalid('DEADLINE_EXCEEDED', 'options.deadlineMs');
  }

  private admit(capture: () => { options: OwnedOptions; start: (check: (phase?: string) => void) => Generator<WorkStep, Result> }, control?: AdapterControl): Promise<Result> {
    // Synchronous ownership capture, with every operational exception rejected.
    try {
      if (this.#closing) invalid('DISPOSED', 'execution');
      const admittedAt = this.#host.now();
      const request = capture();
      if (control) {
        if (!Number.isFinite(control.elapsedMs) || control.elapsedMs < 0) invalid('INTERNAL_ERROR', 'execution.control');
        request.options = Object.freeze({ ...request.options, signal: control.signal });
      }
      if (this.#closing) invalid('DISPOSED', 'execution');
      if (request.options.signal?.aborted) invalid('CANCELLED', 'options.signal');
      if (control && control.elapsedMs >= request.options.deadlineMs) invalid('DEADLINE_EXCEEDED', 'options.deadlineMs');
      if (this.#active && this.#queue.length >= this.#configuration.limits.maxQueuedOperations) invalid('QUEUE_FULL', 'execution.queue');
      let resolve!: (value: Result) => void, reject!: (error: unknown) => void;
      const promise = new Promise<Result>((yes, no) => { resolve = yes; reject = no; });
      const op: Operation = { options: request.options, start: undefined, cursor: undefined, resolve, reject,
        deadline: admittedAt + request.options.deadlineMs - (control?.elapsedMs ?? 0), detach: undefined, timer: undefined, resume: undefined, settled: false, executing: false, cancelled: false };
      op.start = () => request.start(phase => this.check(op, phase));
      if (this.#active) this.#queue.push(op); else this.#active = op;
      try {
        const signal = op.options!.signal;
        if (signal) {
          const stop = (): void => { op.cancelled = true; this.stop(op); };
          op.detach = () => signal.removeEventListener('abort', stop);
          signal.addEventListener('abort', stop, { once: true });
          if (op.settled) { try { signal.removeEventListener('abort', stop); } catch { /* Reentrant registration cleanup. */ } }
        }
        if (!op.settled) {
          this.check(op);
          op.timer = this.#host.schedule(() => { op.timer = undefined; this.stop(op); }, Math.max(0, op.deadline - this.#host.now()));
        }
      } catch (error) { this.finish(op, undefined, this.error(error)); }
      this.pump(); return promise;
    } catch (error) { return Promise.reject(this.error(error)); }
  }

  /** Event/timer stop while suspended closes staging immediately; running code checks cooperatively. */
  private stop(op: Operation): void {
    if (op.settled || op.executing) return;
    try {
      this.check(op);
      // A timer may fire slightly early on a host; preserve its absolute deadline.
      op.timer?.();
      op.timer = this.#host.schedule(() => { op.timer = undefined; this.stop(op); }, Math.max(0, op.deadline - this.#host.now()));
    } catch (error) { this.finish(op, undefined, this.error(error)); this.pump(); }
  }

  private pump(): void {
    if (this.#pumping) return;
    this.#pumping = true;
    // A host task may finish several small FIFO calls; meter that whole burst.
    let consumed = 0;
    try {
      for (;;) {
        if (!this.#active) this.#active = this.#queue.shift();
        const op = this.#active;
        if (!op || op.resume) break;
        op.executing = true;
        try {
          this.check(op);
          op.cursor ??= op.start!();
          op.start = undefined;
          for (;;) {
            this.check(op);
            const step = op.cursor.next();
            // A mutation may have just committed. Never check stops after done.
            if (step.done) { this.finish(op, step.value); break; }
            consumed += step.value.workUnits;
            if (this.#metrics) {
              this.#metrics.workUnits += step.value.workUnits;
              this.#metrics.steps++;
              this.#metrics.maxStepWorkUnits = Math.max(this.#metrics.maxStepWorkUnits, step.value.workUnits);
              this.#metrics.maxTaskWorkUnits = Math.max(this.#metrics.maxTaskWorkUnits, consumed);
            }
            if (consumed >= this.#configuration.limits.checkpointWorkUnits) {
              this.check(op);
              op.resume = this.#host.schedule(() => { op.resume = undefined; this.pump(); }, 0);
              if (this.#metrics) this.#metrics.hostYields++;
              break;
            }
          }
        } catch (error) { this.finish(op, undefined, this.error(error)); }
        finally { op.executing = false; }
        if (this.#active === op) break;
      }
    } finally { this.#pumping = false; this.release(); }
  }

  private error(error: unknown): RaveldexError { return error instanceof RaveldexError ? error : new RaveldexError('INTERNAL_ERROR'); }
  private finish(op: Operation, result?: Result, failure?: unknown): void {
    if (op.settled) return;
    op.settled = true;
    const resolve = op.resolve, reject = op.reject;
    const cursor = op.cursor;
    // Detach admission/root closures before any trusted host cleanup can reenter.
    op.options = undefined; op.start = undefined; op.cursor = undefined; op.resolve = undefined; op.reject = undefined;
    if (failure !== undefined) { try { cursor?.return(undefined as never); } catch { /* Best-effort participant cleanup. */ } }
    for (const cleanup of [op.resume, op.timer, op.detach]) { try { cleanup?.(); } catch { /* Preserve the operation's first outcome. */ } }
    op.resume = undefined; op.timer = undefined; op.detach = undefined;
    if (this.#active === op) this.#active = undefined;
    else this.#queue = this.#queue.filter(item => item !== op);
    if (failure !== undefined) reject!(this.error(failure)); else resolve!(result!);
    this.release();
  }

  dispose(): Promise<void> {
    if (this.#disposal) return this.#disposal;
    this.#closing = true;
    this.#disposal = new Promise<void>(resolve => { this.#disposed = resolve; });
    for (const op of [...this.#queue]) this.finish(op, undefined, new RaveldexError('DISPOSED'));
    if (this.#active && !this.#active.executing) this.finish(this.#active, undefined, new RaveldexError('DISPOSED'));
    this.release(); return this.#disposal;
  }
  private release(): void {
    if (this.#closing && !this.#active && this.#queue.length === 0) {
      this.#owner = undefined;
      const resolve = this.#disposed; this.#disposed = undefined; resolve?.();
    }
  }
}

const executionOwners = new WeakMap<object, ExecutionOwner>();
/** Private identity lookup; optional adapters cannot attach to foreign facades. */
export function getExecutionOwner(engine: Raveldex): ExecutionOwner | undefined { return executionOwners.get(engine); }

/** Trusted owned factory, excluded from the public root package exports. */
export function createOwnedRaveldex(captured: OwnedConfiguration, host: ExecutionHost = directHost(), metrics?: ExecutionMetrics): Raveldex {
  let owner: ExecutionOwner;
  try {
    const installed = initializeParticipants(captured);
    owner = new ExecutionOwner(emptyRoot(captured, installed.states), host, installed.participants, metrics);
  } catch (error) { throw error instanceof RaveldexError ? error : new RaveldexError('INTERNAL_ERROR'); }
  return facadeFromExecutionOwner(owner);
}

/** The single trusted owner-to-facade binding path. Kept outside public exports;
 * internal controlled owners use the same identity and ordinary method surface. */
export function facadeFromExecutionOwner(owner: ExecutionOwner): Raveldex {
  // A public data facade prevents JavaScript callers reaching private test roots
  // or TypeScript-private execution callbacks through the owner's prototype.
  const facade = Object.freeze({
    search: owner.search.bind(owner), add: owner.add.bind(owner),
    addMany: owner.addMany.bind(owner), replace: owner.replace.bind(owner),
    remove: owner.remove.bind(owner), clear: owner.clear.bind(owner),
    dispose: owner.dispose.bind(owner),
  });
  executionOwners.set(facade, owner);
  return facade;
}

export function createRaveldex(configuration: Configuration): Raveldex {
  try { return createOwnedRaveldex(captureConfiguration(configuration)); }
  catch (error) { throw error instanceof RaveldexError ? error : new RaveldexError('INTERNAL_ERROR'); }
}
