import { createAnalysis } from '../analyzer/selected.js';
import type { AnalysisRunner } from '../analyzer/selected.js';
import type { MetadataContext, RefinementContext, EvidenceResultContext, AggregationOutput } from './types.js';
import { bound, invalid } from '../errors/error.js';
import type { OwnedRecord, OwnedSearchOptions } from '../contracts/types.js';
import type { IndexRoot } from '../index/state.js';
import type { WorkStep } from '../index/directory.js';
import { WorkBudget } from '../limits/work.js';
import type { CompiledNode } from '../query/compile.js';
import type { Charge } from '../query/work.js';
import { directoryEntries } from '../index/directory.js';

type Metadata = OwnedRecord['metadata'];
interface PreparedLeaf { test(id: string, metadata: Metadata): Generator<WorkStep, boolean> }
export type Refinements = ReadonlyMap<CompiledNode, PreparedLeaf>;
export interface PreparedExtensions {
  readonly leaves: Refinements;
  readonly aggregations: readonly { readonly capability: string; add(metadata: Metadata): Generator<WorkStep, void>; finish(): Generator<WorkStep, unknown> }[];
  readonly outputs: readonly { readonly capability: string; finish(): Generator<WorkStep, unknown> }[];
  readonly evidence?: { readonly capability: string; finish(context: EvidenceResultContext): Generator<WorkStep, unknown> };
}

/** Prepare every requested leaf and aggregation, including empty/failed branches.
 * One registration budget covers every prepare/test/add/finish cursor. */
export function* prepareRefinements(node: CompiledNode, root: IndexRoot, charge: Charge, options: OwnedSearchOptions, analyze: AnalysisRunner = createAnalysis(root.configuration)): Generator<WorkStep, PreparedExtensions> {
  const leaves = new Map<CompiledNode, PreparedLeaf>();
  const aggregations: PreparedExtensions['aggregations'][number][] = [], budgets = new Map<string, WorkBudget>();
  const outputs: PreparedExtensions['outputs'][number][] = [];
  let evidence: PreparedExtensions['evidence'];
  function setup(capability: string) {
    const set = root.configuration.capabilities, registration = set?.providers[capability];
    if (!registration) invalid('MISSING_CAPABILITY', 'query.capability');
    let budget = budgets.get(registration.manifest.id);
    if (!budget) { budget = new WorkBudget(Math.min(registration.manifest.limits.maxWorkUnits, root.configuration.limits.maxSearchWorkUnits)); budgets.set(registration.manifest.id, budget); }
    const shared = budget;
    return { registration, *run<T>(cursor: Generator<WorkStep, T>): Generator<WorkStep, T> {
      try { for (;;) { const step = cursor.next(); if (step.done) return step.value; const charged = charge(step.value.workUnits); shared.charge(step.value.workUnits); yield charged; } }
      finally { try { cursor.return(undefined as never); } catch { /* Preserve the original stop/failure. */ } }
    } };
  }
  const metadataContext = (capability: string, payload: unknown): MetadataContext => Object.freeze({ revision: root.revision, schema: root.configuration.schema, limits: root.configuration.limits, capability, payload });
  function state(capability: string, consumer: string): unknown {
    const registration = root.configuration.capabilities!.providers[consumer]!;
    if (!registration.manifest.requires.some(ref => ref.id === capability)) invalid('MISSING_CAPABILITY', 'query.provider');
    const provider = root.configuration.capabilities!.providers[capability];
    if (!provider?.participant || !Object.hasOwn(root.participants, provider.manifest.id)) invalid('MISSING_CAPABILITY', 'query.provider');
    return root.participants[provider.manifest.id];
  }
  function output(capability: string, result: AggregationOutput): unknown {
    if (!result || !Number.isSafeInteger(result.entries) || result.entries < 0 || result.value !== null && typeof result.value === 'object' && !Object.isFrozen(result.value)) invalid('INCOMPATIBLE_CAPABILITY', 'extensions.output');
    bound(result.entries, Math.min(root.configuration.capabilities!.providers[capability]!.manifest.limits.maxOutputEntries, root.configuration.limits.maxAdmissionEntries), 'extensions.output');
    return result.value;
  }
  function* walk(node: CompiledNode): Generator<WorkStep> {
    if (node.kind === 'extension' || node.kind === 'predicate') {
      const { registration, run } = setup(node.capability);
      let test: (id: string, metadata: Metadata) => Generator<WorkStep, boolean>;
      if (node.kind === 'extension') {
        if (!registration.refinement) invalid('MISSING_CAPABILITY', 'query.refinement');
        const context: RefinementContext = Object.freeze({ analyze, revision: root.revision, analyzer: root.configuration.analyzer, limits: root.configuration.limits, fields: node.fields, terms: node.terms,
          state(capability: string): unknown {
            return state(capability, node.capability);
          } });
        const prepared = yield* run(registration.refinement.prepare(context));
        if (!prepared || typeof prepared.test !== 'function') invalid('INCOMPATIBLE_CAPABILITY', 'query.refinement');
        test = prepared.test.bind(prepared);
      } else {
        if (!registration.predicate) invalid('MISSING_CAPABILITY', 'query.predicate');
        const prepared = yield* run(registration.predicate.prepare(metadataContext(node.capability, node.payload)));
        if (!prepared || typeof prepared.test !== 'function') invalid('INCOMPATIBLE_CAPABILITY', 'query.predicate');
        const predicate = prepared.test.bind(prepared);
        test = (_id, metadata) => predicate(metadata);
      }
      leaves.set(node, Object.freeze({ *test(id: string, metadata: Metadata): Generator<WorkStep, boolean> {
        const matched = yield* run(test(id, metadata));
        if (typeof matched !== 'boolean') invalid('INCOMPATIBLE_CAPABILITY', 'query.refinement');
        return matched;
      } }));
    } else if (node.kind === 'and' || node.kind === 'or') for (const child of node.children) yield* walk(child);
    else if (node.kind === 'not') yield* walk(node.child);
  }
  yield* walk(node);
  for (const capability of Object.keys(options.extensions ?? {}).sort()) {
    yield charge(capability.length + 1);
    const { registration, run } = setup(capability);
    if (registration.dictionary) {
      const prepared = yield* run(registration.dictionary.prepare(Object.freeze({ ...metadataContext(capability, options.extensions![capability]), analyzer: root.configuration.analyzer,
        *dictionary(fields: readonly string[]) {
          if (!Array.isArray(fields) || !fields.length) invalid('INCOMPATIBLE_CAPABILITY', 'extensions.dictionary.fields');
          bound(fields.length, root.configuration.limits.maxTextFields, 'extensions.dictionary.fields');
          const selected = new Set<string>();
          for (const field of fields) {
            if (typeof field !== 'string' || !registration.manifest.dataRequirements.fields.includes(field) || selected.has(field)) invalid('MISSING_CAPABILITY', 'extensions.dictionary.fields');
            selected.add(field);
          }
          for (const field of selected) for (const [term, entry] of directoryEntries(root.fields[field]!.terms)) {
            yield Object.freeze({ workUnits: field.length + term.length + 1, field, term, documentFrequency: entry.df });
          }
        } })));
      if (!prepared || typeof prepared.finish !== 'function') invalid('INCOMPATIBLE_CAPABILITY', 'extensions.dictionary');
      const finish = prepared.finish.bind(prepared);
      outputs.push(Object.freeze({ capability, *finish(): Generator<WorkStep, unknown> { return output(capability, yield* run(finish())); } }));
      continue;
    }
    if (registration.evidence) {
      if (evidence) invalid('INVALID_OPTIONS', 'options.extensions.evidence');
      const prepared = yield* run(registration.evidence.prepare(Object.freeze({ ...metadataContext(capability, options.extensions![capability]), analyzer: root.configuration.analyzer, analyze,
        state: (requested: string): unknown => state(requested, capability) })));
      if (!prepared || typeof prepared.finish !== 'function') invalid('INCOMPATIBLE_CAPABILITY', 'extensions.evidence');
      const finish = prepared.finish.bind(prepared);
      evidence = Object.freeze({ capability, *finish(context: EvidenceResultContext): Generator<WorkStep, unknown> {
        return output(capability, yield* run(finish(context)));
      } });
      continue;
    }
    if (!registration.aggregation) invalid('MISSING_CAPABILITY', 'options.extensions');
    const prepared = yield* run(registration.aggregation.prepare(metadataContext(capability, options.extensions![capability])));
    if (!prepared || typeof prepared.add !== 'function' || typeof prepared.finish !== 'function') invalid('INCOMPATIBLE_CAPABILITY', 'extensions.aggregation');
    const add = prepared.add.bind(prepared), finish = prepared.finish.bind(prepared);
    aggregations.push(Object.freeze({ capability,
      *add(metadata: Metadata): Generator<WorkStep, void> {
        if ((yield* run(add(metadata))) !== undefined) invalid('INCOMPATIBLE_CAPABILITY', 'extensions.aggregation');
      },
      *finish(): Generator<WorkStep, unknown> {
        return output(capability, yield* run(finish()));
      },
    }));
  }
  return { leaves, aggregations, outputs, ...(evidence ? { evidence } : {}) };
}
