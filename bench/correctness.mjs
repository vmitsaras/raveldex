import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createRaveldex } from '@vmitsaras/raveldex';
import { createSourceProvider, createSourcePhrases } from '@vmitsaras/raveldex/addons/phrases';
import { createPositionProvider } from '@vmitsaras/raveldex/addons/positions';
import { createPositionPhrases } from '@vmitsaras/raveldex/addons/phrases/positions';
import { createPhrases } from '@vmitsaras/raveldex/addons/phrases/mixed';
import { scanSourceCorpus, sourceQueryResult } from '../test/oracle/query.mjs';
import { scanPhraseSourceCorpus, sourcePhraseQueryResult } from '../test/oracle/phrases.mjs';
import { sourceMutation } from '../test/oracle/mutations.mjs';
import { NUMERIC_SCHEMA, numericRecords, handScores, QUERY_SCHEMA, queryRecords, handQueryCases, generatedQueries } from '../test/fixtures/ranking/query.mjs';
import { MUTATION_SCHEMA, deterministicMutations, generatedMutationSequence } from '../test/fixtures/mutations/sequences.mjs';
import { PHRASE_SCHEMA, generatedPhraseCorpus, generatedPhraseQueries } from '../test/fixtures/phrases/generated.mjs';

const seed = 0x5eed4001;
const pages = [{ limit: 100 }, { limit: 0 }, { offset: 1, limit: 3 }];
const close = (a, b) => assert.ok(Math.abs(a - b) <= Math.max(1e-12, Math.abs(b) * 1e-12), `${a} != ${b}`);
const nativePhrase = query => typeof query === 'string' ? query : query.kind === 'phrase'
  ? { kind: 'extension', capability: 'phrases', version: 1, payload: { text: query.text, ...(query.fields ? { fields: query.fields } : {}) } }
  : ['and', 'or'].includes(query.kind) ? { ...query, children: query.children.map(nativePhrase) }
    : query.kind === 'not' ? { ...query, child: nativePhrase(query.child) } : query;

function compare(actual, expected, revision) {
  assert.equal(actual.total, expected.total);
  assert.equal(actual.revision, revision);
  assert.equal(actual.completeness, 'complete');
  assert.equal(actual.model, 'raveldex-bm25-v1');
  assert.deepEqual(actual.hits.map(hit => hit.id), expected.hits.map(hit => hit.id));
  actual.hits.forEach((hit, index) => close(hit.score, expected.hits[index].score));
}

export async function verifyCorrectness() {
  const report = { seed, queryComparisons: 0, mutationOperations: 0, mutationStates: 0, mutationComparisons: 0,
    commits: 0, noops: 0, rejections: 0, phraseComparisons: 0, phraseParityComparisons: 0, handScoreAssertions: 0,
    method: 'Public exported factories and methods; independent original-source scan and policy model, literal membership fixtures, decimal hand-derived BM25 constants; no foreign engine oracle.' };
  const engine = createRaveldex({ schema: QUERY_SCHEMA });
  try {
    await engine.addMany(queryRecords);
    const corpus = scanSourceCorpus(queryRecords, QUERY_SCHEMA);
    for (const row of handQueryCases) {
      const expected = sourceQueryResult(corpus, row.query, { limit: 100 });
      assert.deepEqual(expected.hits.map(hit => hit.id).sort(), [...row.ids].sort(), row.name);
    }
    for (const query of [...handQueryCases.map(row => row.query), ...generatedQueries(seed, 64)]) for (const page of pages) {
      compare(await engine.search(query, page), sourceQueryResult(corpus, query, page), 1); report.queryComparisons++;
    }
  } finally { await engine.dispose(); }

  for (const sequence of [deterministicMutations(), generatedMutationSequence(seed, 48)]) {
    let records = structuredClone(sequence.initial), revision = records.length ? 1 : 0;
    const owner = createRaveldex({ schema: MUTATION_SCHEMA });
    try {
      if (records.length) await owner.addMany(records);
      async function check() {
        const corpus = scanSourceCorpus(records, MUTATION_SCHEMA);
        for (const query of [{ kind: 'all' }, 'red car', '½', { kind: 'not', child: { kind: 'text', text: 'blue' } }, { kind: 'eq', field: 'kind', value: null }]) for (const page of pages) {
          compare(await owner.search(query, page), sourceQueryResult(corpus, query, page), revision); report.mutationComparisons++;
        }
        report.mutationStates++;
      }
      await check();
      for (const operation of sequence.operations) {
        const expected = sourceMutation(records, revision, operation);
        if (expected.error) {
          await assert.rejects(owner[operation.kind](operation.input), { code: expected.error }); report.rejections++;
        } else {
          const result = await owner[operation.kind](...(operation.kind === 'clear' ? [] : [operation.input]));
          assert.deepEqual(result, expected.result); records = expected.records; revision = expected.result.revision;
          if (result.changed) report.commits++; else report.noops++;
        }
        report.mutationOperations++; await check();
      }
    } finally { await owner.dispose(); }
  }

  const records = generatedPhraseCorpus(seed, 32), corpus = scanPhraseSourceCorpus(records, PHRASE_SCHEMA);
  const fields = Object.keys(PHRASE_SCHEMA.text);
  const configurations = {
    source: [createSourceProvider({ fields }), createSourcePhrases({ fields })],
    positions: [createPositionProvider({ fields, offsets: fields }), createPositionPhrases({ fields })],
    mixed: [createSourceProvider({ fields: ['title', 'notes'] }), createPositionProvider({ fields: ['body'], offsets: ['body'] }),
      createPhrases({ fields: { title: 'source', notes: 'source', body: 'positions' } })],
  };
  const owners = Object.values(configurations).map(addons => createRaveldex({ schema: PHRASE_SCHEMA, addons }));
  try {
    for (const owner of owners) await owner.addMany(records);
    for (const query of generatedPhraseQueries(seed, 48)) for (const page of pages) {
      const expected = sourcePhraseQueryResult(corpus, query, page); let first;
      for (const owner of owners) {
        const result = await owner.search(nativePhrase(query), page); compare(result, expected, 1); report.phraseComparisons++;
        if (first) { assert.deepEqual(result, first); report.phraseParityComparisons++; } else first = result;
      }
    }
    const replacement = { id: records[0].id, text: { title: 'red blue', body: ['echo echo', 'red gap blue'] } };
    records[0] = replacement;
    for (const owner of owners) await owner.replace(replacement);
    const changed = scanPhraseSourceCorpus(records, PHRASE_SCHEMA);
    for (const query of [{ kind: 'phrase', text: 'red blue' }, { kind: 'phrase', text: 'echo echo' }]) {
      for (const owner of owners) { compare(await owner.search(nativePhrase(query), { limit: 100 }), sourcePhraseQueryResult(changed, query, { limit: 100 }), 2); report.phraseComparisons++; }
    }
  } finally { for (const owner of owners) await owner.dispose(); }

  const arithmetic = createRaveldex({ schema: NUMERIC_SCHEMA });
  try {
    await arithmetic.addMany(numericRecords);
    for (const [query, expected] of [['red', handScores.red], ['car', handScores.car], ['red car', handScores.and],
      [{ kind: 'group', variants: [{ text: 'red', match: 'exact' }, { text: 'car', match: 'exact' }] }, handScores.alternatives]]) {
      const result = await arithmetic.search(query); assert.equal(result.total, 2);
      for (const hit of result.hits) { close(hit.score, expected[hit.id]); report.handScoreAssertions++; }
    }
    await arithmetic.remove('c');
    const idf = Math.log(1 + 0.5 / 2.5); // N=2,df=2,avgLength=2.5 after removing blue.
    const after = await arithmetic.search('red');
    const expected = { a: idf * 4.4 / (2 + 1.2 * (0.25 + 0.75 * 3 / 2.5)), b: idf * 2.2 / (1 + 1.2 * (0.25 + 0.75 * 2 / 2.5)) };
    for (const hit of after.hits) { close(hit.score, expected[hit.id]); report.handScoreAssertions++; }
    report.handArithmetic = { initial: handScores, postDelete: expected };
  } finally { await arithmetic.dispose(); }
  return { ...report, status: 'Pass' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await verifyCorrectness();
  const output = process.argv[2] ?? '/tmp/raveldex-rx4001-correctness.json';
  await writeFile(output, JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify({ output, ...report }));
}
