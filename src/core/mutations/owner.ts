import type { MutationResult } from '../contracts/types.js';
import { scanUnicode } from '../contracts/data.js';
import { invalid } from '../errors/error.js';
import { WorkBudget } from '../limits/work.js';
import { directoryGet } from '../index/directory.js';
import type { WorkStep } from '../index/directory.js';
import type { IndexRoot } from '../index/state.js';
import type { TransactionParticipant, TransactionContext } from '../revision/participant.js';
import { captureMutation } from './capture.js';
import type { MutationKind, OwnedMutation } from './capture.js';
import { CoreDelta, clearedCore } from './delta.js';
import type { DocumentDelta, StagingCounts } from './delta.js';
import { prepareDocument } from './document.js';
import type { AnalysisCounts } from './document.js';

export type MutationPhase = 'start' | 'validation' | 'analysis' | 'staging' | 'core' | 'participant' | 'prepared' | 'precommit';
export interface MutationDiagnostics { analysis: AnalysisCounts; copies: StagingCounts; workUnits: number }
export interface MutationControl {
  /** Private scheduler/fault seam; it may throw only before publication. */
  readonly checkpoint?: (phase: MutationPhase) => void;
  /** Execution owner checks all stop conditions and owns the signal read. */
  readonly checkStop?: (phase: MutationPhase) => void;
  readonly diagnostics?: MutationDiagnostics;
}

/** Internal transaction owner; the execution owner supplies FIFO/promises/clock. */
export class MutationOwner {
  #root: IndexRoot;
  #active = false;
  private readonly participants: readonly TransactionParticipant[];
  private readonly admitted = new WeakSet<OwnedMutation>();
  constructor(root: IndexRoot, participants: readonly TransactionParticipant[] = []) {
    if (!Number.isSafeInteger(root.revision) || root.revision < 0 || !Object.isFrozen(root)) invalid('INTERNAL_ERROR', 'revision.root');
    const ids = new Set<string>();
    for (const participant of participants) {
      if (!participant.id || ids.has(participant.id) || typeof participant.prepare !== 'function' || !Object.hasOwn(root.participants, participant.id)) invalid('INCOMPATIBLE_CAPABILITY', 'participants');
      ids.add(participant.id);
    }
    if (Object.keys(root.participants).length !== ids.size) invalid('INCOMPATIBLE_CAPABILITY', 'participants');
    this.#root = root;
    // Capture trusted handles so later mutation of registration cannot swap code.
    this.participants = Object.freeze(participants.map(p => {
      if (p.maxWorkUnits !== undefined && (!Number.isSafeInteger(p.maxWorkUnits) || p.maxWorkUnits < 1)) invalid('INCOMPATIBLE_CAPABILITY', 'participants.limits');
      return Object.freeze({ id: p.id, prepare: p.prepare.bind(p), ...(p.maxWorkUnits !== undefined ? { maxWorkUnits: p.maxWorkUnits } : {}) });
    }));
  }
  get root(): IndexRoot { return this.#root; }
  /** Trusted optional adapter publication after complete bounded preparation.
   * It runs in ExecutionOwner's FIFO, with no callbacks at the commit point. */
  publishPrepared(root: IndexRoot, previous: IndexRoot): void {
    if (this.#active || this.#root !== previous || root.configuration !== previous.configuration ||
        !Object.isFrozen(root) || previous.revision === Number.MAX_SAFE_INTEGER || root.revision !== previous.revision + 1 ||
        Object.keys(root.participants).length !== this.participants.length ||
        this.participants.some(participant => !Object.hasOwn(root.participants, participant.id))) invalid('INTERNAL_ERROR', 'adapter.publication');
    this.#root = root;
  }
  capture(kind: MutationKind, input?: unknown, options?: unknown): OwnedMutation {
    const request = captureMutation(this.#root.configuration, kind, input, options);
    this.admitted.add(request); return request;
  }
  mutate(kind: MutationKind, input?: unknown, options?: unknown): Generator<WorkStep, MutationResult> { return this.execute(this.capture(kind, input, options)); }
  execute(request: OwnedMutation, control: MutationControl = {}): Generator<WorkStep, MutationResult> {
    if (!this.admitted.delete(request)) invalid('INTERNAL_ERROR', 'mutation.admission');
    return this.consume(request, control);
  }
  private *consume(request: OwnedMutation, control: MutationControl): Generator<WorkStep, MutationResult> {
    if (this.#active) invalid('INTERNAL_ERROR', 'mutation.active');
    this.#active = true;
    const old = this.#root, budget = new WorkBudget(old.configuration.limits.maxMutationWorkUnits);
    let phase: MutationPhase = 'start';
    const check = (): void => {
      control.checkpoint?.(phase);
      if (control.checkStop) control.checkStop(phase);
      else if (request.options.signal?.aborted) invalid('CANCELLED', 'options.signal');
    };
    const charge = (workUnits: number): WorkStep => {
      check(); budget.charge(workUnits);
      if (control.diagnostics) control.diagnostics.workUnits = budget.consumed;
      return { workUnits };
    };
    const boundary = (next: MutationPhase): void => { phase = next; check(); };
    try {
      check();
      const changes: DocumentDelta[] = [];
      let added = 0, replaced = 0, removed = 0;
      boundary('validation');
      if (request.kind === 'remove') {
        for (const id of request.ids) {
          for (const step of scanUnicode(id, 'INVALID_OPTIONS', 'ids')) yield charge(step.workUnits);
          yield charge(id.length + 1);
          const previous = directoryGet(old.documents, id);
          if (previous) { changes.push(Object.freeze({ previous })); removed++; }
        }
      } else if (request.kind === 'clear') { removed = old.documents.size; }
      else {
        for (const record of request.records) {
          yield charge(record.id.length + 1);
          const previous = directoryGet(old.documents, record.id);
          if (request.kind === 'replace') { if (!previous) invalid('ID_NOT_FOUND', 'record.id'); }
          else if (previous) invalid('ID_EXISTS', 'record.id');
          boundary('analysis');
          const next = yield* prepareDocument(record, old.configuration.limits, charge, control.diagnostics?.analysis);
          changes.push(Object.freeze({ ...(previous ? { previous } : {}), next }));
          if (previous) replaced++; else added++;
          boundary('validation');
        }
      }
      const changed = added + replaced + removed > 0;
      // Construct the response before publication, with the actual observed root.
      if (!changed) {
        const result = Object.freeze({ revision: old.revision, changed: false, added, replaced, removed });
        boundary('precommit'); yield charge(1); check(); return result;
      }
      if (old.revision === Number.MAX_SAFE_INTEGER) invalid('REVISION_EXHAUSTED', 'revision');
      boundary('staging');
      let coreData: Pick<IndexRoot, 'documents' | 'fields' | 'counts'>;
      if (request.kind === 'clear') coreData = yield* clearedCore(old, charge);
      else {
        const delta = new CoreDelta(old, charge, control.diagnostics?.copies);
        for (const change of changes) yield* delta.apply(change);
        boundary('core'); coreData = yield* delta.finish();
      }
      const core: IndexRoot = Object.freeze({ ...coreData, revision: old.revision + 1, configuration: old.configuration, participants: old.participants });
      const context: TransactionContext = Object.freeze({ kind: request.kind, previous: old, core, changes: Object.freeze(changes), records: request.records });
      const participants: Record<string, unknown> = Object.create(null) as typeof participants;
      for (const participant of this.participants) {
        boundary('participant'); yield charge(participant.id.length + 1);
        const participantBudget = participant.maxWorkUnits === undefined ? undefined : new WorkBudget(participant.maxWorkUnits);
        const iterator = participant.prepare(old.participants[participant.id], context);
        let finished = false;
        try {
          for (;;) {
            const step = iterator.next();
            if (step.done) { participants[participant.id] = step.value; finished = true; break; }
            const charged = charge(step.value.workUnits);
            participantBudget?.charge(step.value.workUnits); yield charged;
          }
        } finally {
          if (!finished) { try { iterator.return(undefined); } catch { /* Cleanup cannot replace the original failure. */ } }
        }
      }
      boundary('prepared');
      const root: IndexRoot = Object.freeze({ ...core, participants: Object.freeze(participants) });
      const result = Object.freeze({ revision: root.revision, changed: true, added, replaced, removed });
      boundary('precommit'); yield charge(1); check();
      // Commit point: no callbacks, allocations, throws or yields inside it.
      this.#root = root;
      return result;
    } finally { this.#active = false; }
  }
}
