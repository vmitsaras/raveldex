import test from 'node:test';
import assert from 'node:assert/strict';
import { createRaveldex } from '../../../dist/index.js';
import { createSnapshots, createSnapshotRaveldex, currentNodeSnapshotEnvironment, SnapshotAdapterError } from '../../../dist/adapters/snapshots/index.js';
import { schema, records, replacement, addition } from '../../fixtures/snapshots/records.mjs';
import { addonsFor, inspectSemantics, withoutRevision, close } from './semantics.mjs';
import { checksum, bodyText } from '../../fixtures/snapshots/integrity.mjs';

/** This declared fixture verifies the matching-attestation contract. It is not
 * independent evidence of Unicode or cross-host analyzer equivalence. */
export const qualification = () => ({
  profileId: 'rx-3002-test-declared-exact-node', scope: 'exact-node-runtime',
  environment: currentNodeSnapshotEnvironment(),
  evidence: ['test/adapters/snapshots/roundtrip.test.mjs: attestation-contract fixture; no cross-host qualification claim'],
});
export const fixtureEngine = (kind = 'core', completeSource = false, overrides = {}) => createSnapshotRaveldex({ schema, addons: addonsFor(kind, completeSource), ...overrides }, { nativeQualification: qualification() });

for (const format of ['source', 'native']) {
  for (const kind of format === 'source' ? ['source', 'positions', 'offsets', 'mixed'] : ['core', 'source', 'positions', 'offsets', 'mixed']) {
    test(`${format} roundtrip preserves ${kind} representation, exact semantic output and subsequent writes`, async t => {
      let completeComparisons = 0;
      const completeSource = format === 'source';
      const donor = fixtureEngine(kind, completeSource), restored = fixtureEngine(kind, completeSource);
      try {
        await donor.addMany(records);
        const before = await inspectSemantics(donor, kind, completeSource);
        const donorRevision = (await donor.search({ kind: 'all' })).revision;
        const snapshots = createSnapshots(donor);
        assert.ok(Object.isFrozen(snapshots));
        const encoded = await snapshots[format === 'source' ? 'exportSource' : 'exportNative']();
        assert.equal(typeof encoded, 'string');
        const envelope = JSON.parse(encoded);
        assert.equal(envelope.format, `raveldex-${format}`);
        assert.equal(envelope.formatVersion, 1);
        assert.deepEqual(envelope.codec, { id: 'raveldex-json-v1', version: 1 });
        assert.equal(envelope.body.header.originRevision, donorRevision);
        assert.equal(envelope.body.header.schemaVersion, 1);
        assert.equal(envelope.integrity.value, checksum(bodyText(encoded)));
        await restored.add({ id: 'old-only', text: { title: 'old-searchable' } });
        await restored.replace({ id: 'old-only', text: { title: 'old-searchable-again' } });
        const result = await createSnapshots(restored).restore(encoded);
        assert.equal(result.originRevision, 1);
        assert.equal(result.revision, 3, 'restore uses the next local revision, independently of origin revision');
        assert.equal(result.format, `raveldex-${format}`);
        assert.equal(result.reindexed, format === 'source');
        assert.ok(Object.isFrozen(result));
        assert.deepEqual(withoutRevision(await inspectSemantics(restored, kind, completeSource)), withoutRevision(before));
        completeComparisons += before.length;
        assert.equal((await restored.search('old-searchable-again')).total, 0);
        assert.equal((await donor.search({ kind: 'all' })).revision, donorRevision, 'export is a read');
        for (const [method, input] of [['replace', replacement], ['add', addition], ['remove', ['c', 'missing', 'nonexistent']]]) {
          const a = await donor[method](input), b = await restored[method](input);
          assert.deepEqual(withoutRevision(b), withoutRevision(a));
          assert.equal(b.revision, a.revision + 2);
          assert.deepEqual(withoutRevision(await inspectSemantics(restored, kind, completeSource, false)), withoutRevision(await inspectSemantics(donor, kind, completeSource, false)));
          completeComparisons += before.length;
        }
        await donor.clear(); await restored.clear();
        assert.deepEqual(withoutRevision(await restored.search({ kind: 'all' })), withoutRevision(await donor.search({ kind: 'all' })));
        completeComparisons++;
        // Returned snapshots are caller-owned immutable strings and remain
        // reusable after both originating state and optional roots are cleared.
        await createSnapshots(restored).restore(encoded);
        assert.deepEqual(withoutRevision(await inspectSemantics(restored, kind, completeSource)), withoutRevision(before));
        completeComparisons += before.length;
        t.diagnostic(JSON.stringify({ format, representation: kind, completeComparisons }));
      } finally { await donor.dispose(); await restored.dispose(); }
    });
  }
}

test('source export requires originals for every indexed field and never fabricates source-free text', async () => {
  for (const [kind, completeSource] of [['core', false], ['positions', false], ['offsets', false], ['mixed', false]]) {
    const engine = fixtureEngine(kind, completeSource);
    try {
      await engine.addMany(records);
      await assert.rejects(createSnapshots(engine).exportSource(), error => error instanceof SnapshotAdapterError && error.reason === 'SOURCE_UNAVAILABLE');
      const native = JSON.parse(await createSnapshots(engine).exportNative());
      const coreDocument = Object.values(native.body.payload.documents.buckets).flatMap(bucket => Object.values(bucket))[0];
      assert.equal(Object.hasOwn(coreDocument, 'text'), false);
      if (kind === 'core' || kind === 'positions' || kind === 'offsets') {
        assert.equal(JSON.stringify(native.body.payload).includes('cafe\u0301'), false);
        assert.equal(JSON.stringify(native.body.payload).includes('ﬁle'), false);
      }
      assert.equal((await engine.search('red')).total, 3);
    } finally { await engine.dispose(); }
  }
});

test('unqualified ordinary engines reject native state and source restore reports explicit receiving reindex', async () => {
  const defaultEngine = createRaveldex({ schema, addons: addonsFor('source') }), qualified = fixtureEngine('source');
  try {
    await defaultEngine.add({ id: 'old', text: { title: 'old-state' } });
    await qualified.addMany(records);
    await assert.rejects(createSnapshots(defaultEngine).exportNative(), error => error instanceof SnapshotAdapterError && error.reason === 'UNQUALIFIED_PROFILE');
    const native = await createSnapshots(qualified).exportNative();
    await assert.rejects(createSnapshots(defaultEngine).restore(native), error => error instanceof SnapshotAdapterError && error.reason === 'UNQUALIFIED_PROFILE');
    assert.equal((await defaultEngine.search('old-state')).total, 1);
    assert.equal((await defaultEngine.search({ kind: 'all' })).revision, 1);
    const source = await createSnapshots(qualified).exportSource();
    const restored = await createSnapshots(defaultEngine).restore(source);
    assert.equal(restored.reindexed, true); assert.equal(restored.revision, 2);
    assert.equal(restored.receivingAnalyzer.environmentProfile, 'unqualified');
    assert.deepEqual((await defaultEngine.search('½')).hits.map(hit => hit.id).sort(), ['a', 'half']);
  } finally { await defaultEngine.dispose(); await qualified.dispose(); }
});

test('literal hand BM25 arithmetic survives both formats and deletion without calling the native scorer', async () => {
  const configuration = { schema: { text: { title: { boost: 2 } } } };
  // The one-field source utility is explicit; no tokenizer/scorer oracle is used.
  const { createSourceProvider } = await import('../../../dist/addons/phrases/source.js');
  configuration.addons = [createSourceProvider({ fields: ['title'] })];
  const engines = Array.from({ length: 3 }, () => createSnapshotRaveldex(configuration, { nativeQualification: qualification() }));
  try {
    await engines[0].addMany([{ id: 'a', text: { title: 'red red blue' } }, { id: 'b', text: { title: 'red' } }, { id: 'empty', text: { title: '' } }]);
    await createSnapshots(engines[1]).restore(await createSnapshots(engines[0]).exportSource());
    await createSnapshots(engines[2]).restore(await createSnapshots(engines[0]).exportNative());
    const idf = Math.log(1 + .5 / 2.5), expected = {
      a: 2 * idf * (2 * 2.2) / (2 + 1.2 * (.25 + .75 * 3 / 2)),
      b: 2 * idf * 2.2 / (1 + 1.2 * (.25 + .75 / 2)),
    };
    for (const engine of engines) {
      const result = await engine.search('red');
      assert.equal(result.total, 2); assert.deepEqual(result.hits.map(hit => hit.id), ['b', 'a']);
      for (const hit of result.hits) close(hit.score, expected[hit.id]);
      await engine.remove('a');
      const after = await engine.search('red');
      assert.equal(after.total, 1); close(after.hits[0].score, 2 * Math.log(1 + .5 / 1.5));
    }
  } finally { for (const engine of engines) await engine.dispose(); }
});
