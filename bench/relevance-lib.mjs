import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { JUDGMENT_CONTEXT, RELEVANCE_JUDGMENTS } from '../test/fixtures/relevance/judgments.mjs';

export const RELEVANCE_CUTOFF = 100;
export const sha256 = value => createHash('sha256').update(value).digest('hex');

export function validateJudgments(records, judgments) {
  const ids = new Set(records.map(record => record.id));
  assert.equal(ids.size, records.length, 'Corpus IDs must be unique');
  const queryIds = new Set();
  for (const judgment of judgments) {
    assert.ok(!queryIds.has(judgment.id), `Duplicate judgment ${judgment.id}`);
    queryIds.add(judgment.id);
    assert.ok(['known-relevant', 'intended-empty'].includes(judgment.expectation));
    for (const key of ['mustFindIds', 'acceptableIds', 'knownIrrelevantIds']) {
      assert.ok(Array.isArray(judgment[key]), `${judgment.id}: ${key}`);
      assert.equal(new Set(judgment[key]).size, judgment[key].length, `${judgment.id}: duplicate labels`);
      for (const id of judgment[key]) assert.ok(ids.has(id), `${judgment.id}: unknown ${id}`);
    }
    for (const id of judgment.mustFindIds) assert.ok(judgment.acceptableIds.includes(id), `${judgment.id}: must-find is acceptable`);
    for (const id of judgment.knownIrrelevantIds) assert.ok(!judgment.acceptableIds.includes(id), `${judgment.id}: conflicting label`);
    if (judgment.expectation === 'intended-empty') {
      assert.equal(judgment.acceptableIds.length, 0, `${judgment.id}: empty expectation has relevant labels`);
      assert.ok(judgment.labelsComplete && judgment.emptyReason);
    } else assert.ok(judgment.acceptableIds.length > 0, `${judgment.id}: empty known-relevant denominator`);
    assert.ok(judgment.intent && judgment.semantics && judgment.sourceRationale && judgment.category);
  }
}

export async function loadFrozenFixture() {
  const base = new URL('../test/fixtures/relevance/', import.meta.url);
  const corpusBytes = await readFile(new URL('corpus.json', base));
  const judgmentBytes = await readFile(new URL('judgments.mjs', base));
  const freeze = JSON.parse(await readFile(new URL('freeze.json', base), 'utf8'));
  assert.equal(sha256(corpusBytes), freeze.files['corpus.json'], 'Frozen corpus bytes changed');
  assert.equal(sha256(judgmentBytes), freeze.files['judgments.mjs'], 'Frozen judgments changed');
  const corpus = JSON.parse(corpusBytes);
  const { hash, ...content } = corpus;
  assert.equal(sha256(JSON.stringify(content)), hash, 'Corpus content hash differs');
  assert.equal(hash, freeze.corpusHash);
  assert.equal(hash, JUDGMENT_CONTEXT.corpusHash);
  assert.equal(corpus.records.length, freeze.records);
  assert.equal(RELEVANCE_JUDGMENTS.length, freeze.judgments);
  validateJudgments(corpus.records, RELEVANCE_JUDGMENTS);
  return { corpus, judgments: RELEVANCE_JUDGMENTS, freeze, context: JUDGMENT_CONTEXT };
}

export function containsPhrase(query) {
  if (typeof query === 'string') return false;
  if (query.kind === 'phrase') return true;
  if (query.children) return query.children.some(containsPhrase);
  return query.child ? containsPhrase(query.child) : false;
}

/** Test fixture phrases become an explicit public extension, never parsed text. */
export function publicQuery(query) {
  if (typeof query === 'string') return query;
  if (query.kind === 'phrase') return {
    kind: 'extension', capability: 'phrases', version: 1,
    payload: { text: query.text, ...(query.fields ? { fields: query.fields } : {}) },
  };
  if (query.children) return { ...query, children: query.children.map(publicQuery) };
  if (query.child) return { ...query, child: publicQuery(query.child) };
  return query;
}

export function judgeRanking(judgment, result, cutoff = RELEVANCE_CUTOFF) {
  assert.ok(Number.isSafeInteger(cutoff) && cutoff >= 10);
  assert.ok(Number.isSafeInteger(result.total) && result.total >= 0);
  assert.ok(result.hits.length <= cutoff && result.hits.length <= result.total);
  const ids = result.hits.map(hit => hit.id);
  assert.equal(new Set(ids).size, ids.length, 'Duplicate ranked ID');
  const acceptable = new Set(judgment.acceptableIds);
  const rank = ids.findIndex(id => acceptable.has(id));
  const knownRelevantCount = acceptable.size;
  const knownRelevantInTop10 = ids.slice(0, 10).filter(id => acceptable.has(id)).length;
  return {
    id: judgment.id, expectation: judgment.expectation,
    firstAcceptableRank: rank === -1 ? null : rank + 1,
    top1: rank === 0, top3: rank >= 0 && rank < 3,
    reciprocalRank: rank === -1 ? 0 : 1 / (rank + 1),
    recall10: knownRelevantCount ? knownRelevantInTop10 / knownRelevantCount : null,
    knownRelevantInTop10, knownRelevantCount,
    mustFindMissingFromCompleteResults: judgment.mustFindIds.filter(id => !ids.includes(id)),
    knownIrrelevantInTop10: ids.slice(0, 10).filter(id => judgment.knownIrrelevantIds.includes(id)),
    intendedEmpty: judgment.expectation === 'intended-empty',
    returnedEmpty: result.total === 0,
    retrievalCutoff: cutoff,
    completeRanking: result.total <= cutoff && result.hits.length === result.total,
  };
}

/** Macro recall uses each query's known relevant set, never returned-count. */
export function calculateMetrics(judgments, results, cutoff = RELEVANCE_CUTOFF) {
  assert.equal(judgments.length, results.length, 'One ordered result per judgment required');
  const rows = judgments.map((judgment, index) => {
    assert.equal(results[index].id, judgment.id, 'Result/judgment identity differs');
    return judgeRanking(judgment, results[index], cutoff);
  });
  const ranked = rows.filter(row => !row.intendedEmpty);
  const empty = rows.filter(row => row.intendedEmpty);
  const fraction = (numerator, denominator) => ({ numerator, denominator, value: denominator ? numerator / denominator : null });
  const recallSum = ranked.reduce((sum, row) => sum + row.recall10, 0);
  const reciprocalRankSum = ranked.reduce((sum, row) => sum + row.reciprocalRank, 0);
  return {
    interpretation: 'Acceptable-source success and recall over incomplete judged relevant labels; not complete collection recall or a user study.',
    retrievalCutoff: cutoff, queryCount: rows.length,
    rankingDenominator: ranked.length, intendedEmptyDenominator: empty.length,
    top1: fraction(ranked.filter(row => row.top1).length, ranked.length),
    top3: fraction(ranked.filter(row => row.top3).length, ranked.length),
    mrr: { reciprocalRankSum, denominator: ranked.length, value: ranked.length ? reciprocalRankSum / ranked.length : null },
    recall10Macro: { recallSum, denominator: ranked.length, value: ranked.length ? recallSum / ranked.length : null },
    recall10Micro: fraction(ranked.reduce((sum, row) => sum + row.knownRelevantInTop10, 0), ranked.reduce((sum, row) => sum + row.knownRelevantCount, 0)),
    correctIntendedEmpty: fraction(empty.filter(row => row.returnedEmpty).length, empty.length),
    unintendedEmpty: fraction(ranked.filter(row => row.returnedEmpty).length, ranked.length),
    unexpectedNonempty: fraction(empty.filter(row => !row.returnedEmpty).length, empty.length),
    completeRankingQueries: rows.filter(row => row.completeRanking).length,
    rows,
  };
}

/** Every failed metric/zero row receives an inspectable semantic classification. */
export function classifyOutcome(judgment, result, expected, metrics) {
  const issues = [];
  if (metrics.intendedEmpty) return {
    id: judgment.id,
    category: metrics.returnedEmpty ? 'intended-empty' : 'contract-or-evaluation-failure',
    issues: metrics.returnedEmpty ? [] : ['expected-zero-returned-matches'],
    explanation: judgment.emptyReason,
  };
  if (!metrics.top1) issues.push('top1-miss');
  if (!metrics.top3) issues.push('top3-miss');
  if (metrics.recall10 < 1) issues.push('incomplete-judged-recall10');
  if (metrics.mustFindMissingFromCompleteResults.length) issues.push('must-find-not-lexically-eligible');
  if (metrics.returnedEmpty) issues.push('unintended-empty');
  if (!issues.length) return null;
  const expectedIds = new Set(expected.hits.map(hit => hit.id));
  const acceptedEligible = judgment.acceptableIds.filter(id => expectedIds.has(id));
  const acceptedIneligible = judgment.acceptableIds.filter(id => !expectedIds.has(id));
  const top10Ids = new Set(result.hits.slice(0, 10).map(hit => hit.id));
  const eligibleOutsideTop10 = acceptedEligible.filter(id => !top10Ids.has(id));
  const mustFindEligible = judgment.mustFindIds.filter(id => expected.hits.some(hit => hit.id === id));
  const rankMiss = acceptedEligible.length > 0 && (!metrics.top1 || eligibleOutsideTop10.length > 0);
  const category = acceptedEligible.length === 0 ? 'lexical-mismatch'
    : acceptedIneligible.length && rankMiss ? 'mixed-lexical-and-rank'
    : acceptedIneligible.length ? 'lexical-coverage' : 'rank-ordering';
  return {
    id: judgment.id, category, issues,
    explanation: category === 'lexical-mismatch'
      ? 'Independent complete source scan confirms the query cannot qualify any labeled answer source under its declared exact/phrase/Boolean semantics. Labels remain frozen.'
      : category === 'lexical-coverage'
        ? 'An acceptable source succeeds at top1, while other semantically relevant labeled sources do not satisfy this literal query. This judged-recall loss is lexical coverage, not rank ordering.'
        : category === 'mixed-lexical-and-rank'
          ? 'Some labeled answer sources cannot satisfy the literal query, and eligible acceptable sources also have a top-rank/cutoff miss. Both lexical coverage and ordering limit the metrics.'
          : 'The labeled answer sources are eligible but top rank or the top10 cutoff limits success. No scorer or label tuning applied.',
    returnedTotal: result.total,
    labeledAcceptableEligibleIds: acceptedEligible,
    labeledAcceptableIneligibleIds: acceptedIneligible,
    eligibleAcceptableOutsideTop10Ids: eligibleOutsideTop10,
    labeledMustFindEligibleIds: mustFindEligible,
    sourceRationale: judgment.sourceRationale,
  };
}
