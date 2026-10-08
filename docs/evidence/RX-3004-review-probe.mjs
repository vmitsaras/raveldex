import assert from 'node:assert/strict';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { resolve, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { platform, release, arch } from 'node:os';

// Independent inputs/expectations. No primary test fixture, native analyzer or scorer is imported.
const repo = fileURLToPath(new URL('../../', import.meta.url));
const consumer = resolve(process.argv[2]);
const companion = resolve(process.argv[3] ?? '/Users/vasilis/Documents/GitHub/LocalSearch');
const packageDir = join(consumer, 'node_modules/@vmitsaras/raveldex');
const digest = input => createHash('sha256').update(input).digest('hex');
const utf8 = value => new TextEncoder().encode(value);
const git = (directory, args) => execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8' }).trim();
const manifest = JSON.parse(await readFile(join(packageDir, 'package.json')));
const publicImport = async key => {
  const target = manifest.exports[key]?.import;
  assert.equal(typeof target, 'string', `public import ${key}`);
  return import(pathToFileURL(join(packageDir, target)).href);
};
const sourceFiles = async directory => {
  const paths = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await sourceFiles(path)); else paths.push(path);
  }
  return paths.sort();
};
const sourcePaths = [...await sourceFiles(join(repo, 'src')), join(repo, 'package.json'),
  ...await sourceFiles(join(repo, 'docs/migration')), ...await sourceFiles(join(repo, 'integrations/minisearch')),
  ...await sourceFiles(join(repo, 'examples/migration'))].sort();
const identities = async paths => Promise.all(paths.map(async path => ({ path, sha256: digest(await readFile(path)) })));
const before = await identities(sourcePaths);
const installedPaths = [join(packageDir, 'package.json'), ...await sourceFiles(join(packageDir, 'dist'))].sort();
const installedBefore = await identities(installedPaths);
const tracked = git(companion, ['ls-files']).split('\n').filter(Boolean).sort();
assert.equal(git(companion, ['rev-parse', 'HEAD']), '5f334a8ca4f7d9d95b6b731ac539f4b1dda302cb');
assert.equal(git(companion, ['status', '--porcelain']), '');
const companionBefore = await identities(tracked.map(path => join(companion, path)));
const report = { kind: 'rx-3004-independent-public-package-probes-v1', startedAt: new Date().toISOString(),
  environment: { node: process.version, v8: process.versions.v8, icu: process.versions.icu,
    unicode: process.versions.unicode, os: { platform: platform(), release: release(), arch: arch() } },
  consumer, companion, packageManifestSha256: digest(await readFile(join(packageDir, 'package.json'))),
  installedRuntimeIdentityBefore: installedBefore,
  method: 'Independent handwritten records, literal complete membership and arithmetic; actual companion public exports plus hand canonical bytes; installed public native exports only.',
  records: [], sourceIdentityBefore: before, sourceIdentityAfter: [], limitations: ['One local Node/Chrome host only',
    'No AT/physical latency/heap/cross-host qualification', 'Checksum is corruption detection, not authentication'] };
const probe = async (name, callback) => {
  try { report.records.push({ name, status: 'Pass', observation: await callback() }); }
  catch (error) { report.records.push({ name, status: 'Fail', error: { name: error.name, code: error.code, message: error.message, stack: error.stack } }); }
};
const { createRaveldex } = await publicImport('.');
const { convertLocalSearchSnapshot, MigrationError } = await publicImport('./integrations/localsearch');
const { createSourceProvider, createSourcePhrases } = await publicImport('./addons/phrases');
const { createSnapshots } = await publicImport('./adapters/snapshots');
const { createLocalSearch } = await import(pathToFileURL(join(companion, 'dist/index.js')).href);
const { restoreLocalSearch } = await import(pathToFileURL(join(companion, 'dist/storage/index.js')).href);
await probe('isolated bare public imports perform no host initialization and private paths stay excluded', async () => {
  const startup = execFileSync(process.execPath, ['--input-type=module', '--eval', `
    const reads=[];
    for(const name of ['window','document','navigator','Worker','SharedWorker','fetch','indexedDB','localStorage','crypto','TextEncoder','TextDecoder','setTimeout','setInterval'])
      Object.defineProperty(globalThis,name,{configurable:true,get(){reads.push(name);throw Error(name)}});
    const core=await import('@vmitsaras/raveldex');
    const migration=await import('@vmitsaras/raveldex/integrations/localsearch');
    if(reads.length)throw Error('import-time host reads');
    for(const specifier of ['@vmitsaras/raveldex/integrations/localsearch/codec','@vmitsaras/raveldex/dist/integrations/localsearch/index.js','@vmitsaras/raveldex/integrations/minisearch']){
      try{await import(specifier);throw Error('private path admitted')}catch(error){if(error.code!=='ERR_PACKAGE_PATH_NOT_EXPORTED')throw error}
    }
    console.log(JSON.stringify({reads,coreExports:Object.keys(core).sort(),migrationExports:Object.keys(migration).sort(),privatePaths:'Excluded'}));
  `], { cwd: consumer, encoding: 'utf8' });
  const observed = JSON.parse(startup);
  assert.deepEqual(observed.migrationExports, ['MIGRATION_ERROR_CODES', 'MigrationError', 'convertLocalSearchSnapshot']);
  return observed;
});
const options = { schema: { title: { type: 'text' }, parts: { type: 'text[]' }, category: { type: 'keyword' },
  n: { type: 'number' }, active: { type: 'boolean' } }, returnFields: ['title', 'category'] };
const originals = [
  { id: 'z', title: 'red red fox', parts: ['', 'red fox', 'red', 'fox'], category: 'guide', n: -0, active: true },
  { id: 'a', title: 'ＲＥＤ fox', parts: ['red', 'fox'], category: 'guide', n: 2, active: false },
  { id: '__proto__', title: '\u0301red', parts: [], category: 'reference', n: 3, active: true },
  { id: 'empty' },
];
const foreign = await createLocalSearch(options);
await foreign.addAll(originals);
const bytes = await foreign.exportSnapshot({ sourceRevision: 'review-owned-v1' });
const expectedRecords = [
  { id: '__proto__', text: { title: ['\u0301red'], parts: [] }, metadata: { category: 'reference', n: 3, active: true } },
  { id: 'a', text: { title: ['ＲＥＤ fox'], parts: ['red', 'fox'] }, metadata: { category: 'guide', n: 2, active: false } },
  { id: 'empty', text: {}, metadata: {} },
  { id: 'z', text: { title: ['red red fox'], parts: ['', 'red fox', 'red', 'fox'] }, metadata: { category: 'guide', n: 0, active: true } },
];
const plan = await convertLocalSearchSnapshot(bytes);
const plain = input => JSON.parse(JSON.stringify(input));
const deepFrozen = input => {
  if (!input || typeof input !== 'object') return;
  assert.equal(Object.isFrozen(input), true);
  for (const item of Object.values(input)) deepFrozen(item);
};
const sortedIds = result => result.hits.map(hit => hit.id).sort();
const nativeConfig = input => ({ ...input.configuration, addons: [createSourceProvider({ fields: ['title', 'parts'] }), createSourcePhrases({ fields: ['title', 'parts'] })] });
const migrated = createRaveldex(nativeConfig(plan));
const independent = createRaveldex(nativeConfig(plan));
await migrated.addMany(plan.records); await independent.addMany(expectedRecords);
await probe('actual companion export maps originals, metadata, lineage and frozen ownership', async () => {
  assert.deepEqual(plain(plan.records), expectedRecords); deepFrozen(plan);
  assert.equal(plan.sourceRevision, 'review-owned-v1'); assert.deepEqual(plan.returnFields, ['title', 'category']);
  assert.equal(plan.identity.nativeScoreModel, 'raveldex-bm25-v1'); assert.equal(plan.identity.scoreModel, 'minisearch-7.2.0-companion-v1');
  assert.equal(Object.is(plan.records[3].metadata.n, -0), false);
  assert.equal(Object.is(JSON.parse(new TextDecoder().decode(bytes)).payload.records[3].n, -0), true);
  return { bytes: bytes.length, sha256: digest(bytes), origin: plan.origin, records: expectedRecords };
});
await probe('input bytes owned before SHA await and own accessors never invoked', async () => {
  const copy = bytes.slice(); let invoked = 0;
  for (const name of ['buffer', 'byteLength', 'toJSON']) Object.defineProperty(copy, name, { get() { invoked++; throw Error('getter'); } });
  Object.defineProperty(copy, Symbol.iterator, { get() { invoked++; throw Error('iterator'); } });
  const pending = convertLocalSearchSnapshot(copy); Uint8Array.prototype.fill.call(copy, 0);
  assert.deepEqual(plain((await pending).records), expectedRecords); assert.equal(invoked, 0);
  return { invoked, callerMutationIgnored: true };
});
await probe('literal complete native memberships and independent receiving rebuild scores', async () => {
  const phrase = fields => ({ kind: 'extension', capability: 'phrases', version: 1, payload: { text: 'red fox', fields } });
  const rows = [
    ['native red', 'red', ['__proto__', 'a', 'z']],
    ['all terms', 'red fox', ['a', 'z']],
    ['empty missing preserved', { kind: 'all' }, ['__proto__', 'a', 'empty', 'z']],
    ['exact keyword', { kind: 'eq', field: 'category', value: 'guide' }, ['a', 'z']],
    ['canonical zero', { kind: 'eq', field: 'n', value: 0 }, ['z']],
    ['false metadata', { kind: 'eq', field: 'active', value: false }, ['a']],
    ['per-value phrase', phrase(['parts']), ['z']],
    ['native compatibility phrase', phrase(['title']), ['a', 'z']],
    ['absent', 'green', []],
  ];
  const observed = [];
  for (const [name, query, ids] of rows) {
    const actual = await migrated.search(query, { limit: 100 });
    assert.equal(actual.total, ids.length); assert.deepEqual(sortedIds(actual), ids);
    assert.deepEqual(actual, await independent.search(query, { limit: 100 })); observed.push({ name, ids, result: actual });
  }
  const legacy = await foreign.search({ kind: 'text', value: 'red', limit: 100 });
  assert.deepEqual(sortedIds(legacy), ['a', 'z']);
  const legacyTitle = await foreign.search({ kind: 'text', value: 'red', fields: ['title'], limit: 100 });
  assert.deepEqual(sortedIds(legacyTitle), ['z']);
  return { fullComparisons: rows.length, observed, intentionalLegacyDifference: { allFields: sortedIds(legacy), title: sortedIds(legacyTitle) } };
});
// Independent canonical writer; original-run counts are for the historical source envelope, not native retrieval.
const serialize = value => typeof value === 'number' && Object.is(value, -0) ? '-0' : Array.isArray(value)
  ? '[' + value.map(serialize).join(',') + ']' : value && typeof value === 'object'
    ? '{' + Object.entries(value).map(([key, item]) => JSON.stringify(key) + ':' + serialize(item)).join(',') + '}' : JSON.stringify(value);
function handSnapshot(schema, inputs, revision = 'independent-hand-source') {
  const records = [...inputs].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map(record => {
    const out = { id: record.id }; for (const field of schema) if (Object.hasOwn(record, field.name)) out[field.name] = record[field.name]; return out;
  });
  let sourceStringUnits = 0, arraySlots = 0, indexedTokens = 0;
  for (const record of records) { sourceStringUnits += record.id.length;
    for (const field of schema) { const raw = record[field.name]; if (raw === undefined) continue;
      const values = Array.isArray(raw) ? raw : [raw]; if (Array.isArray(raw)) arraySlots += raw.length;
      for (const value of values) if (typeof value === 'string') {
        sourceStringUnits += value.length;
        if (field.type === 'text' || field.type === 'text[]') for (const match of value.matchAll(/[\p{L}\p{M}\p{N}]+/gu)) if (/[\p{L}\p{N}]/u.test(match[0])) indexedTokens++;
      }
    }
  }
  const payload = { contract: 'companion-v1', dependency: 'minisearch@7.2.0', analyzerId: 'basic-v1', scoreModel: 'minisearch-7.2.0-companion-v1',
    config: { schema, returnFields: [] }, records, counts: { recordCount: records.length, sourceStringUnits, arraySlots, indexedTokens },
    origin: { sessionId: 'review-hand-session', generation: 7 }, sourceRevision: revision };
  return seal(payload);
}
function seal(payload) {
  const text = serialize(payload); const checksum = digest('localsearch-source-v1\n' + text);
  return utf8('{"format":1,"payload":' + text + ',"checksum":{"algorithm":"SHA-256","value":"' + checksum + '"}}');
}
async function refused(input, code) {
  let error; try { await convertLocalSearchSnapshot(input); } catch (caught) { error = caught; }
  assert.ok(error instanceof MigrationError); assert.equal(error.code, code);
  assert.doesNotMatch(error.message + JSON.stringify(error.details), /red fox|review-hand-session|review-owned-v1/);
  return { code: error.code, details: error.details };
}
await probe('hand canonical snapshot accepted by companion and native converter', async () => {
  const hand = handSnapshot([{ name: 'title', type: 'text', boost: 1 }, { name: 'n', type: 'number' }], [{ id: 'safe', title: 'red', n: -0 }]);
  const old = await restoreLocalSearch(hand, { kind: 'direct' });
  try { assert.deepEqual(sortedIds(await old.engine.search({ kind: 'text', value: 'red' })), ['safe']); }
  finally { await old.engine.destroy(); }
  const result = await convertLocalSearchSnapshot(hand); assert.equal(result.records[0].metadata.n, 0);
  return { bytes: hand.length, sha256: digest(hand), independentlyAcceptedByCompanion: true };
});
await probe('corrupt, incompatible, opaque and noncanonical inputs refused without engine mutation', async () => {
  const baseline = await migrated.search({ kind: 'all' }, { limit: 100 }); const source = new TextDecoder().decode(bytes);
  const badChecksum = source.replace(/"value":"[0-9a-f]{64}"/, '"value":"' + '0'.repeat(64) + '"');
  const tests = [
    ['empty', new Uint8Array(), 'INVALID_BYTES'], ['object', { payload: 'opaque' }, 'INVALID_BYTES'],
    ['opaque', utf8('{"serializationVersion":2,"index":[]}'), 'INVALID_SNAPSHOT'],
    ['bad checksum', utf8(badChecksum), 'CHECKSUM_MISMATCH'],
    ['wrong dependency', utf8(source.replace('minisearch@7.2.0', 'minisearch@6.0.0')), 'INCOMPATIBLE_SNAPSHOT'],
    ['whitespace', utf8(' ' + source), 'NONCANONICAL_SNAPSHOT'],
    ['duplicate key', utf8(source.replace('{"format":1,', '{"format":1,"format":1,')), 'INVALID_SNAPSHOT'],
    ['BOM', new Uint8Array([0xef, 0xbb, 0xbf, ...bytes]), 'INVALID_SNAPSHOT'],
    ['invalid UTF8', new Uint8Array([0xff]), 'INVALID_SNAPSHOT'],
    ['minus zero changed', utf8(source.replace('"n":-0', '"n":0')), 'CHECKSUM_MISMATCH'],
  ];
  const observations = []; for (const [name, input, code] of tests) observations.push({ name, ...await refused(input, code) });
  const object = JSON.parse(source); object.payload.counts.indexedTokens++;
  observations.push({ name: 'signed false counts', ...await refused(seal(object.payload), 'INVALID_SNAPSHOT') });
  assert.deepEqual(await migrated.search({ kind: 'all' }, { limit: 100 }), baseline);
  return { rejected: observations.length, observations, sameRevisionAndScores: true };
});
await probe('native intersection rejects legacy-valid source bounds without truncation', async () => {
  const title = [{ name: 'title', type: 'text', boost: 1 }];
  const tests = [
    ['boost17', [{ name: 'title', type: 'text', boost: 17 }], [{ id: 's', title: 'red' }]],
    ['array65', [{ name: 'title', type: 'text[]', boost: 1 }], [{ id: 's', title: Array(65).fill('') }]],
    ['metadata1025', [...title, { name: 'category', type: 'keyword' }], [{ id: 's', title: 'red', category: 'x'.repeat(1025) }]],
    ['raw token257', title, [{ id: 's', title: 'x'.repeat(257) }]],
    ['normalized expansion', title, [{ id: 's', title: 'ﬁ'.repeat(129) }]],
    ['malformed Unicode', title, [{ id: 's', title: '\ud800' }]],
    ['per-record text', Array.from({ length: 6 }, (_, i) => ({ name: 'field' + i, type: 'text', boost: 1 })),
      [Object.fromEntries([['id', 's'], ...Array.from({ length: 6 }, (_, i) => ['field' + i, 'x '.repeat(25000)])])]],
  ];
  const observations = []; for (const [name, schema, records] of tests) observations.push({ name, ...await refused(handSnapshot(schema, records), 'NATIVE_INCOMPATIBLE') });
  return { rejected: observations.length, observations };
});
await probe('consumer oversized rebuild batch failure is atomic and explicit chunking works', async () => {
  const hand = handSnapshot([{ name: 'title', type: 'text', boost: 1 }], Array.from({ length: 257 }, (_, i) => ({ id: 'p' + String(i).padStart(3, '0'), title: 'red' })));
  const converted = await convertLocalSearchSnapshot(hand); const engine = createRaveldex(converted.configuration);
  try {
    await engine.add({ id: 'existing', text: { title: 'blue' } }); const before = await engine.search({ kind: 'all' }, { limit: 100 });
    await assert.rejects(engine.addMany(converted.records), error => error.code === 'LIMIT_EXCEEDED');
    assert.deepEqual(await engine.search({ kind: 'all' }, { limit: 100 }), before);
    for (let i = 0; i < converted.records.length; i += 32) await engine.addMany(converted.records.slice(i, i + 32));
    const result = await engine.search('red', { limit: 0 }); assert.equal(result.total, 257);
    return { conversionRecords: converted.records.length, failedBatchPreservedRevision: before.revision, totalAfterChunks: result.total };
  } finally { await engine.dispose(); }
});
await probe('native numerical scores derived independently differ from identified foreign model', async () => {
  const oldOptions = { schema: { title: { type: 'text' } } }; const data = [{ id: 'a', title: 'red' }, { id: 'b', title: 'red red blue blue blue blue blue blue blue blue' }, { id: 'c', title: 'blue' }];
  const old = await createLocalSearch(oldOptions); await old.addAll(data);
  const converted = await convertLocalSearchSnapshot(await old.exportSnapshot()); const native = createRaveldex(converted.configuration);
  try {
    await native.addMany(converted.records); const result = await native.search('red'); const legacy = await old.search({ kind: 'text', value: 'red' });
    // Native occurrence lengths 1,10,1 (avg4), foreign distinct lengths1,2,1(avg4/3); df2,N3 in both.
    const idf = Math.log(1 + 1.5 / 2.5); const nativeExpected = { a: idf * (2.2 / (1 + 1.2 * (0.25 + 0.75 * 1 / 4))), b: idf * (2 * 2.2 / (2 + 1.2 * (0.25 + 0.75 * 10 / 4))) };
    const foreignExpected = { a: idf * (0.5 + 2.2 / (1 + 1.2 * (0.3 + 0.7 * 1 / (4 / 3)))),
      b: idf * (0.5 + 2 * 2.2 / (2 + 1.2 * (0.3 + 0.7 * 2 / (4 / 3)))) };
    for (const hit of result.hits) assert.ok(Math.abs(hit.score - nativeExpected[hit.id]) <= 1e-12);
    for (const hit of legacy.hits) assert.ok(Math.abs(hit.score - foreignExpected[hit.id]) <= 1e-12);
    assert.equal(result.model, 'raveldex-bm25-v1'); assert.equal(legacy.scoreModel, 'minisearch-7.2.0-companion-v1');
    assert.deepEqual(result.hits.map(hit => hit.id), ['a', 'b']); assert.deepEqual(legacy.hits.map(hit => hit.id), ['b', 'a']);
    assert.notEqual(result.hits[0].score, legacy.hits[0].score);
    const explanation = await old.explain({ kind: 'text', value: 'red' }, 'a'); assert.deepEqual(explanation.scoreDecomposition, { status: 'unavailable', reason: 'upstream-not-exposed' });
    return { nativeExpected, foreignExpected, actualNative: result, actualForeign: legacy.hits.map(({ id, score }) => ({ id, score })), nativeFactsFromForeign: false };
  } finally { await native.dispose(); await old.destroy(); }
});
await probe('update and source snapshot recovery agree with separately reindexed owned source', async () => {
  const replacement = { id: 'z', text: { title: ['blue fox'], parts: ['blue fox'] }, metadata: { category: 'guide', n: 8, active: true } };
  await migrated.replace(replacement); await independent.replace(replacement); await migrated.remove('a'); await independent.remove('a');
  const snapshot = await createSnapshots(migrated).exportSource(); const restored = createRaveldex(nativeConfig(plan));
  try {
    const receipt = await createSnapshots(restored).restore(snapshot); assert.equal(receipt.reindexed, true); assert.equal(receipt.revision, 1);
    const rows = []; for (const [query, ids] of [['red', ['__proto__']], ['blue fox', ['z']], [{ kind: 'all' }, ['__proto__', 'empty', 'z']]]) {
      const actual = await restored.search(query, { limit: 100 }); assert.deepEqual(sortedIds(actual), ids); assert.equal(actual.total, ids.length);
      const expected = await independent.search(query, { limit: 100 }); assert.deepEqual(actual.hits, expected.hits); rows.push({ query, ids, result: actual });
    }
    return { fullComparisons: rows.length, snapshotBytes: Buffer.byteLength(snapshot), receipt, rows };
  } finally { await restored.dispose(); }
});
const require = createRequire(join(repo, 'package.json'));
const { build, version: esbuild } = require('esbuild');
const bundle = async source => build({ absWorkingDir: consumer, stdin: { contents: source, resolveDir: consumer, sourcefile: 'independent-review-entry.mjs' },
  bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', minify: true, metafile: true, logLevel: 'silent' });
await probe('packed public core and migration graphs exclude foreign engines and comparator', async () => {
  assert.equal(manifest.dependencies, undefined); assert.equal(manifest.exports['./integrations/minisearch'], undefined);
  assert.equal(await readFile(join(packageDir, 'dist/integrations/localsearch/LICENSE.LocalSearch'), 'utf8'), await readFile(join(companion, 'LICENSE'), 'utf8'));
  const rows = [];
  for (const specifier of ['@vmitsaras/raveldex', '@vmitsaras/raveldex/integrations/localsearch']) {
    const built = await bundle(`import * as api from '${specifier}'; globalThis.review = api;`); const inputs = Object.keys(built.metafile.inputs);
    assert.ok(inputs.every(path => path === 'independent-review-entry.mjs' || path.startsWith('node_modules/@vmitsaras/raveldex/dist/')));
    assert.ok(inputs.every(path => !/\/node_modules\/(?:minisearch|localsearch|fuse|flexsearch|orama)\/|integrations\/minisearch|test\/|examples\//.test(path)));
    assert.ok(Object.values(built.metafile.inputs).every(row => row.imports.every(item => !item.external)));
    if (specifier === '@vmitsaras/raveldex') assert.ok(inputs.every(path => !/\/integrations\/|\/addons\/|\/adapters\//.test(path)));
    rows.push({ specifier, inputs, bytes: built.outputFiles[0].contents.length, sha256: digest(built.outputFiles[0].contents) });
  }
  return { esbuild, graphs: rows, licenseByteIdentical: true, runtimeDependencies: 0 };
});
if (process.argv.includes('--browser')) await probe('fresh packed browser conversion, update, IndexedDB save/reload and erase', async () => {
  const built = await bundle(`import {createRaveldex} from '@vmitsaras/raveldex'; import {convertLocalSearchSnapshot} from '@vmitsaras/raveldex/integrations/localsearch';
    import {createSourceProvider,createSourcePhrases} from '@vmitsaras/raveldex/addons/phrases'; import {createSnapshots} from '@vmitsaras/raveldex/adapters/snapshots';
    import {createIndexedDBPersistence} from '@vmitsaras/raveldex/adapters/indexeddb'; globalThis.reviewApi={createRaveldex,convertLocalSearchSnapshot,createSourceProvider,createSourcePhrases,createSnapshots,createIndexedDBPersistence};`);
  const server = createServer((request, response) => { response.setHeader('content-type', request.url === '/bundle.mjs' ? 'text/javascript' : 'text/html');
    response.end(request.url === '/bundle.mjs' ? built.outputFiles[0].text : '<!doctype html><script type="module" src="/bundle.mjs"></script>'); });
  let browser;
  try {
    await new Promise((yes, no) => { server.once('error', no); server.listen(0, '127.0.0.1', yes); });
    const { chromium } = require('playwright-core'); browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage(); await page.goto('http://127.0.0.1:' + server.address().port); await page.waitForFunction(() => !!globalThis.reviewApi);
    const observation = await page.evaluate(async encoded => {
      const api = globalThis.reviewApi, plan = await api.convertLocalSearchSnapshot(new Uint8Array(encoded));
      const config = { ...plan.configuration, addons: [api.createSourceProvider({ fields: ['title', 'parts'] }), api.createSourcePhrases({ fields: ['title', 'parts'] })] };
      const first = api.createRaveldex(config); await first.addMany(plan.records);
      const before = await first.search('red', { limit: 100 }); await first.replace({ id: 'z', text: { title: 'blue fox', parts: ['blue fox'] }, metadata: { category: 'guide', n: 8, active: true } });
      const storageOptions = { databaseName: 'rx3004-independent-review', namespace: 'new-native-source' };
      const savedHandle = api.createIndexedDBPersistence(api.createSnapshots(first), storageOptions); const saved = await savedHandle.save({ expectedGeneration: null });
      const expected = await first.search('blue fox', { limit: 100 }); await savedHandle.dispose(); await first.dispose();
      const fresh = api.createRaveldex(config), loadedHandle = api.createIndexedDBPersistence(api.createSnapshots(fresh), storageOptions);
      try { const loaded = await loadedHandle.load(); const actual = await fresh.search('blue fox', { limit: 100 }); const red = await fresh.search('red', { limit: 100 });
        const erased = await loadedHandle.erase({ expectedGeneration: loaded.generation }); const missing = await loadedHandle.load();
        return { before, saved, loaded, expected, actual, red, erased, missing };
      } finally { await loadedHandle.dispose(); await fresh.dispose(); }
    }, [...bytes]);
    assert.deepEqual(sortedIds(observation.before), ['__proto__', 'a', 'z']); assert.equal(observation.saved.durable, true);
    assert.equal(observation.loaded.status, 'restored'); assert.equal(observation.loaded.restore.reindexed, true);
    assert.deepEqual(observation.actual.hits, observation.expected.hits); assert.deepEqual(sortedIds(observation.actual), ['z']);
    assert.deepEqual(sortedIds(observation.red), ['__proto__', 'a']); assert.equal(observation.erased.durable, true); assert.equal(observation.missing.status, 'missing');
    report.environment.browser = { channel: 'chrome', version: browser.version(), headless: true };
    return { ...observation, bundleSha256: digest(built.outputFiles[0].contents), bundleInputs: Object.keys(built.metafile.inputs) };
  } finally { await browser?.close(); await new Promise(yes => server.listening ? server.close(yes) : yes()); }
});
await foreign.destroy(); await migrated.dispose(); await independent.dispose();
await probe('candidate source and full companion tracked history remain byte-identical during probes', async () => {
  report.sourceIdentityAfter = await identities(sourcePaths); assert.deepEqual(report.sourceIdentityAfter, before);
  report.installedRuntimeIdentityAfter = await identities(installedPaths); assert.deepEqual(report.installedRuntimeIdentityAfter, installedBefore);
  const after = await identities(tracked.map(path => join(companion, path))); assert.deepEqual(after, companionBefore); assert.equal(git(companion, ['status', '--porcelain']), '');
  return { candidateSourceFiles: before.length, installedFiles: installedPaths.length, companionTrackedFiles: tracked.length, companionTrackedIdentity: digest(JSON.stringify(after)),
    historicalEvidenceFiles: tracked.filter(path => path.startsWith('docs/verification/')).length, sameBeforeAfter: true };
});
report.finishedAt = new Date().toISOString(); report.summary = { passed: report.records.filter(row => row.status === 'Pass').length, failed: report.records.filter(row => row.status === 'Fail').length };
await writeFile(new URL('./RX-3004-review-probe.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ summary: report.summary, rows: report.records.map(({ name, status, error }) => ({ name, status, ...(error ? { error } : {}) })) }));
if (report.summary.failed) process.exitCode = 1;
