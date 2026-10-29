import { analyzeValue } from '../../core/analyzer/basic.js';
import type { Token } from '../../core/analyzer/basic.js';
import type { AnalysisRunner } from '../../core/analyzer/selected.js';
import { Admission, has, keysOnly, ownObject, scanUnicode } from '../../core/contracts/data.js';
import { invalid } from '../../core/errors/error.js';
import { directoryGet } from '../../core/index/directory.js';
import type { WorkStep } from '../../core/index/directory.js';
import type { Limits } from '../../core/limits/limits.js';
import type { SourceRoot } from '../phrases/store.js';
import { taggedPositionTokens } from '../positions/tagged.js';
import type { PositionRoot } from '../positions/store.js';

const charge = (workUnits = 1): WorkStep => ({ workUnits });
const count = (value: unknown, maximum: number): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= maximum;

/** Provider state is trusted immutable data. Small descriptor captures still reject
 * accessors without calling them; large occurrence arrays resume per entry. */
function object(input: unknown, maximum: number, path: string, nullPrototype = false): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || !Object.isFrozen(input) || nullPrototype && Object.getPrototypeOf(input) !== null) invalid('INCOMPATIBLE_CAPABILITY', path);
  if (Reflect.ownKeys(input).length > maximum) invalid('INCOMPATIBLE_CAPABILITY', path);
  return ownObject(input, 'INCOMPATIBLE_CAPABILITY', path, new Admission(maximum));
}
function* array(input: unknown, maximum: number, path: string): Generator<WorkStep, readonly unknown[]> {
  if (!Array.isArray(input) || !Object.isFrozen(input) || !count(input.length, maximum)) invalid('INCOMPATIBLE_CAPABILITY', path);
  const prototype: unknown = Object.getPrototypeOf(input);
  if (prototype !== Array.prototype && prototype !== null) invalid('INCOMPATIBLE_CAPABILITY', path);
  const keys = Reflect.ownKeys(input);
  yield charge(keys.length + 1);
  if (keys.length !== input.length + 1) invalid('INCOMPATIBLE_CAPABILITY', path);
  for (const key of keys) {
    yield charge();
    if (key !== 'length' && (typeof key !== 'string' || !/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= input.length)) invalid('INCOMPATIBLE_CAPABILITY', path);
  }
  const values: unknown[] = [];
  for (let index = 0; index < input.length; index++) {
    yield charge();
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
    if (!descriptor || !('value' in descriptor)) invalid('INCOMPATIBLE_CAPABILITY', path);
    values.push(descriptor.value);
  }
  return values;
}

export type ValueTokens = readonly (readonly Token[])[];

/** Complete reanalysis of selected originals, with positions local to each value. */
export function* sourceTokens(root: SourceRoot, id: string, field: string, limits: Limits, analyze: AnalysisRunner = analyzeValue): Generator<WorkStep, ValueTokens> {
  yield charge(id.length + field.length + 1);
  const record = directoryGet(root.records, id);
  if (!record) invalid('MISSING_CAPABILITY', 'evidence.source.record');
  const data = object(record, 3, 'evidence.source.record');
  keysOnly(data, ['text', 'retainedEntries', 'textCodeUnits'], 'INCOMPATIBLE_CAPABILITY', 'evidence.source.record');
  if (!count(data.retainedEntries, root.maxRetainedEntries) || !count(data.textCodeUnits, limits.maxTextCodeUnitsPerRecord)) invalid('INCOMPATIBLE_CAPABILITY', 'evidence.source.record');
  const text = object(data.text, limits.maxTextFields, 'evidence.source.text');
  for (const name of Object.keys(text)) {
    yield charge(name.length + 1);
    if (!root.fields.includes(name)) invalid('INCOMPATIBLE_CAPABILITY', 'evidence.source.fields');
  }
  if (!has(text, field)) return Object.freeze([]);
  const values = yield* array(text[field], limits.maxTextValuesPerField, 'evidence.source.values');
  const output: (readonly Token[])[] = [];
  let tokenCount = 0;
  for (let valueIndex = 0; valueIndex < values.length; valueIndex++) {
    const value = values[valueIndex];
    yield charge();
    if (typeof value !== 'string' || value.length > limits.maxTextCodeUnitsPerValue) invalid('INCOMPATIBLE_CAPABILITY', 'evidence.source.value');
    const tokens: Token[] = [];
    for (const step of analyze(value, valueIndex, limits, 'INCOMPATIBLE_CAPABILITY')) {
      yield charge(step.workUnits);
      if (step.token) {
        if (++tokenCount > limits.maxTokensPerRecord) invalid('INCOMPATIBLE_CAPABILITY', 'evidence.source.tokens');
        tokens.push(step.token);
      }
    }
    yield charge(tokens.length + 1); output.push(Object.freeze(tokens));
  }
  return Object.freeze(output);
}

/** Reconstruct each dense analyzed value from complete ordered stored occurrences.
 * Every term/list is validated, including values that provide no query match. */
export function* offsetTokens(root: PositionRoot, id: string, field: string, limits: Limits): Generator<WorkStep, ValueTokens> {
  yield charge(id.length + field.length + 1);
  const record = directoryGet(root.records, id);
  if (!record) invalid('MISSING_CAPABILITY', 'evidence.offsets.record');
  const data = object(record, 6, 'evidence.offsets.record');
  keysOnly(data, ['positions', 'retainedEntries', 'occurrenceCount', 'offsetCount', 'termEntries', 'termCodeUnits'], 'INCOMPATIBLE_CAPABILITY', 'evidence.offsets.record');
  if (!count(data.retainedEntries, root.maxRetainedEntries) || !count(data.occurrenceCount, limits.maxTokensPerRecord) ||
      !count(data.offsetCount, data.occurrenceCount) || !count(data.termEntries, data.occurrenceCount) ||
      !count(data.termCodeUnits, limits.maxTokensPerRecord * limits.maxTermCodeUnits)) invalid('INCOMPATIBLE_CAPABILITY', 'evidence.offsets.record');
  const fields = object(data.positions, limits.maxTextFields, 'evidence.offsets.fields', true);
  for (const name of Object.keys(fields)) {
    yield charge(name.length + 1);
    if (!root.fields.includes(name)) invalid('INCOMPATIBLE_CAPABILITY', 'evidence.offsets.fields');
  }
  if (!has(fields, field)) return Object.freeze([]);
  const values = yield* array(fields[field], limits.maxTextValuesPerField, 'evidence.offsets.values');
  const output: (readonly Token[])[] = [];
  let fieldCount = 0;
  if (root.kind === 'raveldex-positions-v2') {
    for (let valueIndex = 0; valueIndex < values.length; valueIndex++) {
      const tokens = yield* taggedPositionTokens(values[valueIndex] as import('../positions/store.js').PositionValue, true, limits);
      fieldCount += tokens.length;
      if (fieldCount > data.occurrenceCount || fieldCount > data.offsetCount) invalid('INCOMPATIBLE_CAPABILITY', 'evidence.offsets.counts');
      const originals = new Map<number, Token>(), result: Token[] = [];
      for (const token of tokens) {
        yield charge(token.term.length + 1);
        const original = originals.get(token.position);
        if (token.kind === 'component' && !original) invalid('INCOMPATIBLE_CAPABILITY', 'evidence.offsets.original');
        const value: Token = Object.freeze({ term: token.term, valueIndex, position: token.position, start: token.start!, end: token.end!, kind: token.kind,
          ...(token.kind === 'component' ? { original: Object.freeze({ term: original!.term, start: original!.start, end: original!.end }) } : {}) });
        if (token.kind === 'original') originals.set(token.position, value);
        result.push(value);
      }
      output.push(Object.freeze(result));
    }
    return Object.freeze(output);
  }
  for (let valueIndex = 0; valueIndex < values.length; valueIndex++) {
    yield charge();
    const value = object(values[valueIndex], 2, 'evidence.offsets.value');
    keysOnly(value, ['tokenCount', 'terms'], 'INCOMPATIBLE_CAPABILITY', 'evidence.offsets.value');
    if (!count(value.tokenCount, limits.maxTokensPerRecord)) invalid('INCOMPATIBLE_CAPABILITY', 'evidence.offsets.tokens');
    const tokenCount = value.tokenCount;
    fieldCount += tokenCount;
    if (fieldCount > data.occurrenceCount || fieldCount > data.offsetCount) invalid('INCOMPATIBLE_CAPABILITY', 'evidence.offsets.counts');
    if (typeof value.terms !== 'object' || value.terms === null || !Object.isFrozen(value.terms) || Object.getPrototypeOf(value.terms) !== null) invalid('INCOMPATIBLE_CAPABILITY', 'evidence.offsets.terms');
    const keys = Reflect.ownKeys(value.terms);
    yield charge(keys.length + 1);
    if (keys.length > tokenCount) invalid('INCOMPATIBLE_CAPABILITY', 'evidence.offsets.terms');
    const tokens: Token[] = [];
    let occurrenceCount = 0;
    for (const term of keys) {
      yield charge();
      if (typeof term !== 'string' || !term.length || term.length > limits.maxTermCodeUnits) invalid('INCOMPATIBLE_CAPABILITY', 'evidence.offsets.term');
      yield* scanUnicode(term, 'INCOMPATIBLE_CAPABILITY', 'evidence.offsets.term');
      const descriptor = Object.getOwnPropertyDescriptor(value.terms, term);
      if (!descriptor || !('value' in descriptor)) invalid('INCOMPATIBLE_CAPABILITY', 'evidence.offsets.terms');
      const occurrences = yield* array(descriptor.value, tokenCount, 'evidence.offsets.occurrences');
      if (!occurrences.length) invalid('INCOMPATIBLE_CAPABILITY', 'evidence.offsets.occurrences');
      let last = -1;
      for (const input of occurrences) {
        yield charge(5);
        const occurrence = object(input, 4, 'evidence.offsets.occurrence');
        keysOnly(occurrence, ['position', 'positionLength', 'start', 'end'], 'INCOMPATIBLE_CAPABILITY', 'evidence.offsets.occurrence');
        const { position, start, end } = occurrence;
        if (!count(position, tokenCount - 1) || position <= last || occurrence.positionLength !== 1 ||
            !count(start, limits.maxTextCodeUnitsPerValue) || !count(end, limits.maxTextCodeUnitsPerValue) ||
            end <= start || end - start > limits.maxRawTokenCodeUnits || has(tokens, position)) invalid('INCOMPATIBLE_CAPABILITY', 'evidence.offsets.occurrence');
        tokens[position] = Object.freeze({ term, valueIndex, position, start, end });
        last = position; occurrenceCount++;
        if (occurrenceCount > tokenCount) invalid('INCOMPATIBLE_CAPABILITY', 'evidence.offsets.counts');
      }
    }
    if (occurrenceCount !== tokenCount) invalid('INCOMPATIBLE_CAPABILITY', 'evidence.offsets.counts');
    let previousEnd = 0;
    for (let position = 0; position < tokenCount; position++) {
      yield charge();
      const token = tokens[position];
      if (!token || token.start < previousEnd) invalid('INCOMPATIBLE_CAPABILITY', 'evidence.offsets.order');
      previousEnd = token.end;
    }
    yield charge(tokens.length + 1); output.push(Object.freeze(tokens));
  }
  return Object.freeze(output);
}
