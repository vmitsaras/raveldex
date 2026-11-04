import type { AddonRegistration, RefinementContext } from '../../core/capabilities/types.js';
import { workerIdentity } from '../../core/capabilities/worker-identity.js';
import { DEFAULT_LIMITS } from '../../core/limits/limits.js';
import { captureOptions } from './options.js';
import type { ProximityOptions } from './types.js';
import { prepareProximity } from './verifier.js';

export type { ProximityOptions, ProximityPayload } from './types.js';
export const PROXIMITY_POLICY = 'ordered-adjacent-gap-v1' as const;

/** Explicit selected-position ordered matching; no source/side-state ownership. */
export function createProximity(options: ProximityOptions): AddonRegistration {
  const captured = captureOptions(options);
  return Object.freeze({
    manifest: Object.freeze({
      id: captured.id, version: '0.1.0', contractVersion: 1,
      roles: Object.freeze(['leaf-refinement'] as const),
      provides: Object.freeze([Object.freeze({ id: 'proximity', contractVersion: 1 })]),
      requires: Object.freeze(captured.fields.map(field => Object.freeze({ id: `positions:${field}`, contractVersion: 1 }))),
      dataRequirements: Object.freeze({ fields: captured.fields, source: false, positions: true, offsets: false, metadata: false }),
      indexEffect: 'none', rebuildPolicy: 'new-index',
      execution: Object.freeze({ direct: true, worker: true, workerRegistration: workerIdentity('proximity', { ...captured, policy: PROXIMITY_POLICY, maxGap: 32, maxGroups: 32, maxAlternatives: 16, score: 'native-equal-weight-groups', originalsOnly: true }) }),
      limits: Object.freeze({ maxPayloadCodeUnits: DEFAULT_LIMITS.maxQueryCodeUnits, maxWorkUnits: captured.maxWorkUnits, maxRetainedEntries: 0, maxOutputEntries: 0 }),
      costs: Object.freeze({
        importedCode: 'Explicit bounded ordered-group verifier and authoritative original-position protocol.',
        retainedRepresentation: 'No additional retained state, codec, source, n-gram accelerator or cross-search cache. Separately installed position providers retain selected originals.',
        transientWork: 'At most 32 groups/16 alternatives and selected value occurrence references, bounded k-way unions and two reachable-endpoint arrays. Shared complete-search and registration budgets cover every validation/merge/reachability step.',
        externalResources: 'none',
      }),
    }),
    refinement: Object.freeze({ kind: 'ordered-token-groups', maxTokens: DEFAULT_LIMITS.maxQueryTokens,
      prepare: (context: RefinementContext) => prepareProximity(context, captured.fields) }),
  });
}
