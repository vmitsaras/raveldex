import { workerIdentity } from '../../core/capabilities/worker-identity.js';
import { BASIC_ANALYZER } from '../../core/analyzer/basic.js';
import type { AddonRegistration, PreparedRefinement, RefinementContext } from '../../core/capabilities/types.js';
import { bound, invalid } from '../../core/errors/error.js';
import { directoryGet } from '../../core/index/directory.js';
import type { WorkStep } from '../../core/index/directory.js';
import { DEFAULT_LIMITS } from '../../core/limits/limits.js';
import { capturePhraseOptions } from './options.js';
import type { SourcePhraseOptions } from './options.js';
import { requireSourceRoot } from './store.js';
import type { SourceRecord, SourceRoot } from './store.js';
import { phraseFailureTable, sourceValueMatches } from './verifier.js';

export { createSourceProvider } from './source.js';
export type { SourceProviderOptions, SourcePhraseOptions } from './options.js';

const MAX_PHRASE_TOKENS = 32;
const rawCharge = (workUnits: number): WorkStep => ({ workUnits });

function* preparePhrase(context: RefinementContext, enabledFields: readonly string[]): Generator<WorkStep, PreparedRefinement> {
  if (context.analyzer.id !== BASIC_ANALYZER.id) invalid('INCOMPATIBLE_CAPABILITY', 'phrases.analyzer');
  bound(context.terms.length, Math.min(MAX_PHRASE_TOKENS, context.limits.maxQueryTokens), 'phrases.tokens');
  const fields: { readonly name: string; readonly root: SourceRoot }[] = [];
  // Validate every requested field before testing any candidate, including empty
  // analyzed phrases and lexical queries that produced no candidate documents.
  for (const field of context.fields) {
    yield rawCharge(field.length + enabledFields.length + 1);
    if (!enabledFields.includes(field)) invalid('MISSING_CAPABILITY', 'phrases.field');
    const root = requireSourceRoot(context.state(`source:${field}`), field, context.revision, context.analyzer);
    yield rawCharge(root.fields.length + 1);
    fields.push(Object.freeze({ name: field, root }));
  }
  const failure = yield* phraseFailureTable(context.terms);
  const sources = Object.freeze(fields);
  const terms = context.terms, limits = context.limits;
  return Object.freeze({
    *test(id: string): Generator<WorkStep, boolean> {
      // The caller supplies lexical candidates only. An absent authoritative
      // record means broken source consistency, rather than a phrase nonmatch.
      const records: { readonly field: string; readonly record: SourceRecord }[] = [];
      for (const field of sources) {
        yield rawCharge(id.length + 1);
        const record = directoryGet(field.root.records, id);
        if (!record) invalid('MISSING_CAPABILITY', 'phrases.source.record');
        if (!Object.isFrozen(record) || typeof record.text !== 'object' || record.text === null || !Object.isFrozen(record.text)) invalid('INCOMPATIBLE_CAPABILITY', 'phrases.source.record');
        records.push({ field: field.name, record });
      }
      // Resolve every authoritative record before returning a positive result.
      for (const { field, record } of records) {
        const values = record.text[field];
        if (!values) continue;
        if (!Array.isArray(values) || !Object.isFrozen(values) || values.length > limits.maxTextValuesPerField) invalid('INCOMPATIBLE_CAPABILITY', 'phrases.source.values');
        for (let i = 0; i < values.length; i++) {
          yield rawCharge(1);
          if (typeof values[i] !== 'string') invalid('INCOMPATIBLE_CAPABILITY', 'phrases.source.values');
          if (yield* sourceValueMatches(values[i]!, i, terms, failure, limits)) return true;
        }
      }
      return false;
    },
  });
}

/** Exact native token adjacency in one selected original field value. */
export function createSourcePhrases(options: SourcePhraseOptions): AddonRegistration {
  const captured = capturePhraseOptions(options, false);
  return Object.freeze({
    manifest: Object.freeze({
      id: captured.id, version: '0.0.0', contractVersion: 1,
      roles: Object.freeze(['leaf-refinement'] as const),
      provides: Object.freeze([Object.freeze({ id: 'phrases', contractVersion: 1 })]),
      requires: Object.freeze(captured.fields.map(field => Object.freeze({ id: `source:${field}`, contractVersion: 1 }))),
      dataRequirements: Object.freeze({ fields: captured.fields, source: true, positions: false, offsets: false, metadata: false }),
      indexEffect: 'none', rebuildPolicy: 'new-index',
      execution: Object.freeze({ direct: true, worker: true, workerRegistration: workerIdentity('source-phrases', captured) }),
      limits: Object.freeze({ maxPayloadCodeUnits: DEFAULT_LIMITS.maxQueryCodeUnits, maxWorkUnits: captured.maxWorkUnits, maxRetainedEntries: 0, maxOutputEntries: 0 }),
      costs: Object.freeze({ importedCode: 'Native analyzer, resumable source phrase verifier and selected-source protocol.', retainedRepresentation: 'No additional index state; source providers retain declared originals.', transientWork: 'At most 32 phrase-prefix entries plus one current token; complete lexical candidates are scanned under the shared search budget.', externalResources: 'none' }),
    }),
    refinement: Object.freeze({
      kind: 'exact-token-sequence', maxTokens: MAX_PHRASE_TOKENS,
      prepare: (context: RefinementContext): Generator<WorkStep, PreparedRefinement> => preparePhrase(context, captured.fields),
    }),
  });
}
