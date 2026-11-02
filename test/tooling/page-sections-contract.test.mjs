import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRaveldex } from '../../dist/index.js';
import { createSourceProvider } from '../../dist/addons/phrases/source.js';
import { createPositionProvider } from '../../dist/addons/positions/index.js';
import { createMatchEvidence } from '../../dist/addons/evidence/index.js';

const fixture = async name => JSON.parse(await readFile(new URL(`../fixtures/page-sections/${name}.json`, import.meta.url), 'utf8'));
const corpus = await fixture('corpus'), projection = await fixture('projection');
const value = (record, field, index) => Array.isArray(record.text[field]) ? record.text[field][index] : index === 0 ? record.text[field] : undefined;
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) <= Math.max(1e-12, Math.abs(expected) * 1e-12), `${actual} != handwritten ${expected}`);

test('handwritten section fixtures retain exact Unicode slices, independent arithmetic and encoded anchors', async () => {
  const record = corpus.records[0];
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  for (const slice of corpus.sourceSlices) {
    const original = value(record, slice.field, slice.valueIndex);
    assert.equal(original.slice(slice.start, slice.end), slice.text);
    const boundaries = new Set([...segmenter.segment(original)].map(part => part.index)); boundaries.add(original.length);
    assert.ok(boundaries.has(slice.start) && boundaries.has(slice.end), 'literal spans end at actual grapheme boundaries');
  }
  for (const token of corpus.allOriginalTokens) assert.equal(value(record, token.field, token.valueIndex).slice(token.start, token.end), token.text);
  const idf = Math.log(10 / 9);
  const handwritten = { 'cross-section': idf * (11 / 7 + 1), 'two-groups': idf * (11 / 7 + 11 / 8),
    prefix: idf * 11 / 7, unicode: idf, 'title-only': idf, 'mixed-fields': 2 * idf, 'no-positive-ranges': 0 };
  for (const query of corpus.queries) close(query.expectedScore, handwritten[query.id]);
  for (const link of projection.expectedURLs) {
    const parent = corpus.documents.find(document => document.id === link.pageId).url;
    assert.equal(parent + '#' + encodeURIComponent(link.anchor), link.url);
    const resolved = new URL(link.url), original = new URL(parent);
    assert.equal(resolved.origin, original.origin); assert.equal(resolved.pathname, original.pathname);
    assert.equal(decodeURIComponent(resolved.hash.slice(1)), link.anchor);
  }
  for (const scenario of projection.cases) for (const expected of scenario.expected) {
    const page = scenario.mapOverride?.pageId === expected.pageId ? scenario.mapOverride : projection.pages.find(page => page.pageId === expected.pageId);
    for (const excerpt of expected.excerpts) {
      const section = page.sections.find(section => section.anchor === excerpt.anchor);
      const source = corpus.sourceSlices[excerpt.sourceSliceIndex];
      assert.equal(section.field, source.field); assert.equal(section.valueIndex, source.valueIndex);
      assert.equal(section.start, source.start); assert.equal(section.end, source.end);
      for (const [start, end] of excerpt.highlights) {
        assert.ok(start >= 0 && start < end && end <= source.text.length);
        assert.ok(corpus.allOriginalTokens.some(token => token.field === source.field && token.valueIndex === source.valueIndex
          && token.start === source.start + start && token.end === source.start + end), 'expected mark corresponds to a literal original token');
      }
    }
  }
  for (const scenario of (await fixture('urls')).cases) {
    const candidate = scenario.mapped ? scenario.parentURL + '#' + encodeURIComponent(scenario.anchor) : scenario.parentURL;
    if (scenario.expectedURL) assert.equal(candidate, scenario.expectedURL);
    if (scenario.expectedLength) assert.equal(candidate.length, scenario.expectedLength);
    if (scenario.candidateLength) assert.equal(candidate.length, scenario.candidateLength);
  }
  for (const scenario of (await fixture('windows')).cases) {
    const text = scenario.record.text.body;
    const snippets = scenario.expected.previews?.map(preview => preview.snippet) ?? [scenario.expected.snippet];
    for (const snippet of snippets.filter(Boolean)) {
      assert.equal(text.slice(snippet.start, snippet.end), snippet.text, 'window expectation is a literal original slice');
      assert.ok(snippet.text.length <= scenario.maxCodeUnits);
      for (const [start, end] of snippet.highlights) assert.ok(start >= 0 && start < end && end <= snippet.text.length);
    }
  }
});

test('current native source and offset evidence matches handwritten page totals, ID ties, scores, paging and original ranges', async () => {
  let pageComparisons = 0, evidenceComparisons = 0;
  for (const strategy of ['source', 'offsets']) {
    const fields = ['body', 'title'];
    const engine = createRaveldex({ schema: corpus.schema, addons: [createSourceProvider({ fields }),
      ...(strategy === 'offsets' ? [createPositionProvider({ fields, offsets: fields })] : []),
      createMatchEvidence({ fields: Object.fromEntries(fields.map(field => [field, strategy])) })] });
    try {
      const written = await engine.addMany(corpus.records);
      for (const scenario of corpus.queries) {
        for (const page of corpus.expectedPages.pages) {
          const actual = await engine.search(scenario.query, { offset: page.offset, limit: page.limit });
          assert.equal(actual.total, corpus.expectedPages.total); assert.equal(actual.revision, written.revision);
          assert.equal(actual.completeness, 'complete');
          assert.deepEqual(actual.hits.map(hit => hit.id), page.ids);
          for (const hit of actual.hits) close(hit.score, scenario.expectedScore);
          pageComparisons++;
        }
        const actual = await engine.search(scenario.query, { limit: 2, extensions: {
          'match-evidence': { ids: corpus.expectedPages.ids, fields, expectedRevision: written.revision } } });
        const evidence = actual.extensions['match-evidence'];
        assert.equal(evidence.complete, true); assert.equal(evidence.revision, actual.revision);
        assert.deepEqual(evidence.fields, fields);
        const expectedRanges = scenario.expectedTokenIndices.map(index => {
          const { text, ...range } = corpus.allOriginalTokens[index]; return range;
        });
        assert.deepEqual(evidence.documents.map(document => document.id), corpus.expectedPages.ids);
        for (const document of evidence.documents) {
          assert.equal(document.eligibility, 'matched'); assert.deepEqual(document.ranges.map(range => ({ ...range })), expectedRanges);
          evidenceComparisons++;
        }
      }
    } finally { await engine.dispose(); }
  }
  assert.equal(pageComparisons, 56); assert.equal(evidenceComparisons, 56);
  // Check the excerpt-boundary fixtures' input evidence as well, without
  // implementing the future window selection or section projection algorithm.
  for (const scenario of (await fixture('windows')).cases) {
    const engine = createRaveldex({ schema: { text: { body: {} } }, addons: [
      createSourceProvider({ fields: ['body'] }), createMatchEvidence({ fields: { body: 'source' } })] });
    try {
      const written = await engine.add(scenario.record);
      const actual = await engine.search(scenario.query, { limit: 1, extensions: {
        'match-evidence': { ids: [scenario.record.id], expectedRevision: written.revision } } });
      assert.equal(actual.total, 1); assert.equal(actual.hits[0].id, scenario.record.id);
      assert.deepEqual(actual.extensions['match-evidence'].documents[0].ranges.map(range => [range.start, range.end]), scenario.positiveRanges);
    } finally { await engine.dispose(); }
  }
});

test('future section and static compatibility scenarios remain explicit independent descriptors with named owners', async () => {
  const failures = await fixture('failures'), compatibility = await fixture('compatibility');
  for (const cases of [projection.cases, failures.failureCases, failures.limitCases, compatibility.cases,
    (await fixture('urls')).cases, (await fixture('windows')).cases]) {
    assert.ok(cases.length > 0);
    assert.equal(new Set(cases.map(item => item.id)).size, cases.length);
  }
  assert.equal(corpus.executionMatrix.length, 4);
  assert.ok(failures.runtimeOwner.includes('RX-6005'));
  assert.ok(failures.failureCases.some(item => item.id === 'main-evidence-race'));
  assert.ok(compatibility.cases.some(item => JSON.stringify(item).includes('INCOMPATIBLE_ARTIFACT')));
  // This validates fixture integrity and current native prerequisites only.
  // It deliberately implements no future section selector, renderer or loader.
});
