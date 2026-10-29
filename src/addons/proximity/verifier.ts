import type { PreparedRefinement, RefinementContext } from '../../core/capabilities/types.js';
import { bound, invalid } from '../../core/errors/error.js';
import type { WorkStep } from '../../core/index/directory.js';
import type { PositionOccurrence } from '../positions/store.js';
import { preparePositionFieldWith } from '../positions/verifier.js';

const rawCharge = (workUnits: number): WorkStep => ({ workUnits });

/** Bounded k-way union. Repeated alternative occurrences share one endpoint. */
function* union(lists: readonly (readonly PositionOccurrence[])[]): Generator<WorkStep, number[]> {
  const cursors = lists.map(() => 0), positions: number[] = [];
  for (;;) {
    let next = Infinity;
    for (let i = 0; i < lists.length; i++) {
      yield rawCharge(1);
      const occurrence = lists[i]![cursors[i]!];
      if (occurrence && occurrence.position < next) next = occurrence.position;
    }
    if (next === Infinity) return positions;
    yield rawCharge(1); positions.push(next);
    for (let i = 0; i < lists.length; i++) {
      yield rawCharge(1);
      if (lists[i]![cursors[i]!]?.position === next) cursors[i] = cursors[i]! + 1;
    }
  }
}

/** Keep every reachable endpoint: an earlier endpoint can be too far from the
 * next group even when a later endpoint completes a valid bounded-gap path. */
function* ordered(lists: readonly (readonly PositionOccurrence[])[], sizes: readonly number[], maxGap: number): Generator<WorkStep, boolean> {
  let offset = 0, reachable: number[] = [];
  for (let group = 0; group < sizes.length; group++) {
    yield rawCharge(sizes[group]! + 1);
    const current = yield* union(lists.slice(offset, offset + sizes[group]!)); offset += sizes[group]!;
    if (group === 0) { reachable = current; continue; }
    const next: number[] = []; let prior = 0;
    for (const position of current) {
      yield rawCharge(1);
      while (prior < reachable.length && reachable[prior]! < position - maxGap - 1) { yield rawCharge(1); prior++; }
      yield rawCharge(1);
      if (prior < reachable.length && reachable[prior]! < position) next.push(position);
    }
    reachable = next;
  }
  return reachable.length > 0;
}

export function* prepareProximity(context: RefinementContext, enabledFields: readonly string[]): Generator<WorkStep, PreparedRefinement> {
  const groups = context.groups, maxGap = context.maxGap;
  if (!Array.isArray(groups) || !groups.length || !Number.isSafeInteger(maxGap) || maxGap! < 0 || maxGap! > 32) invalid('INCOMPATIBLE_CAPABILITY', 'proximity.context');
  bound(groups.length, 32, 'proximity.groups');
  const terms: string[] = [], sizes: number[] = [];
  for (const group of groups) {
    yield rawCharge(1);
    if (!Array.isArray(group) || !group.length || group.some(term => typeof term !== 'string' || !term.length)) invalid('INCOMPATIBLE_CAPABILITY', 'proximity.groups');
    bound(group.length, Math.min(16, context.limits.maxVariantsPerGroup), 'proximity.alternatives');
    for (const term of group) { yield rawCharge(term.length + 1); terms.push(term); }
    sizes.push(group.length);
  }
  bound(terms.length, context.limits.maxQueryTokens, 'proximity.tokens');
  const prepared: PreparedRefinement[] = [];
  for (const field of context.fields) {
    yield rawCharge(field.length + enabledFields.length + 1);
    if (!enabledFields.includes(field)) invalid('MISSING_CAPABILITY', 'proximity.fields');
    prepared.push(yield* preparePositionFieldWith(context, field, terms, lists => ordered(lists, sizes, maxGap!)));
  }
  return Object.freeze({
    *test(id: string): Generator<WorkStep, boolean> {
      let matched = false;
      // Every selected provider remains authoritative even after another match.
      for (const field of prepared) if (yield* field.test(id)) matched = true;
      return matched;
    },
  });
}
