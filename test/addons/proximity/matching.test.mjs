import test from 'node:test';
import assert from 'node:assert/strict';
import { createRaveldex } from '../../../dist/index.js';
import { createProximity, PROXIMITY_POLICY } from '../../../dist/addons/proximity/index.js';
import { createPositionProvider } from '../../../dist/addons/positions/index.js';
import { createPositionPhrases } from '../../../dist/addons/positions/phrases.js';
import { createSourceProvider, createSourcePhrases } from '../../../dist/addons/phrases/index.js';
import { createIdentifierAnalyzer, IDENTIFIER_ANALYZER } from '../../../dist/addons/identifiers/index.js';
import { createEnglishAnalyzer, ENGLISH_ANALYZER } from '../../../dist/integrations/languages/english/index.js';
import { emptyDirectory } from '../../../dist/core/index/staging.js';
import { executeSearch } from '../../../dist/core/query/search.js';
import { drain, setup } from '../phrases/helpers.mjs';

const schema = { text: { title: { boost: 2 }, body: {}, other: {} } };
const fields = ['title', 'body'];
const query = (groups, maxGap = 0, selected) => ({ kind: 'extension', capability: 'proximity', version: 1, payload: { groups, maxGap, ...(selected ? { fields: selected } : {}) } });
const phrase = (text, selected) => ({ kind: 'extension', capability: 'phrases', version: 1, payload: { text, ...(selected ? { fields: selected } : {}) } });
const configuration = (extras = {}) => ({ schema, addons: [createPositionProvider({ fields }), createProximity({ fields })], ...extras });
const ids = result => result.hits.map(hit => hit.id).sort();
const records = [
  { id: 'adjacent', text: { title: 'red blue green' } },
  { id: 'gapped', text: { title: 'red gap blue gap green' } },
  { id: 'reverse', text: { title: 'green blue red' } },
  { id: 'values', text: { title: ['red', 'blue green'] } },
  { id: 'fields', text: { title: 'red', body: 'blue green' } },
  { id: 'repeat', text: { title: 'red red blue' } },
  { id: 'single', text: { title: 'red' } },
  { id: 'nongreedy', text: { title: 'red blue blue gap green' } },
];

test('ordered proximity uses per-adjacent gaps, all reachable endpoints and original field/value boundaries', async () => {
  assert.equal(PROXIMITY_POLICY, 'ordered-adjacent-gap-v1');
  const engine = createRaveldex(configuration());
  try {
    await engine.addMany([...records].reverse());
    const groups = [['red'], ['blue'], ['green']];
    assert.deepEqual(ids(await engine.search(query(groups))), ['adjacent']);
    assert.deepEqual(ids(await engine.search(query(groups, 1))), ['adjacent', 'gapped', 'nongreedy']);
    assert.deepEqual(ids(await engine.search(query(groups, 32, ['body']))), []);
    const full = await engine.search(query(groups, 1), { limit: 100 });
    for (const page of [{ limit: 0 }, { limit: 1 }, { offset: 1, limit: 1 }, { offset: 30, limit: 2 }]) {
      const actual = await engine.search(query(groups, 1), page);
      assert.equal(actual.total, full.total); assert.equal(actual.completeness, 'complete');
      assert.deepEqual(actual.hits, full.hits.slice(page.offset ?? 0, (page.offset ?? 0) + page.limit));
    }
    await assert.rejects(engine.search(query(groups, 1, ['other'])), { code: 'MISSING_CAPABILITY' });
    assert.equal((await engine.search(query([['red']], 0))).total, records.length);
  } finally { await engine.dispose(); }
});

test('repeated and overlapping alternatives consume distinct positions without score multiplication', async () => {
  const engine = createRaveldex(configuration());
  try {
    await engine.addMany(records);
    assert.deepEqual(ids(await engine.search(query([['red'], ['red']], 0))), ['repeat']);
    assert.deepEqual(ids(await engine.search(query([['red', 'blue'], ['red', 'blue']], 0))), ['adjacent', 'nongreedy', 'repeat', 'reverse']);
    const left = query([['red', 'blue'], ['green']], 1), right = query([['blue', 'RED', 'red'], ['GREEN', 'green']], 1);
    assert.deepEqual(await engine.search(left, { limit: 100 }), await engine.search(right, { limit: 100 }));
    const lexical = { kind: 'and', children: [{ kind: 'group', variants: [{ text: 'red', match: 'exact' }, { text: 'blue', match: 'exact' }] }, { kind: 'text', text: 'green' }] };
    const native = await engine.search(lexical, { limit: 100 }), proximity = await engine.search(left, { limit: 100 });
    for (const hit of proximity.hits) assert.equal(hit.score, native.hits.find(other => other.id === hit.id).score);
    const repeated = await engine.search(query([['red'], ['red']], 0)), once = await engine.search('red', { limit: 100 });
    assert.equal(repeated.hits[0].score, once.hits.find(hit => hit.id === 'repeat').score);
  } finally { await engine.dispose(); }
});

test('zero-gap singleton sequences preserve source/position phrase eligibility and unrounded native scores', async () => {
  for (const strategy of ['source', 'positions']) {
    const engine = createRaveldex(configuration({ addons: [createPositionProvider({ fields }), createProximity({ fields }), ...(strategy === 'source' ? [createSourceProvider({ fields }), createSourcePhrases({ fields })] : [createPositionPhrases({ fields })])] }));
    try {
      await engine.addMany(records);
      for (const terms of [['red', 'blue'], ['red', 'red'], ['red', 'blue', 'green'], ['missing'], ['red']]) {
        for (const selected of [fields, ['title'], ['body']]) assert.deepEqual(await engine.search(query(terms.map(term => [term]), 0, selected), { limit: 100 }), await engine.search(phrase(terms.join(' '), selected), { limit: 100 }));
      }
      const all = await engine.search('red blue', { limit: 100 });
      assert.equal(all.total, 7, 'ordinary lexical conjunction remains unordered/cross-value/cross-field');
    } finally { await engine.dispose(); }
  }
});

test('Boolean success paths retain native groups; failed AND and NOT proximity leaves add no score', async () => {
  const engine = createRaveldex(configuration());
  try {
    await engine.addMany(records);
    const positive = query([['red'], ['blue']], 0), negative = query([['green'], ['red']], 0);
    const lexical = { kind: 'text', text: 'green' };
    assert.deepEqual(await engine.search({ kind: 'or', children: [{ kind: 'and', children: [positive, { kind: 'text', text: 'absent' }] }, lexical] }, { limit: 100 }), await engine.search(lexical, { limit: 100 }));
    const not = await engine.search({ kind: 'not', child: positive }, { limit: 100 });
    assert.ok(not.hits.every(hit => hit.score === 0));
    assert.deepEqual(ids(not), ['fields', 'gapped', 'reverse', 'single', 'values']);
    assert.equal((await engine.search(negative)).total, 0);
  } finally { await engine.dispose(); }
});

test('English normalization is shared once; identifier components never supply ordered adjacency', async () => {
  const english = createRaveldex(configuration({ analyzer: ENGLISH_ANALYZER, addons: [createEnglishAnalyzer(), createPositionProvider({ fields }), createProximity({ fields }), createPositionPhrases({ fields })] }));
  const code = createRaveldex(configuration({ analyzer: IDENTIFIER_ANALYZER, addons: [createIdentifierAnalyzer(), createPositionProvider({ fields, offsets: ['title'] }), createProximity({ fields }), createPositionPhrases({ fields })] }));
  try {
    await english.addMany([{ id: 'a', text: { title: 'running quickly jumped' } }, { id: 'b', text: { title: 'runs jump' } }]);
    assert.deepEqual(ids(await english.search(query([['RUNS'], ['jumping']], 1))), ['a', 'b']);
    assert.deepEqual(await english.search(query([['running'], ['jumped']], 0), { limit: 100 }), await english.search(phrase('running jumped', fields), { limit: 100 }));
    await code.addMany([{ id: 'whole', text: { title: 'fooBar next' } }, { id: 'split', text: { title: 'foo bar next' } }, { id: 'cross', text: { title: 'fooBar bar' } }]);
    assert.deepEqual(ids(await code.search(query([['foo'], ['bar']], 32))), ['split']);
    assert.deepEqual(ids(await code.search(query([['fooBar'], ['next']], 0))), ['whole']);
    assert.equal((await code.search(query([['foo'], ['next']], 32))).total, 1, 'foo component cannot anchor an ordered leaf');
    assert.deepEqual(await code.search(query([['fooBar'], ['next']], 0), { limit: 100 }), await code.search(phrase('fooBar next', fields), { limit: 100 }));
  } finally { await english.dispose(); await code.dispose(); }
});

test('owned factory/payload capture rejects accessors and malformed alternatives under finite bounds', async () => {
  let reads = 0;
  for (const options of [{}, { fields: [] }, { fields: ['title', 'title'] }, { fields: ['bad-name'] }, { fields: ['title'], maxWorkUnits: 0 }, { fields: ['title'], maxGap: 1 }, { get fields() { reads++; return fields; } }]) assert.throws(() => createProximity(options), { code: 'INVALID_OPTIONS' });
  const mutable = ['title'], selected = createProximity({ fields: mutable, id: 'owned-proximity' }); mutable[0] = 'other';
  const engine = createRaveldex(configuration({ addons: [createPositionProvider({ fields }), selected] }));
  try {
    await engine.addMany(records);
    const groups = [['red'], ['blue']], raw = query(groups, 1), pending = engine.search(raw, { limit: 100 }); groups[0][0] = 'missing'; raw.payload.maxGap = 0;
    assert.deepEqual(ids(await pending), ['adjacent', 'gapped', 'nongreedy', 'repeat']);
    for (const payload of [{}, { groups: [], maxGap: 0 }, { groups: [[]], maxGap: 0 }, { groups: [['red blue']], maxGap: 0 }, { groups: [['']], maxGap: 0 }, { groups: [['\ud800']], maxGap: 0 }, { groups: [['red']], maxGap: -1 }, { groups: [['red']], maxGap: 0.1 }, { groups: [['red']], maxGap: NaN }, { groups: [['red']] }, { groups: [['red']], maxGap: 0, slop: 1 }, { groups: [['red']], maxGap: 0, fields: [] }, { get groups() { reads++; return [['red']]; }, maxGap: 0 }]) await assert.rejects(engine.search({ kind: 'extension', capability: 'proximity', version: 1, payload }), { code: 'INVALID_QUERY' });
    await assert.rejects(engine.search(query([['red']], 33)), { code: 'LIMIT_EXCEEDED' });
    await assert.rejects(engine.search(query(Array.from({ length: 33 }, () => ['red']))), { code: 'LIMIT_EXCEEDED' });
    await assert.rejects(engine.search(query([Array.from({ length: 17 }, () => 'red')])), { code: 'LIMIT_EXCEEDED' });
    assert.equal(reads, 0);
  } finally { await engine.dispose(); }
});

test('every selected position header/record stays authoritative after another field matches', async () => {
  assert.throws(() => createRaveldex({ schema, addons: [createProximity({ fields })] }), { code: 'MISSING_CAPABILITY' });
  const fixture = setup(schema, { addons: [createPositionProvider({ fields: ['title'], id: 'title-positions' }), createPositionProvider({ fields: ['body'], id: 'body-positions' }), createProximity({ fields })] });
  try {
    await fixture.call('addMany', records);
    const root = fixture.engine.root, state = root.participants['body-positions'];
    const missingHeader = Object.freeze({ ...root, participants: Object.freeze({ ...root.participants, 'body-positions': undefined }) });
    assert.throws(() => drain(executeSearch(missingHeader, query([['absent']]))), { code: 'MISSING_CAPABILITY' });
    const missingRecord = Object.freeze({ ...state, records: emptyDirectory(), retainedEntries: 0, occurrenceCount: 0, offsetCount: 0, termEntries: 0, termCodeUnits: 0 });
    assert.throws(() => drain(executeSearch(Object.freeze({ ...root, participants: Object.freeze({ ...root.participants, 'body-positions': missingRecord }) }), query([['red'], ['blue']]))), { code: 'MISSING_CAPABILITY' });
    const stale = Object.freeze({ ...state, revision: root.revision + 1 });
    assert.throws(() => drain(executeSearch(Object.freeze({ ...root, participants: Object.freeze({ ...root.participants, 'body-positions': stale }) }), query([['absent']]))), { code: 'REVISION_MISMATCH' });
  } finally { await fixture.engine.dispose(); }
});

test('proximity retains no side state and follows atomic replacement removal and clear', async () => {
  const fixture = setup(schema, { addons: [createPositionProvider({ fields }), createProximity({ fields })] });
  try {
    const q = query([['red'], ['blue']], 1);
    await fixture.call('add', { id: '__proto__', text: { title: 'red gap blue' } });
    assert.deepEqual(Object.keys(fixture.engine.root.participants), ['positions']);
    const old = fixture.engine.root; assert.equal((await fixture.call('search', q)).total, 1);
    await fixture.call('replace', { id: '__proto__', text: { title: 'blue red' } });
    assert.equal((await fixture.call('search', q)).total, 0);
    assert.equal(drain(executeSearch(old, q)).value.total, 1);
    await fixture.call('remove', '__proto__'); assert.equal((await fixture.call('search', q)).revision, 3);
    await fixture.call('add', { id: 'again', text: { body: 'red blue' } });
    await fixture.call('clear'); assert.equal((await fixture.call('search', q)).total, 0);
  } finally { await fixture.engine.dispose(); }
});

test('reduced distinct-group ceilings preserve repeated zero-gap phrase parity while every raw alternative counts as a token', async () => {
  const engine = createRaveldex(configuration({ limits: { maxQueryGroups: 1, maxQueryTokens: 3 }, addons: [createPositionProvider({ fields }), createProximity({ fields }), createPositionPhrases({ fields })] }));
  try {
    await engine.addMany(records);
    assert.deepEqual(await engine.search(query([['red'], ['red']], 0), { limit: 100 }), await engine.search(phrase('red red', fields), { limit: 100 }));
    assert.deepEqual(await engine.search(query([['RED', 'red'], ['red']], 0), { limit: 100 }), await engine.search(phrase('red red', fields), { limit: 100 }));
    await assert.rejects(engine.search(query([['red', 'RED'], ['red', 'RED']], 0)), { code: 'LIMIT_EXCEEDED' });
    await assert.rejects(engine.search(query([['red'], ['blue']], 0)), { code: 'LIMIT_EXCEEDED' });
  } finally { await engine.dispose(); }
});
