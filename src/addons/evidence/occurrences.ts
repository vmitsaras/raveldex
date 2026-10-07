import type { Token } from '../../core/analyzer/basic.js';
import { invalid } from '../../core/errors/error.js';
import type { WorkStep } from '../../core/index/directory.js';
import type { CanonicalGroup, CompiledNode } from '../../core/query/compile.js';
import type { Fact } from '../../core/trace/facts.js';

const charge = (workUnits = 1): WorkStep => ({ workUnits });
/** Equality work is local to the optional module; no query/runtime import. */
function* equal(a: string, b: string): Generator<WorkStep, boolean> {
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    yield charge();
    if (a.charCodeAt(index) !== b.charCodeAt(index)) return false;
  }
  yield charge(); return a.length === b.length;
}
export type NodeFact = Extract<Fact, { readonly kind: 'node' }>;
export type ContributingLeaf =
  | { readonly kind: 'group'; readonly group: CanonicalGroup }
  | { readonly kind: 'phrase'; readonly fields: readonly string[]; readonly terms: readonly string[] };

/** Use actual membership paths. Sharing a group with a failed phrase or AND
 * branch does not make that branch contribute presentation occurrences. */
export function* contributingLeaves(node: CompiledNode, facts: ReadonlyMap<string, NodeFact>, path = 'query'): Generator<WorkStep, readonly ContributingLeaf[]> {
  const output: ContributingLeaf[] = [];
  function* walk(node: CompiledNode, path: string): Generator<WorkStep> {
    yield charge(path.length + 1);
    const fact = facts.get(path);
    if (!fact || fact.node !== node.kind) invalid('INCOMPATIBLE_CAPABILITY', 'evidence.trace.node');
    if (!fact.matched || node.kind === 'not') return;
    if (node.kind === 'group') output.push({ kind: 'group', group: node.group });
    else if (node.kind === 'extension') {
      if (fact.capability !== node.capability) invalid('INCOMPATIBLE_CAPABILITY', 'evidence.trace.node');
      output.push({ kind: 'phrase', fields: node.fields, terms: node.terms });
    } else if (node.kind === 'and' || node.kind === 'or') for (let index = 0; index < node.children.length; index++) yield* walk(node.children[index]!, `${path}.children[${index}]`);
  }
  yield* walk(node, path);
  return output;
}

function* prefix(term: string, query: string): Generator<WorkStep, boolean> {
  yield charge();
  if (term.length < query.length) return false;
  for (let index = 0; index < query.length; index++) {
    yield charge();
    if (term.charCodeAt(index) !== query.charCodeAt(index)) return false;
  }
  return true;
}
export function* matchingGroup(tokens: readonly Token[], group: CanonicalGroup, mark: (position: number) => void): Generator<WorkStep> {
  for (const token of tokens) {
    yield charge();
    for (const variant of group.variants) {
      yield charge();
      const matches = variant.match === 'prefix' ? yield* prefix(token.term, variant.term) : yield* equal(token.term, variant.term);
      if (matches) { mark(token.position); break; }
    }
  }
}

/** KMP keeps repeats/order and enumerates overlapping complete sequences. */
export function* phraseTable(terms: readonly string[]): Generator<WorkStep, readonly number[]> {
  const failure: number[] = [];
  if (terms.length) { yield charge(); failure.push(0); }
  for (let index = 1; index < terms.length; index++) {
    let matched = failure[index - 1]!;
    for (;;) {
      if (yield* equal(terms[index]!, terms[matched]!)) { matched++; break; }
      if (!matched) break;
      yield charge(); matched = failure[matched - 1]!;
    }
    yield charge(); failure.push(matched);
  }
  return Object.freeze(failure);
}
export function* matchingPhrase(tokens: readonly Token[], terms: readonly string[], failure: readonly number[], mark: (position: number) => void): Generator<WorkStep> {
  if (!terms.length) return;
  let matched = 0;
  for (const token of tokens) {
    yield charge();
    for (;;) {
      if (yield* equal(token.term, terms[matched]!)) { matched++; break; }
      if (!matched) break;
      yield charge(); matched = failure[matched - 1]!;
    }
    if (matched === terms.length) {
      for (let offset = terms.length - 1; offset >= 0; offset--) { yield charge(); mark(token.position - offset); }
      matched = failure[matched - 1]!;
    }
  }
}
