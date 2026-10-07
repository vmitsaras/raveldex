/** Runnable independent fixture checks: node test/fixtures/phrases/verify.mjs */
import assert from 'node:assert/strict';
import {
  SOURCE_PHRASE_MAX_TOKENS, scanPhraseSourceCorpus, sourcePhraseIds,
  sourcePhraseCandidateIds, sourcePhraseQueryResult,
} from '../../oracle/phrases.mjs';
import { sourceQueryResult, originalSourceTokens } from '../../oracle/query.mjs';
import {
  PHRASE_SCHEMA, phraseRecords, handPhraseCases, handPhraseParticipationCases,
  handPhraseCandidateCases, phraseLengthSchema, phraseLengthRecords, phraseLengthCases,
} from './strict.mjs';
import { PHRASE_CORPUS_SEEDS, generatedPhraseCorpus, generatedPhraseQueries } from './generated.mjs';

const sorted = (ids) => [...ids].sort();
const complete = (corpus, query) => sourcePhraseQueryResult(corpus, query, { limit: corpus.documents.length });
const corpus = scanPhraseSourceCorpus(phraseRecords, PHRASE_SCHEMA);
let literalScoreComparisons = 0;
let selectedBranchComparisons = 0;

for (const fixture of handPhraseCases) {
  const result = complete(corpus, fixture.query);
  assert.equal(result.total, fixture.ids.length, fixture.name);
  assert.deepEqual(sorted(result.hits.map(({ id }) => id)), sorted(fixture.ids), fixture.name);
  if (fixture.zero) assert(result.hits.every(({ score }) => score === 0), fixture.name);
  if (fixture.query.kind === 'phrase') {
    assert.deepEqual(sourcePhraseIds(phraseRecords, PHRASE_SCHEMA, fixture.query.text, fixture.query.fields), fixture.ids, fixture.name);
  }
  if (fixture.lexicalQuery) {
    const lexical = sourceQueryResult(corpus, fixture.lexicalQuery, { limit: phraseRecords.length });
    for (const hit of result.hits) {
      assert.equal(hit.score, lexical.hits.find(({ id }) => id === hit.id)?.score, fixture.name);
      assert.deepEqual(result.participation.get(hit.id), lexical.participation.get(hit.id), fixture.name);
      literalScoreComparisons += 1;
    }
  }
}

for (const fixture of handPhraseCandidateCases) {
  const candidates = sourcePhraseCandidateIds(phraseRecords, PHRASE_SCHEMA, fixture.text, fixture.fields);
  assert.deepEqual(candidates, fixture.ids, fixture.name);
  const survivors = sourcePhraseIds(phraseRecords, PHRASE_SCHEMA, fixture.text, fixture.fields);
  assert(survivors.every((id) => candidates.includes(id)), fixture.name);
}

for (const fixture of handPhraseParticipationCases) {
  const result = complete(corpus, fixture.query);
  for (const expected of fixture.expected) {
    const lexical = sourceQueryResult(corpus, expected.query, { limit: phraseRecords.length });
    assert.equal(result.hits.find(({ id }) => id === expected.id)?.score, lexical.hits.find(({ id }) => id === expected.id)?.score, fixture.name);
    assert.deepEqual(result.participation.get(expected.id), lexical.participation.get(expected.id), fixture.name);
    selectedBranchComparisons += 1;
  }
}

for (const fixture of phraseLengthCases) {
  if (fixture.error) {
    assert.throws(() => sourcePhraseIds(phraseLengthRecords, phraseLengthSchema, fixture.text), fixture.error, fixture.name);
    assert.throws(() => sourcePhraseCandidateIds(phraseLengthRecords, phraseLengthSchema, fixture.text), fixture.error, fixture.name);
    const lengthCorpus = scanPhraseSourceCorpus(phraseLengthRecords, phraseLengthSchema);
    assert.throws(() => sourcePhraseQueryResult(lengthCorpus, { kind: 'phrase', text: fixture.text }), fixture.error, fixture.name);
  } else {
    assert.deepEqual(sourcePhraseIds(phraseLengthRecords, phraseLengthSchema, fixture.text), fixture.ids, fixture.name);
  }
}

function phraseLeaves(query) {
  if (typeof query === 'string') return [];
  if (query.kind === 'phrase') return [query];
  if (query.kind === 'not') return phraseLeaves(query.child);
  return query.children?.flatMap(phraseLeaves) ?? [];
}

let generatedQueryComparisons = 0;
let generatedPhraseLeafComparisons = 0;
let pageComparisons = 0;
for (const seed of PHRASE_CORPUS_SEEDS) {
  const records = generatedPhraseCorpus(seed);
  const generatedCorpus = scanPhraseSourceCorpus(records, PHRASE_SCHEMA);
  for (const query of generatedPhraseQueries(seed)) {
    const result = complete(generatedCorpus, query);
    assert.equal(result.total, result.hits.length);
    assert.equal(result.participation.size, result.total);
    assert(phraseLeaves(query).length > 0);
    for (const leaf of phraseLeaves(query)) {
      assert(originalSourceTokens(leaf.text).length <= SOURCE_PHRASE_MAX_TOKENS);
      const eligible = sourcePhraseIds(records, PHRASE_SCHEMA, leaf.text, leaf.fields);
      const candidates = sourcePhraseCandidateIds(records, PHRASE_SCHEMA, leaf.text, leaf.fields);
      assert(eligible.every((id) => candidates.includes(id)));
      const phraseResult = complete(generatedCorpus, leaf);
      assert.deepEqual(sorted(phraseResult.hits.map(({ id }) => id)), sorted(eligible));
      const lexical = sourceQueryResult(generatedCorpus, { kind: 'text', text: leaf.text, ...(leaf.fields ? { fields: leaf.fields } : {}) }, { limit: records.length });
      for (const hit of phraseResult.hits) {
        assert.equal(hit.score, lexical.hits.find(({ id }) => id === hit.id)?.score);
        assert.deepEqual(phraseResult.participation.get(hit.id), lexical.participation.get(hit.id));
      }
      generatedPhraseLeafComparisons += 1;
    }
    for (const options of [{ limit: 0 }, { limit: 1 }, { offset: 1, limit: 3 }, { offset: records.length, limit: 1 }]) {
      const page = sourcePhraseQueryResult(generatedCorpus, query, options);
      assert.equal(page.total, result.total);
      assert.deepEqual(page.hits, result.hits.slice(options.offset ?? 0, (options.offset ?? 0) + options.limit));
      assert.deepEqual(page.participation, result.participation);
      pageComparisons += 1;
    }
    generatedQueryComparisons += 1;
  }
}

console.log(JSON.stringify({
  status: 'pass',
  literalRecords: phraseRecords.length,
  literalQueryCases: handPhraseCases.length,
  literalCandidateCases: handPhraseCandidateCases.length,
  literalScoreComparisons,
  selectedBranchCases: handPhraseParticipationCases.length,
  selectedBranchComparisons,
  phraseLengthCases: phraseLengthCases.length,
  generatedSeeds: PHRASE_CORPUS_SEEDS.length,
  generatedQueryComparisons,
  generatedPhraseLeafComparisons,
  pageComparisons,
}));
