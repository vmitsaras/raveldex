import test from 'node:test';
import assert from 'node:assert/strict';
import { createRaveldex } from '../../../dist/index.js';
import { createIdentifierAnalyzer, IDENTIFIER_ANALYZER } from '../../../dist/addons/identifiers/index.js';
import { createSourceProvider, createSourcePhrases } from '../../../dist/addons/phrases/index.js';
import { createPositionProvider } from '../../../dist/addons/positions/index.js';
import { createPositionPhrases } from '../../../dist/addons/positions/phrases.js';
import { createPhrases } from '../../../dist/addons/phrases/mixed.js';
import { createMatchEvidence } from '../../../dist/addons/evidence/index.js';
import { createSnippetEvidence } from '../../../dist/addons/snippets/index.js';
import { createSnapshots, createSnapshotRaveldex, currentNodeSnapshotEnvironment } from '../../../dist/adapters/snapshots/index.js';
import { alter, byId } from '../../fixtures/snapshots/integrity.mjs';

const schema = { text: { title: {}, body: {} } };
const plain = value => JSON.parse(JSON.stringify(value));
const phrase = (text, fields = ['title']) => ({ kind: 'extension', capability: 'phrases', version: 1, payload: { text, fields } });
const request = (ids, capability = 'match-evidence', fields = ['title', 'body']) => ({ extensions: { [capability]: { ids, fields } } });
const ids = result => result.hits.map(hit => hit.id).sort();
const strategies = ['source', 'offsets', 'mixed'];
function configuration(strategy, { snippets = false, completeSource = false } = {}) {
  const fields = strategy === 'source' ? { title: 'source', body: 'source' } : strategy === 'offsets' ? { title: 'offsets', body: 'offsets' } : { title: 'source', body: 'offsets' };
  const source = Object.keys(fields).filter(field => fields[field] === 'source'), offsets = Object.keys(fields).filter(field => fields[field] === 'offsets');
  return { schema, analyzer: IDENTIFIER_ANALYZER, addons: [createIdentifierAnalyzer(),
    ...(source.length || snippets || completeSource ? [createSourceProvider({ fields: snippets || completeSource ? ['title', 'body'] : source })] : []),
    ...(offsets.length ? [createPositionProvider({ fields: offsets, offsets })] : []),
    ...(strategy === 'source' ? [createSourcePhrases({ fields: ['title', 'body'] })] : strategy === 'offsets' ? [createPositionPhrases({ fields: ['title', 'body'] })] : [createPhrases({ fields: { title: 'source', body: 'positions' } })]),
    snippets ? createSnippetEvidence({ fields }) : createMatchEvidence({ fields }),
  ] };
}
const records = [
  { id: 'a', text: { title: '😀 HTTPServer2 fooFoo foo_bar', body: ['', 'path/to/FileName.ts fooBar next'] } },
  { id: 'b', text: { title: 'http server 2 foo bar', body: 'fooBar next' } },
  { id: 'c', text: { title: ['foo', 'bar'], body: 'foo bar next' } },
  { id: 'd', text: { title: 'fooBar fooBar', body: 'foo__bar' } },
];

test('identifier source, offset and mixed strict phrases use originals only with exact totals and deterministic pages', async t => {
  const engines = strategies.map(strategy => createRaveldex(configuration(strategy))); let comparisons = 0;
  try {
    for (const engine of engines) await engine.addMany(records);
    for (const [query, expected] of [
      [{ kind: 'text', text: 'foo bar', fields: ['title'] }, ['a', 'b', 'c', 'd']],
      [phrase('foo bar'), ['b']],
      [phrase('http server'), ['b']],
      [phrase('HTTPServer2 fooFoo'), ['a']],
      [phrase('fooBar fooBar'), ['d']],
      [phrase('fooBar next', ['body']), ['a', 'b']],
      [phrase('file name', ['body']), []],
      [{ kind: 'or', children: [phrase('foo bar'), { kind: 'text', text: 'HTTPServer2', fields: ['title'] }] }, ['a', 'b']],
      [{ kind: 'and', children: [{ kind: 'text', text: 'foo', fields: ['title'] }, { kind: 'not', child: phrase('foo bar') }] }, ['a', 'c', 'd']],
    ]) {
      let reference;
      for (const engine of engines) {
        const result = await engine.search(query, { limit: 100 }); assert.deepEqual(ids(result), expected);
        if (reference) assert.deepEqual(result, reference); else reference = result;
        for (const options of [{ limit: 0 }, { limit: 1, offset: 1 }]) {
          const page = await engine.search(query, options); assert.equal(page.total, expected.length);
          assert.deepEqual(page.hits, result.hits.slice(options.offset ?? 0, (options.offset ?? 0) + options.limit)); comparisons++;
        }
      }
    }
  } finally { for (const engine of engines) await engine.dispose(); }
  t.diagnostic(JSON.stringify({ literalPhraseBooleanCases: 9, completePageComparisons: comparisons }));
});

test('identifier evidence preserves component spans, original provenance and earliest canonical duplicate across source/offsets', async () => {
  const title = '😀 HTTPServer2 fooFoo';
  const expected = [
    { field: 'title', valueIndex: 1, position: 0, start: 3, end: 7, term: 'http', kind: 'component', original: { term: 'httpserver2', start: 3, end: 14 } },
    { field: 'title', valueIndex: 1, position: 0, start: 7, end: 13, term: 'server', kind: 'component', original: { term: 'httpserver2', start: 3, end: 14 } },
    { field: 'title', valueIndex: 1, position: 0, start: 13, end: 14, term: '2', kind: 'component', original: { term: 'httpserver2', start: 3, end: 14 } },
    { field: 'title', valueIndex: 1, position: 1, start: 15, end: 18, term: 'foo', kind: 'component', original: { term: 'foofoo', start: 15, end: 21 } },
  ];
  let reference;
  for (const strategy of strategies) {
    const engine = createRaveldex(configuration(strategy));
    try {
      await engine.add({ id: 'a', text: { title: ['', title] } });
      const result = await engine.search('http server 2 foo', request(['a'], 'match-evidence', ['title']));
      assert.equal(result.total, 1);
      const data = plain(result.extensions['match-evidence']); assert.deepEqual(data.documents[0].ranges, expected);
      assert.deepEqual(expected.map(range => title.slice(range.start, range.end)), ['HTTP', 'Server', '2', 'foo']);
      if (reference) assert.deepEqual(data, reference); else reference = data;
      const original = await engine.search('HTTPServer2 fooFoo', request(['a'], 'match-evidence', ['title']));
      assert.deepEqual(plain(original.extensions['match-evidence'].documents[0].ranges), [
        { field: 'title', valueIndex: 1, position: 0, start: 3, end: 14, term: 'httpserver2', kind: 'original' },
        { field: 'title', valueIndex: 1, position: 1, start: 15, end: 21, term: 'foofoo', kind: 'original' },
      ]);
    } finally { await engine.dispose(); }
  }
});

test('identifier snippets distinguish overlapping original/component occurrences without selecting sibling fragments', async () => {
  let reference;
  for (const strategy of strategies) {
    const engine = createRaveldex(configuration(strategy, { snippets: true }));
    try {
      await engine.add({ id: 'a', text: { title: '😀 fooBar next' } });
      const result = await engine.search({ kind: 'text', text: 'foo fooBar', operator: 'or', fields: ['title'] }, request(['a'], 'snippets', ['title']));
      const data = plain(result.extensions.snippets), document = data.documents[0];
      assert.deepEqual(document.ranges, [
        { field: 'title', valueIndex: 0, position: 0, start: 3, end: 6, term: 'foo', kind: 'component', original: { term: 'foobar', start: 3, end: 9 } },
        { field: 'title', valueIndex: 0, position: 0, start: 3, end: 9, term: 'foobar', kind: 'original' },
      ]);
      assert.equal(document.snippets[0].text, '😀 fooBar next');
      assert.deepEqual(document.snippets[0].highlights, [{ start: 3, end: 9 }]);
      assert.equal(document.snippetOmissions.unshownMatches, 0);
      const component = plain((await engine.search('foo', request(['a'], 'snippets', ['title']))).extensions.snippets.documents[0]);
      assert.equal(component.ranges.length, 1); assert.equal(component.ranges[0].term, 'foo');
      assert.deepEqual(component.snippets[0].highlights, [{ start: 3, end: 6 }]);
      const originalPhrase = plain((await engine.search(phrase('fooBar next'), request(['a'], 'snippets', ['title']))).extensions.snippets.documents[0]);
      assert.deepEqual(originalPhrase.ranges.map(range => range.kind), ['original', 'original']);
      if (reference) assert.deepEqual(data, reference); else reference = data;
    } finally { await engine.dispose(); }
  }
});

const qualification = () => ({ profileId: 'rx-a050-provider-exact-node-fixture', scope: 'exact-node-runtime', environment: currentNodeSnapshotEnvironment(), evidence: ['test/addons/identifiers/evidence.test.mjs: matching declared runtime contract only; no cross-host Unicode claim'] });
const snapshotEngine = (strategy, options = {}) => createSnapshotRaveldex(configuration(strategy, { completeSource: true, ...options }), { nativeQualification: qualification() });
const withoutRevision = value => { const result = plain(value); delete result.revision; if (result.extensions) for (const data of Object.values(result.extensions)) delete data.revision; return result; };

test('source/native identifier restores preserve co-position tags, short-name frequencies, phrase semantics and evidence', async t => {
  let comparisons = 0;
  for (const strategy of strategies) for (const format of ['Source', 'Native']) {
    const donor = snapshotEngine(strategy), receiver = snapshotEngine(strategy);
    try {
      await donor.addMany([...records, { id: 'short', text: { title: 'aB' } }]);
      const encoded = await createSnapshots(donor)[`export${format}`]();
      if (format === 'Native' && strategy !== 'source') assert.equal(JSON.parse(encoded).body.payload.participants.positions.kind, 'raveldex-positions-v2');
      await createSnapshots(receiver).restore(encoded);
      for (const query of ['a', 'aB', 'foo', 'HTTPServer2', phrase('foo bar'), phrase('HTTPServer2 fooFoo')]) {
        const options = request(['a', 'b', 'c', 'd', 'short']);
        assert.deepEqual(withoutRevision(await receiver.search(query, options)), withoutRevision(await donor.search(query, options))); comparisons++;
      }
      await receiver.replace({ id: 'a', text: { title: 'anotherName' } });
      assert.equal((await receiver.search('HTTPServer2')).total, 0);
      assert.equal((await donor.search('HTTPServer2')).total, 1);
    } finally { await donor.dispose(); await receiver.dispose(); }
  }
  // Core-only native state also admits aB's three retained term occurrences in
  // two source code units. No position/source participant authenticates it.
  const config = { schema, analyzer: IDENTIFIER_ANALYZER, addons: [createIdentifierAnalyzer()] };
  const donor = createSnapshotRaveldex(config, { nativeQualification: qualification() }), receiver = createSnapshotRaveldex(config, { nativeQualification: qualification() });
  try { await donor.add({ id: 'short', text: { title: 'aB' } }); await createSnapshots(receiver).restore(await createSnapshots(donor).exportNative()); assert.deepEqual(withoutRevision(await receiver.search('a')), withoutRevision(await donor.search('a'))); comparisons++; }
  finally { await donor.dispose(); await receiver.dispose(); }
  t.diagnostic(JSON.stringify({ completeSnapshotComparisons: comparisons, scope: 'exact current Node attestation fixture, not cross-host qualification' }));
});

test('native tagged identifier corruption rejects atomically and v1 reinterpretation cannot hide components', async t => {
  const donor = snapshotEngine('offsets'), target = snapshotEngine('offsets'); let refusals = 0;
  try {
    await donor.add({ id: 'a', text: { title: 'fooBar next' } });
    await target.add({ id: 'old', text: { title: 'oldState' } });
    const encoded = await createSnapshots(donor).exportNative(), baseline = await target.search('old');
    const value = payload => byId(payload.participants.positions.records, 'a').positions.title[0];
    for (const mutation of [
      payload => { payload.participants.positions.kind = 'raveldex-positions-v1'; },
      payload => { value(payload).originalCount++; },
      payload => { value(payload).tokenCount--; },
      payload => { delete value(payload).terms.foobar[0].kind; },
      payload => { value(payload).terms.foo[0].kind = 'original'; },
      payload => { value(payload).terms.foo[0].position = 1; },
      payload => { value(payload).terms.foo[0].start = 99; },
      payload => { value(payload).terms.foo[0].positionLength = 2; },
      payload => { value(payload).terms.bar[0].end = 99; },
      payload => { value(payload).terms.bar[0].start = 2; },
      payload => { value(payload).terms.next[0].start = 0; },
      payload => { value(payload).terms.foo[0].original = { term: 'forged' }; },
    ]) {
      await assert.rejects(createSnapshots(target).restore(alter(encoded, envelope => mutation(envelope.body.payload))), error => error.reason === 'INVALID_NATIVE_STATE');
      assert.deepEqual(await target.search('old'), baseline); refusals++;
    }
  } finally { await donor.dispose(); await target.dispose(); }
  t.diagnostic(JSON.stringify({ atomicTaggedStateRefusals: refusals }));
});

test('identifier provider evidence follows replacement/removal and range overflow refuses a whole operation', async () => {
  for (const strategy of strategies) {
    const engine = createRaveldex(configuration(strategy));
    try {
      await engine.add({ id: 'a', text: { title: 'fooBar' } });
      assert.equal((await engine.search('foo', request(['a']))).extensions['match-evidence'].documents[0].ranges[0].kind, 'component');
      await engine.replace({ id: 'a', text: { title: 'foo nextName' } });
      const ranges = plain((await engine.search('foo', request(['a']))).extensions['match-evidence'].documents[0].ranges);
      assert.deepEqual(ranges, [{ field: 'title', valueIndex: 0, position: 0, start: 0, end: 3, term: 'foo', kind: 'original' }]);
      assert.equal((await engine.search('bar')).total, 0);
      const options = { extensions: { 'match-evidence': { ids: ['a'], fields: ['title'], maxRanges: 1 } } };
      await assert.rejects(engine.search('foo next', options), { code: 'LIMIT_EXCEEDED' });
      assert.equal((await engine.search('foo')).total, 1);
      await engine.remove('a'); assert.equal((await engine.search('foo')).total, 0);
      await engine.add({ id: 'a', text: { title: 'newName' } }); await engine.clear(); assert.equal((await engine.search('name')).total, 0);
    } finally { await engine.dispose(); }
  }
});
