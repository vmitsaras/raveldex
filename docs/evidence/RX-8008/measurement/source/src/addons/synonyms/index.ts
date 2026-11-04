import { workerIdentity } from '../../core/capabilities/worker-identity.js';
import type { AddonRegistration, ExpansionAlternative, ExpansionContext } from '../../core/capabilities/types.js';
import { bound, invalid } from '../../core/errors/error.js';
import type { WorkStep } from '../../core/index/directory.js';
import { DEFAULT_LIMITS } from '../../core/limits/limits.js';
import { captureSynonymsOptions } from './options.js';
import type { SynonymsOptions } from './options.js';

export type { SynonymsOptions, SynonymMapping } from './options.js';
export const SYNONYMS_POLICY = 'directional-one-step-v1' as const;
export interface SynonymAlternative { readonly term: string; readonly match: 'exact'; readonly weight: number }
export interface SynonymGroup {
  readonly term: string; readonly fields: readonly string[];
  readonly alternatives: readonly SynonymAlternative[];
  readonly dictionaryEntriesVisited: number; readonly workUnits: number;
}
export interface SynonymsResult {
  /** Named algorithm followed by the caller's vocabulary version. */
  readonly policy: `directional-one-step-v1:${string}`;
  readonly groups: readonly SynonymGroup[];
}

/** Explicit single-step alternatives. Retains owned vocabulary, no corpus side index. */
export function createSynonyms(options: SynonymsOptions): AddonRegistration {
  const captured = captureSynonymsOptions(options);
  const identity = workerIdentity('synonyms', captured);
  bound(identity.length, 8192, 'synonyms.workerIdentity');
  return Object.freeze({
    manifest: Object.freeze({ id: captured.id, version: '0.1.0', contractVersion: 1,
      roles: Object.freeze(['term-expansion'] as const),
      provides: Object.freeze([Object.freeze({ id: 'synonyms', contractVersion: 1 })]), requires: Object.freeze([]),
      dataRequirements: Object.freeze({ fields: captured.fields, source: false, positions: false, offsets: false, metadata: false }),
      indexEffect: 'none', rebuildPolicy: 'new-index',
      execution: Object.freeze({ direct: true, worker: true, workerRegistration: identity }),
      limits: Object.freeze({ maxPayloadCodeUnits: DEFAULT_LIMITS.maxQueryCodeUnits, maxWorkUnits: captured.maxWorkUnits,
        maxRetainedEntries: 0, maxOutputEntries: 3 + DEFAULT_LIMITS.maxQueryGroups * (8 + DEFAULT_LIMITS.maxTextFields + 4 * (captured.maxAlternatives + 1)) }),
      costs: Object.freeze({ importedCode: 'Explicit single-token directional mapping capture and expansion.',
        retainedRepresentation: 'Owned normalized vocabulary (at most 128 input edges), fields/options and canonical worker identity (at most 8192 UTF-16 units); no corpus side index or cache.',
        transientWork: 'One-step table lookup, complete live selected dictionary scan when mapped, bounded weighted alternatives and output under shared/module budgets.', externalResources: 'none' }),
    }),
    expansion: Object.freeze({ kind: 'weighted-token-alternatives' as const, maxTokens: DEFAULT_LIMITS.maxQueryTokens,
      policy: `${SYNONYMS_POLICY}:${captured.vocabularyVersion}`,
      *expand(context: ExpansionContext): Generator<WorkStep, readonly ExpansionAlternative[]> {
        if (context.analyzer.id !== 'basic-v1') invalid('INCOMPATIBLE_CAPABILITY', 'synonyms.analyzer');
        const targets = new Set<string>();
        for (const mapping of captured.mappings) {
          yield { workUnits: mapping.from.length + mapping.to.length + context.term.length + 1 };
          if (mapping.from === context.term) targets.add(mapping.to);
        }
        const alternatives = new Map<string, ExpansionAlternative>();
        if (context.exact) alternatives.set(context.term, Object.freeze({ term: context.term, weight: 1 }));
        if (targets.size) for (const step of context.dictionary()) {
          yield { workUnits: step.workUnits + step.term.length + 1 };
          if (!targets.has(step.term) || alternatives.has(step.term)) continue;
          bound(alternatives.size + 1, Math.min(captured.maxAlternatives + (context.exact ? 1 : 0), context.limits.maxVariantsPerGroup - (context.exact ? 0 : 1)), 'synonyms.alternatives');
          alternatives.set(step.term, Object.freeze({ term: step.term, weight: 0.5 }));
        }
        yield { workUnits: context.term.length + alternatives.size + 1 };
        return Object.freeze([...alternatives.values()]);
      },
    }),
  });
}
