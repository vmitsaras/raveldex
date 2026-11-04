import { workerIdentity } from '../../core/capabilities/worker-identity.js';
import type { AddonRegistration, ExpansionAlternative, ExpansionContext } from '../../core/capabilities/types.js';
import { bound, invalid } from '../../core/errors/error.js';
import type { WorkStep } from '../../core/index/directory.js';
import { DEFAULT_LIMITS } from '../../core/limits/limits.js';
import { codePoints, oneEdit } from './distance.js';
import { captureTypoOptions } from './options.js';
import type { TypoOptions } from './options.js';

export type { TypoOptions } from './options.js';
export type { TypoAlternative, TypoGroup, TypoResult } from './types.js';
export const TYPO_POLICY = 'unicode-osa1-exact-first-v1' as const;

/** Explicit one-edit dictionary expansion; retains no index, source or cache. */
export function createTypoTolerance(options: TypoOptions): AddonRegistration {
  const captured = captureTypoOptions(options);
  return Object.freeze({
    manifest: Object.freeze({ id: captured.id, version: '0.1.0', contractVersion: 1,
      roles: Object.freeze(['term-expansion'] as const),
      provides: Object.freeze([Object.freeze({ id: 'typo', contractVersion: 1 })]), requires: Object.freeze([]),
      dataRequirements: Object.freeze({ fields: captured.fields, source: false, positions: false, offsets: false, metadata: false }),
      indexEffect: 'none', rebuildPolicy: 'new-index',
      execution: Object.freeze({ direct: true, worker: true, workerRegistration: workerIdentity('typo', captured) }),
      limits: Object.freeze({ maxPayloadCodeUnits: DEFAULT_LIMITS.maxQueryCodeUnits, maxWorkUnits: captured.maxWorkUnits,
        maxRetainedEntries: 0, maxOutputEntries: 3 + DEFAULT_LIMITS.maxQueryGroups * (8 + DEFAULT_LIMITS.maxTextFields + 4 * captured.maxAlternatives) }),
      costs: Object.freeze({ importedCode: 'Explicit Unicode OSA distance-one matcher and registration.',
        retainedRepresentation: 'No side index or cache; reads the current live core dictionary.',
        transientWork: 'Complete selected dictionary scans, two bounded code-point arrays, bounded weighted alternatives and output under shared/module budgets.', externalResources: 'none' }),
    }),
    expansion: Object.freeze({ kind: 'weighted-token-alternatives' as const, maxTokens: DEFAULT_LIMITS.maxQueryTokens, policy: TYPO_POLICY,
      *expand(context: ExpansionContext): Generator<WorkStep, readonly ExpansionAlternative[]> {
        if (context.analyzer.id !== 'basic-v1') invalid('INCOMPATIBLE_CAPABILITY', 'typo.analyzer');
        if (context.exact) { yield { workUnits: context.term.length + 1 }; return Object.freeze([Object.freeze({ term: context.term, weight: 1 })]); }
        const input = yield* codePoints(context.term);
        if (input.length < 4) return Object.freeze([]);
        const alternatives = new Map<string, ExpansionAlternative>();
        for (const step of context.dictionary()) {
          yield { workUnits: step.workUnits };
          if (alternatives.has(step.term)) continue;
          const candidate = yield* codePoints(step.term);
          if (!(yield* oneEdit(input, candidate))) continue;
          bound(alternatives.size + 1, Math.min(captured.maxAlternatives, context.limits.maxVariantsPerGroup - 1), 'typo.alternatives');
          alternatives.set(step.term, Object.freeze({ term: step.term, weight: 0.5 }));
        }
        return Object.freeze([...alternatives.values()]);
      },
    }),
  });
}
