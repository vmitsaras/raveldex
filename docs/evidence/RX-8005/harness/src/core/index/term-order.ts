import type { WorkStep } from './directory.js';
import { compareStrings } from '../query/work.js';
import type { Charge } from '../query/work.js';

/** Immutable AVL key index: one node per live field term, no query cache. */
export interface TermOrder {
  readonly key: string;
  readonly height: number;
  readonly left: TermOrder | null;
  readonly right: TermOrder | null;
}
const height = (node: TermOrder | null): number => node?.height ?? 0;
function* node(key: string, left: TermOrder | null, right: TermOrder | null, charge: Charge): Generator<WorkStep, TermOrder> {
  yield charge(1);
  return Object.freeze({ key, height: 1 + Math.max(height(left), height(right)), left, right });
}
function* balanced(key: string, left: TermOrder | null, right: TermOrder | null, charge: Charge): Generator<WorkStep, TermOrder> {
  if (height(left) - height(right) > 1) {
    const l = left!;
    if (height(l.left) >= height(l.right)) return yield* node(l.key, l.left, yield* node(key, l.right, right, charge), charge);
    const middle = l.right!;
    return yield* node(middle.key, yield* node(l.key, l.left, middle.left, charge), yield* node(key, middle.right, right, charge), charge);
  }
  if (height(right) - height(left) > 1) {
    const r = right!;
    if (height(r.right) >= height(r.left)) return yield* node(r.key, yield* node(key, left, r.left, charge), r.right, charge);
    const middle = r.left!;
    return yield* node(middle.key, yield* node(key, left, middle.left, charge), yield* node(r.key, middle.right, r.right, charge), charge);
  }
  return yield* node(key, left, right, charge);
}
/** Path copying is local to the staged root. No published node is mutated. */
export function* updateTermOrder(root: TermOrder | null, key: string, present: boolean, charge: Charge): Generator<WorkStep, TermOrder | null> {
  if (!root) return present ? yield* node(key, null, null, charge) : null;
  const comparison = yield* compareStrings(key, root.key, charge);
  if (!comparison) {
    if (present) return root;
    if (!root.left) return root.right;
    if (!root.right) return root.left;
    let next = root.right;
    while (next.left) { yield charge(1); next = next.left; }
    return yield* balanced(next.key, root.left, yield* updateTermOrder(root.right, next.key, false, charge), charge);
  }
  if (comparison < 0) {
    const left = yield* updateTermOrder(root.left, key, present, charge);
    return left === root.left ? root : yield* balanced(root.key, left, root.right, charge);
  }
  const right = yield* updateTermOrder(root.right, key, present, charge);
  return right === root.right ? root : yield* balanced(root.key, root.left, right, charge);
}

/** Seek lower bound, then matching successors. Comparisons charge UTF-16 work.
 * Stop after headroom+1 matches: callers preserve legacy traversal if expansion
 * limits could make encounter order observable. No unbounded query side cache. */
export function* prefixTerms(root: TermOrder | null, prefix: string, headroom: number, charge: Charge, checkpoint?: () => void): Generator<WorkStep, { keys: string[]; overflow: boolean }> {
  const stack: TermOrder[] = [], keys: string[] = [];
  let current = root;
  while (current) {
    checkpoint?.(); yield charge(1);
    if ((yield* compareStrings(current.key, prefix, charge)) >= 0) { stack.push(current); current = current.left; }
    else current = current.right;
  }
  while (stack.length) {
    const next = stack.pop()!;
    checkpoint?.(); yield charge(1);
    let matches = next.key.length >= prefix.length;
    for (let i = 0; matches && i < prefix.length; i++) { yield charge(1); matches = next.key.charCodeAt(i) === prefix.charCodeAt(i); }
    if (!matches) break;
    keys.push(next.key);
    if (keys.length > headroom) return { keys, overflow: true };
    current = next.right;
    while (current) { checkpoint?.(); yield charge(1); stack.push(current); current = current.left; }
  }
  return { keys, overflow: false };
}
