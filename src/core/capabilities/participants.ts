import type { OwnedConfiguration } from '../contracts/types.js';
import type { WorkStep } from '../index/directory.js';
import type { TransactionContext, TransactionParticipant } from '../revision/participant.js';

/** This bridge passes changed owned data, never the core owner/root. */
export function initializeParticipants(configuration: OwnedConfiguration): { readonly states: Readonly<Record<string, unknown>>; readonly participants: readonly TransactionParticipant[] } {
  const states: Record<string, unknown> = Object.create(null) as typeof states;
  const participants: TransactionParticipant[] = [];
  for (const registration of configuration.capabilities?.ordered ?? []) {
    const handle = registration.participant;
    if (!handle) continue;
    const id = registration.manifest.id;
    states[id] = handle.initialize(configuration);
    participants.push(Object.freeze({ id, maxWorkUnits: Math.min(registration.manifest.limits.maxWorkUnits, configuration.limits.maxMutationWorkUnits), *prepare(previous: unknown, context: TransactionContext): Generator<WorkStep, unknown> {
      const removedIds: string[] = [];
      for (const change of context.changes) if (change.previous && !change.next) {
        yield { workUnits: change.previous.id.length + 1 }; removedIds.push(change.previous.id);
      }
      const request = Object.freeze({ kind: context.kind, previousRevision: context.previous.revision, revision: context.core.revision, analyzer: configuration.analyzer, records: context.records, removedIds: Object.freeze(removedIds) });
      const cursor = handle.prepare(previous, request);
      try {
        for (;;) { const step = cursor.next(); if (step.done) return step.value; yield step.value; }
      } finally { try { cursor.return(undefined); } catch { /* Cleanup cannot replace the first operation outcome. */ } }
    } }));
  }
  return Object.freeze({ states: Object.freeze(states), participants: Object.freeze(participants) });
}
