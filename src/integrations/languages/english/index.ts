import type { AddonRegistration } from '../../../core/capabilities/types.js';
import { workerIdentity } from '../../../core/capabilities/worker-identity.js';
import { DEFAULT_LIMITS } from '../../../core/limits/limits.js';
import { stemEnglish } from './stem.js';

/** Original-paper Porter 1980 after basic segmentation/NFKC/lowercase. */
export const ENGLISH_ANALYZER = Object.freeze({ id: 'english-porter1980-v1', environmentProfile: 'unqualified' } as const);

/** Import/registration alone does not select this global text analyzer. */
export function createEnglishAnalyzer(): AddonRegistration {
  return Object.freeze({
    manifest: Object.freeze({ id: 'english-analyzer', version: '0.1.0', contractVersion: 1,
      roles: Object.freeze(['analyzer'] as const),
      provides: Object.freeze([Object.freeze({ id: `analyzer:${ENGLISH_ANALYZER.id}`, contractVersion: 1 })]), requires: Object.freeze([]),
      dataRequirements: Object.freeze({ fields: Object.freeze([] as string[]), source: false, positions: false, offsets: false, metadata: false }),
      indexEffect: 'analysis', rebuildPolicy: 'new-index',
      execution: Object.freeze({ direct: true, worker: true, workerRegistration: workerIdentity('english-analyzer', { id: ENGLISH_ANALYZER.id, algorithm: 'porter1980-paper-v1', segmentation: 'basic-v1', asciiOnly: true }) }),
      limits: Object.freeze({ maxPayloadCodeUnits: DEFAULT_LIMITS.maxQueryCodeUnits, maxWorkUnits: DEFAULT_LIMITS.maxMutationWorkUnits, maxRetainedEntries: 0, maxOutputEntries: 0 }),
      costs: Object.freeze({ importedCode: 'Explicit original-paper Porter1980 ASCII suffix rules; generic basic token transform protocol.',
        retainedRepresentation: 'Constant algorithm suffix tables and registration identity; no corpus side index, vocabulary cache, positions or source.',
        transientWork: 'Bounded per-token scans/copies, one transformed term and original full-token coordinates; one analysis budget across the complete operation.', externalResources: 'none' }),
    }),
    analyzer: Object.freeze({ kind: 'single-token-transform' as const, id: ENGLISH_ANALYZER.id, transform: stemEnglish }),
  });
}
