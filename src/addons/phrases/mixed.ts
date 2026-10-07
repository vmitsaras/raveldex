import { Admission, has, keysOnly, ownObject, stringValue } from '../../core/contracts/data.js';
import type { AddonRegistration, PreparedRefinement, RefinementContext } from '../../core/capabilities/types.js';
import { invalid } from '../../core/errors/error.js';
import type { WorkStep } from '../../core/index/directory.js';
import { DEFAULT_LIMITS } from '../../core/limits/limits.js';
import { preparePositionField } from '../positions/verifier.js';
import { createSourcePhrases } from './index.js';
import { capturePhraseOptions } from './options.js';

export interface MixedPhraseOptions {
  readonly fields: Readonly<Record<string, 'source' | 'positions'>>;
  readonly id?: string;
  readonly maxWorkUnits?: number;
}

/** One strict phrase meaning, with an explicitly selected representation per field. */
export function createPhrases(options: MixedPhraseOptions): AddonRegistration {
  const admission = new Admission(DEFAULT_LIMITS.maxAdmissionEntries);
  const raw = ownObject(options, 'INVALID_OPTIONS', 'phrases.options', admission);
  keysOnly(raw, ['fields', 'id', 'maxWorkUnits'], 'INVALID_OPTIONS', 'phrases.options');
  const data = ownObject(raw.fields, 'INVALID_OPTIONS', 'phrases.fields', admission);
  const fields = Object.keys(data);
  const captured = capturePhraseOptions({ fields, ...(has(raw, 'id') ? { id: raw.id } : { id: 'mixed-phrases' }), ...(has(raw, 'maxWorkUnits') ? { maxWorkUnits: raw.maxWorkUnits } : {}) }, false);
  const strategies: Record<string, 'source' | 'positions'> = Object.create(null) as typeof strategies;
  for (const field of captured.fields) {
    const strategy = stringValue(data[field], 16, 'INVALID_OPTIONS', 'phrases.strategy');
    if (strategy !== 'source' && strategy !== 'positions') invalid('INVALID_OPTIONS', 'phrases.strategy');
    strategies[field] = strategy;
  }
  Object.freeze(strategies);
  const source = captured.fields.filter(field => strategies[field] === 'source');
  const sourceHandler = source.length ? createSourcePhrases({ fields: source }).refinement! : undefined;
  return Object.freeze({
    manifest: Object.freeze({
      id: captured.id, version: '0.0.0', contractVersion: 1,
      roles: Object.freeze(['leaf-refinement'] as const),
      provides: Object.freeze([Object.freeze({ id: 'phrases', contractVersion: 1 })]),
      requires: Object.freeze(captured.fields.map(field => Object.freeze({ id: `${strategies[field]}:${field}`, contractVersion: 1 }))),
      dataRequirements: Object.freeze({ fields: captured.fields, source: source.length > 0, positions: source.length < captured.fields.length, offsets: false, metadata: false }),
      indexEffect: 'none', rebuildPolicy: 'new-index',
      execution: Object.freeze({ direct: true, worker: false }),
      limits: Object.freeze({ maxPayloadCodeUnits: DEFAULT_LIMITS.maxQueryCodeUnits, maxWorkUnits: captured.maxWorkUnits, maxRetainedEntries: 0, maxOutputEntries: 0 }),
      costs: Object.freeze({ importedCode: 'Explicit source and position strict phrase verifiers.', retainedRepresentation: 'No extra state; declared providers own each selected representation.', transientWork: 'Complete lexical candidates; per-field source scans or ordered occurrence intersections under one shared search budget.', externalResources: 'none' }),
    }),
    refinement: Object.freeze({
      kind: 'exact-token-sequence', maxTokens: 32,
      *prepare(context: RefinementContext): Generator<WorkStep, PreparedRefinement> {
        const verifiers: PreparedRefinement[] = [];
        for (const field of context.fields) {
          yield { workUnits: field.length + 1 };
          if (!has(strategies, field)) invalid('MISSING_CAPABILITY', 'phrases.field');
          if (strategies[field] === 'positions') verifiers.push(yield* preparePositionField(context, field));
          else verifiers.push(yield* sourceHandler!.prepare(Object.freeze({ ...context, fields: Object.freeze([field]) })));
        }
        return Object.freeze({ *test(id: string): Generator<WorkStep, boolean> {
          let matched = false;
          // Test every authoritative field even after a positive result. A broken
          // second provider must not be concealed by a matching first field.
          for (const verifier of verifiers) if (yield* verifier.test(id)) matched = true;
          return matched;
        } });
      },
    }),
  });
}
