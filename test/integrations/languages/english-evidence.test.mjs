import test from 'node:test';
import assert from 'node:assert/strict';
import { createRaveldex } from '../../../dist/index.js';
import { createEnglishAnalyzer, ENGLISH_ANALYZER } from '../../../dist/integrations/languages/english/index.js';
import { createSourceProvider, createSourcePhrases } from '../../../dist/addons/phrases/index.js';
import { createPhrases } from '../../../dist/addons/phrases/mixed.js';
import { createPositionProvider } from '../../../dist/addons/positions/index.js';
import { createPositionPhrases } from '../../../dist/addons/positions/phrases.js';
import { createMatchEvidence } from '../../../dist/addons/evidence/index.js';
import { createSnippetEvidence } from '../../../dist/addons/snippets/index.js';

const schema = { text: { title: {}, body: {} } };
const plain = value => JSON.parse(JSON.stringify(value));
const phrase = (text, fields = ['title', 'body']) => ({ kind: 'extension', capability: 'phrases', version: 1, payload: { text, fields } });
const fieldsFor = strategy => strategy === 'source' ? { title: 'source', body: 'source' } : strategy === 'positions' ? { title: 'offsets', body: 'offsets' } : { title: 'source', body: 'offsets' };
function makeEngine(strategy, snippets = false) {
  const fields = fieldsFor(strategy), source = Object.keys(fields).filter(field => fields[field] === 'source'), positions = Object.keys(fields).filter(field => fields[field] === 'offsets');
  return createRaveldex({ schema, analyzer: ENGLISH_ANALYZER, addons: [createEnglishAnalyzer(),
    ...(source.length || snippets ? [createSourceProvider({ fields: snippets ? ['title', 'body'] : source })] : []),
    ...(positions.length ? [createPositionProvider({ fields: positions, offsets: positions })] : []),
    ...(strategy === 'source' ? [createSourcePhrases({ fields: ['title', 'body'] })] : strategy === 'positions' ? [createPositionPhrases({ fields: ['title', 'body'] })] : [createPhrases({ fields: { title: 'source', body: 'positions' } })]),
    ...(snippets ? [createSnippetEvidence({ fields })] : [createMatchEvidence({ fields })]),
  ] });
}
const ids = result => result.hits.map(hit => hit.id).sort();
const request = (ids, capability = 'match-evidence', fields = ['title', 'body']) => ({ extensions: { [capability]: { ids, fields } } });
const records = [
  { id: 'a', text: { title: '😀 Eating apples and jumped fences.' } },
  { id: 'b', text: { title: 'eat apple' } },
  { id: 'c', text: { title: ['eating', 'apples'] } },
  { id: 'd', text: { title: 'eating', body: 'apples' } },
  { id: 'e', text: { title: 'eating bright apples' } },
  { id: 'f', text: { title: '😀 eat apple and jumping fences.' } },
  { id: 'g', text: { body: 'Eating apples' } },
];

test('English source, positions and mixed phrases share analyzed adjacency without crossing values, fields or stop words', async t => {
  const engines = ['source', 'positions', 'mixed'].map(strategy => makeEngine(strategy));
  let comparisons = 0;
  try {
    for (const engine of engines) await engine.addMany(records);
    for (const [text, fields, expected] of [
      ['eat apple', ['title'], ['a', 'b', 'f']],
      ['eating apples', ['title', 'body'], ['a', 'b', 'f', 'g']],
      ['apple and jump', ['title'], ['a', 'f']],
      ['eat and apple', ['title', 'body'], []],
      ['eat bright apple', ['title'], ['e']],
      ['apples eating', ['title', 'body'], []],
    ]) {
      let reference;
      for (const engine of engines) {
        const complete = await engine.search(phrase(text, fields), { limit: 100 });
        assert.deepEqual(ids(complete), expected, text);
        if (reference) assert.deepEqual(complete, reference); else reference = complete;
        for (const page of [{ limit: 0 }, { offset: 1, limit: 1 }]) {
          const result = await engine.search(phrase(text, fields), page);
          assert.equal(result.total, expected.length);
          assert.deepEqual(result.hits, complete.hits.slice(page.offset ?? 0, (page.offset ?? 0) + page.limit));
          comparisons++;
        }
      }
    }
    // The nonadjacent and split-value records still satisfy ordinary AND text.
    for (const engine of engines) assert.deepEqual(ids(await engine.search('eating apples', { limit: 100 })), records.map(record => record.id));
  } finally { for (const engine of engines) await engine.dispose(); }
  t.diagnostic(`${comparisons} complete page comparisons across three phrase representations; independently hand-literal membership.`);
});

test('English source and stored-offset evidence use stems with complete original UTF-16 slices and untouched Unicode', async () => {
  const values = ['', '😀 Eating apples and jumped fences.', 'ﬁling boxes café δοκιμή'];
  const expected = [
    { field: 'title', valueIndex: 1, position: 0, start: 3, end: 9, term: 'eat' },
    { field: 'title', valueIndex: 1, position: 1, start: 10, end: 16, term: 'appl' },
    { field: 'title', valueIndex: 1, position: 3, start: 21, end: 27, term: 'jump' },
    { field: 'title', valueIndex: 2, position: 0, start: 0, end: 5, term: 'file' },
    { field: 'title', valueIndex: 2, position: 1, start: 6, end: 11, term: 'box' },
    { field: 'title', valueIndex: 2, position: 2, start: 12, end: 16, term: 'café' },
    { field: 'title', valueIndex: 2, position: 3, start: 17, end: 23, term: 'δοκιμή' },
  ];
  let reference;
  for (const strategy of ['source', 'positions', 'mixed']) {
    const engine = makeEngine(strategy);
    try {
      await engine.add({ id: 'original', text: { title: values } });
      const query = { kind: 'text', text: 'eat apple jump file box café δοκιμή', operator: 'or', fields: ['title'] };
      const result = await engine.search(query, request(['original'], 'match-evidence', ['title']));
      assert.equal(result.total, 1);
      const evidence = plain(result.extensions['match-evidence']);
      assert.deepEqual(evidence.documents[0].ranges, expected);
      assert.deepEqual(expected.map(range => values[range.valueIndex].slice(range.start, range.end)), ['Eating', 'apples', 'jumped', 'ﬁling', 'boxes', 'café', 'δοκιμή']);
      if (reference) assert.deepEqual(evidence, reference); else reference = evidence;
      const selected = await engine.search(phrase('eat apple', ['title']), request(['original'], 'match-evidence', ['title']));
      assert.deepEqual(plain(selected.extensions['match-evidence'].documents[0].ranges), expected.slice(0, 2));
    } finally { await engine.dispose(); }
  }
});

test('English phrase/evidence providers track replacement, removal and new revisions without stale original tokens', async () => {
  for (const strategy of ['source', 'positions', 'mixed']) {
    const engine = makeEngine(strategy);
    try {
      await engine.add({ id: 'a', text: { title: 'Eating apples', body: 'Eating apples' } });
      assert.equal((await engine.search(phrase('eat apple'))).total, 1);
      await engine.replace({ id: 'a', text: { title: ['eating', 'apples'], body: 'walked fences' } });
      const miss = await engine.search(phrase('eat apple'), request(['a']));
      assert.equal(miss.revision, 2); assert.equal(miss.total, 0);
      assert.deepEqual(plain(miss.extensions['match-evidence'].documents[0]), { id: 'a', eligibility: 'excluded', ranges: [] });
      const changed = await engine.search(phrase('walk fence'), request(['a']));
      assert.equal(changed.revision, 2); assert.equal(changed.total, 1);
      assert.deepEqual(plain(changed.extensions['match-evidence'].documents[0].ranges), [
        { field: 'body', valueIndex: 0, position: 0, start: 0, end: 6, term: 'walk' },
        { field: 'body', valueIndex: 0, position: 1, start: 7, end: 13, term: 'fenc' },
      ]);
      await engine.remove(['a']);
      const removed = await engine.search('walk fence', request(['a']));
      assert.equal(removed.revision, 3); assert.equal(removed.total, 0);
      assert.equal(removed.extensions['match-evidence'].documents[0].eligibility, 'absent');
    } finally { await engine.dispose(); }
  }
});

test('English snippets retain original display spelling while validating selected stemmed source and offset ranges', async () => {
  for (const strategy of ['source', 'positions', 'mixed']) {
    const engine = makeEngine(strategy, true);
    try {
      const text = '😀 Eating apples and jumping fences.';
      await engine.add({ id: 'a', text: { title: text, body: text } });
      const result = await engine.search(phrase('eat apple'), request(['a'], 'snippets'));
      const evidence = plain(result.extensions.snippets.documents[0]);
      assert.equal(evidence.eligibility, 'matched');
      assert.ok(evidence.snippets.length > 0);
      for (const snippet of evidence.snippets) {
        assert.equal(snippet.text, text.slice(snippet.start, snippet.end));
        for (const highlight of snippet.highlights) {
          const original = snippet.text.slice(highlight.start, highlight.end);
          assert.ok(original === 'Eating' || original === 'apples' || original === 'Eating apples', original);
        }
      }
      assert.ok(evidence.snippets.some(snippet => snippet.text.includes('Eating apples')));
    } finally { await engine.dispose(); }
  }
});
