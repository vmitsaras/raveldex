import test from 'node:test';
import assert from 'node:assert/strict';
import { scanPhraseSourceCorpus, sourcePhraseQueryResult } from '../../oracle/phrases.mjs';
import { PHRASE_SCHEMA, phraseRecords, handPhraseCases, handPhraseParticipationCases, phraseLengthSchema, phraseLengthRecords, phraseLengthCases } from '../../fixtures/phrases/strict.mjs';
import { PHRASE_CORPUS_SEEDS, generatedPhraseCorpus, generatedPhraseQueries } from '../../fixtures/phrases/generated.mjs';
import { compare, extension, nativeQuery, setup } from './helpers.mjs';

async function representations(schema, records) {
  const fixtures = ['source', 'positions', 'mixed'].map(strategy => setup(schema, {}, strategy));
  for (const fixture of fixtures) await fixture.call('addMany', records);
  return fixtures;
}

async function compareRepresentations(fixtures, corpus, query, page, revision = 1) {
  const expected = sourcePhraseQueryResult(corpus, query, page);
  let source;
  for (const fixture of fixtures) {
    const actual = await fixture.call('search', nativeQuery(query), page);
    compare(actual, expected, revision);
    // Same surviving groups use the actual native scorer. Equal real scores,
    // not rounded display values, prove strategies add no phrase bonus.
    if (source) assert.deepEqual(actual, source);
    else source = actual;
  }
}

test('source, positions and mixed fields agree on every complete literal Boolean result and unrounded native score', async t => {
  const fixtures = await representations(PHRASE_SCHEMA, phraseRecords), corpus = scanPhraseSourceCorpus(phraseRecords, PHRASE_SCHEMA);
  let oracleComparisons = 0;
  for (const row of handPhraseCases) {
    assert.deepEqual(sourcePhraseQueryResult(corpus, row.query, { limit: 100 }).hits.map(hit => hit.id).sort(), [...row.ids].sort(), row.name);
    for (const page of [{ limit: 100 }, { limit: 1 }, { limit: 0 }, { offset: 2, limit: 3 }]) {
      await compareRepresentations(fixtures, corpus, row.query, page); oracleComparisons += fixtures.length;
    }
  }
  for (const row of handPhraseParticipationCases) {
    await compareRepresentations(fixtures, corpus, row.query, { limit: 100 }); oracleComparisons += fixtures.length;
  }
  for (const fixture of fixtures) await fixture.engine.dispose();
  t.diagnostic(JSON.stringify({ literalTrees: handPhraseCases.length, branchTrees: handPhraseParticipationCases.length, completeOracleComparisons: oracleComparisons }));
});

for (const seed of PHRASE_CORPUS_SEEDS) test(`three representations preserve independent generated totals, stable pages and numeric scores: ${seed.toString(16)}`, async t => {
  const records = generatedPhraseCorpus(seed), corpus = scanPhraseSourceCorpus(records, PHRASE_SCHEMA), fixtures = await representations(PHRASE_SCHEMA, records);
  let comparisons = 0;
  for (const query of generatedPhraseQueries(seed)) for (const page of [{ limit: 100 }, { limit: 0 }, { offset: 1, limit: 3 }, { offset: 47, limit: 1 }]) {
    await compareRepresentations(fixtures, corpus, query, page); comparisons += fixtures.length;
  }
  for (const fixture of fixtures) await fixture.engine.dispose();
  t.diagnostic(JSON.stringify({ records: records.length, queries: generatedPhraseQueries(seed).length, completeOracleComparisons: comparisons }));
});

test('positions preserve the original 32-token phrase bound before repeated-group deduplication', async () => {
  const fixtures = await representations(phraseLengthSchema, phraseLengthRecords);
  for (const fixture of fixtures) {
    for (const row of phraseLengthCases) {
      if (row.error) await assert.rejects(fixture.call('search', extension(row.text)), { code: 'LIMIT_EXCEEDED' });
      else assert.deepEqual((await fixture.call('search', extension(row.text), { limit: 100 })).hits.map(hit => hit.id), row.ids);
    }
    await fixture.engine.dispose();
  }
});

test('positions consider all deep lexical candidates before total and page selection', async () => {
  const schema = { text: { body: {} } }, records = Array.from({ length: 240 }, (_, index) => ({ id: `r${String(index).padStart(3, '0')}`, text: { body: index === 239 ? 'red blue' : 'red gap blue' } }));
  const fixtures = await representations(schema, records), corpus = scanPhraseSourceCorpus(records, schema);
  for (const fixture of fixtures) assert.equal((await fixture.call('search', 'red blue', { limit: 0 })).total, 240);
  for (const page of [{ limit: 100 }, { limit: 1 }, { limit: 0 }, { offset: 1, limit: 1 }]) await compareRepresentations(fixtures, corpus, { kind: 'phrase', text: 'red blue' }, page);
  for (const fixture of fixtures) await fixture.engine.dispose();
});
