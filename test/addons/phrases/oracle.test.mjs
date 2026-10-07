import test from 'node:test';
import assert from 'node:assert/strict';
import { scanPhraseSourceCorpus, sourcePhraseQueryResult, sourcePhraseCandidateIds } from '../../oracle/phrases.mjs';
import { scanSourceCorpus, sourceQueryResult } from '../../oracle/query.mjs';
import { PHRASE_SCHEMA, phraseRecords, handPhraseCases, handPhraseParticipationCases, handPhraseCandidateCases, phraseLengthSchema, phraseLengthRecords, phraseLengthCases } from '../../fixtures/phrases/strict.mjs';
import { PHRASE_CORPUS_SEEDS, generatedPhraseCorpus, generatedPhraseQueries } from '../../fixtures/phrases/generated.mjs';
import { compare, extension, nativeQuery, setup } from './helpers.mjs';

test('40 hand-authored strict phrases and Boolean trees agree with complete IDs and native BM25 before every page', async t => {
  const { engine, call } = setup(PHRASE_SCHEMA), corpus = scanPhraseSourceCorpus(phraseRecords, PHRASE_SCHEMA);
  await call('addMany', phraseRecords);
  let comparisons = 0;
  for (const row of handPhraseCases) {
    const complete = sourcePhraseQueryResult(corpus, row.query, { limit: 100 });
    assert.deepEqual(complete.hits.map(({ id }) => id).sort(), [...row.ids].sort(), row.name);
    for (const page of [{ limit: 100 }, { limit: 1 }, { limit: 0 }, { offset: 2, limit: 3 }]) {
      compare(await call('search', nativeQuery(row.query), page), sourcePhraseQueryResult(corpus, row.query, page), 1); comparisons++;
    }
  }
  for (const row of handPhraseParticipationCases) {
    const actual = await call('search', nativeQuery(row.query), { limit: 100 });
    for (const expected of row.expected) {
      const hit = actual.hits.find(({ id }) => id === expected.id);
      const lexical = sourceQueryResult(scanSourceCorpus(phraseRecords, PHRASE_SCHEMA), expected.query, { limit: 100 }).hits.find(({ id }) => id === expected.id);
      assert.ok(hit && lexical, row.name); assert.ok(Math.abs(hit.score - lexical.score) <= 1e-12); comparisons++;
    }
  }
  for (const row of handPhraseCandidateCases) assert.deepEqual(sourcePhraseCandidateIds(phraseRecords, PHRASE_SCHEMA, row.text), row.ids);
  await engine.dispose(); t.diagnostic(JSON.stringify({ completeAndPageComparisons: comparisons, handCases: handPhraseCases.length }));
});

for (const seed of PHRASE_CORPUS_SEEDS) test(`complete independent generated phrase membership, order, Boolean participation and numeric scores: ${seed.toString(16)}`, async t => {
  const records = generatedPhraseCorpus(seed), corpus = scanPhraseSourceCorpus(records, PHRASE_SCHEMA);
  const { engine, call } = setup(PHRASE_SCHEMA); await call('addMany', records);
  let comparisons = 0;
  for (const query of generatedPhraseQueries(seed)) for (const page of [{ limit: 100 }, { limit: 0 }, { offset: 1, limit: 3 }, { offset: 47, limit: 1 }]) {
    compare(await call('search', nativeQuery(query), page), sourcePhraseQueryResult(corpus, query, page), 1); comparisons++;
  }
  await engine.dispose(); t.diagnostic(JSON.stringify({ records: records.length, comparisons }));
});

test('32 ordered original tokens are allowed and the 33rd fails before repeated-group deduplication', async () => {
  const { engine, call } = setup(phraseLengthSchema); await call('addMany', phraseLengthRecords);
  for (const row of phraseLengthCases) {
    if (row.error) await assert.rejects(call('search', extension(row.text)), { code: 'LIMIT_EXCEEDED' });
    else assert.deepEqual((await call('search', extension(row.text), { limit: 100 })).hits.map(({ id }) => id), row.ids);
  }
  await engine.dispose();
});

test('only the last deep lexical candidate qualifies; limit zero and offset never truncate phrase verification', async () => {
  const schema = { text: { body: {} } }, { engine, call } = setup(schema);
  const records = Array.from({ length: 240 }, (_, i) => ({ id: `r${String(i).padStart(3, '0')}`, text: { body: i === 239 ? 'red blue' : 'red gap blue' } }));
  await call('addMany', records);
  assert.equal((await call('search', 'red blue', { limit: 0 })).total, 240);
  for (const page of [{ limit: 100 }, { limit: 1 }, { limit: 0 }, { offset: 1, limit: 1 }]) compare(await call('search', extension('red blue'), page), sourcePhraseQueryResult(scanPhraseSourceCorpus(records, schema), { kind: 'phrase', text: 'red blue' }, page), 1);
  await engine.dispose();
});
