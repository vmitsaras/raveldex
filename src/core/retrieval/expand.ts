import { directoryEntries, directoryGet } from '../index/directory.js';
import type { WorkStep } from '../index/directory.js';
import type { IndexRoot, TermEntry } from '../index/state.js';
import { invalid } from '../errors/error.js';
import { validateExpansionCounts } from '../limits/work.js';
import type { CanonicalGroup } from '../query/compile.js';
import { compareStrings, sortedStrings } from '../query/work.js';
import type { Charge } from '../query/work.js';

export interface Expansion { readonly term: string; readonly weight: number; readonly variantKey: string; readonly entry: TermEntry }
export interface ExpandedGroup { readonly group: CanonicalGroup; readonly fields: ReadonlyMap<string, readonly Expansion[]>; readonly ids: ReadonlySet<string> }

/** Establish all expansions, including those in branches that later fail. */
export function* expandGroups(root: IndexRoot, groups: ReadonlyMap<string, CanonicalGroup>, charge: Charge, checkpoint?: (phase: 'dictionary' | 'postings') => void): Generator<WorkStep, ReadonlyMap<string, ExpandedGroup>> {
  const queryPairs = new Set<string>();
  const result = new Map<string, ExpandedGroup>();
  for (const key of yield* sortedStrings(groups.keys(), charge)) {
    const group = groups.get(key)!;
    let perGroup = 0;
    const fields = new Map<string, readonly Expansion[]>();
    const ids = new Set<string>();
    for (const name of group.fields) {
      const field = root.fields[name];
      if (!field) invalid('INTERNAL_ERROR', 'index.fields');
      const terms = new Map<string, Expansion>();
      function* add(term: string, entry: TermEntry, weight: number, variantKey: string): Generator<WorkStep> {
        yield charge(term.length + 1);
        const old = terms.get(term);
        if (!old) {
          yield charge(name.length + term.length + 1);
          queryPairs.add(JSON.stringify([name, term]));
          validateExpansionCounts(++perGroup, queryPairs.size, root.configuration.limits);
        }
        if (!old || weight > old.weight || (weight === old.weight && (yield* compareStrings(variantKey, old.variantKey, charge)) < 0)) {
          terms.set(term, Object.freeze({ term, entry, weight, variantKey }));
        }
      }
      for (const variant of group.variants) {
        if (variant.match === 'exact') {
          checkpoint?.('dictionary');
          yield charge(variant.term.length + 1);
          const entry = directoryGet(field.terms, variant.term);
          if (entry) yield* add(variant.term, entry, variant.weight, variant.key);
        } else {
          for (const [term, entry] of directoryEntries(field.terms)) {
            checkpoint?.('dictionary');
            yield charge(1);
            let matches = term.length >= variant.term.length;
            for (let i = 0; matches && i < variant.term.length; i++) {
              yield charge(1);
              matches = term.charCodeAt(i) === variant.term.charCodeAt(i);
            }
            if (matches) yield* add(term, entry, variant.weight, variant.key);
          }
        }
      }
      const alternatives: Expansion[] = [];
      for (const term of yield* sortedStrings(terms.keys(), charge)) {
        const expansion = terms.get(term)!;
        const entry = expansion.entry;
        if (!Number.isSafeInteger(entry.df) || entry.df < 1 || entry.df > field.documents || entry.df !== entry.postings.size) invalid('INTERNAL_ERROR', 'index.df');
        alternatives.push(expansion);
        for (const [id, tf] of directoryEntries(entry.postings)) {
          checkpoint?.('postings');
          yield charge(id.length + name.length + term.length + 3);
          const doc = directoryGet(root.documents, id);
          if (!doc || !Number.isSafeInteger(tf) || tf <= 0 || doc.fields[name]?.terms[term] !== tf) invalid('INTERNAL_ERROR', 'index.postings');
          yield charge(id.length + 1); ids.add(id);
        }
      }
      fields.set(name, Object.freeze(alternatives));
    }
    result.set(key, { group, fields, ids });
  }
  return result;
}
