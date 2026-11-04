import { bulkParticipant } from '../../core/capabilities/bulk-participant.js';
import { createAnalysis } from '../../core/analyzer/selected.js';
import type { OwnedConfiguration } from '../../core/contracts/types.js';
import { invalid } from '../../core/errors/error.js';
import { emptyRoot } from '../../core/execution/engine.js';
import type { WorkStep } from '../../core/index/directory.js';
import type { IndexRoot } from '../../core/index/state.js';
import { WorkBudget } from '../../core/limits/work.js';
import { captureMutation } from '../../core/mutations/capture.js';
import { CoreDelta } from '../../core/mutations/delta.js';
import { prepareDocument } from '../../core/mutations/document.js';

/** One unpublished add-only core. Public participants retain their ordinary
 * per-record context, revisions, binding and both invocation/operation meters.
 * No codec assertion authorizes skipping a captured participant. */
export function* reconstructSource(records: readonly unknown[], configuration: OwnedConfiguration, check: (phase?: string) => void): Generator<WorkStep, IndexRoot> {
  const states: Record<string, unknown> = Object.create(null) as typeof states;
  const participants = (configuration.capabilities?.ordered ?? []).flatMap(registration => {
    if (!registration.participant) return [];
    const id = registration.manifest.id, handle = registration.participant;
    states[id] = handle.initialize(configuration);
    const maximum = Math.min(registration.manifest.limits.maxWorkUnits, configuration.limits.maxMutationWorkUnits);
    return [{ id, handle, maximum, budget: new WorkBudget(maximum), bulk: bulkParticipant(registration, states[id]) }];
  });
  const old = emptyRoot(configuration, Object.freeze(states));
  const analyze = createAnalysis(configuration, check);
  let phase = 'snapshot.source.admission';
  const boundary = (next: string): void => { phase = next; check(phase); };
  let budget = new WorkBudget(configuration.limits.maxMutationWorkUnits);
  const charge = (workUnits: number): WorkStep => { check(phase); budget.charge(workUnits); return { workUnits }; };
  const delta = new CoreDelta(old, charge);
  let revision = 0, currentStates = old.participants;
  for (const record of records) {
    yield { workUnits: 1 };
    boundary('snapshot.source.admission');
    const request = captureMutation(configuration, 'add', record);
    budget = new WorkBudget(configuration.limits.maxMutationWorkUnits);
    const owned = request.records[0]!;
    yield charge(owned.id.length + 1);
    if (delta.hasDocument(owned.id)) invalid('ID_EXISTS', 'record.id');
    boundary('snapshot.source.analysis');
    const document = yield* prepareDocument(owned, configuration.limits, charge, undefined, analyze);
    boundary('snapshot.source.core');
    yield* delta.apply({ next: document });
    yield charge(5); delta.checkCounts();
    const nextStates: Record<string, unknown> = Object.create(null) as typeof nextStates;
    for (const participant of participants) {
      boundary('snapshot.source.participant');
      yield charge(participant.id.length + 1);
      const invocation = new WorkBudget(participant.maximum);
      const context = Object.freeze({ analyze, kind: 'add' as const, previousRevision: revision, revision: revision + 1, analyzer: configuration.analyzer, records: request.records, removedIds: Object.freeze([]) });
      const cursor = participant.bulk ? participant.bulk.add(context) : participant.handle.prepare(currentStates[participant.id], context);
      try {
        for (;;) {
          const step = cursor.next();
          if (step.done) { nextStates[participant.id] = participant.bulk ? currentStates[participant.id] : step.value; break; }
          participant.budget.charge(step.value.workUnits);
          const charged = charge(step.value.workUnits);
          invocation.charge(step.value.workUnits); yield charged;
        }
      } finally { try { cursor.return(undefined); } catch { /* Preserve first outcome, including success. */ } }
    }
    currentStates = Object.freeze(nextStates); revision++;
    yield charge(1); check();
  }
  // Sealing is yielded and charged inside the same outer restore budget. It
  // gets its own invocation allowance rather than an unmetered final sweep.
  budget = new WorkBudget(configuration.limits.maxMutationWorkUnits);
  boundary('snapshot.source.finalization');
  const core = yield* delta.finish();
  const finalStates: Record<string, unknown> = { ...currentStates };
  for (const participant of participants) {
    if (!participant.bulk) continue;
    boundary('snapshot.source.participant-finalization');
    yield charge(participant.id.length + 1);
    const invocation = new WorkBudget(participant.maximum);
    const cursor = participant.bulk.finish(revision);
    try {
      for (;;) {
        const step = cursor.next();
        if (step.done) { finalStates[participant.id] = step.value; break; }
        participant.budget.charge(step.value.workUnits);
        const charged = charge(step.value.workUnits);
        invocation.charge(step.value.workUnits); yield charged;
      }
    } finally { try { cursor.return(undefined); } catch { /* Preserve first outcome. */ } }
  }
  return Object.freeze({ ...core, configuration, revision, participants: Object.freeze(finalStates) });
}
