import test from 'node:test';
import assert from 'node:assert/strict';
import { createRaveldex, RaveldexError } from '../../../dist/index.js';
import { createSnapshots, createSnapshotRaveldex, currentNodeSnapshotEnvironment, SNAPSHOT_REASONS, SnapshotAdapterError } from '../../../dist/adapters/snapshots/index.js';
import { schema, records } from '../../fixtures/snapshots/records.mjs';
import { alter, firstEntry, byId } from '../../fixtures/snapshots/integrity.mjs';
import { addonsFor } from './semantics.mjs';

const qualification = () => ({ profileId: 'rx-3002-test-declared-exact-node', scope: 'exact-node-runtime', environment: currentNodeSnapshotEnvironment(), evidence: ['test/adapters/snapshots/compatibility.test.mjs: test-declared matching-profile contract only'] });
const engineFor = kind => createSnapshotRaveldex({ schema, addons: addonsFor(kind, true) }, { nativeQualification: qualification() });
const expectReason = reason => error => {
  assert.ok(error instanceof SnapshotAdapterError); assert.ok(error instanceof RaveldexError);
  assert.equal(error.reason, reason); assert.ok(SNAPSHOT_REASONS.includes(reason));
  assert.equal(error.message, `Raveldex: ${error.code}`); assert.ok(Object.isFrozen(error.details));
  return true;
};

test('format, codec and every compatibility header/version produce specific reasons and preserve old state', async t => {
  const donor = engineFor('source'), target = engineFor('source');
  try {
    await donor.addMany(records); await target.add({ id: 'old', text: { title: 'old-state' } });
    const baseline = await target.search({ kind: 'all' });
    let assertions = 0;
    for (const format of ['Source', 'Native']) {
      const encoded = await createSnapshots(donor)[`export${format}`]();
      const cases = [
        [envelope => { envelope.format = 'opaque-foreign-search-index'; }, 'UNSUPPORTED_FORMAT'],
        [envelope => { envelope.formatVersion = 2; }, 'UNSUPPORTED_FORMAT'],
        [envelope => { envelope.codec.id = 'unknown-json-codec'; }, 'UNSUPPORTED_CODEC'],
        [envelope => { envelope.codec.version = 2; }, 'UNSUPPORTED_CODEC'],
        [envelope => { envelope.body.header.schemaVersion = 2; }, 'SCHEMA_MISMATCH'],
        [envelope => { envelope.body.header.schema.text.title.boost = 3; }, 'SCHEMA_MISMATCH'],
        [envelope => { envelope.body.header.analyzer.id = 'other-analyzer'; }, 'ANALYZER_MISMATCH'],
        [envelope => { envelope.body.header.ranking.model = 'foreign-bm25'; }, 'RANKING_MISMATCH'],
        [envelope => { envelope.body.header.ranking.implementationVersion = 2; }, 'RANKING_MISMATCH'],
        [envelope => { envelope.body.header.capabilities = []; }, 'CAPABILITY_MISMATCH'],
        [envelope => { envelope.body.header.capabilities.find(entry => entry.id === 'source').version = '99.0.0'; }, 'CAPABILITY_MISMATCH'],
        [envelope => { envelope.body.header.capabilities.find(entry => entry.id === 'source').contractVersion = 2; }, 'CAPABILITY_MISMATCH'],
        [envelope => { envelope.body.header.capabilities.find(entry => entry.id === 'source').codec.version = 2; }, 'CAPABILITY_MISMATCH'],
        [envelope => { envelope.body.header.capabilities.find(entry => entry.id === 'source').execution.workerRegistration += ':different-options'; }, 'CAPABILITY_MISMATCH'],
        [envelope => { envelope.body.header.indexDetail.id = 'other-details'; }, 'INDEX_DETAIL_MISMATCH'],
        [envelope => { envelope.body.header.indexDetail.version = 2; }, 'INDEX_DETAIL_MISMATCH'],
        [envelope => { envelope.body.header.limits.maxDocuments--; }, 'LIMITS_MISMATCH'],
      ];
      if (format === 'Native') {
        cases.push([envelope => { envelope.body.header.nativeQualification.environment.unicode = 'foreign-runtime'; }, 'PROFILE_MISMATCH']);
        cases.push([envelope => { envelope.body.header.analyzer.environmentProfile = 'unqualified'; }, 'UNQUALIFIED_PROFILE']);
      }
      for (const [mutation, reason] of cases) {
        await assert.rejects(createSnapshots(target).restore(alter(encoded, mutation)), expectReason(reason));
        assert.deepEqual(await target.search({ kind: 'all' }), baseline);
        assert.equal((await target.search('old-state')).total, 1);
        assertions++;
      }
    }
    t.diagnostic(JSON.stringify({ compatibilityCases: assertions }));
  } finally { await donor.dispose(); await target.dispose(); }
});

test('unknown or absent participant codecs fail explicitly instead of dropping selected transactional state', async () => {
  const { createSourceProvider } = await import('../../../dist/addons/phrases/source.js');
  for (const codec of [undefined, { id: 'foreign-opaque-index', version: 1 }, { id: 'raveldex-source-v1', version: 2 }]) {
    const registration = createSourceProvider({ fields: ['title', 'body'] });
    const { codec: _, ...manifest } = registration.manifest;
    const selected = { ...registration, manifest: { ...manifest, ...(codec ? { codec } : {}) } };
    const engine = createSnapshotRaveldex({ schema, addons: [selected] }, { nativeQualification: qualification() });
    try {
      await engine.addMany(records); const baseline = await engine.search({ kind: 'all' });
      for (const method of ['exportSource', 'exportNative']) await assert.rejects(createSnapshots(engine)[method](), expectReason('UNSUPPORTED_CODEC'));
      assert.deepEqual(await engine.search({ kind: 'all' }), baseline);
    } finally { await engine.dispose(); }
  }
});

test('malformed, truncated, duplicate-property and damaged JSON snapshots never modify a visible revision', async t => {
  const donor = engineFor('source'), target = engineFor('source');
  try {
    await donor.addMany(records); await target.add({ id: 'old', text: { title: 'old-state' } });
    const encoded = await createSnapshots(donor).exportSource(), baseline = await target.search({ kind: 'all' });
    const malformed = ['', '{', encoded.slice(0, -1), 'null', '[]', '{}', '{"body":{},"body":{}}', '\ud800', ` ${encoded} garbage`, encoded.replace('"format":', '"unexpected":true,"format":')];
    for (const input of malformed) {
      await assert.rejects(createSnapshots(target).restore(input), expectReason('MALFORMED_SNAPSHOT'));
      assert.deepEqual(await target.search({ kind: 'all' }), baseline);
    }
    await assert.rejects(createSnapshots(target).restore(alter(encoded, envelope => { envelope.body.payload.records[0].text.title[0] = 'changed-without-checksum'; }, false)), expectReason('INTEGRITY_MISMATCH'));
    await assert.rejects(createSnapshots(target).restore(alter(encoded, envelope => { envelope.integrity.algorithm = 'cryptographic-proof'; }, false)), expectReason('UNSUPPORTED_CODEC'));
    assert.deepEqual(await target.search({ kind: 'all' }), baseline);
    t.diagnostic(JSON.stringify({ malformedCases: malformed.length, integrityCases: 2 }));
  } finally { await donor.dispose(); await target.dispose(); }
});

test('source and offset participant corruption cannot bypass native side-state validation with a recomputed checksum', async t => {
  const donor = engineFor('mixed'), target = engineFor('mixed');
  try {
    await donor.addMany(records); await target.add({ id: 'old', text: { title: 'old-state' } });
    const encoded = await createSnapshots(donor).exportNative(), baseline = await target.search({ kind: 'all' });
    const mutations = [
      payload => { payload.participants.source.revision++; },
      payload => { payload.participants.source.analyzer.id = 'wrong'; },
      payload => { payload.participants.source.fields = ['title']; },
      payload => { payload.participants.source.records.size--; },
      payload => { payload.participants.source.retainedEntries++; },
      payload => { payload.participants.source.textCodeUnits++; },
      payload => { payload.participants.source.maxRetainedEntries--; },
      payload => { byId(payload.participants.source.records, 'a').retainedEntries++; },
      payload => { byId(payload.participants.source.records, 'a').text.title[0] = 'unrelated'; },
      payload => { delete byId(payload.participants.source.records, 'a').text.title; },
      payload => { payload.participants.positions.revision++; },
      payload => { payload.participants.positions.offsetFields = []; },
      payload => { payload.participants.positions.occurrenceCount++; },
      payload => { payload.participants.positions.offsetCount++; },
      payload => { payload.participants.positions.termEntries++; },
      payload => { payload.participants.positions.termCodeUnits++; },
      payload => { payload.participants.positions.retainedEntries++; },
      payload => { payload.participants.positions.records.size--; },
      payload => { payload.participants.positions.maxOccurrences++; },
      payload => { byId(payload.participants.positions.records, 'a').positions.body[1].tokenCount++; },
      payload => { byId(payload.participants.positions.records, 'a').positions.body[1].terms.red[0].position = 1; },
      payload => { byId(payload.participants.positions.records, 'a').positions.body[1].terms.red[0].positionLength = 2; },
      payload => { byId(payload.participants.positions.records, 'a').positions.body[1].terms.red[0].end = 0; },
      payload => { byId(payload.participants.positions.records, 'a').positions.body[1].terms.red[0].start = 1; },
      payload => { delete payload.participants.source; },
      payload => { payload.participants.unknown = {}; },
    ];
    for (const mutate of mutations) {
      await assert.rejects(createSnapshots(target).restore(alter(encoded, envelope => mutate(envelope.body.payload))), expectReason('INVALID_NATIVE_STATE'));
      assert.deepEqual(await target.search({ kind: 'all' }), baseline);
    }
    t.diagnostic(JSON.stringify({ nativeSideStateCorruptions: mutations.length }));
  } finally { await donor.dispose(); await target.dispose(); }
});

test('qualified factory strictly owns and validates the attestation without promoting ordinary engines', async () => {
  const declared = qualification(), ownedEnvironment = declared.environment, engine = createSnapshotRaveldex({ schema }, { nativeQualification: declared });
  try {
    declared.profileId = 'changed'; declared.evidence[0] = 'changed';
    const envelope = JSON.parse(await createSnapshots(engine).exportNative());
    assert.equal(envelope.body.header.nativeQualification.profileId, 'rx-3002-test-declared-exact-node');
    assert.equal(envelope.body.header.nativeQualification.evidence[0].includes('test-declared'), true);
    assert.equal(envelope.body.header.analyzer.environmentProfile.includes('rx-3002-test-declared-exact-node'), true);
    assert.ok(Object.isFrozen(ownedEnvironment));
  } finally { await engine.dispose(); }
  let accessors = 0;
  const getter = { get nativeQualification() { accessors++; return qualification(); } };
  assert.throws(() => createSnapshotRaveldex({ schema }, getter)); assert.equal(accessors, 0);
  for (const mutation of [
    value => { value.scope = 'universal-unicode'; },
    value => { value.environment = { ...value.environment, version: 'different-node' }; },
    value => { value.environment = { ...value.environment, v8: 'different-v8' }; },
    value => { value.evidence = []; },
    value => { value.profileId = ''; },
  ]) { const value = qualification(); mutation(value); assert.throws(() => createSnapshotRaveldex({ schema }, { nativeQualification: value })); }
  const ordinary = createRaveldex({ schema });
  try { assert.throws(() => createSnapshots(ordinary, { nativeQualification: qualification() })); }
  finally { await ordinary.dispose(); }
});

test('valid-integrity native corruption fails reverse, postings, statistics and directory invariants atomically', async t => {
  const donor = engineFor('source'), target = engineFor('source');
  try {
    await donor.addMany(records); await target.add({ id: 'old', text: { title: 'old-state' } });
    const encoded = await createSnapshots(donor).exportNative(), baseline = await target.search({ kind: 'all' });
    const mutations = [
      payload => { payload.documents.size++; },
      payload => { firstEntry(payload.documents)[1].id = 'does-not-match-directory-key'; },
      payload => { firstEntry(payload.documents)[1].textCodeUnits = -1; },
      payload => { payload.fields.title.documents++; },
      payload => { payload.fields.title.length++; },
      payload => { payload.fields.title.terms.size++; },
      payload => { firstEntry(payload.fields.title.terms)[1].df++; },
      payload => { firstEntry(payload.fields.title.terms)[1].frequency++; },
      payload => { firstEntry(payload.fields.title.terms)[1].postings.size++; },
      payload => { const postings = firstEntry(payload.fields.title.terms)[1].postings; const [id] = firstEntry(postings); const bucket = Object.values(postings.buckets).find(bucket => Object.hasOwn(bucket, id)); bucket[id] = 0; },
      payload => { payload.counts.tokens++; },
      payload => { payload.counts.postingEntries++; },
      payload => { payload.counts.documents++; },
      payload => { const [slot] = Object.keys(payload.documents.buckets); payload.documents.buckets['256'] = payload.documents.buckets[slot]; delete payload.documents.buckets[slot]; },
      payload => { const [, document] = firstEntry(payload.documents); const [field] = Object.keys(document.fields); if (field) document.fields[field].length++; else document.fields.title = { length: 1, terms: {} }; },
      payload => { payload.foreignOpaqueBlob = 'not-a-native-index'; },
    ];
    for (const mutate of mutations) {
      await assert.rejects(createSnapshots(target).restore(alter(encoded, envelope => mutate(envelope.body.payload))), expectReason('INVALID_NATIVE_STATE'));
      assert.deepEqual(await target.search({ kind: 'all' }), baseline);
    }
    t.diagnostic(JSON.stringify({ nativeCoreCorruptions: mutations.length }));
  } finally { await donor.dispose(); await target.dispose(); }
});
