import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { createRaveldex, RaveldexError } from '../../../dist/index.js';
import { createSourceProvider, createSourcePhrases } from '../../../dist/addons/phrases/index.js';
import { createEnglishAnalyzer, ENGLISH_ANALYZER } from '../../../dist/integrations/languages/english/index.js';
import { currentNodeSnapshotEnvironment, createSnapshots, SnapshotAdapterError } from '../../../dist/adapters/snapshots/index.js';
import { buildStaticSearch, StaticSearchError, STATIC_SEARCH_ERROR_CODES } from '../../../integrations/astro/dist/build.js';
import { loadStaticSearch } from '../../../integrations/astro/dist/client.js';
import { scanPhraseSourceCorpus, sourcePhraseQueryResult } from '../../oracle/phrases.mjs';
import { schema, entries, excluded, queries, nativeQuery, pages } from '../../fixtures/astro/records.mjs';

const encoder = new TextEncoder();
const digest = value => createHash('sha256').update(typeof value === 'string' ? encoder.encode(value) : value).digest('hex');
const clone = value => structuredClone(value);
const ordinal = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const records = entries.map(entry => entry.record);
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) <= Math.max(1e-12, Math.abs(expected) * 1e-12), `${label}: ${actual} != ${expected}`);
function configuration(overrides = {}) { return { schema, addons: [createSourceProvider({ fields: ['title', 'body'] }), createSourcePhrases({ fields: ['title', 'body'] })], ...overrides }; }
const qualification = () => ({ profileId: 'rx-a100-runtime-fixture', scope: 'exact-node-runtime', environment: currentNodeSnapshotEnvironment(), evidence: ['test/integrations/astro/runtime.test.mjs: exact local Node consumer only'] });
const errorCode = (...codes) => error => { assert.ok(codes.includes(error.code), `${error.name}/${error.code}/${error.reason ?? ''}`); assert.ok(error instanceof StaticSearchError || error instanceof RaveldexError); return true; };
const frozen = value => { if (value && typeof value === 'object') { assert.ok(Object.isFrozen(value)); for (const item of Object.values(value)) frozen(item); } };
function response(url, content, status = 200) {
  const length = typeof content === 'string' ? encoder.encode(content).length : content instanceof Uint8Array ? content.byteLength : undefined;
  const result = new Response(content, { status, headers: { 'content-type': 'application/json', ...(length === undefined ? {} : { 'content-length': String(length) }) } });
  Object.defineProperty(result, 'url', { value: url }); return result;
}
function network(artifacts, origin = 'https://static.example') {
  const directory = origin + artifacts.manifest.base + 'raveldex/', manifestUrl = directory + 'manifest.json';
  const files = new Map(Object.entries(artifacts.files).map(([name, content]) => [directory + name, content]));
  const requests = [], net = { directory, manifestUrl, files, requests, override: undefined, async fetch(input, options = {}) {
    const url = String(input); requests.push({ url, redirect: options.redirect, signal: options.signal });
    assert.equal(options.redirect, 'error', 'artifact requests cannot follow off-origin redirects');
    if (net.override) { const value = await net.override(url, options); if (value !== undefined) return value; }
    return files.has(url) ? response(url, files.get(url)) : response(url, '', 404);
  } };
  return net;
}
function loadOptions(artifacts, net, extra = {}) { return { manifestUrl: net.manifestUrl, expectedBuildId: artifacts.manifest.buildId, configuration: configuration(), fetch: net.fetch, ...extra }; }
function changeManifest(artifacts, change) {
  const manifest = clone(artifacts.manifest); change(manifest);
  return { manifest, files: { ...artifacts.files, 'manifest.json': JSON.stringify(manifest) } };
}
function changeDocuments(artifacts, change) {
  const manifest = clone(artifacts.manifest), files = { ...artifacts.files }, old = manifest.assets.documents.file;
  const value = JSON.parse(files[old]); change(value); const wire = JSON.stringify(value), sha256 = digest(wire), file = `documents-${sha256}.json`;
  delete files[old]; files[file] = wire; manifest.assets.documents = { file, bytes: encoder.encode(wire).length, sha256 }; files['manifest.json'] = JSON.stringify(manifest);
  return { manifest, files };
}
function compare(actual, expected, label) {
  assert.equal(actual.completeness, 'complete', label); assert.equal(actual.model, 'raveldex-bm25-v1', label); assert.equal(actual.total, expected.total, label);
  assert.deepEqual(actual.hits.map(hit => hit.id), expected.hits.map(hit => hit.id), label);
  for (let index = 0; index < actual.hits.length; index++) near(actual.hits[index].score, expected.hits[index].score, label);
}

// This direct test uses an explicitly disclosed development peer. The separate
// browser qualification installs both actual tarballs and refuses workspace links.
test('source artifacts at root and changed deployment base preserve all complete independent source results', async t => {
  const model = scanPhraseSourceCorpus(records, schema); let comparisons = 0, documentReads = 0;
  for (const base of ['/', '/docs/']) {
    const artifacts = await buildStaticSearch({ configuration: configuration(), entries, buildId: 'release-1', base }); frozen(artifacts);
    assert.equal(artifacts.manifest.kind, 'raveldex-static-search'); assert.equal(artifacts.manifest.version, 1); assert.equal(artifacts.manifest.recordCount, entries.length);
    for (const [role, asset] of Object.entries(artifacts.manifest.assets)) { assert.equal(asset.sha256, digest(artifacts.files[asset.file])); assert.equal(asset.bytes, encoder.encode(artifacts.files[asset.file]).length); assert.equal(asset.file, `${role}-${asset.sha256}.json`); }
    const net = network(artifacts), loaded = await loadStaticSearch(loadOptions(artifacts, net)), ordinary = createRaveldex(configuration());
    try {
      await ordinary.addMany(records); assert.equal(net.requests.length, 2); assert.ok(net.requests.every(row => !row.url.includes('documents-')));
      for (const query of queries) for (const page of pages) {
        const actual = await loaded.engine.search(nativeQuery(query), page), full = await ordinary.search(nativeQuery(query), page);
        assert.deepEqual(actual, full); compare(actual, sourcePhraseQueryResult(model, query, page), `${base} ${JSON.stringify(query)}`); comparisons++;
      }
      assert.equal((await loaded.engine.search(excluded.record.text.body)).total, 0, 'unselected content never enters artifacts');
      const documents = await loaded.loadDocuments(); frozen(documents); documentReads++;
      assert.deepEqual(documents.map(doc => doc.id).sort(ordinal), records.map(record => record.id).sort(ordinal));
      const paths = new Map(entries.map(entry => [entry.record.id, base + entry.path.slice(1)]));
      for (const doc of documents) assert.equal(doc.url, paths.get(doc.id));
      assert.equal(net.requests.length, 3); assert.equal(net.requests[2].url, net.directory + artifacts.manifest.assets.documents.file);
      await loaded.loadDocuments(); assert.equal(net.requests.length, 4, 'display loads are explicit and not hidden in a module cache');
      assert.equal(loaded.manifest.buildId, 'release-1'); frozen(loaded.manifest); assert.ok(Object.isFrozen(loaded));
    } finally { await loaded.dispose(); await ordinary.dispose(); }
  }
  assert.equal(comparisons, 108); assert.equal(documentReads, 2);
  t.diagnostic(JSON.stringify({ explicitEntries: entries.length, excludedEntries: 1, deploymentBases: 2, completeSourceFullReplacementComparisons: comparisons, explicitInitialDocumentReads: documentReads }));
});

test('loaded source scores have independently hand-derived native BM25 and retain original source values', async t => {
  const config = { schema: { text: { body: {} } }, addons: [createSourceProvider({ fields: ['body'] })] };
  const selected = [{ record: { id: 'a', text: { body: ['red red', 'blue'] } }, title: 'A', path: '/a/' }, { record: { id: 'b', text: { body: 'red blue' } }, title: 'B', path: '/b/' }, { record: { id: 'c', text: { body: 'blue' } }, title: 'C', path: '/c/' }, { record: { id: 'empty', text: {} }, title: 'Empty', path: '/empty/' }];
  const artifacts = await buildStaticSearch({ configuration: config, entries: selected, buildId: 'numbers-1' }), net = network(artifacts), loaded = await loadStaticSearch(loadOptions(artifacts, net, { configuration: config }));
  try {
    const result = await loaded.engine.search('red'); assert.equal(result.total, 2);
    const score = (tf, length) => Math.log(1 + (3 - 2 + 0.5) / (2 + 0.5)) * (tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * length / 2));
    near(result.hits[0].score, score(2, 3), 'a tf2,length3,N3,df2,avg2'); near(result.hits[1].score, score(1, 2), 'b tf1,length2,N3,df2,avg2'); assert.deepEqual(result.hits.map(hit => hit.id), ['a', 'b']);
    const rebuilt = JSON.parse(await createSnapshots(loaded.engine).exportSource()).body.payload.records;
    assert.deepEqual(rebuilt.find(row => row.id === 'a').text.body, ['red red', 'blue']); assert.equal(Object.hasOwn(rebuilt.find(row => row.id === 'empty').text, 'body'), false);
    t.diagnostic(JSON.stringify({ handDerivedScores: 2, fieldPopulation: 3, documentFrequency: 2, totalFieldLength: 6, averageFieldLength: 2, originalValueAssertions: 2 }));
  } finally { await loaded.dispose(); }
});

test('build ownership captures every entry before the first await and rejects malformed allowlists without evaluating accessors', async t => {
  const originals = Array.from({ length: 201 }, (_, index) => ({ record: { id: 'r' + index, text: { title: 'red record ' + index, body: ['original'] } }, title: 'Original ' + index, path: `/r${index}/` }));
  const options = { configuration: configuration(), entries: originals, buildId: 'owned-1', base: '/docs/' };
  const pending = buildStaticSearch(options); originals[200].record.text.body[0] = 'later'; originals[200].title = 'Changed'; originals[200].path = '/changed/'; originals.splice(0); options.buildId = 'changed'; options.base = '/changed/';
  const artifacts = await pending, net = network(artifacts), loaded = await loadStaticSearch(loadOptions(artifacts, net));
  try { assert.equal(artifacts.manifest.recordCount, 201); assert.equal(artifacts.manifest.buildId, 'owned-1'); assert.equal((await loaded.engine.search('original', { limit: 0 })).total, 201); assert.equal((await loaded.engine.search('later')).total, 0); const docs = await loaded.loadDocuments(); const last = docs.find(row => row.id === 'r200'); assert.deepEqual(last, { id: 'r200', title: 'Original 200', url: '/docs/r200/' }); } finally { await loaded.dispose(); }
  let getters = 0; const withGetter = clone(entries[0]); Object.defineProperty(withGetter, 'title', { get() { getters++; throw Error('do not evaluate'); }, enumerable: true });
  const badText = clone(entries[0]); Object.defineProperty(badText.record.text, 'body', { get() { getters++; throw Error('do not evaluate'); }, enumerable: true });
  const badToJSON = clone(entries[0]); badToJSON.record.toJSON = () => { getters++; throw Error('do not serialize'); };
  const sparse = new Array(1), bad = [null, [entries[0], entries[0]], [withGetter], [badText], [badToJSON], sparse, [{ ...entries[0], extra: true }], [{ ...entries[0], title: undefined }], [{ ...entries[0], path: 'https://foreign.example/a/' }], [{ ...entries[0], path: '/../escape/' }], [{ ...entries[0], path: '/%2e%2e/escape/' }], [{ ...entries[0], path: '/a//b/' }], [{ ...entries[0], path: '/a/?private=1' }], [{ ...entries[0], path: '/a/#fragment' }], [{ ...entries[0], path: '/a\\b/' }], [{ ...entries[0], path: '/without-slash' }]];
  for (const value of bad) await assert.rejects(buildStaticSearch({ configuration: configuration(), entries: value, buildId: 'invalid-1' }), errorCode('INVALID_INPUT', 'INVALID_RECORD', 'ID_EXISTS'));
  for (const base of ['/../', '//foreign/', '/bad?query/', '/encoded%2f/']) await assert.rejects(buildStaticSearch({ configuration: configuration(), entries: [], buildId: 'invalid-1', base }), errorCode('INVALID_INPUT'));
  for (const buildId of ['', '../release', 'x'.repeat(65)]) await assert.rejects(buildStaticSearch({ configuration: configuration(), entries: [], buildId }), errorCode('INVALID_INPUT'));
  await assert.rejects(buildStaticSearch({ configuration: configuration(), entries: Array.from({ length: 10001 }, () => entries[0]), buildId: 'too-many' }), errorCode('ASSET_LIMIT', 'INVALID_INPUT'));
  assert.equal(getters, 0); t.diagnostic(JSON.stringify({ ownedEntriesAcrossAwait: 201, malformedAllowlists: bad.length, invalidBases: 4, invalidBuildIds: 3, recordCountCeiling: 10000, executedAccessorsOrToJSON: getters }));
});

test('empty allowlists and complete generation updates load separate owners without changing an application-owned prior generation', async () => {
  const first = await buildStaticSearch({ configuration: configuration(), entries, buildId: 'release-1' }), old = await loadStaticSearch(loadOptions(first, network(first)));
  try {
    const empty = await buildStaticSearch({ configuration: configuration(), entries: [], buildId: 'empty-1' }), noRecords = await loadStaticSearch(loadOptions(empty, network(empty)));
    try { assert.equal((await noRecords.engine.search({ kind: 'all' })).total, 0); assert.deepEqual(await noRecords.loadDocuments(), []); } finally { await noRecords.dispose(); }
    const secondEntries = [clone(entries[0])]; secondEntries[0].record.text.body = 'new generation green';
    const second = await buildStaticSearch({ configuration: configuration(), entries: secondEntries, buildId: 'release-2' }), net = network(second);
    await assert.rejects(loadStaticSearch(loadOptions(second, net, { expectedBuildId: 'release-1' })), errorCode('STALE_BUILD'));
    assert.equal(net.requests.length, 1); assert.equal((await old.engine.search('red')).total, 2);
    const fresh = await loadStaticSearch(loadOptions(second, network(second)));
    try { assert.equal((await fresh.engine.search('green')).total, 1); assert.equal((await fresh.engine.search('red')).total, 0); assert.equal((await old.engine.search('red')).total, 2); } finally { await fresh.dispose(); }
  } finally { await old.dispose(); }
});

test('stale, missing, corrupt and malformed manifest/assets fail explicitly and cannot cause implicit display or source-page loading', async t => {
  const artifacts = await buildStaticSearch({ configuration: configuration(), entries, buildId: 'failure-1' }); let refused = 0;
  const missingManifest = network(artifacts); missingManifest.files.delete(missingManifest.manifestUrl); await assert.rejects(loadStaticSearch(loadOptions(artifacts, missingManifest)), errorCode('MISSING_ARTIFACT')); refused++;
  const missingSnapshot = network(artifacts); missingSnapshot.files.delete(missingSnapshot.directory + artifacts.manifest.assets.source.file); await assert.rejects(loadStaticSearch(loadOptions(artifacts, missingSnapshot)), errorCode('MISSING_ARTIFACT')); refused++;
  const corrupt = network(artifacts), sourceUrl = corrupt.directory + artifacts.manifest.assets.source.file, source = corrupt.files.get(sourceUrl); corrupt.files.set(sourceUrl, source.replace('Atomic', 'At0mic')); await assert.rejects(loadStaticSearch(loadOptions(artifacts, corrupt)), errorCode('INTEGRITY_MISMATCH')); refused++;
  const invalidJSON = network(artifacts); invalidJSON.files.set(invalidJSON.manifestUrl, '{broken'); await assert.rejects(loadStaticSearch(loadOptions(artifacts, invalidJSON)), errorCode('INVALID_ARTIFACT')); refused++;
  for (const change of [value => { value.version = 2; }, value => { value.extra = true; }, value => { value.assets.source.file = '../outside.json'; }, value => { value.assets.source.file = 'https://foreign.example/source.json'; }, value => { value.assets.documents.sha256 = 'invalid'; }, value => { value.recordCount = 10001; }]) {
    const changed = changeManifest(artifacts, change), net = network(changed);
    await assert.rejects(loadStaticSearch(loadOptions(changed, net)), errorCode('INVALID_ARTIFACT', 'ASSET_LIMIT')); assert.equal(net.requests.length, 1); refused++;
  }
  for (const change of [value => { value.recordCount = 4; }, value => { value.documentIdsSha256 = '0'.repeat(64); }]) {
    const changed = changeManifest(artifacts, change), net = network(changed);
    await assert.rejects(loadStaticSearch(loadOptions(changed, net)), errorCode('INCOMPATIBLE_ARTIFACT', 'INTEGRITY_MISMATCH', 'INVALID_ARTIFACT')); refused++;
  }
  const thrown = network(artifacts); thrown.override = async () => { throw Error('private endpoint secret'); };
  await assert.rejects(loadStaticSearch(loadOptions(artifacts, thrown)), error => { assert.equal(error.code, 'FETCH_FAILED'); assert.equal(error.message.includes('private endpoint secret'), false); assert.equal(Object.hasOwn(error, 'cause'), false); return true; }); refused++;
  for (const manifestUrl of ['file:///private/manifest.json', 'https://a:b@static.example/raveldex/manifest.json', 'https://static.example/raveldex/manifest.json?query', 'https://static.example/wrong.json']) await assert.rejects(loadStaticSearch(loadOptions(artifacts, network(artifacts), { manifestUrl })), errorCode('INVALID_INPUT'));
  assert.equal(refused, 13); t.diagnostic(JSON.stringify({ manifestOrAssetRefusals: refused, invalidManifestUrls: 4, networkScope: 'Only explicitly requested manifest/selected snapshot; never source page or display prefetch' }));
});

test('display loading verifies actual envelope data, build identity, unique ID digest and safe deployment URLs after hash verification', async t => {
  const artifacts = await buildStaticSearch({ configuration: configuration(), entries, buildId: 'display-1', base: '/docs/' }); let rejected = 0;
  for (const change of [value => { value.buildId = 'other'; }, value => { value.kind = 'foreign'; }, value => { value.documents.pop(); }, value => { value.documents[0].id = value.documents[1].id; }, value => { value.documents[0].id = 'foreign-id'; }, value => { value.documents[0].url = 'javascript:alert(1)'; }, value => { value.documents[0].url = '/other-base/page/'; }, value => { value.documents[0].url = '/docs/../outside/'; }, value => { value.documents[0].title = null; }, value => { value.documents[0].extra = true; }]) {
    const changed = changeDocuments(artifacts, change), net = network(changed), loaded = await loadStaticSearch(loadOptions(changed, net));
    try { assert.equal(net.requests.length, 2); await assert.rejects(loaded.loadDocuments(), errorCode('INVALID_ARTIFACT', 'STALE_BUILD', 'INTEGRITY_MISMATCH', 'INCOMPATIBLE_ARTIFACT')); assert.equal((await loaded.engine.search('red')).total, 2); assert.equal(net.requests.length, 3); rejected++; } finally { await loaded.dispose(); }
  }
  const missing = network(artifacts), loaded = await loadStaticSearch(loadOptions(artifacts, missing));
  try { missing.files.delete(missing.directory + artifacts.manifest.assets.documents.file); await assert.rejects(loaded.loadDocuments(), errorCode('MISSING_ARTIFACT')); assert.equal((await loaded.engine.search({ kind: 'all' })).total, 5); } finally { await loaded.dispose(); }
  assert.equal(rejected, 10); t.diagnostic(JSON.stringify({ rehashedStructurallyInvalidDisplayEnvelopes: rejected, missingDisplayAsset: 1, ordinaryOwnerRemainsUsable: true }));
});

test('configuration compatibility rejects mismatched schema, analyzer, limits, source capabilities and source-free build', async t => {
  const artifacts = await buildStaticSearch({ configuration: configuration(), entries, buildId: 'compatibility-1' });
  const variants = [configuration({ schema: { ...schema, text: { ...schema.text, extra: {} } }, addons: [createSourceProvider({ fields: ['title', 'body', 'extra'] }), createSourcePhrases({ fields: ['title', 'body', 'extra'] })] }), configuration({ limits: { maxDocuments: 50 } }), configuration({ addons: [createSourceProvider({ fields: ['title', 'body'] })] }), configuration({ analyzer: ENGLISH_ANALYZER, addons: [...configuration().addons, createEnglishAnalyzer()] })];
  for (const config of variants) await assert.rejects(loadStaticSearch(loadOptions(artifacts, network(artifacts), { configuration: config })), errorCode('INCOMPATIBLE_ARTIFACT'));
  await assert.rejects(buildStaticSearch({ configuration: { schema }, entries, buildId: 'source-free' }), error => { assert.equal(error.code, 'MISSING_CAPABILITY'); assert.equal(error.reason, 'SOURCE_UNAVAILABLE'); return true; });
  const partial = { schema, addons: [createSourceProvider({ fields: ['title'] })] }; await assert.rejects(buildStaticSearch({ configuration: partial, entries, buildId: 'partial-source' }), errorCode('MISSING_CAPABILITY'));
  t.diagnostic(JSON.stringify({ incompatibleReceiverConfigurations: variants.length, sourceFreeBuildRefusals: 1, partialSourceBuildRefusals: 1 }));
});

test('finite streamed byte checks cancel oversized and malformed UTF-8 assets, while explicit abort and read timeout remain typed', async t => {
  const artifacts = await buildStaticSearch({ configuration: configuration(), entries, buildId: 'transport-1' }); let streamCancels = 0;
  const net = network(artifacts), sourceUrl = net.directory + artifacts.manifest.assets.source.file;
  net.override = async url => { if (url !== sourceUrl) return undefined; const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(artifacts.manifest.assets.source.bytes + 1)); }, cancel() { streamCancels++; } }); return response(url, stream); };
  await assert.rejects(loadStaticSearch(loadOptions(artifacts, net)), errorCode('ASSET_LIMIT', 'INTEGRITY_MISMATCH')); assert.equal(streamCancels, 1);
  const badUTF8 = network(artifacts); badUTF8.override = async url => url === badUTF8.manifestUrl ? response(url, new Uint8Array([0xc3, 0x28])) : undefined;
  await assert.rejects(loadStaticSearch(loadOptions(artifacts, badUTF8)), errorCode('INVALID_ARTIFACT'));
  const pre = new AbortController(); pre.abort(); const preNet = network(artifacts); await assert.rejects(loadStaticSearch(loadOptions(artifacts, preNet, { signal: pre.signal })), errorCode('CANCELLED')); assert.equal(preNet.requests.length, 0);
  function waitingNet() { const waiting = network(artifacts); waiting.override = async (_url, options) => new Promise((_resolve, reject) => { const stop = () => reject(new DOMException('aborted', 'AbortError')); if (options.signal.aborted) stop(); else options.signal.addEventListener('abort', stop, { once: true }); }); return waiting; }
  const timed = waitingNet(); await assert.rejects(loadStaticSearch(loadOptions(artifacts, timed, { timeoutMs: 5 })), errorCode('FETCH_FAILED'));
  const active = new AbortController(), aborted = waitingNet(), pending = loadStaticSearch(loadOptions(artifacts, aborted, { signal: active.signal })); active.abort(); await assert.rejects(pending, errorCode('CANCELLED'));
  let compressedDecodingChecks = 0;
  for (const [encoding, compress] of [['gzip', gzipSync], ['br', brotliCompressSync]]) {
    const compressed = network(artifacts);
    compressed.override = async url => { const body = compressed.files.get(url); if (body === undefined) return undefined; const decoded = response(url, body); decoded.headers.set('content-encoding', encoding); decoded.headers.set('content-length', String(compress(Buffer.from(body)).length)); return decoded; };
    const decoded = await loadStaticSearch(loadOptions(artifacts, compressed));
    try { assert.equal((await decoded.engine.search('red')).total, 2); assert.equal((await decoded.loadDocuments()).length, 5); compressedDecodingChecks++; } finally { await decoded.dispose(); }
  }
  const recovery = await loadStaticSearch(loadOptions(artifacts, network(artifacts))); try { assert.equal((await recovery.engine.search('red')).total, 2); } finally { await recovery.dispose(); }
  t.diagnostic(JSON.stringify({ oversizedStreamCancellations: streamCancels, invalidUTF8: 1, preAbortWithoutRequests: 1, activeAbort: 1, actualRequestTimeout: 1, compressedDecodedResponseChecks: compressedDecodingChecks, freshRecovery: 1 }));
});

test('disposing a loaded generation aborts pending display reads and closes future engine and display admission', async () => {
  const artifacts = await buildStaticSearch({ configuration: configuration(), entries, buildId: 'dispose-1' }), net = network(artifacts), loaded = await loadStaticSearch(loadOptions(artifacts, net));
  let started; const ready = new Promise(resolve => { started = resolve; });
  net.override = async (url, options) => { if (!url.includes('documents-')) return undefined; started(); return new Promise((_resolve, reject) => { const stop = () => reject(new DOMException('disposed', 'AbortError')); if (options.signal.aborted) stop(); else options.signal.addEventListener('abort', stop, { once: true }); }); };
  const pending = loaded.loadDocuments(); const outcome = pending.then(value => ({ value }), error => ({ error })); await ready; await loaded.dispose();
  const result = await outcome; assert.equal(result.error?.code, 'DISPOSED'); await assert.rejects(loaded.loadDocuments(), errorCode('DISPOSED')); await assert.rejects(loaded.engine.search('red'), { code: 'DISPOSED' }); await loaded.dispose();
});

test('qualified native and source artifacts retain existing exact-Node compatibility with no native-to-source fallback', async t => {
  const config = configuration(), nativeQualification = qualification(), artifacts = await buildStaticSearch({ configuration: config, entries, buildId: 'native-1', nativeQualification });
  assert.ok(artifacts.manifest.assets.native); let comparisons = 0;
  const model = scanPhraseSourceCorpus(records, schema);
  for (const format of ['source', 'native']) {
    const net = network(artifacts), loaded = await loadStaticSearch(loadOptions(artifacts, net, { configuration: config, format, ...(format === 'native' ? { nativeQualification } : {}) }));
    try { assert.equal(net.requests.length, 2); assert.equal(net.requests[1].url, net.directory + artifacts.manifest.assets[format].file); for (const query of queries) for (const page of pages) { compare(await loaded.engine.search(nativeQuery(query), page), sourcePhraseQueryResult(model, query, page), `same-Node ${format}`); comparisons++; } } finally { await loaded.dispose(); }
  }
  const incompatible = { ...nativeQualification, profileId: 'rx-a100-other-profile' };
  await assert.rejects(loadStaticSearch(loadOptions(artifacts, network(artifacts), { format: 'native', nativeQualification: incompatible })), error => { assert.ok(error instanceof SnapshotAdapterError); assert.equal(error.reason, 'PROFILE_MISMATCH'); return true; });
  await assert.rejects(loadStaticSearch(loadOptions(artifacts, network(artifacts), { format: 'native' })), errorCode('INVALID_INPUT', 'INCOMPATIBLE_CAPABILITY', 'INCOMPATIBLE_ARTIFACT'));
  const sourceOnly = await buildStaticSearch({ configuration: config, entries, buildId: 'source-only' });
  await assert.rejects(loadStaticSearch(loadOptions(sourceOnly, network(sourceOnly), { format: 'native', nativeQualification })), errorCode('MISSING_ARTIFACT'));
  assert.equal(comparisons, 108); assert.ok(Object.isFrozen(STATIC_SEARCH_ERROR_CODES)); assert.equal(new Set(STATIC_SEARCH_ERROR_CODES).size, 10);
  t.diagnostic(JSON.stringify({ sameExactNodeCompleteSourceNativeComparisons: comparisons, mismatchedNativeProfile: 1, missingQualification: 1, missingNativeAsset: 1, scope: 'Exact current local Node only; browser refusal is separately exercised by the real packed Astro consumer' }));
});

test('fetch callbacks receive their declared receiver instead of an internal read-options object', async () => {
  const artifacts = await buildStaticSearch({ configuration: configuration(), entries, buildId: 'fetch-receiver' });
  const injected = network(artifacts); let injectedCalls = 0;
  function providedFetch(input, options) { assert.equal(this, undefined, 'injected function called as a plain function'); injectedCalls++; return injected.fetch(input, options); }
  const selected = await loadStaticSearch(loadOptions(artifacts, injected, { fetch: providedFetch }));
  try { assert.equal((await selected.engine.search('red')).total, 2); await selected.loadDocuments(); assert.equal(injectedCalls, 3); } finally { await selected.dispose(); }
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'fetch'), defaultNetwork = network(artifacts); let defaultCalls = 0;
  Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: function windowLikeFetch(input, options) { assert.equal(this, globalThis, 'native browser fetch uses the actual host receiver'); defaultCalls++; return defaultNetwork.fetch(input, options); } });
  try {
    const options = loadOptions(artifacts, defaultNetwork); delete options.fetch;
    const loaded = await loadStaticSearch(options);
    try { assert.equal((await loaded.engine.search('red')).total, 2); await loaded.loadDocuments(); assert.equal(defaultCalls, 3); } finally { await loaded.dispose(); }
  } finally { Object.defineProperty(globalThis, 'fetch', prior); }
  const missing = network(artifacts); missing.files.delete(missing.manifestUrl);
  await assert.rejects(loadStaticSearch(loadOptions(artifacts, missing, { fetch: function plain(input, options) { assert.equal(this, undefined); return missing.fetch(input, options); } })), errorCode('MISSING_ARTIFACT'));
});


test('an aborted load explicitly cancels a late response body when the injected fetch ignores its signal', async () => {
  const artifacts = await buildStaticSearch({ configuration: configuration(), entries, buildId: 'late-fetch' }), net = network(artifacts), controller = new AbortController();
  let release, cancellations = 0;
  net.override = async () => new Promise(resolve => { release = resolve; });
  const pending = loadStaticSearch(loadOptions(artifacts, net, { signal: controller.signal })).then(value => ({ value }), error => ({ error }));
  assert.equal(typeof release, 'function'); controller.abort(); const stopped = await pending; assert.equal(stopped.error?.code, 'CANCELLED');
  const body = new ReadableStream({ start(stream) { stream.enqueue(encoder.encode('{}')); }, cancel() { cancellations++; } }), late = new Response(body);
  try { release(late); await new Promise(resolve => setImmediate(resolve)); assert.equal(cancellations, 1, 'unaccepted late body is actively released'); } finally { if (!cancellations) await body.cancel(); }
});


test('reentrant aborts consume already-created fetch and reader rejection promises without unhandled rejections', async () => {
  const client = new URL('../../../integrations/astro/dist/client.js', import.meta.url).href;
  const source = `import {loadStaticSearch} from ${JSON.stringify(client)};
const rows=[];
for(const phase of ['fetch','reader']){
  const unhandled=[],listener=error=>unhandled.push(error);process.on('unhandledRejection',listener);const controller=new AbortController();let cancelledReaders=0;
  const fetcher=phase==='fetch'?()=>{controller.abort();return Promise.reject(Error('reentrant fetch marker'));}:()=>{const value=new Response('');Object.defineProperty(value,'body',{value:{getReader(){return{read(){controller.abort();return Promise.reject(Error('reentrant reader marker'));},cancel(){cancelledReaders++;return Promise.resolve();},releaseLock(){}}}}});return Promise.resolve(value);};
  let code;try{await loadStaticSearch({manifestUrl:'https://reentrant.example/raveldex/manifest.json',expectedBuildId:'probe-1',configuration:{schema:{text:{body:{}}}},signal:controller.signal,fetch:fetcher});}catch(error){code=error.code;}
  await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));process.removeListener('unhandledRejection',listener);rows.push({phase,code,unhandledRejections:unhandled.length,cancelledReaders});
}
console.log(JSON.stringify(rows));`;
  const child = await promisify(execFile)(process.execPath, ['--input-type=module', '--eval', source], { encoding: 'utf8' }), rows = JSON.parse(child.stdout);
  assert.deepEqual(rows, [{ phase: 'fetch', code: 'CANCELLED', unhandledRejections: 0, cancelledReaders: 0 }, { phase: 'reader', code: 'CANCELLED', unhandledRejections: 0, cancelledReaders: 1 }]);
});
