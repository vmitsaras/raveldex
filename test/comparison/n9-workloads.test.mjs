import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRaveldex } from '../../dist/index.js';
import { createSourceProvider, createSourcePhrases } from '../../dist/addons/phrases/index.js';
import { FAMILIES, SIZES, MODEL, SOURCE, schema, digest, referenceTokens, workloadFor, verifyFrozen } from '../../bench/n9/workloads.mjs';

test('N9 frozen 3x3 matrix pins complete corpus/query/judgment/source identities', () => {
  assert.equal(SOURCE.sections, 34);
  assert.deepEqual(MODEL, { analyzer: { id: 'basic-v1', environmentProfile: 'unqualified' }, ranking: 'raveldex-bm25-v1', k1: 1.2, b: 0.75, work: 'work-v1' });
  const frozen = JSON.parse(readFileSync(new URL('../fixtures/n9/freeze.json', import.meta.url)));
  assert.equal(frozen.workloads.length, 9);
  for (const family of FAMILIES) for (const size of SIZES) {
    const workload = verifyFrozen(workloadFor(family, size));
    assert.equal(workload.records.length, size);
    assert.equal(new Set(workload.records.map(record => record.id)).size, size);
    assert.equal(workload.labels.length, size);
    assert.equal(workload.queries.length, 8);
    assert.ok(Object.isFrozen(workload.records[0].text));
    assert.ok(workload.queries.every(query => new Set(query.expectedIds).size === query.expectedIds.length));
    assert.equal(digest(workload.records), workload.identity.corpusSha256);
    assert.ok(workload.records.reduce((sum, record) => sum + (Array.isArray(record.text.body) ? record.text.body.join('') : record.text.body).length, 0) < 67_108_864);
    assert.ok(workload.labels.every(label => label.retainedExcerpt === (family !== 'adversarial')));
    if (family !== 'real-docs') {
      assert.equal(workload.queries.find(query => query.id === 'common').expectedIds.length, size);
      assert.equal(workload.queries.find(query => query.id === 'rare').expectedIds.length, Math.floor((size - 1 - 7) / 997) + 1);
      assert.equal(workload.queries.find(query => query.id === 'filtered').expectedIds.length, Math.ceil(size / 5));
      assert.equal(workload.queries.find(query => query.id === 'source-phrase').expectedIds.length, Math.ceil(size / 3));
      assert.equal(workload.queries.find(query => query.id === 'narrow-prefix').expectedExpansions, 30);
      assert.deepEqual(workload.queries.find(query => query.id === 'broad-prefix-refusal').expectedError, { code: 'LIMIT_EXCEEDED', path: 'expansions.group' });
    }
  }
});

test('N9 reference tokens independently preserve normalization and value-boundary semantics', () => {
  assert.deepEqual(referenceTokens('ＦＯＯ—CAFÉ cafe\u0301 ½ file Hello_world 😀'), ['foo', 'café', 'café', '1⁄2', 'file', 'hello', 'world']);
  assert.throws(() => referenceTokens(null));
  assert.throws(() => workloadFor('missing', 100));
  for (const size of [0, 1, 99, 101, 10001, NaN]) assert.throws(() => workloadFor('adversarial', size));
  assert.throws(() => verifyFrozen({ family: 'real-docs', size: 100, identity: {} }));
  const workload = workloadFor('adversarial', 100);
  assert.deepEqual(workload.records[2].text.body.slice(1), ['n9red', 'n9blue']);
  assert.ok(!workload.queries.find(query => query.kind === 'phrase').expectedIds.includes(workload.records[2].id));
});

for (const family of FAMILIES) test(`N9 independent ${family} complete memberships and explicit refusals agree with public runtime`, async () => {
  const workload = verifyFrozen(workloadFor(family, 100));
  const engine = createRaveldex({ schema, addons: [createSourceProvider({ fields: ['body'] }), createSourcePhrases({ fields: ['body'] })] });
  try {
    for (let start = 0; start < workload.size; start += 32) await engine.addMany(workload.records.slice(start, start + 32), { deadlineMs: 60000 });
    for (const row of workload.queries) {
      if (row.expectedError) {
        await assert.rejects(engine.search(row.query, { limit: 100 }), error => error.code === row.expectedError.code && error.details.path === row.expectedError.path);
        continue;
      }
      const result = await engine.search(row.query, { limit: 100, deadlineMs: 60000 });
      assert.equal(result.completeness, 'complete');
      assert.equal(result.model, MODEL.ranking);
      assert.equal(result.total, row.expectedIds.length, row.id);
      assert.equal(result.revision, Math.ceil(workload.size / 32));
      assert.deepEqual(result.hits.map(hit => hit.id).sort(), [...row.expectedIds].sort(), row.id);
      assert.ok(result.hits.every(hit => Number.isFinite(hit.score)));
    }
    // A refusal must not mutate the owner or poison later complete queries.
    const after = await engine.search({ kind: 'all' }, { limit: 100 });
    assert.equal(after.total, 100);
    assert.equal(after.revision, 4);
  } finally { await engine.dispose(); }
});
