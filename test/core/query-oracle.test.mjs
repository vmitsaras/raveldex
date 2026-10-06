import assert from 'node:assert/strict';
import test from 'node:test';
import { IndexConstruction } from '../../dist/core/index/construction.js';
import { executeSearch } from '../../dist/core/query/search.js';
import { originalSourceTokens, scanSourceCorpus, sourceQueryResult } from '../oracle/query.mjs';
import {
  NUMERIC_SCHEMA, numericRecords, handScores, QUERY_SCHEMA, queryRecords, handQueryCases,
  MULTIFIELD_SCHEMA, multiFieldRecords, multiFieldHandScores,
  QUERY_CORPUS_SEEDS, GENERATED_QUERY_COUNT, generatedQueryCorpus, generatedQueries,
  text, group, exact, prefix, and, or, not, eq,
} from '../fixtures/ranking/query.mjs';

function drain(iterator) {
  for (;;) {
    const step = iterator.next();
    if (step.done) return step.value;
    assert.ok(Number.isSafeInteger(step.value.workUnits) && step.value.workUnits > 0);
  }
}

function build(records, schema = QUERY_SCHEMA) {
  const construction = new IndexConstruction({ schema });
  for (let start = 0; start < records.length; start += 256) drain(construction.append(records.slice(start, start + 256)));
  return drain(construction.finish());
}

function closeScore(actual, expected, message) {
  assert.ok(Number.isFinite(actual), `${message}: finite score`);
  const tolerance = Math.max(1e-12, Math.abs(expected) * 1e-12);
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} versus ${expected} (tolerance ${tolerance})`);
}

function compareQuery(root, corpus, query, options = { limit: 100 }, context = '') {
  const expected = sourceQueryResult(corpus, query, options);
  const actual = drain(executeSearch(root, query, options));
  const description = `${context} ${JSON.stringify({ query, options })}`;
  assert.equal(actual.revision, 0, description);
  assert.equal(actual.model, 'raveldex-bm25-v1', description);
  assert.equal(actual.completeness, 'complete', description);
  assert.equal(actual.total, expected.total, description);
  assert.deepEqual(actual.hits.map(({ id }) => id), expected.hits.map(({ id }) => id), description);
  for (let index = 0; index < actual.hits.length; index++) {
    closeScore(actual.hits[index].score, expected.hits[index].score, `${description} ${actual.hits[index].id}`);
  }
  return { actual, expected };
}

test('independent query reference reads original Unicode spans without normalizing or retokenizing the whole source', () => {
  assert.deepEqual(originalSourceTokens('😀½ a\u0301 \uFDFA ﬁle'), [
    { term: '1⁄2', start: 2, end: 3 },
    { term: 'á', start: 4, end: 6 },
    { term: 'صلى الله عليه وسلم', start: 7, end: 8 },
    { term: 'file', start: 9, end: 12 },
  ]);
  assert.deepEqual(originalSourceTokens('1/2').map(({ term }) => term), ['1', '2']);
  assert.deepEqual(originalSourceTokens('\u0301 😀!'), []);
});

test('hand-stated query membership and source-derived participation agree with complete native results', () => {
  const root = build(queryRecords);
  const corpus = scanSourceCorpus(queryRecords, QUERY_SCHEMA);
  for (const fixture of handQueryCases) {
    const { actual, expected } = compareQuery(root, corpus, fixture.query, { limit: 100 }, fixture.name);
    assert.deepEqual(expected.hits.map(({ id }) => id).sort(), [...fixture.ids].sort(), `reference ${fixture.name}`);
    assert.deepEqual(actual.hits.map(({ id }) => id).sort(), [...fixture.ids].sort(), `native ${fixture.name}`);
    if (fixture.orderedIds) assert.deepEqual(actual.hits.map(({ id }) => id), fixture.orderedIds, fixture.name);
    if (fixture.zero) for (const hit of actual.hits) assert.equal(hit.score, 0, fixture.name);
  }
});

test('failed Boolean branches, duplicate groups, and double NOT have independently stated participation', () => {
  const root = build(queryRecords);
  const corpus = scanSourceCorpus(queryRecords, QUERY_SCHEMA);
  const red = sourceQueryResult(corpus, 'red', { limit: 100 });
  const redById = new Map(red.hits.map(({ id, score }) => [id, score]));
  for (const query of [and(text('red'), text('RED')), and(text('red'), or(text('RED'), { kind: 'none' }))]) {
    const { actual, expected } = compareQuery(root, corpus, query);
    for (const hit of actual.hits) {
      assert.equal(expected.participation.get(hit.id).length, 1);
      closeScore(hit.score, redById.get(hit.id), `single red contribution ${hit.id}`);
    }
  }
  const blueById = new Map(sourceQueryResult(corpus, 'blue', { limit: 100 }).hits.map(({ id, score }) => [id, score]));
  const failed = compareQuery(root, corpus, or(and(text('red'), text('absent')), text('blue')));
  for (const hit of failed.actual.hits) {
    assert.equal(failed.expected.participation.get(hit.id).length, 1);
    closeScore(hit.score, blueById.get(hit.id), `only successful blue branch ${hit.id}`);
  }
  const negative = compareQuery(root, corpus, not(not(text('red'))));
  for (const hit of negative.actual.hits) {
    assert.equal(negative.expected.participation.get(hit.id).length, 0);
    assert.equal(hit.score, 0);
  }
});

for (const [name, schema, records, constants] of [
  ['one field', NUMERIC_SCHEMA, numericRecords, handScores],
  ['multiple fields and tokenless/missing values', MULTIFIELD_SCHEMA, multiFieldRecords, multiFieldHandScores],
]) {
  test(`hand-derived numerical constants: ${name}`, () => {
    const root = build(records, schema);
    const corpus = scanSourceCorpus(records, schema);
    const cases = [
      ['red', 'red'],
      ['car', 'car'],
      ['and', 'red car'],
      ['alternatives', group([exact('red'), exact('car')])],
    ];
    for (const [kind, query] of cases) {
      const { actual, expected } = compareQuery(root, corpus, query);
      assert.equal(actual.hits.length, Object.keys(constants[kind]).length);
      for (const hit of actual.hits) closeScore(hit.score, constants[kind][hit.id], `native ${name} ${kind}/${hit.id}`);
      for (const hit of expected.hits) closeScore(hit.score, constants[kind][hit.id], `reference ${name} ${kind}/${hit.id}`);
    }
  });
}

test('source-derived field populations exclude missing, empty arrays, whitespace and tokenless fields', () => {
  const corpus = scanSourceCorpus(multiFieldRecords, MULTIFIELD_SCHEMA);
  assert.equal(corpus.statistics.get('title').population, 3);
  assert.equal(corpus.statistics.get('title').totalLength, 6);
  assert.equal(corpus.statistics.get('title').documentFrequencies.get('red'), 2);
  assert.equal(corpus.statistics.get('body').population, 2);
  assert.equal(corpus.statistics.get('body').totalLength, 4);
  assert.equal(corpus.statistics.get('body').documentFrequencies.get('red'), 1);
  const root = build(multiFieldRecords, MULTIFIELD_SCHEMA);
  const reduced = build(multiFieldRecords.slice(0, 3), MULTIFIELD_SCHEMA);
  assert.deepEqual(drain(executeSearch(root, 'red car')), drain(executeSearch(reduced, 'red car')));
});

test('duplicate alternatives and exact/prefix overlap retain only the greatest contribution within each field', () => {
  const corpus = scanSourceCorpus(queryRecords, QUERY_SCHEMA);
  const root = build(queryRecords);
  const baseline = compareQuery(root, corpus, group([exact('car')])).actual;
  const duplicate = compareQuery(root, corpus, group([exact('car'), exact('CAR'), exact('car', 0.25)])).actual;
  assert.deepEqual(duplicate, baseline);
  const prefixBase = compareQuery(root, corpus, group([prefix('ca')])).actual;
  const overlap = compareQuery(root, corpus, group([prefix('ca'), prefix('car', 0.75), exact('car', 0.5)])).actual;
  assert.deepEqual(overlap, prefixBase);
  const weighted = compareQuery(root, corpus, group([prefix('ca', 0.25)])).actual;
  assert.deepEqual(weighted.hits.map(({ id }) => id), prefixBase.hits.map(({ id }) => id));
  for (let i = 0; i < weighted.hits.length; i++) closeScore(weighted.hits[i].score, 0.25 * prefixBase.hits[i].score, weighted.hits[i].id);
});

test('different explicit weights and field selections are separate scoring groups', () => {
  const corpus = scanSourceCorpus(queryRecords, QUERY_SCHEMA);
  const root = build(queryRecords);
  const query = and(group([exact('red')], ['title']), group([exact('red', 0.5)], ['title']), text('red', ['body']));
  const { actual, expected } = compareQuery(root, corpus, query);
  assert.ok(actual.hits.length > 0);
  for (const hit of actual.hits) assert.equal(expected.participation.get(hit.id).length, 3);
});

test('reordered normalized variants and selected fields preserve canonical deduplication and exact arithmetic', () => {
  const corpus = scanSourceCorpus(queryRecords, QUERY_SCHEMA);
  const root = build(queryRecords);
  const first = group([exact('red'), exact('car', 0.5), prefix('ca', 0.25)], ['title', 'body']);
  const reordered = group([prefix('CA', 0.25), exact('CAR', 0.5), exact('RED')], ['body', 'title']);
  const baseline = compareQuery(root, corpus, first).actual;
  assert.deepEqual(compareQuery(root, corpus, reordered).actual, baseline);
  const duplicate = compareQuery(root, corpus, and(first, reordered));
  assert.deepEqual(duplicate.actual, baseline);
  for (const hit of duplicate.actual.hits) assert.equal(duplicate.expected.participation.get(hit.id).length, 1);
});

test('empty corpus is complete for all, negative-only, lexical and equality queries', () => {
  const root = build([]);
  const corpus = scanSourceCorpus([], QUERY_SCHEMA);
  for (const query of [{ kind: 'all' }, { kind: 'none' }, not(text('red')), 'red', '', eq('kind', null), group([prefix('ca')])]) {
    const { actual } = compareQuery(root, corpus, query);
    assert.equal(actual.total, 0);
    assert.deepEqual(actual.hits, []);
  }
});

test('generated query fixtures reproduce seeds and cover varied source structures', () => {
  const seed = QUERY_CORPUS_SEEDS[0];
  assert.deepEqual(generatedQueryCorpus(seed), generatedQueryCorpus(seed));
  assert.deepEqual(generatedQueries(seed), generatedQueries(seed));
  assert.equal(generatedQueries(seed).length, GENERATED_QUERY_COUNT);
  assert.notDeepEqual(generatedQueryCorpus(seed), generatedQueryCorpus(QUERY_CORPUS_SEEDS[1]));
  assert.notDeepEqual(generatedQueries(seed), generatedQueries(QUERY_CORPUS_SEEDS[1]));
  const records = generatedQueryCorpus(seed);
  assert.equal(new Set(records.map(({ id }) => id)).size, records.length);
  assert.ok(records.some(({ text: source }) => Object.keys(source).length < 3));
  assert.ok(records.some(({ text: source }) => Object.values(source).some(Array.isArray)));
});

for (const seed of QUERY_CORPUS_SEEDS) {
  test(`complete Boolean/field/equality/prefix/numerical parity, seed 0x${seed.toString(16)}`, () => {
    const records = generatedQueryCorpus(seed);
    const corpus = scanSourceCorpus(records, QUERY_SCHEMA);
    const roots = [build(records), build([...records].reverse()), build([...records.slice(13), ...records.slice(0, 13)])];
    for (const [queryIndex, query] of generatedQueries(seed).entries()) {
      const results = roots.map((root, order) => compareQuery(root, corpus, query, { limit: 100 }, `seed=${seed} query=${queryIndex} order=${order}`).actual);
      assert.deepEqual(results[1], results[0], 'reverse corpus preserves exact numerical results');
      assert.deepEqual(results[2], results[0], 'rotated corpus preserves exact numerical results');
    }
    // Pages are projections of complete membership, including default 20 and zero limit.
    for (const options of [{}, { limit: 0 }, { limit: 1 }, { limit: 5, offset: 7 }, { limit: 0, offset: 100 }]) {
      compareQuery(roots[0], corpus, or({ kind: 'all' }, text('red car', undefined, 'or')), options, `pagination seed=${seed}`);
    }
    assert.deepEqual(drain(executeSearch(roots[0], 'red')), drain(executeSearch(roots[0], 'red')), 'repeated query preserves exact result');
  });
}
