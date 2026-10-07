import assert from 'node:assert/strict';
import test from 'node:test';
import { createSnippetEvidence } from '../../../dist/addons/snippets/index.js';
import { data, frozen, plain, publicEngine, request } from './helpers.mjs';

const snippetRequest = (ids, extra = {}) => request(ids, extra, 'snippets');
const snippetData = result => data(result, 'snippets');
const fields = { title: 'source' };
function boundaries(original) { return new Set([0, original.length, ...[...new Intl.Segmenter('und', { granularity: 'grapheme' }).segment(original)].map(segment => segment.index)]); }
function checkDocument(document, record, { maxSnippets = 3, maxCodeUnits = 240, maxHighlights = 32 } = {}) {
  assert.ok(document.snippets.length <= maxSnippets);
  let represented = 0;
  for (const snippet of document.snippets) {
    const originalValue = record.text[snippet.field], original = typeof originalValue === 'string' ? originalValue : originalValue[snippet.valueIndex];
    const endpoints = boundaries(original);
    assert.equal(snippet.text, original.slice(snippet.start, snippet.end));
    assert.ok(snippet.text.length <= maxCodeUnits && snippet.start < snippet.end);
    assert.ok(endpoints.has(snippet.start) && endpoints.has(snippet.end));
    assert.equal(snippet.omittedBefore, snippet.start > 0); assert.equal(snippet.omittedAfter, snippet.end < original.length);
    assert.ok(snippet.highlights.length <= maxHighlights);
    let previous = 0;
    for (const highlight of snippet.highlights) {
      assert.ok(highlight.start >= previous && highlight.start < highlight.end && highlight.end <= snippet.text.length);
      assert.ok(endpoints.has(snippet.start + highlight.start) && endpoints.has(snippet.start + highlight.end));
      assert.ok(document.ranges.some(range => range.field === snippet.field && range.valueIndex === snippet.valueIndex && range.start < snippet.start + highlight.end && range.end > snippet.start + highlight.start));
      previous = highlight.end;
    }
  }
  for (const range of document.ranges) if (document.snippets.some(snippet => snippet.field === range.field && snippet.valueIndex === range.valueIndex && snippet.highlights.some(highlight => snippet.start + highlight.start <= range.start && snippet.start + highlight.end >= range.end))) represented++;
  assert.equal(document.snippetOmissions.unshownMatches, document.ranges.length - represented);
  assert.ok(document.snippetOmissions.matchTooLong + document.snippetOmissions.graphemeTooLong <= document.snippetOmissions.unshownMatches);
}

test('snippets slice original text, preserve grapheme clusters and mark literal tokens without trusted HTML', async t => {
  const fixtures = [
    { name: 'combining token', original: 'cafe\u0301', query: 'café', ranges: [{ field: 'title', valueIndex: 0, position: 0, start: 0, end: 5, term: 'café' }], marks: [{ start: 0, end: 5 }] },
    { name: 'NFKC expansion never replaces original spelling', original: 'ﬁle', query: 'file', ranges: [{ field: 'title', valueIndex: 0, position: 0, start: 0, end: 3, term: 'file' }], marks: [{ start: 0, end: 3 }] },
    { name: 'supplementary token', original: '𐐀𐐁', query: '𐐨𐐩', ranges: [{ field: 'title', valueIndex: 0, position: 0, start: 0, end: 4, term: '𐐨𐐩' }], marks: [{ start: 0, end: 4 }] },
    { name: 'Indic conjunct mark expands to enclosing grapheme', original: 'क्‍ष', query: 'क्', ranges: [{ field: 'title', valueIndex: 0, position: 0, start: 0, end: 2, term: 'क्' }], marks: [{ start: 0, end: 4 }] },
    { name: 'emoji source context stays literal', original: '👩🏽‍💻 red 🇬🇷', query: 'red', ranges: [{ field: 'title', valueIndex: 0, position: 0, start: 8, end: 11, term: 'red' }], marks: [{ start: 8, end: 11 }] },
    { name: 'unsafe content is ordinary text data', original: '<img src=x onerror=alert(1)>red</img>', query: 'red', ranges: [{ field: 'title', valueIndex: 0, position: 6, start: 28, end: 31, term: 'red' }], marks: [{ start: 28, end: 31 }] },
  ];
  let completeComparisons = 0;
  for (const fixture of fixtures) {
    const record = { id: 'a', text: { title: fixture.original } }; let reference;
    for (const strategy of ['source', 'offsets']) {
      const selectedFields = { title: strategy }, engine = publicEngine(strategy, {}, { fields: selectedFields, snippets: true });
      await engine.add(record); const actual = snippetData(await engine.search(fixture.query, snippetRequest(['a', 'missing'])));
      const document = actual.documents[0]; assert.deepEqual(plain(document.ranges), fixture.ranges, fixture.name);
      assert.deepEqual(plain(document.snippets), [{ field: 'title', valueIndex: 0, start: 0, end: fixture.original.length, text: fixture.original, highlights: fixture.marks, omittedBefore: false, omittedAfter: false }], fixture.name);
      assert.deepEqual(plain(document.snippetOmissions), { unshownMatches: 0, windowLimit: false, highlightLimit: false, matchTooLong: 0, graphemeTooLong: 0 });
      checkDocument(document, record); assert.deepEqual(actual.documents[1].snippets, []); assert.equal(actual.documents[1].eligibility, 'absent');
      assert.equal(Object.hasOwn(document.snippets[0], 'html'), false); frozen(actual);
      if (reference) assert.deepEqual(actual, reference); else reference = actual;
      completeComparisons++; await engine.dispose();
    }
  }
  t.diagnostic(JSON.stringify({ literalGraphemeSourceFixtures: fixtures.length, completeSourceOffsetComparisons: completeComparisons }));
});

test('bounded context and overlapping phrase marks remain original slices with truthful omission flags', async () => {
  const records = [
    { id: 'context', text: { title: '👩🏽‍💻 '.repeat(5) + 'red red red' + ' 🇬🇷'.repeat(8) } },
    { id: 'many', text: { title: ['red', 'red', 'red', 'red'] } },
    { id: 'marks', text: { title: 'red '.repeat(40) } },
  ];
  const engine = publicEngine('source', {}, { fields, snippets: true, factory: { maxSnippets: 1, maxCodeUnits: 16, maxHighlights: 2 } }); await engine.addMany(records);
  const actual = snippetData(await engine.search('red', snippetRequest(records.map(record => record.id))));
  for (const record of records) checkDocument(actual.documents.find(document => document.id === record.id), record, { maxSnippets: 1, maxCodeUnits: 16, maxHighlights: 2 });
  const context = actual.documents[0]; assert.ok(context.snippets[0].omittedBefore); assert.ok(context.snippets[0].omittedAfter);
  assert.ok(context.snippetOmissions.unshownMatches > 0); assert.equal(context.snippetOmissions.highlightLimit, true);
  const many = actual.documents[1]; assert.equal(many.snippets.length, 1); assert.equal(many.snippetOmissions.unshownMatches, 3); assert.equal(many.snippetOmissions.windowLimit, true);
  const marks = actual.documents[2]; assert.ok(marks.snippetOmissions.unshownMatches >= 38); assert.equal(marks.snippetOmissions.highlightLimit, true);
  await engine.dispose();
  const overlapEngine = publicEngine('source', {}, { fields, snippets: true }); await overlapEngine.add({ id: 'a', text: { title: 'red red red' } });
  const query = { kind: 'extension', capability: 'phrases', version: 1, payload: { text: 'red red', fields: ['title'] } };
  const overlapping = snippetData(await overlapEngine.search(query, snippetRequest(['a']))).documents[0];
  assert.equal(overlapping.ranges.length, 3); assert.equal(overlapping.snippets.length, 1); assert.deepEqual(plain(overlapping.snippets[0].highlights), [{ start: 0, end: 3 }, { start: 4, end: 7 }, { start: 8, end: 11 }]);
  assert.equal(overlapping.snippetOmissions.unshownMatches, 0); await overlapEngine.dispose();
});

test('a whole original token or enclosing grapheme beyond the cap is explicitly unavailable without clipping its marks', async () => {
  const records = [
    { id: 'token', text: { title: 'abcdefghijklmnop' } },
    { id: 'grapheme', text: { title: 'a\u200d' + '\u0301'.repeat(250) } },
  ];
  const engine = publicEngine('source', {}, { fields, snippets: true, factory: { maxCodeUnits: 3 } }); await engine.addMany(records);
  const token = snippetData(await engine.search('abcdefghijklmnop', snippetRequest(['token']))).documents[0];
  assert.equal(token.ranges.length, 1); assert.deepEqual(token.snippets, []); assert.deepEqual(plain(token.snippetOmissions), { unshownMatches: 1, windowLimit: false, highlightLimit: false, matchTooLong: 1, graphemeTooLong: 0 });
  const grapheme = snippetData(await engine.search('a', snippetRequest(['grapheme']))).documents[0];
  assert.deepEqual(plain(grapheme.ranges), [{ field: 'title', valueIndex: 0, position: 0, start: 0, end: 1, term: 'a' }]); assert.deepEqual(grapheme.snippets, []);
  assert.deepEqual(plain(grapheme.snippetOmissions), { unshownMatches: 1, windowLimit: false, highlightLimit: false, matchTooLong: 0, graphemeTooLong: 1 });
  await engine.dispose();
});

test('missing Intl.Segmenter rejects requested snippets even on empty selections while range and ordinary search still work', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(Intl, 'Segmenter');
  const engine = publicEngine('source', {}, { fields, snippets: true }); await engine.add({ id: 'a', text: { title: 'red' } });
  try {
    Object.defineProperty(Intl, 'Segmenter', { value: undefined, configurable: true, writable: true });
    for (const [query, ids] of [[{ kind: 'none' }, []], ['red', ['a']]]) await assert.rejects(engine.search(query, snippetRequest(ids)), { code: 'UNSUPPORTED_ENVIRONMENT', message: 'Raveldex: UNSUPPORTED_ENVIRONMENT' });
    assert.equal((await engine.search('red')).total, 1);
    const range = publicEngine('source', {}, { fields }); await range.add({ id: 'a', text: { title: 'red' } }); assert.equal(data(await range.search('red', request(['a']))).documents[0].ranges.length, 1); await range.dispose();
  } finally { Object.defineProperty(Intl, 'Segmenter', descriptor); await engine.dispose(); }
});
