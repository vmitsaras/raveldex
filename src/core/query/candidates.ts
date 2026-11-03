import { bucketOf, directoryEntries, directoryGet } from '../index/directory.js';
import type { WorkStep } from '../index/directory.js';
import type { DocumentEntry, IndexRoot } from '../index/state.js';
import type { ExpandedGroup } from '../retrieval/expand.js';
import type { CompiledNode } from './compile.js';
import type { Charge } from './work.js';

/** Undefined denotes the universe, never an empty result. Posting sets are
 * borrowed read-only: evaluation and explicit traces still need every group. */
export type CandidateBound = ReadonlySet<string> | undefined;

function* hasRecordChecks(node: CompiledNode, charge: Charge): Generator<WorkStep, boolean> {
  yield charge(1);
  if (node.kind === 'predicate' || node.kind === 'extension') return true;
  if (node.kind === 'not') return yield* hasRecordChecks(node.child, charge);
  if (node.kind === 'and' || node.kind === 'or') {
    for (const child of node.children) if (yield* hasRecordChecks(child, charge)) return true;
  }
  return false;
}

function* intersect(bounds: readonly CandidateBound[], charge: Charge): Generator<WorkStep, CandidateBound> {
  let smallest: CandidateBound;
  for (const bound of bounds) {
    yield charge(1);
    if (bound && (!smallest || bound.size < smallest.size)) smallest = bound;
  }
  if (!smallest || bounds.every(bound => !bound || bound === smallest)) return smallest;
  const result = new Set<string>();
  for (const id of smallest) {
    yield charge(id.length + 1);
    let included = true;
    for (const bound of bounds) {
      yield charge(1);
      if (bound && !bound.has(id)) { included = false; break; }
    }
    if (included) result.add(id);
  }
  return result;
}

/** Complete upper bounds only. All lexical expansion and capability preparation
 * precede this pass. Opaque tests and compound refinements retain their original
 * per-record checks, including those outside the final root membership. */
export function* candidateBound(node: CompiledNode, expansions: ReadonlyMap<string, ExpandedGroup>, charge: Charge): Generator<WorkStep, CandidateBound> {
  if (node.kind !== 'extension' && (yield* hasRecordChecks(node, charge))) return undefined;
  function* visit(node: CompiledNode): Generator<WorkStep, CandidateBound> {
    yield charge(1);
    switch (node.kind) {
      case 'group': return expansions.get(node.group.key)!.ids;
      case 'extension': return node.terms.length ? yield* intersect(node.groups.map(group => expansions.get(group.key)!.ids), charge) : new Set<string>();
      case 'none': return new Set<string>();
      case 'all': case 'eq': case 'predicate': case 'not': return undefined;
      case 'and': case 'or': {
        const bounds: CandidateBound[] = [];
        for (const child of node.children) bounds.push(yield* visit(child));
        if (node.kind === 'and') return yield* intersect(bounds, charge);
        if (bounds.some(bound => !bound)) return undefined;
        if (bounds.every(bound => bound === bounds[0])) return bounds[0];
        const result = new Set<string>();
        for (const bound of bounds) for (const id of bound!) { yield charge(id.length + 1); result.add(id); }
        return result;
      }
    }
  }
  return yield* visit(node);
}

/** Preserve native bucket/key order for aggregation callbacks and trace facts.
 * Sparse bounds inspect keys only in touched buckets; they never sort the corpus
 * or allocate a retained reverse order index. Explicit trace-only records join
 * this traversal, but do not become query candidates or contribute to results. */
export function* candidateDocuments(root: IndexRoot, bound: CandidateBound, selected: ReadonlySet<string>, charge: Charge): Generator<WorkStep, Generator<readonly [string, DocumentEntry]>> {
  if (!bound || bound.size === root.documents.size) return directoryEntries(root.documents);
  const buckets = new Set<string>();
  for (const ids of [bound, selected]) for (const id of ids) {
    yield charge(id.length + 1); buckets.add(bucketOf(id));
  }
  const ordered: string[] = [];
  if (buckets.size) for (const slot of Object.keys(root.documents.buckets)) {
    yield charge(1);
    if (!buckets.has(slot)) continue;
    const bucket = root.documents.buckets[slot]!;
    for (const id of Object.keys(bucket)) {
      yield charge(id.length + 1);
      if (bound.has(id) || selected.has(id)) ordered.push(id);
    }
  }
  function* entries(): Generator<readonly [string, DocumentEntry]> {
    // The consuming evaluation loop charges each ID lookup before using it.
    for (const id of ordered) yield [id, directoryGet(root.documents, id)!] as const;
  }
  return entries();
}
