import assert from 'node:assert/strict';
import { captureConfiguration } from '../../../dist/core/contracts/schema.js';
import { initializeParticipants } from '../../../dist/core/capabilities/participants.js';
import { emptyRoot, ExecutionOwner } from '../../../dist/core/execution/engine.js';
import { createSourceProvider, createSourcePhrases } from '../../../dist/addons/phrases/index.js';
import { createPhrases } from '../../../dist/addons/phrases/mixed.js';
import { createPositionProvider } from '../../../dist/addons/positions/index.js';
import { createPositionPhrases } from '../../../dist/addons/positions/phrases.js';
import { FakeHost } from '../../fixtures/execution/host.mjs';
import { directoryEntries, directoryGet } from '../../../dist/core/index/directory.js';
import { inspectIndex } from '../../../dist/core/index/invariants.js';
import { originalSourceTokens } from '../../oracle/query.mjs';
import { drain } from '../phrases/helpers.mjs';
export { compare, drain, extension, nativeQuery } from '../phrases/helpers.mjs';

export function addonsFor(schema, strategy, offsets = []) {
  const fields = Object.keys(schema.text);
  if (strategy === 'core') return [];
  if (strategy === 'source') return [createSourceProvider({ fields }), createSourcePhrases({ fields })];
  if (strategy === 'positions') return [createPositionProvider({ fields, offsets }), createPositionPhrases({ fields })];
  if (strategy === 'mixed') {
    const source = fields.filter((_, index) => index % 2 === 0), positions = fields.filter((_, index) => index % 2 === 1);
    return [
      ...(source.length ? [createSourceProvider({ fields: source })] : []),
      ...(positions.length ? [createPositionProvider({ fields: positions, offsets: offsets.filter(field => positions.includes(field)) })] : []),
      createPhrases({ fields: Object.fromEntries(fields.map(field => [field, source.includes(field) ? 'source' : 'positions'])) }),
    ];
  }
  throw new Error('Unknown test representation');
}

export function setup(schema, options = {}, strategy = 'positions') {
  const host = new FakeHost();
  const configuration = captureConfiguration({ schema, addons: addonsFor(schema, strategy), ...options });
  const installed = initializeParticipants(configuration);
  const engine = new ExecutionOwner(emptyRoot(configuration, installed.states), host, installed.participants);
  return { engine, host, async call(method, ...args) { const promise = engine[method](...args); host.runReady(); return promise; } };
}

export function coherent(root, records, fields = Object.keys(root.configuration.schema.text), offsets = [], id = 'positions') {
  drain(inspectIndex(root));
  const state = root.participants[id];
  assert.equal(state.revision, root.revision); assert.deepEqual(state.analyzer, root.configuration.analyzer);
  assert.deepEqual(state.fields, fields); assert.deepEqual(state.offsetFields, offsets);
  assert.ok(Object.isFrozen(state) && Object.isFrozen(state.records) && Object.isFrozen(state.records.buckets));
  assert.deepEqual([...directoryEntries(state.records)].map(([id]) => id).sort(), records.map(record => record.id).sort());
  let retainedEntries = 0, occurrenceCount = 0, offsetCount = 0, termEntries = 0, termCodeUnits = 0;
  for (const input of records) {
    const retained = directoryGet(state.records, input.id);
    assert.ok(Object.isFrozen(retained) && Object.isFrozen(retained.positions));
    assert.deepEqual(Object.keys(retained).sort(), ['occurrenceCount', 'offsetCount', 'positions', 'retainedEntries', 'termCodeUnits', 'termEntries']);
    let entries = 1, occurrences = 0, spanCount = 0, terms = 0, units = 0;
    for (const field of fields) {
      if (!Object.hasOwn(input.text, field)) { assert.equal(Object.hasOwn(retained.positions, field), false); continue; }
      const values = typeof input.text[field] === 'string' ? [input.text[field]] : input.text[field], actualValues = retained.positions[field];
      assert.equal(actualValues.length, values.length); assert.ok(Object.isFrozen(actualValues)); entries++;
      for (let valueIndex = 0; valueIndex < values.length; valueIndex++) {
        const actual = actualValues[valueIndex], expectedTokens = originalSourceTokens(values[valueIndex]);
        assert.ok(Object.isFrozen(actual) && Object.isFrozen(actual.terms)); assert.equal(actual.tokenCount, expectedTokens.length); entries++;
        assert.deepEqual(Object.keys(actual).sort(), ['terms', 'tokenCount']);
        const expected = Object.create(null);
        expectedTokens.forEach((token, position) => (expected[token.term] ??= []).push({ position, positionLength: 1, ...(offsets.includes(field) ? { start: token.start, end: token.end } : {}) }));
        assert.deepEqual(actual.terms, expected);
        for (const [term, list] of Object.entries(actual.terms)) {
          assert.ok(Object.isFrozen(list)); terms++; units += term.length; entries++;
          for (const occurrence of list) {
            assert.ok(Object.isFrozen(occurrence)); occurrences++; entries++;
            if (offsets.includes(field)) { spanCount++; entries += 2; }
            else { assert.equal(Object.hasOwn(occurrence, 'start'), false); assert.equal(Object.hasOwn(occurrence, 'end'), false); }
          }
        }
      }
    }
    assert.deepEqual(Object.keys(retained.positions).sort(), fields.filter(field => Object.hasOwn(input.text, field)).sort());
    assert.equal(retained.retainedEntries, entries); assert.equal(retained.occurrenceCount, occurrences); assert.equal(retained.offsetCount, spanCount); assert.equal(retained.termEntries, terms); assert.equal(retained.termCodeUnits, units);
    retainedEntries += entries; occurrenceCount += occurrences; offsetCount += spanCount; termEntries += terms; termCodeUnits += units;
  }
  assert.equal(state.retainedEntries, retainedEntries); assert.equal(state.occurrenceCount, occurrenceCount); assert.equal(state.offsetCount, offsetCount); assert.equal(state.termEntries, termEntries); assert.equal(state.termCodeUnits, termCodeUnits);
}
