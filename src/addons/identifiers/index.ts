import type { AddonRegistration } from '../../core/capabilities/types.js';
import { workerIdentity } from '../../core/capabilities/worker-identity.js';
import { DEFAULT_LIMITS } from '../../core/limits/limits.js';
import { analyzeIdentifiers } from './scanner.js';

/** Whole names plus derived components on original ordinals; no phrase graph. */
export const IDENTIFIER_ANALYZER = Object.freeze({ id: 'code-identifiers-v1', environmentProfile: 'unqualified' } as const);

/** Explicit configuration selects this analyzer. Import/registration is inert. */
export function createIdentifierAnalyzer(): AddonRegistration {
  return Object.freeze({
    manifest: Object.freeze({ id: 'identifier-analyzer', version: '0.1.0', contractVersion: 1,
      roles: Object.freeze(['analyzer'] as const),
      provides: Object.freeze([Object.freeze({ id: `analyzer:${IDENTIFIER_ANALYZER.id}`, contractVersion: 1 })]), requires: Object.freeze([]),
      dataRequirements: Object.freeze({ fields: Object.freeze([] as string[]), source: false, positions: false, offsets: false, metadata: false }),
      indexEffect: 'analysis', rebuildPolicy: 'new-index',
      execution: Object.freeze({ direct: true, worker: true, workerRegistration: workerIdentity('identifier-analyzer', {
        id: IDENTIFIER_ANALYZER.id, policy: 'whole-plus-components-v1', numbers: 'unicode-N', case: 'Lu-Lt-Ll',
        normalization: 'per-original-span-NFKC-lowercase', duplicates: 'earliest-component-per-term', phrases: 'originals-only', weight: 1,
      }) }),
      limits: Object.freeze({ maxPayloadCodeUnits: DEFAULT_LIMITS.maxQueryCodeUnits, maxWorkUnits: DEFAULT_LIMITS.maxMutationWorkUnits,
        maxRetainedEntries: 0, maxOutputEntries: 0 }),
      costs: Object.freeze({ importedCode: 'Native raw identifier scanner and bounded original/component derivation.',
        retainedRepresentation: 'Registration/Unicode category constants only; no corpus side index, source, positions or vocabulary cache. Derived terms enter the explicitly selected core index.',
        transientWork: 'One bounded original and component list, normalization/deduplication, original UTF-16 spans and dense original ordinals; shared complete-operation analysis budget.', externalResources: 'none' }),
    }),
    analyzer: Object.freeze({ kind: 'identifier-tokenizer' as const, id: IDENTIFIER_ANALYZER.id, analyze: analyzeIdentifiers }),
  });
}
