import assert from 'node:assert/strict';
import { scanSourceCorpus, sourceQueryResult } from '../oracle/query.mjs';
import { sourceMutation } from '../oracle/mutations.mjs';

export function compareQuery(actual, records, schema, query, revision, options = { limit: 100 }) {
  const expected = sourceQueryResult(scanSourceCorpus(records, schema), query, options);
  assert.equal(actual.total, expected.total);
  assert.equal(actual.revision, revision);
  assert.equal(actual.model, 'raveldex-bm25-v1');
  assert.equal(actual.completeness, 'complete');
  assert.deepEqual(actual.hits.map(({ id }) => id), expected.hits.map(({ id }) => id));
  for (let i = 0; i < actual.hits.length; i++) {
    const score = expected.hits[i].score;
    assert.ok(Math.abs(actual.hits[i].score - score) <= Math.max(1e-12, Math.abs(score) * 1e-12), `score: ${actual.hits[i].id}`);
  }
  return expected;
}
export function verifyPilot(corpus, judgments, pilot) {
  compareQuery(pilot.initial, [], corpus.schema, { kind: 'all' }, 0);
  let { records, result } = sourceMutation([], 0, { kind: 'addMany', input: corpus.records });
  assert.deepEqual(pilot.indexed, result);
  assert.equal(pilot.corpusHash, corpus.hash);
  assert.equal(pilot.queries.length, judgments.length);
  let comparisons = 1;
  for (const row of pilot.queries) {
    const judgment = judgments.find(({ id }) => id === row.id);
    assert.ok(judgment, row.id);
    assert.deepEqual(row.query, judgment.query);
    compareQuery(row.result, records, corpus.schema, row.query, result.revision); comparisons++;
  }
  const first = corpus.records[0];
  const operations = [
    ['replace-title-empty', { kind: 'replace', input: { ...first, text: { ...first.text, title: '' } } }],
    ['replace-original', { kind: 'replace', input: first }],
    ['remove-one', { kind: 'remove', input: first.id }],
    ['add-one', { kind: 'add', input: first }],
    ['clear', { kind: 'clear' }],
    ['addMany-original', { kind: 'addMany', input: corpus.records }],
    ['remove-empty', { kind: 'remove', input: [] }],
  ];
  assert.equal(pilot.mutations.length, operations.length);
  for (let i = 0; i < operations.length; i++) {
    const [kind, operation] = operations[i]; const row = pilot.mutations[i];
    assert.equal(row.kind, kind);
    ({ records, result } = sourceMutation(records, result.revision, operation));
    assert.deepEqual(row.result, result);
    for (const search of row.searches) { compareQuery(search.result, records, corpus.schema, search.query, result.revision); comparisons++; }
  }
  compareQuery(pilot.final, records, corpus.schema, { kind: 'all' }, result.revision); comparisons++;
  assert.deepEqual(pilot.errors.map(({ label, code }) => [label, code]), [
    ['duplicate-id', 'ID_EXISTS'], ['unsupported-phrase', 'MISSING_CAPABILITY'], ['invalid-query', 'INVALID_QUERY'],
  ]);
  return { comparisons, mutations: operations.length + 1, correctness: 'Pass' };
}

/** Labels are incomplete; metrics describe authored judgments, not universal relevance. */
export function judgeResults(judgments, pilot) {
  const rows = judgments.map((judgment) => {
    const result = pilot.queries.find(({ id }) => id === judgment.id).result;
    const relevant = new Set([...judgment.intendedIds, ...judgment.acceptableIds]);
    const firstAcceptable = result.hits.findIndex(({ id }) => relevant.has(id));
    const intendedRanks = judgment.intendedIds.map((id) => {
      const index = result.hits.findIndex((hit) => hit.id === id);
      return { id, rank: index < 0 ? null : index + 1 };
    });
    const expectedEmpty = judgment.expectation === 'zero';
    return { ...judgment, total: result.total, hits: result.hits, intendedRanks,
      firstAcceptableRank: firstAcceptable < 0 ? null : firstAcceptable + 1,
      outcome: expectedEmpty ? result.total === 0 ? 'expected-empty' : 'unexpected-match'
        : firstAcceptable < 0 ? result.total === 0 ? 'unintended-empty' : 'missing-judged-source'
          : firstAcceptable < 3 ? 'acceptable-top3' : 'acceptable-below-top3',
      recallAt10: relevant.size === 0 ? null : result.hits.slice(0, 10).filter(({ id }) => relevant.has(id)).length / relevant.size };
  });
  const ranked = rows.filter(({ expectation }) => expectation !== 'zero');
  const empty = rows.filter(({ expectation }) => expectation === 'zero');
  return { labels: 'incomplete judgments over allowlisted sections', retrievalCutoff: 100, rows,
    metrics: { rankedQueries: ranked.length, intendedEmptyQueries: empty.length,
      top1: ranked.filter(({ firstAcceptableRank }) => firstAcceptableRank === 1).length,
      top3: ranked.filter(({ firstAcceptableRank }) => firstAcceptableRank !== null && firstAcceptableRank <= 3).length,
      mrr: ranked.reduce((sum, { firstAcceptableRank }) => sum + (firstAcceptableRank === null ? 0 : 1 / firstAcceptableRank), 0) / ranked.length,
      meanRecallAt10OverJudged: ranked.reduce((sum, { recallAt10 }) => sum + recallAt10, 0) / ranked.length,
      correctEmpty: empty.filter(({ total }) => total === 0).length,
      unexpectedEmpty: ranked.filter(({ total }) => total === 0).length } };
}
