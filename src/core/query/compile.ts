import { analyzeQuery } from '../contracts/query.js';
import type { OwnedQuery } from '../contracts/query.js';
import type { OwnedConfiguration, Scalar } from '../contracts/types.js';
import type { WorkStep } from '../index/directory.js';
import { sortedStrings } from './work.js';
import type { Charge } from './work.js';

export interface CanonicalVariant { readonly term: string; readonly match: 'exact' | 'prefix'; readonly weight: number; readonly key: string }
export interface CanonicalGroup { readonly key: string; readonly fields: readonly string[]; readonly variants: readonly CanonicalVariant[] }
export type CompiledNode =
  | { readonly kind: 'group'; readonly group: CanonicalGroup }
  | { readonly kind: 'and' | 'or'; readonly children: readonly CompiledNode[] }
  | { readonly kind: 'not'; readonly child: CompiledNode }
  | { readonly kind: 'extension'; readonly capability: string; readonly fields: readonly string[]; readonly terms: readonly string[]; readonly groups: readonly CanonicalGroup[] }
  | { readonly kind: 'predicate'; readonly capability: string; readonly payload: unknown }
  | { readonly kind: 'eq'; readonly field: string; readonly value: Scalar }
  | { readonly kind: 'all' | 'none' };
export interface CompiledQuery { readonly node: CompiledNode; readonly groups: ReadonlyMap<string, CanonicalGroup>; readonly key: string }

/** Consume shared analysis once. Normalized output never re-enters raw analysis. */
export function* compileQuery(query: OwnedQuery, configuration: OwnedConfiguration, charge: Charge): Generator<WorkStep, CompiledQuery> {
  const tokens = new Map<OwnedQuery, string[]>();
  for (const step of analyzeQuery(query, configuration.schema, configuration.limits, configuration.capabilities)) {
    yield charge(step.workUnits);
    if (step.token && step.leaf) {
      yield charge(1);
      let list = tokens.get(step.leaf);
      if (!list) { list = []; tokens.set(step.leaf, list); }
      list.push(step.token.term);
    }
  }
  const groups = new Map<string, CanonicalGroup>();
  function* group(fields: readonly string[] | undefined, variants: readonly Omit<CanonicalVariant, 'key'>[]): Generator<WorkStep, CompiledNode> {
    const names = yield* sortedStrings(fields ?? Object.keys(configuration.schema.text), charge);
    const entries = new Map<string, CanonicalVariant>();
    for (const variant of variants) {
      yield charge(variant.term.length + 1);
      const key = JSON.stringify([variant.term, variant.match, variant.weight]);
      yield charge(key.length + 1);
      entries.set(key, Object.freeze({ ...variant, key }));
    }
    const keys = yield* sortedStrings(entries.keys(), charge);
    yield charge(names.reduce((n, field) => n + field.length, 1) + keys.reduce((n, key) => n + key.length, 1));
    const key = JSON.stringify([names, keys]);
    yield charge(key.length + 1);
    let canonical = groups.get(key);
    if (!canonical) {
      canonical = Object.freeze({ key, fields: Object.freeze(names), variants: Object.freeze(keys.map((entry) => entries.get(entry)!)) });
      groups.set(key, canonical);
    }
    return Object.freeze({ kind: 'group', group: canonical });
  }
  function* walk(raw: OwnedQuery): Generator<WorkStep, CompiledNode> {
    yield charge(1);
    switch (raw.kind) {
      case 'text': {
        const children: CompiledNode[] = [];
        for (const term of tokens.get(raw) ?? []) children.push(yield* group(raw.fields, [{ term, match: 'exact', weight: 1 }]));
        return children.length ? Object.freeze({ kind: raw.operator ?? 'and', children: Object.freeze(children) }) : Object.freeze({ kind: 'none' });
      }
      case 'group': return yield* group(raw.fields, raw.variants.map((variant, i) => ({ term: tokens.get(raw)![i]!, match: variant.match, weight: variant.weight ?? 1 })));
      case 'extension': {
        const lexical: CanonicalGroup[] = [], terms = Object.freeze(tokens.get(raw) ?? []);
        for (const term of terms) {
          const node = yield* group(raw.payload.fields, [{ term, match: 'exact', weight: 1 }]);
          if (node.kind === 'group') lexical.push(node.group);
        }
        return Object.freeze({ kind: 'extension', capability: raw.capability,
          fields: Object.freeze(yield* sortedStrings(raw.payload.fields ?? Object.keys(configuration.schema.text), charge)), terms, groups: Object.freeze(lexical) });
      }
      case 'and': case 'or': {
        const children: CompiledNode[] = [];
        for (const child of raw.children) children.push(yield* walk(child as OwnedQuery));
        return Object.freeze({ kind: raw.kind, children: Object.freeze(children) });
      }
      case 'not': return Object.freeze({ kind: 'not', child: yield* walk(raw.child as OwnedQuery) });
      case 'predicate': return Object.freeze({ kind: 'predicate', capability: raw.capability, payload: raw.payload });
      case 'eq': return Object.freeze({ kind: 'eq', field: raw.field, value: raw.value });
      case 'all': case 'none': return Object.freeze({ kind: raw.kind });
    }
  }
  const node = yield* walk(query);
  // Canonical lexical keys are stable; Boolean path identity preserves the input
  // structure (especially NOT participation) rather than algebraically rewriting it.
  const key = JSON.stringify(node);
  yield charge(key.length + 1);
  return { node, groups, key };
}
