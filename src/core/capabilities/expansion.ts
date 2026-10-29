import type { ExpansionAlternative, ExpansionContext } from './types.js';
import { bound, invalid } from '../errors/error.js';
import { directoryEntries, directoryGet } from '../index/directory.js';
import type { WorkStep } from '../index/directory.js';
import type { IndexRoot } from '../index/state.js';
import { WorkBudget } from '../limits/work.js';
import type { CanonicalVariant } from '../query/compile.js';
import { sortedStrings } from '../query/work.js';
import type { Charge } from '../query/work.js';

type Variant = Omit<CanonicalVariant, 'key'>;
interface GroupObservation {
  readonly term: string; readonly fields: readonly string[]; readonly alternatives: readonly Variant[];
  readonly dictionaryEntriesVisited: number; readonly workUnits: number;
}
export interface ExpansionResolver {
  resolve(capability: string, fields: readonly string[], terms: readonly string[]): Generator<WorkStep, readonly (readonly Variant[])[]>;
  finish(): Readonly<Record<string, unknown>> | undefined;
}

/** Lazy operation-local expansion. No dictionary cache or side state survives it. */
export function createExpansionResolver(root: IndexRoot, charge: Charge): ExpansionResolver {
  const budgets = new Map<string, WorkBudget>(), outputs = new Map<string, number>();
  const observations = new Map<string, GroupObservation[]>(), cache = new Map<string, readonly Variant[]>();
  let outputEntries = 0;
  return {
    *resolve(capability, fields, terms) {
      const registration = root.configuration.capabilities?.providers[capability];
      if (!registration?.expansion) invalid('MISSING_CAPABILITY', 'query.expansion');
      for (const field of fields) {
        yield charge(field.length + 1);
        if (!registration.manifest.dataRequirements.fields.includes(field)) invalid('MISSING_CAPABILITY', 'query.expansion.fields');
      }
      const output = (count: number): void => {
        const entries = (outputs.get(registration.manifest.id) ?? 0) + count;
        bound(entries, registration.manifest.limits.maxOutputEntries, 'query.expansion.output');
        bound(outputEntries + count, root.configuration.limits.maxAdmissionEntries, 'query.expansion.output');
        outputs.set(registration.manifest.id, entries); outputEntries += count;
      };
      if (!observations.has(capability)) { output(3); yield charge(3); observations.set(capability, []); }
      let budget = budgets.get(registration.manifest.id);
      if (!budget) { budget = new WorkBudget(Math.min(registration.manifest.limits.maxWorkUnits, root.configuration.limits.maxSearchWorkUnits)); budgets.set(registration.manifest.id, budget); }
      const result: (readonly Variant[])[] = [];
      for (const term of terms) {
        const key = JSON.stringify([capability, fields, term]);
        yield charge(key.length + 1);
        const reused = cache.get(key);
        if (reused) { result.push(reused); continue; }
        const before = budget.consumed;
        let exact = false, visited = 0;
        for (const field of fields) {
          yield charge(field.length + term.length + 1);
          if (directoryGet(root.fields[field]!.terms, term)) exact = true;
        }
        const context: ExpansionContext = Object.freeze({ revision: root.revision, analyzer: root.configuration.analyzer,
          limits: root.configuration.limits, fields, term, exact,
          *dictionary() {
            for (const field of fields) for (const [candidate] of directoryEntries(root.fields[field]!.terms)) {
              visited++;
              yield { workUnits: field.length + candidate.length + 1, term: candidate };
            }
          } });
        const cursor = registration.expansion.expand(context);
        let alternatives: readonly ExpansionAlternative[];
        try {
          for (;;) {
            const step = cursor.next();
            if (step.done) { alternatives = step.value; break; }
            const charged = charge(step.value.workUnits); budget.charge(step.value.workUnits); yield charged;
          }
        } finally { try { cursor.return([]); } catch { /* Preserve original failure/stop. */ } }
        if (!Array.isArray(alternatives) || !Object.isFrozen(alternatives)) invalid('INCOMPATIBLE_CAPABILITY', 'query.expansion.output');
        bound(alternatives.length, root.configuration.limits.maxVariantsPerGroup, 'query.expansion.alternatives');
        const byTerm = new Map<string, Variant>();
        for (const alternative of alternatives) {
          if (!alternative || typeof alternative.term !== 'string' || !alternative.term.length || alternative.term.length > root.configuration.limits.maxTermCodeUnits || !Number.isFinite(alternative.weight) || alternative.weight <= 0 || alternative.weight > 1 || byTerm.has(alternative.term)) invalid('INCOMPATIBLE_CAPABILITY', 'query.expansion.output');
          yield charge(alternative.term.length + 1);
          // Already normalized dictionary terms must not be analyzed a second time.
          let live = false;
          for (const field of fields) {
            yield charge(field.length + alternative.term.length + 1);
            if (directoryGet(root.fields[field]!.terms, alternative.term)) live = true;
          }
          if (!live) invalid('INCOMPATIBLE_CAPABILITY', 'query.expansion.dictionary');
          byTerm.set(alternative.term, Object.freeze({ term: alternative.term, match: 'exact', weight: alternative.weight }));
        }
        const variants: Variant[] = [];
        for (const name of yield* sortedStrings(byTerm.keys(), charge)) variants.push(byTerm.get(name)!);
        const owned = Object.freeze(variants);
        // Own-object keys and own-array keys (including length), as Admission.
        const entries = 8 + fields.length + 4 * variants.length;
        output(entries); yield charge(entries);
        const list = observations.get(capability) ?? [];
        list.push(Object.freeze({ term, fields, alternatives: owned, dictionaryEntriesVisited: visited, workUnits: budget.consumed - before }));
        observations.set(capability, list); cache.set(key, owned); result.push(owned);
      }
      return result;
    },
    finish() {
      if (!observations.size) return undefined;
      const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      for (const [capability, groups] of observations) result[capability] = Object.freeze({
        policy: root.configuration.capabilities!.providers[capability]!.expansion!.policy, groups: Object.freeze(groups) });
      return Object.freeze(result);
    },
  };
}
