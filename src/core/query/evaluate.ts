import type { DocumentEntry } from '../index/state.js';
import type { WorkStep } from '../index/directory.js';
import type { ExpandedGroup } from '../retrieval/expand.js';
import type { CompiledNode } from './compile.js';
import type { Charge } from './work.js';
import { sortedStrings } from './work.js';
import type { FactCollector } from '../trace/facts.js';

export interface Qualification { readonly matched: boolean; readonly groups: ReadonlySet<string> }

/** Failed branches discard their positive groups; NOT never supplies groups. */
export function* evaluate(node: CompiledNode, doc: DocumentEntry, expansions: ReadonlyMap<string, ExpandedGroup>, charge: Charge, facts?: FactCollector, path = 'query'): Generator<WorkStep, Qualification> {
  yield charge(1);
  let matched = false;
  let groups = new Set<string>();
  switch (node.kind) {
    case 'group':
      yield charge(doc.id.length + node.group.key.length + 1);
      matched = expansions.get(node.group.key)!.ids.has(doc.id);
      if (matched) { yield charge(node.group.key.length + 1); groups.add(node.group.key); }
      break;
    case 'all': matched = true; break;
    case 'none': break;
    case 'eq': {
      yield charge(node.field.length + 1);
      if (Object.hasOwn(doc.metadata, node.field)) {
        const value = doc.metadata[node.field];
        const values = Array.isArray(value) ? value : [value];
        for (const scalar of values) {
          yield charge(typeof scalar === 'string' && typeof node.value === 'string' ? Math.max(scalar.length, node.value.length) + 1 : 1);
          if (scalar === node.value) { matched = true; break; }
        }
      }
      break;
    }
    case 'not': matched = !(yield* evaluate(node.child, doc, expansions, charge, facts, facts ? `${path}.child` : '')).matched; break;
    case 'and': case 'or': {
      matched = node.kind === 'and';
      for (let i = 0; i < node.children.length; i++) {
        const child = yield* evaluate(node.children[i]!, doc, expansions, charge, facts, facts ? `${path}.children[${i}]` : '');
        matched = node.kind === 'and' ? matched && child.matched : matched || child.matched;
        if (child.matched) for (const key of child.groups) { yield charge(key.length + 1); groups.add(key); }
      }
      if (!matched) groups = new Set<string>();
      break;
    }
  }
  if (facts) {
    const keys = Object.freeze(yield* sortedStrings(groups, charge));
    yield charge(1); facts.record({ kind: 'node', id: doc.id, path, node: node.kind, matched, groups: keys });
  }
  return { matched, groups };
}
