import type { PreparedRefinement, RefinementContext } from './types.js';
import { invalid } from '../errors/error.js';
import type { IndexRoot } from '../index/state.js';
import type { WorkStep } from '../index/directory.js';
import { WorkBudget } from '../limits/work.js';
import type { CompiledNode } from '../query/compile.js';
import type { Charge } from '../query/work.js';

export type Refinements = ReadonlyMap<CompiledNode, PreparedRefinement>;

/** Prepare all requested leaves at this root, including empty lexical leaves.
 * Handles get only declared side states. Their work joins one search budget. */
export function* prepareRefinements(node: CompiledNode, root: IndexRoot, charge: Charge): Generator<WorkStep, Refinements> {
  const prepared = new Map<CompiledNode, PreparedRefinement>();
  const budgets = new Map<string, WorkBudget>();
  function* walk(node: CompiledNode): Generator<WorkStep> {
    if (node.kind === 'extension') {
      const set = root.configuration.capabilities, registration = set?.providers[node.capability];
      if (!registration?.refinement) invalid('MISSING_CAPABILITY', 'query.capability');
      let budget = budgets.get(registration.manifest.id);
      if (!budget) { budget = new WorkBudget(Math.min(registration.manifest.limits.maxWorkUnits, root.configuration.limits.maxSearchWorkUnits)); budgets.set(registration.manifest.id, budget); }
      const sharedBudget = budget;
      const context: RefinementContext = Object.freeze({ revision: root.revision, analyzer: root.configuration.analyzer, limits: root.configuration.limits, fields: node.fields, terms: node.terms,
        state(capability: string): unknown {
          if (!registration.manifest.requires.some(ref => ref.id === capability)) invalid('MISSING_CAPABILITY', 'query.provider');
          const provider = set!.providers[capability];
          if (!provider?.participant || !Object.hasOwn(root.participants, provider.manifest.id)) invalid('MISSING_CAPABILITY', 'query.provider');
          return root.participants[provider.manifest.id];
        } });
      const cursor = registration.refinement.prepare(context);
      let verifier: PreparedRefinement;
      try {
        for (;;) { const step = cursor.next(); if (step.done) { verifier = step.value; break; } const charged = charge(step.value.workUnits); sharedBudget.charge(step.value.workUnits); yield charged; }
      } finally { try { cursor.return(undefined as never); } catch { /* Preserve a stop/validation failure. */ } }
      if (!verifier || typeof verifier.test !== 'function') invalid('INCOMPATIBLE_CAPABILITY', 'query.refinement');
      const test = verifier.test.bind(verifier);
      prepared.set(node, Object.freeze({ *test(id: string): Generator<WorkStep, boolean> {
        const cursor = test(id);
        try {
          for (;;) { const step = cursor.next(); if (step.done) { if (typeof step.value !== 'boolean') invalid('INCOMPATIBLE_CAPABILITY', 'query.refinement'); return step.value; } const charged = charge(step.value.workUnits); sharedBudget.charge(step.value.workUnits); yield charged; }
        } finally { try { cursor.return(false); } catch { /* Preserve a stop/validation failure. */ } }
      } }));
    } else if (node.kind === 'and' || node.kind === 'or') for (const child of node.children) yield* walk(child);
    else if (node.kind === 'not') yield* walk(node.child);
  }
  yield* walk(node); return prepared;
}
