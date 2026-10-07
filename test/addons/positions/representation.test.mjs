import test from 'node:test';
import assert from 'node:assert/strict';
import { createPositionProvider } from '../../../dist/addons/positions/index.js';
import { createPositionPhrases } from '../../../dist/addons/positions/phrases.js';
import { createSourceProvider } from '../../../dist/addons/phrases/source.js';
import { directoryGet } from '../../../dist/core/index/directory.js';
import { originalPositionCases } from '../../fixtures/phrases/positions.mjs';
import { coherent, setup, extension } from './helpers.mjs';

const schema = { text: { title: {}, body: {}, ignored: {} }, metadata: { kind: { type: 'string' } } };

test('literal original UTF-16 spans and value-aware token positions survive every normalization case', async t => {
  const fixture = setup(schema, { addons: [createPositionProvider({ fields: ['title', 'body'], offsets: ['title'] }), createPositionPhrases({ fields: ['title', 'body'] })] });
  const records = originalPositionCases.map((row, index) => ({ id: `literal:${index}`, text: { title: row.values, body: row.values, ignored: 'DISPLAY-SOURCE-NOT-RETAINED' }, metadata: { kind: 'metadata-not-retained' } }));
  records.push({ id: 'missing-field', text: {} });
  await fixture.call('addMany', records);
  const state = fixture.engine.root.participants.positions;
  let assertedTokens = 0;
  for (let index = 0; index < originalPositionCases.length; index++) {
    const row = originalPositionCases[index], retained = directoryGet(state.records, `literal:${index}`);
    for (const field of ['title', 'body']) {
      const actual = [];
      retained.positions[field].forEach((value, valueIndex) => {
        for (const [term, occurrences] of Object.entries(value.terms)) for (const occurrence of occurrences) actual.push({ term, valueIndex, ...occurrence });
      });
      actual.sort((left, right) => left.valueIndex - right.valueIndex || left.position - right.position);
      const expected = row.tokens.map(token => ({ term: token.term, valueIndex: token.valueIndex, position: token.position, positionLength: 1, ...(field === 'title' ? { start: token.start, end: token.end } : {}) }));
      assert.deepEqual(actual, expected, row.name);
      assertedTokens += expected.length;
      for (const token of actual) if (field === 'title') {
        assert.ok(token.start >= 0 && token.end > token.start && token.end <= row.values[token.valueIndex].length, row.name);
        assert.notEqual(row.values[token.valueIndex].slice(token.start, token.end), '', row.name);
      }
    }
    assert.equal(Object.hasOwn(retained.positions, 'ignored'), false);
    assert.equal(Object.hasOwn(retained, 'text'), false); assert.equal(Object.hasOwn(retained, 'metadata'), false);
  }
  assert.equal(Object.hasOwn(directoryGet(state.records, 'missing-field').positions, 'title'), false);
  assert.equal(state.offsetCount, originalPositionCases.reduce((count, row) => count + row.tokens.length, 0));
  coherent(fixture.engine.root, records, ['title', 'body'], ['title']);
  await fixture.engine.dispose();
  t.diagnostic(JSON.stringify({ literalCoordinateCases: originalPositionCases.length, positionAssertions: assertedTokens, originalSpanAssertions: assertedTokens / 2 }));
});

test('core-only, source-only, positions-only and selected-offset roots retain exactly their declared representations', async () => {
  const records = [{ id: 'all', text: { title: ['ﬁle red', '', 'blue'], body: 'red blue', ignored: 'untouched' }, metadata: { kind: 'private metadata' } }, { id: 'missing', text: { body: [] } }];
  const core = setup(schema, {}, 'core'); await core.call('addMany', records);
  assert.deepEqual(Object.keys(core.engine.root.participants), []); assert.equal(core.engine.root.configuration.capabilities, undefined);
  for (const document of [directoryGet(core.engine.root.documents, 'all'), directoryGet(core.engine.root.documents, 'missing')]) {
    assert.equal(Object.hasOwn(document, 'text'), false); assert.equal(Object.hasOwn(document, 'positions'), false); assert.equal(Object.hasOwn(document, 'offsets'), false);
  }
  const source = setup(schema, { addons: [createSourceProvider({ fields: ['title'] })] }); await source.call('addMany', records);
  assert.deepEqual(Object.keys(source.engine.root.participants), ['source']);
  assert.deepEqual(Object.keys(directoryGet(source.engine.root.participants.source.records, 'all').text), ['title']);
  assert.equal(Object.hasOwn(source.engine.root.participants.source, 'positions'), false); assert.equal(Object.hasOwn(source.engine.root.participants.source, 'offsets'), false);
  const positions = setup(schema, { addons: [createPositionProvider({ fields: ['title', 'body'] })] }); await positions.call('addMany', records);
  coherent(positions.engine.root, records, ['title', 'body'], []);
  const offsets = setup(schema, { addons: [createPositionProvider({ fields: ['title', 'body'], offsets: ['body'] })] }); await offsets.call('addMany', records);
  coherent(offsets.engine.root, records, ['title', 'body'], ['body']);
  assert.deepEqual(Object.keys(positions.engine.root.participants), ['positions']); assert.deepEqual(Object.keys(offsets.engine.root.participants), ['positions']);
  assert.equal(positions.engine.root.participants.positions.offsetCount, 0);
  assert.equal(offsets.engine.root.participants.positions.occurrenceCount, positions.engine.root.participants.positions.occurrenceCount);
  assert.ok(offsets.engine.root.participants.positions.retainedEntries > positions.engine.root.participants.positions.retainedEntries);
  for (const fixture of [core, source, positions, offsets]) await fixture.engine.dispose();
});

test('position factories own field/offset selections, reject malformed options and expose no proximity or synonym-graph contract', async () => {
  const fields = ['title', 'body'], offsets = ['title'];
  const provider = createPositionProvider({ fields, offsets }); fields[0] = 'ignored'; offsets[0] = 'body';
  const fixture = setup(schema, { addons: [provider, createPositionPhrases({ fields: ['title', 'body'] })] });
  const records = [{ id: 'a', text: { title: 'red—blue', body: 'red gap blue' } }]; await fixture.call('addMany', records);
  coherent(fixture.engine.root, records, ['title', 'body'], ['title']);
  for (const invalid of [
    {}, { fields: [] }, { fields: ['title', 'title'] }, { fields: ['title'], offsets: ['body'] }, { fields: ['title'], offsets: ['title', 'title'] },
    { fields: ['title'], offsets: true }, { fields: ['title'], maxRetainedEntries: -1 }, { fields: ['title'], maxWorkUnits: 0 },
    { fields: ['title'], proximity: 1 }, { fields: ['title'], offsets: ['title'], get id() { throw new Error('getter must not execute'); } },
  ]) assert.throws(() => createPositionProvider(invalid), { code: 'INVALID_OPTIONS' });
  for (const extra of [{ slop: 1 }, { positionLength: 2 }, { synonyms: [['red', 'red blue']] }, { prefix: true }]) {
    const query = extension('red blue'); Object.assign(query.payload, extra);
    await assert.rejects(fixture.call('search', query), { code: 'INVALID_QUERY' });
  }
  await assert.rejects(fixture.call('search', extension('red blue')), { code: 'MISSING_CAPABILITY' });
  assert.deepEqual((await fixture.call('search', extension('red blue', ['title', 'body']), { limit: 100 })).hits.map(hit => hit.id), ['a']);
  await fixture.engine.dispose();
});

test('positional field providers are explicit, dependency-validated and cannot fall back to another selected field', async () => {
  assert.throws(() => setup(schema, { addons: [createPositionPhrases({ fields: ['title'] })] }), { code: 'MISSING_CAPABILITY' });
  assert.throws(() => setup(schema, { addons: [createPositionProvider({ fields: ['title'] }), createPositionPhrases({ fields: ['title', 'body'] })] }), { code: 'MISSING_CAPABILITY' });
  assert.throws(() => setup(schema, { addons: [createPositionProvider({ fields: ['undeclared'] })] }), { code: 'INCOMPATIBLE_CAPABILITY' });
  const selected = setup(schema, { addons: [createPositionPhrases({ fields: ['title', 'body'] }), createPositionProvider({ fields: ['body'], id: 'body-positions' }), createPositionProvider({ fields: ['title'], id: 'title-positions', offsets: ['title'] })] });
  const records = [{ id: 'title', text: { title: 'red blue' } }, { id: 'body', text: { body: 'red blue' } }, { id: 'split', text: { title: 'red', body: 'blue' } }];
  await selected.call('addMany', records);
  coherent(selected.engine.root, records, ['title'], ['title'], 'title-positions'); coherent(selected.engine.root, records, ['body'], [], 'body-positions');
  assert.deepEqual((await selected.call('search', extension('red blue', ['title', 'body']), { limit: 100 })).hits.map(hit => hit.id).sort(), ['body', 'title']);
  for (const text of ['', 'absent', 'red blue']) await assert.rejects(selected.call('search', extension(text, ['title', 'ignored'])), { code: 'MISSING_CAPABILITY' });
  await selected.engine.dispose();
});
