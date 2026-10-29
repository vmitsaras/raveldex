import { has, keysOnly, scanUnicode } from '../../core/contracts/data.js';
import { invalid } from '../../core/errors/error.js';
import type { WorkStep } from '../../core/index/directory.js';
import type { Limits } from '../../core/limits/limits.js';
import type { PositionOccurrence, PositionValue } from './store.js';

export interface TaggedPositionToken extends PositionOccurrence { readonly term: string; readonly kind: 'original' | 'component' }
const charge = (workUnits = 1): WorkStep => ({ workUnits });
const count = (value: unknown, maximum: number): value is number => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= maximum;
function data(input: unknown, keys: readonly string[], nullPrototype = false): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || !Object.isFrozen(input) || Array.isArray(input) || nullPrototype && Object.getPrototypeOf(input) !== null) invalid('INCOMPATIBLE_CAPABILITY', 'positions.identifiers');
  const result = input as Record<string, unknown>;
  if (Reflect.ownKeys(result).length > keys.length) invalid('INCOMPATIBLE_CAPABILITY', 'positions.identifiers');
  for (const key of Reflect.ownKeys(result)) if (typeof key !== 'string' || !keys.includes(key) || !Object.hasOwn(Object.getOwnPropertyDescriptor(result, key)!, 'value')) invalid('INCOMPATIBLE_CAPABILITY', 'positions.identifiers');
  keysOnly(result, keys, 'INCOMPATIBLE_CAPABILITY', 'positions.identifiers'); return result;
}

/** The v2 tag is accepted only by an explicitly selected identifier owner. Every
 * ordinal has one complete original, plus distinct derived terms at that ordinal.
 * Offset-free state retains no original coordinate or source-string side data. */
export function* taggedPositionTokens(input: PositionValue, offsets: boolean, limits: Limits): Generator<WorkStep, readonly TaggedPositionToken[]> {
  const value = data(input, ['tokenCount', 'originalCount', 'terms']);
  if (!count(value.tokenCount, limits.maxTokensPerRecord) || !count(value.originalCount, value.tokenCount) || !has(value, 'terms')) invalid('INCOMPATIBLE_CAPABILITY', 'positions.identifiers.counts');
  const tokenCount = value.tokenCount, originalCount = value.originalCount;
  if (typeof value.terms !== 'object' || value.terms === null || !Object.isFrozen(value.terms) || Object.getPrototypeOf(value.terms) !== null) invalid('INCOMPATIBLE_CAPABILITY', 'positions.identifiers.terms');
  const terms = value.terms as Record<string, readonly PositionOccurrence[]>;
  const keys = Reflect.ownKeys(terms); yield charge(keys.length + 1);
  if (keys.length > tokenCount) invalid('INCOMPATIBLE_CAPABILITY', 'positions.identifiers.terms');
  const originals = new Map<number, TaggedPositionToken>(), byPosition = new Map<number, TaggedPositionToken[]>();
  let seen = 0;
  for (const term of keys) {
    if (typeof term !== 'string' || !term.length || term.length > limits.maxTermCodeUnits) invalid('INCOMPATIBLE_CAPABILITY', 'positions.identifiers.term');
    yield* scanUnicode(term, 'INCOMPATIBLE_CAPABILITY', 'positions.identifiers.term');
    yield charge(term.length * 2 + 1);
    if (term.normalize('NFKC').toLowerCase() !== term) invalid('INCOMPATIBLE_CAPABILITY', 'positions.identifiers.term');
    const descriptor = Object.getOwnPropertyDescriptor(terms, term);
    if (!descriptor || !('value' in descriptor)) invalid('INCOMPATIBLE_CAPABILITY', 'positions.identifiers.terms');
    const list: unknown = descriptor.value;
    if (!Array.isArray(list) || !Object.isFrozen(list) || !list.length || list.length > originalCount || Reflect.ownKeys(list).length !== list.length + 1) invalid('INCOMPATIBLE_CAPABILITY', 'positions.identifiers.occurrences');
    let last = -1;
    for (let index = 0; index < list.length; index++) {
      yield charge(7);
      const descriptor = Object.getOwnPropertyDescriptor(list, String(index));
      if (!descriptor || !('value' in descriptor)) invalid('INCOMPATIBLE_CAPABILITY', 'positions.identifiers.occurrences');
      const entry = data(descriptor.value, offsets ? ['position', 'positionLength', 'kind', 'start', 'end'] : ['position', 'positionLength', 'kind']);
      const { position, kind, start, end } = entry;
      if (!count(position, originalCount - 1) || position <= last || entry.positionLength !== 1 || kind !== 'original' && kind !== 'component') invalid('INCOMPATIBLE_CAPABILITY', 'positions.identifiers.occurrence');
      if (offsets && (!count(start, limits.maxTextCodeUnitsPerValue) || !count(end, limits.maxTextCodeUnitsPerValue) || end <= start || end - start > limits.maxRawTokenCodeUnits)) invalid('INCOMPATIBLE_CAPABILITY', 'positions.identifiers.offsets');
      const token: TaggedPositionToken = Object.freeze({ term, position, positionLength: 1, kind, ...(offsets ? { start: start as number, end: end as number } : {}) });
      if (kind === 'original') { if (originals.has(position)) invalid('INCOMPATIBLE_CAPABILITY', 'positions.identifiers.original'); originals.set(position, token); }
      const siblings = byPosition.get(position) ?? []; siblings.push(token); byPosition.set(position, siblings);
      last = position; if (++seen > tokenCount) invalid('INCOMPATIBLE_CAPABILITY', 'positions.identifiers.counts');
    }
  }
  if (seen !== tokenCount || originals.size !== originalCount) invalid('INCOMPATIBLE_CAPABILITY', 'positions.identifiers.counts');
  const output: TaggedPositionToken[] = []; let previousEnd = 0;
  for (let position = 0; position < originalCount; position++) {
    yield charge(); const original = originals.get(position);
    if (!original || offsets && original.start! < previousEnd) invalid('INCOMPATIBLE_CAPABILITY', 'positions.identifiers.order');
    if (offsets) previousEnd = original.end!;
    output.push(original);
    // Source-order the distinct components without an unmetered sorting loop.
    const sorted: TaggedPositionToken[] = [];
    for (const token of byPosition.get(position)!) {
      yield charge(); if (token.kind === 'original') continue;
      if (token.term === original.term || offsets && (token.start! < original.start! || token.end! > original.end!)) invalid('INCOMPATIBLE_CAPABILITY', 'positions.identifiers.component');
      let index = sorted.length;
      while (index > 0) {
        yield charge(token.term.length + sorted[index - 1]!.term.length + 1);
        const prior = sorted[index - 1]!;
        if (offsets ? prior.start! < token.start! || prior.start === token.start && prior.end! <= token.end! : prior.term <= token.term) break;
        index--;
      }
      sorted.splice(index, 0, token);
    }
    let componentEnd = original.start ?? 0;
    for (const token of sorted) {
      yield charge();
      if (offsets && (token.start! < componentEnd || token.start === original.start && token.end === original.end)) invalid('INCOMPATIBLE_CAPABILITY', 'positions.identifiers.component');
      if (offsets) componentEnd = token.end!;
      output.push(token);
    }
  }
  return Object.freeze(output);
}
