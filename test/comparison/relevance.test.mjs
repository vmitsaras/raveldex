import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { calculateMetrics, classifyOutcome, containsPhrase, judgeRanking, loadFrozenFixture, publicQuery, sha256, validateJudgments } from '../../bench/relevance-lib.mjs';
import { scanPhraseSourceCorpus, sourcePhraseQueryResult } from '../oracle/phrases.mjs';

const judgment = (id, acceptableIds, options = {}) => ({
  id, query: id, intent: 'Fixture question', semantics: 'Exact fixture semantics', sourceRationale: 'Authored fixture labels', category: 'keyword',
  expectation: acceptableIds.length ? 'known-relevant' : 'intended-empty',
  mustFindIds: acceptableIds, acceptableIds, knownIrrelevantIds: [], labelsComplete: true,
  ...(acceptableIds.length ? {} : { emptyReason: 'fixture-empty' }), ...options,
});
const result = (id, ids, total = ids.length) => ({ id, total, hits: ids.map(id => ({ id, score: 0 })) });

test('ranking metrics exclude intended empty queries while retaining known-answer empty misses', () => {
  const judgments = [judgment('one', ['a', 'b', 'c']), judgment('two', ['d']), judgment('empty', []), judgment('wrong-empty', [])];
  const rows = [result('one', ['unknown', 'a', 'b']), result('two', []), result('empty', []), result('wrong-empty', ['unknown'])];
  const metrics = calculateMetrics(judgments, rows);
  assert.deepEqual(metrics.top1, { numerator: 0, denominator: 2, value: 0 });
  assert.deepEqual(metrics.top3, { numerator: 1, denominator: 2, value: 0.5 });
  assert.deepEqual(metrics.mrr, { reciprocalRankSum: 0.5, denominator: 2, value: 0.25 });
  assert.deepEqual(metrics.recall10Macro, { recallSum: 2 / 3, denominator: 2, value: 1 / 3 });
  assert.deepEqual(metrics.recall10Micro, { numerator: 2, denominator: 4, value: 0.5 });
  assert.deepEqual(metrics.correctIntendedEmpty, { numerator: 1, denominator: 2, value: 0.5 });
  assert.deepEqual(metrics.unintendedEmpty, { numerator: 1, denominator: 2, value: 0.5 });
  assert.deepEqual(metrics.unexpectedNonempty, { numerator: 1, denominator: 2, value: 0.5 });
});

test('MRR records rank beyond ten; recall denominator stays known labels and not retrieved count', () => {
  const row = judgeRanking(judgment('late', ['answer', 'unretrieved']), result('late', [...Array.from({ length: 10 }, (_, index) => `unknown${index}`), 'answer']));
  assert.equal(row.firstAcceptableRank, 11);
  assert.equal(row.reciprocalRank, 1 / 11);
  assert.equal(row.recall10, 0);
  assert.equal(row.top1, false);
  assert.equal(row.top3, false);
  assert.deepEqual(row.mustFindMissingFromCompleteResults, ['unretrieved']);
  assert.equal(row.completeRanking, true);
});

test('empty metric groups have explicit null values rather than NaN or fabricated success', () => {
  const metrics = calculateMetrics([judgment('empty', [])], [result('empty', [])]);
  assert.deepEqual(metrics.top1, { numerator: 0, denominator: 0, value: null });
  assert.equal(metrics.mrr.value, null);
  assert.equal(metrics.recall10Macro.value, null);
  assert.equal(metrics.recall10Micro.value, null);
  assert.equal(metrics.correctIntendedEmpty.value, 1);
});

test('metrics reject reordered, duplicate or inconsistent ranked observations', () => {
  assert.throws(() => calculateMetrics([judgment('a', ['a'])], [result('b', ['a'])]), /identity differs/);
  assert.throws(() => judgeRanking(judgment('a', ['a']), result('a', ['a', 'a'])), /Duplicate ranked ID/);
  assert.throws(() => judgeRanking(judgment('a', ['a']), result('a', ['a'], 0)));
});

test('labels validate unique known sources, disjoint irrelevant sets and expected-zero support', () => {
  const records = [{ id: 'a' }, { id: 'b' }];
  validateJudgments(records, [judgment('one', ['a'])]);
  assert.throws(() => validateJudgments(records, [judgment('one', ['missing'])]), /unknown/);
  assert.throws(() => validateJudgments(records, [judgment('one', ['a'], { knownIrrelevantIds: ['a'] })]), /conflicting label/);
  assert.throws(() => validateJudgments(records, [judgment('one', ['a'], { mustFindIds: ['b'] })]), /must-find is acceptable/);
  assert.throws(() => validateJudgments(records, [judgment('one', [], { labelsComplete: false })]));
});

test('query mapping preserves explicit phrase leaves through nested Boolean branches', () => {
  const phrase = { kind: 'phrase', text: 'original text', fields: ['body'] };
  const query = { kind: 'or', children: ['source', { kind: 'not', child: phrase }] };
  assert.equal(containsPhrase(query), true);
  assert.equal(containsPhrase('"original text"'), false);
  assert.deepEqual(publicQuery(query), { kind: 'or', children: ['source', { kind: 'not', child: { kind: 'extension', capability: 'phrases', version: 1, payload: { text: 'original text', fields: ['body'] } } }] });
});

test('failed/zero classifications separate lexical eligibility, ranking and intended emptiness', () => {
  const known = judgment('known', ['a']);
  const absent = result('known', []);
  assert.equal(classifyOutcome(known, absent, absent, judgeRanking(known, absent)).category, 'lexical-mismatch');
  const late = result('known', ['x', 'a']);
  const classified = classifyOutcome(known, late, late, judgeRanking(known, late));
  assert.equal(classified.category, 'rank-ordering');
  assert.deepEqual(classified.issues, ['top1-miss']);
  const intended = judgment('empty', []), zero = result('empty', []);
  assert.equal(classifyOutcome(intended, zero, zero, judgeRanking(intended, zero)).category, 'intended-empty');
  const unexpected = result('empty', ['a']);
  assert.equal(classifyOutcome(intended, unexpected, zero, judgeRanking(intended, unexpected)).category, 'contract-or-evaluation-failure');
  const partial = judgment('partial', ['a', 'b']), onlyA = result('partial', ['a']);
  assert.equal(classifyOutcome(partial, onlyA, onlyA, judgeRanking(partial, onlyA)).category, 'lexical-coverage');
  const mixed = result('partial', ['x', 'a']);
  assert.equal(classifyOutcome(partial, mixed, mixed, judgeRanking(partial, mixed)).category, 'mixed-lexical-and-rank');
});

test('the source corpus and source-authored judgments remain frozen and useful', async () => {
  const { corpus, judgments, context, freeze } = await loadFrozenFixture();
  assert.equal(corpus.records.length, 34);
  assert.equal(corpus.sources.length, 5);
  assert.equal(judgments.length, 76);
  assert.equal(judgments.filter(row => row.expectation === 'intended-empty').length, 6);
  assert.equal(judgments.filter(row => row.category === 'natural-question').length, 8);
  assert.ok(judgments.filter(row => containsPhrase(row.query)).length >= 10);
  assert.ok(judgments.some(row => row.category === 'ambiguous'));
  assert.ok(judgments.some(row => row.category === 'typed-metadata'));
  assert.ok(judgments.some(row => row.category === 'typed-prefix'));
  assert.equal(context.corpusHash, corpus.hash);
  assert.equal(freeze.context.author, context.author);
  for (let index = 0; index < corpus.records.length; index += 1) {
    assert.equal(sha256(JSON.stringify(corpus.records[index])), corpus.sections[index].contentHash);
    assert.ok(corpus.records[index].text.body.trim());
    assert.ok(corpus.sections[index].sourceUrl.endsWith(`#${corpus.sections[index].anchor}`));
  }
});

test('independent complete source scan verifies all six frozen intended-empty cases', async () => {
  const { corpus, judgments } = await loadFrozenFixture();
  const oracle = scanPhraseSourceCorpus(corpus.records, corpus.schema);
  for (const row of judgments.filter(row => row.expectation === 'intended-empty')) {
    assert.equal(sourcePhraseQueryResult(oracle, row.query, { limit: 100 }).total, 0, row.id);
  }
});

test('the relevance harness uses public package imports and the independent oracle has no production imports', async () => {
  const runner = await readFile(new URL('../../bench/relevance.mjs', import.meta.url), 'utf8');
  assert.match(runner, /from '@vmitsaras\/raveldex'/);
  assert.doesNotMatch(runner, /(?:from|import\()\s*['"][^'"]*\/dist\//);
  for (const name of ['query.mjs', 'phrases.mjs']) {
    const source = await readFile(new URL(`../oracle/${name}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /(?:from|import\()\s*['"][^'"]*(?:\/src\/|\/dist\/|@vmitsaras\/raveldex)/);
  }
});
