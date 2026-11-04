import { workerIdentity } from '../../core/capabilities/worker-identity.js';
import type { AddonRegistration, PreparedRefinement, RefinementContext } from '../../core/capabilities/types.js';
import { bound, invalid } from '../../core/errors/error.js';
import type { WorkStep } from '../../core/index/directory.js';
import { DEFAULT_LIMITS } from '../../core/limits/limits.js';
import { capturePositionOptions } from './options.js';
import type { PositionPhraseOptions } from './options.js';
import { preparePositionField } from './verifier.js';

export type { PositionPhraseOptions } from './options.js';

const MAX_PHRASE_TOKENS = 32;
const rawCharge = (workUnits: number): WorkStep => ({ workUnits });

function* preparePhrase(context: RefinementContext, enabledFields: readonly string[]): Generator<WorkStep, PreparedRefinement> {
  bound(context.terms.length, Math.min(MAX_PHRASE_TOKENS, context.limits.maxQueryTokens), 'phrases.tokens');
  const fields: PreparedRefinement[] = [];
  for (const field of context.fields) {
    yield rawCharge(field.length + enabledFields.length + 1);
    if (!enabledFields.includes(field)) invalid('MISSING_CAPABILITY', 'phrases.field');
    fields.push(yield* preparePositionField(context, field));
  }
  return Object.freeze({
    *test(id: string): Generator<WorkStep, boolean> {
      let matched = false;
      // Every selected provider and candidate record is authoritative, even if
      // an earlier selected field has already established phrase membership.
      for (const field of fields) if (yield* field.test(id)) matched = true;
      return matched;
    },
  });
}

/** The same strict native phrase meaning, using selected term positions. */
export function createPositionPhrases(options: PositionPhraseOptions): AddonRegistration {
  const captured = capturePositionOptions(options, false);
  return Object.freeze({
    manifest: Object.freeze({
      id: captured.id, version: '0.0.0', contractVersion: 1,
      roles: Object.freeze(['leaf-refinement'] as const),
      provides: Object.freeze([Object.freeze({ id: 'phrases', contractVersion: 1 })]),
      requires: Object.freeze(captured.fields.map(field => Object.freeze({ id: `positions:${field}`, contractVersion: 1 }))),
      dataRequirements: Object.freeze({ fields: captured.fields, source: false, positions: true, offsets: false, metadata: false }),
      indexEffect: 'none', rebuildPolicy: 'new-index', execution: Object.freeze({ direct: true, worker: true, workerRegistration: workerIdentity('position-phrases', captured) }),
      limits: Object.freeze({ maxPayloadCodeUnits: DEFAULT_LIMITS.maxQueryCodeUnits, maxWorkUnits: captured.maxWorkUnits, maxRetainedEntries: 0, maxOutputEntries: 0 }),
      costs: Object.freeze({ importedCode: 'Selected-position protocol and resumable occurrence-position intersection; no source reanalysis.', retainedRepresentation: 'No additional index state; position providers retain declared term occurrences and optionally original spans.', transientWork: 'Sorted occurrence lists are intersected with ordered query offsets independently in each original value; complete lexical candidates and selected providers are checked under the shared search budget.', externalResources: 'none' }),
    }),
    refinement: Object.freeze({ kind: 'exact-token-sequence', maxTokens: MAX_PHRASE_TOKENS,
      prepare: (context: RefinementContext): Generator<WorkStep, PreparedRefinement> => preparePhrase(context, captured.fields) }),
  });
}
