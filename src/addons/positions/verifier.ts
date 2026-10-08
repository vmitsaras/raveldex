import { BASIC_ANALYZER } from '../../core/analyzer/basic.js';
import type { PreparedRefinement, RefinementContext } from '../../core/capabilities/types.js';
import { has } from '../../core/contracts/data.js';
import { invalid } from '../../core/errors/error.js';
import { directoryGet } from '../../core/index/directory.js';
import type { WorkStep } from '../../core/index/directory.js';
import { requirePositionRoot } from './store.js';
import type { PositionOccurrence, PositionValue } from './store.js';

const rawCharge = (workUnits: number): WorkStep => ({ workUnits });
const finiteCount = (value: number): boolean => Number.isSafeInteger(value) && value >= 0;

function* requireOccurrences(value: PositionValue, term: string, offsets: boolean, maximumSpan: number): Generator<WorkStep, readonly PositionOccurrence[]> {
  yield rawCharge(term.length + 1);
  if (!has(value.terms, term)) return Object.freeze([] as PositionOccurrence[]);
  const occurrences = value.terms[term]!;
  if (!Array.isArray(occurrences) || !Object.isFrozen(occurrences) || !occurrences.length || occurrences.length > value.tokenCount) invalid('INCOMPATIBLE_CAPABILITY', 'phrases.positions.occurrences');
  let last = -1;
  for (const occurrence of occurrences) {
    yield rawCharge(offsets ? 5 : 3);
    if (typeof occurrence !== 'object' || occurrence === null || !Object.isFrozen(occurrence) ||
        !finiteCount(occurrence.position) || occurrence.position >= value.tokenCount || occurrence.position <= last ||
        occurrence.positionLength !== 1 ||
        Object.keys(occurrence).some(key => key !== 'position' && key !== 'positionLength' && key !== 'start' && key !== 'end')) invalid('INCOMPATIBLE_CAPABILITY', 'phrases.positions.occurrence');
    if (offsets) {
      if (!has(occurrence, 'start') || !has(occurrence, 'end') || !finiteCount(occurrence.start!) || !finiteCount(occurrence.end!) ||
          occurrence.end! <= occurrence.start! || occurrence.end! > maximumSpan) invalid('INCOMPATIBLE_CAPABILITY', 'phrases.positions.offsets');
    } else if (has(occurrence, 'start') || has(occurrence, 'end')) invalid('INCOMPATIBLE_CAPABILITY', 'phrases.positions.offsets');
    last = occurrence.position;
  }
  return occurrences;
}

/** Intersect sorted positions after subtracting each ordered query offset.
 * Repeated terms reuse their occurrence arrays but keep distinct query offsets. */
function* intersectOffsets(lists: readonly (readonly PositionOccurrence[])[]): Generator<WorkStep, boolean> {
  if (!lists.length || lists.some(list => !list.length)) return false;
  const cursors = lists.map(() => 0);
  for (const start of lists[0]!) {
    yield rawCharge(1);
    let matched = true;
    for (let offset = 1; offset < lists.length; offset++) {
      const list = lists[offset]!, target = start.position + offset;
      let cursor = cursors[offset]!;
      while (cursor < list.length) {
        yield rawCharge(1);
        if (list[cursor]!.position >= target) break;
        cursor++;
      }
      cursors[offset] = cursor;
      yield rawCharge(1);
      if (cursor === list.length || list[cursor]!.position !== target) matched = false;
    }
    if (matched) return true;
  }
  return false;
}

/** One selected field, usable by a mixed-strategy registration. Headers are
 * checked during preparation even if the lexical candidate set will be empty. */
export function* preparePositionField(context: RefinementContext, field: string): Generator<WorkStep, PreparedRefinement> {
  if (context.analyzer.id !== BASIC_ANALYZER.id) invalid('INCOMPATIBLE_CAPABILITY', 'phrases.positions.analyzer');
  yield rawCharge(field.length + 1);
  const root = requirePositionRoot(context.state(`positions:${field}`), field, context.revision, context.analyzer);
  yield rawCharge(root.fields.length + root.offsetFields.length + 1);
  const offsets = root.offsetFields.includes(field), terms = context.terms;
  return Object.freeze({
    *test(id: string): Generator<WorkStep, boolean> {
      yield rawCharge(id.length + 1);
      const record = directoryGet(root.records, id);
      if (!record) invalid('MISSING_CAPABILITY', 'phrases.positions.record');
      if (!Object.isFrozen(record) || typeof record.positions !== 'object' || record.positions === null ||
          !Object.isFrozen(record.positions) || Object.getPrototypeOf(record.positions) !== null ||
          !finiteCount(record.retainedEntries) || !finiteCount(record.occurrenceCount) || record.occurrenceCount > root.limits.maxTokensPerRecord ||
          !finiteCount(record.offsetCount) || record.offsetCount > record.occurrenceCount ||
          !finiteCount(record.termEntries) || record.termEntries > record.occurrenceCount ||
          !finiteCount(record.termCodeUnits)) invalid('INCOMPATIBLE_CAPABILITY', 'phrases.positions.record');
      if (!has(record.positions, field)) return false;
      const values = record.positions[field]!;
      if (!Array.isArray(values) || !Object.isFrozen(values) || values.length > root.limits.maxTextValuesPerField) invalid('INCOMPATIBLE_CAPABILITY', 'phrases.positions.values');
      let matched = false;
      for (const value of values) {
        yield rawCharge(1);
        if (typeof value !== 'object' || value === null || !Object.isFrozen(value) || !finiteCount(value.tokenCount) ||
            value.tokenCount > root.limits.maxTokensPerRecord || typeof value.terms !== 'object' || value.terms === null ||
            !Object.isFrozen(value.terms) || Object.getPrototypeOf(value.terms) !== null) invalid('INCOMPATIBLE_CAPABILITY', 'phrases.positions.value');
        const byTerm = new Map<string, readonly PositionOccurrence[]>(), lists: (readonly PositionOccurrence[])[] = [];
        for (const term of terms) {
          yield rawCharge(term.length + 1);
          let list = byTerm.get(term);
          if (!list) { list = yield* requireOccurrences(value, term, offsets, root.limits.maxTextCodeUnitsPerValue); byTerm.set(term, list); }
          lists.push(list);
        }
        // Validate every selected value/query occurrence list before returning a
        // positive result; a later malformed value cannot be hidden by a match.
        if (yield* intersectOffsets(lists)) matched = true;
      }
      return matched;
    },
  });
}
