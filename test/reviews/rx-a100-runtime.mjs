/** Independent runtime review. Does not import reviewer-authored unit tests,
 * fixtures, production tokenizers/scorers, or the package/browser helper. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { createSourceProvider } from '../../dist/addons/phrases/source.js';
import { currentNodeSnapshotEnvironment } from '../../dist/adapters/snapshots/index.js';
import { buildStaticSearch } from '../../integrations/astro/dist/build.js';
import { loadStaticSearch, StaticSearchError } from '../../integrations/astro/dist/client.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sha = value => createHash('sha256').update(value).digest('hex');
const utf8 = text => Buffer.from(text, 'utf8');
const sourceFiles = ['build', 'client', 'common', 'error', 'types'].flatMap(name => [`integrations/astro/src/${name}.ts`, `integrations/astro/dist/${name}.js`, `integrations/astro/dist/${name}.d.ts`]).concat(['docs/specs/STATIC_ASTRO.md', 'integrations/astro/package.json', 'integrations/astro/tsconfig.build.json']);
const bind = async () => Promise.all(sourceFiles.map(async path => { const bytes = await readFile(resolve(root, path)); return { path, bytes: bytes.length, sha256: sha(bytes) }; }));
const before = await bind(), observations = [];
async function probe(name, run) { const details = await run(); observations.push({ name, status: 'Pass', ...details }); console.log('Pass:', name, JSON.stringify(details)); }
const exact = (...codes) => error => { assert.ok(codes.includes(error.code), `${error.name}/${error.code}/${error.reason ?? ''}`); return true; };
const config = () => ({ schema: { text: { content: { boost: 2 } } }, addons: [createSourceProvider({ fields: ['content'] })] });
const allowlist = [
  { record: { id: 'one', text: { content: ['red red', 'blue'] } }, title: 'First document', path: '/first/' },
  { record: { id: 'two', text: { content: 'red blue' } }, title: 'Second document', path: '/second/' },
  { record: { id: 'three', text: { content: 'blue' } }, title: 'Third document', path: '/third/' },
  { record: { id: 'void', text: {} }, title: 'No words', path: '/empty/' },
];
const qual = () => ({ profileId: 'rx-a100-independent-runtime', scope: 'exact-node-runtime', environment: currentNodeSnapshotEnvironment(), evidence: ['Independent finite same-Node runtime probe; no browser native portability claim'] });
const changeManifest = (artifact, mutate) => { const manifest = structuredClone(artifact.manifest); mutate(manifest); return { manifest, files: { ...artifact.files, 'manifest.json': JSON.stringify(manifest) } }; };
function rewrite(artifact, role, mutate) { const manifest = structuredClone(artifact.manifest), files = { ...artifact.files }, old = manifest.assets[role].file, data = JSON.parse(files[old]); mutate(data); const text = JSON.stringify(data), hash = sha(utf8(text)), name = `${role}-${hash}.json`; delete files[old]; files[name] = text; manifest.assets[role] = { file: name, bytes: utf8(text).length, sha256: hash }; files['manifest.json'] = JSON.stringify(manifest); return { manifest, files }; }
function net(artifact) {
  const directory = 'https://review.example' + artifact.manifest.base + 'raveldex/', requests = [], files = new Map(Object.entries(artifact.files).map(([name, text]) => [directory + name, text]));
  const value = { directory, manifestUrl: directory + 'manifest.json', requests, files, override: undefined, fetch: async (url, options) => {
    assert.equal(options.redirect, 'error'); requests.push(String(url));
    if (value.override) { const special = await value.override(String(url), options); if (special !== undefined) return special; }
    const result = new Response(files.has(String(url)) ? files.get(String(url)) : '', { status: files.has(String(url)) ? 200 : 404 }); Object.defineProperty(result, 'url', { value: String(url) }); return result;
  } }; return value;
}
const options = (artifact, network, rest = {}) => ({ manifestUrl: network.manifestUrl, expectedBuildId: artifact.manifest.buildId, configuration: config(), fetch: network.fetch, ...rest });
const near = (a, b) => assert.ok(Math.abs(a - b) <= Math.max(1e-12, Math.abs(b) * 1e-12), `${a} != ${b}`);
const numerical = (term, id) => {
  const literal = { one: ['red', 'red', 'blue'], two: ['red', 'blue'], three: ['blue'], void: [] }, present = ['one', 'two', 'three'], tf = literal[id].filter(word => word === term).length;
  if (!tf) return 0;
  const df = present.filter(other => literal[other].includes(term)).length;
  return 2 * Math.log(1 + (3 - df + 0.5) / (df + 0.5)) * tf * 2.2 / (tf + 1.2 * (0.25 + 0.75 * literal[id].length / 2));
};
const artifact = await buildStaticSearch({ configuration: config(), entries: allowlist, buildId: 'review-1', base: '/manual/' });

await probe('Imports do not read host startup or load framework/network resources', async () => {
  const entries = ['build', 'client'].map(name => new URL(`../../integrations/astro/dist/${name}.js`, import.meta.url).href);
  const child = `const write=process.stdout.write.bind(process.stdout),reads=[];for(const key of ['fetch','window','document','navigator','Worker','indexedDB','localStorage','setTimeout','setInterval','crypto'])Object.defineProperty(globalThis,key,{configurable:true,get(){reads.push(key);throw Error(key)}});for(const url of ${JSON.stringify(entries)})await import(url);write(JSON.stringify({reads}));`;
  const result = JSON.parse((await promisify(execFile)(process.execPath, ['--input-type=module', '--eval', child], { cwd: root, encoding: 'utf8' })).stdout); assert.deepEqual(result.reads, []);
  for (const file of ['build.ts', 'client.ts', 'common.ts']) { const text = await readFile(resolve(root, 'integrations/astro/src', file), 'utf8'); assert.doesNotMatch(text, /from\s*['"](?:astro|node:|.*\/core\/)/); }
  return { freshImportEntries: 2, observedHostReads: 0, staticImportBoundary: 'Public peer and own relative helpers only; no runtime graph-size claim' };
});

await probe('Pre-await ownership preserves records and receiver configuration/callback references', async () => {
  const records = structuredClone(allowlist), build = { configuration: config(), entries: records, buildId: 'owned-review' }, pending = buildStaticSearch(build);
  records[0].record.text.content[0] = 'replaced'; records[3].record.text.content = 'added'; records[0].title = 'changed'; build.buildId = 'later';
  const owned = await pending, network = net(owned), receiver = config(), loading = loadStaticSearch(options(owned, network, { configuration: receiver }));
  receiver.schema.text.content.boost = 9; receiver.addons.splice(0);
  const loaded = await loading;
  try { assert.equal(loaded.manifest.buildId, 'owned-review'); assert.equal((await loaded.engine.search('red')).total, 2); assert.equal((await loaded.engine.search('replaced')).total, 0); assert.equal((await loaded.loadDocuments()).find(row => row.id === 'one').title, 'First document'); } finally { await loaded.dispose(); }
  return { mutatedRecordLocations: 4, mutatedReceiverConfigurationLocations: 2, prematureCallerMutationsObserved: 0 };
});

await probe('Loaded complete results and field scores match separate literal-source arithmetic', async () => {
  const network = net(artifact), loaded = await loadStaticSearch(options(artifact, network)); let comparisons = 0;
  try {
    for (const term of ['red', 'blue']) for (const page of [{ limit: 100 }, { offset: 1, limit: 1 }, { limit: 0 }]) {
      const ids = ['one', 'two', 'three'].filter(id => numerical(term, id) > 0).sort((a, b) => numerical(term, b) - numerical(term, a) || (a < b ? -1 : 1)), result = await loaded.engine.search(term, page), wanted = ids.slice(page.offset ?? 0, (page.offset ?? 0) + page.limit);
      assert.equal(result.total, ids.length); assert.equal(result.revision, 1); assert.equal(result.completeness, 'complete'); assert.deepEqual(result.hits.map(row => row.id), wanted); for (const row of result.hits) near(row.score, numerical(term, row.id)); comparisons++;
    }
    const all = await loaded.engine.search({ kind: 'all' }); assert.deepEqual(all.hits.map(row => row.id), ['one', 'three', 'two', 'void']); assert.ok(all.hits.every(row => row.score === 0));
    const docs = await loaded.loadDocuments(); assert.equal(docs.find(row => row.id === 'two').url, '/manual/second/'); assert.equal(network.requests.length, 3);
  } finally { await loaded.dispose(); }
  return { independentlyCalculatedPages: comparisons, nonemptyPopulation: 3, totalFieldLength: 6, average: 2, lexicalGroups: 'Individual exact terms, field boost2, independent tf/df and BM25', completeAllDocuments: 4 };
});

await probe('Stale, malformed and mixed count/ID/configuration generations never publish an owner', async () => {
  const cases = [
    [changeManifest(artifact, value => { value.buildId = 'stale'; }), 'STALE_BUILD'],
    [changeManifest(artifact, value => { value.recordCount = 3; }), 'INCOMPATIBLE_ARTIFACT'],
    [changeManifest(artifact, value => { value.documentIdsSha256 = 'f'.repeat(64); }), 'INCOMPATIBLE_ARTIFACT'],
    [changeManifest(artifact, value => { value.assets.source.file = '../outside.json'; }), 'INVALID_ARTIFACT'],
  ];
  for (const [changed, code] of cases) { const network = net(changed); await assert.rejects(loadStaticSearch(options(changed, network, { expectedBuildId: 'review-1' })), exact(code)); }
  const changedConfiguration = config(); changedConfiguration.schema.text.content.boost = 3;
  await assert.rejects(loadStaticSearch(options(artifact, net(artifact), { configuration: changedConfiguration })), exact('INCOMPATIBLE_ARTIFACT'));
  return { generationRefusals: cases.length, normalizedConfigurationRefusal: 1, partialHandlesReturned: 0 };
});

await probe('Rehashed malformed display bodies cannot substitute foreign IDs, unsafe URLs or duplicate labels', async () => {
  let refusals = 0;
  for (const mutate of [value => { value.documents[0].id = 'foreign'; }, value => { value.documents[1].id = value.documents[0].id; }, value => { value.documents[0].url = '//other.example/source/'; }, value => { value.documents[0].url = '/manual/%2e%2e/source/'; }, value => { value.documents[0].title = ''; }]) {
    const changed = rewrite(artifact, 'documents', mutate), network = net(changed), loaded = await loadStaticSearch(options(changed, network));
    try { assert.equal(network.requests.length, 2); await assert.rejects(loaded.loadDocuments(), exact('INVALID_ARTIFACT', 'INCOMPATIBLE_ARTIFACT')); assert.equal((await loaded.engine.search('blue')).total, 3); refusals++; } finally { await loaded.dispose(); }
  }
  return { independentlyRehashedInvalidDisplayBodies: refusals, nativeOwnersRemainUsableBeforeDisposal: refusals };
});

await probe('Non-ending streams, late responses, abandoned HTTP bodies and disposal release read resources', async () => {
  let overflowCancellations = 0, lateCancellations = 0, unopenedCancellations = 0;
  const overflow = net(artifact); overflow.override = async url => { if (!url.includes('source-')) return undefined; return new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(artifact.manifest.assets.source.bytes + 1)); }, cancel() { overflowCancellations++; } })); };
  await assert.rejects(loadStaticSearch(options(artifact, overflow)), exact('INTEGRITY_MISMATCH')); assert.equal(overflowCancellations, 1);
  const controller = new AbortController(), late = net(artifact); let release;
  late.override = () => new Promise(resolve => { release = resolve; }); const stopped = loadStaticSearch(options(artifact, late, { signal: controller.signal })).then(value => ({ value }), error => ({ error })); controller.abort(); assert.equal((await stopped).error.code, 'CANCELLED');
  release(new Response(new ReadableStream({ start(stream) { stream.enqueue(utf8('{}')); }, cancel() { lateCancellations++; } }))); await new Promise(resolve => setImmediate(resolve)); assert.equal(lateCancellations, 1);
  const badStatus = net(artifact); badStatus.override = async () => new Response(new ReadableStream({ cancel() { unopenedCancellations++; } }), { status: 404 });
  await assert.rejects(loadStaticSearch(options(artifact, badStatus)), exact('MISSING_ARTIFACT')); assert.equal(unopenedCancellations, 1);
  const network = net(artifact), loaded = await loadStaticSearch(options(artifact, network)); let begun; const ready = new Promise(resolve => { begun = resolve; });
  network.override = async (url, opts) => { if (!url.includes('documents-')) return undefined; begun(); return new Promise((_resolve, reject) => { opts.signal.addEventListener('abort', () => reject(Error('closed host')), { once: true }); }); };
  const pending = loaded.loadDocuments().then(value => ({ value }), error => ({ error })); await ready; const first = loaded.dispose(), second = loaded.dispose(); assert.equal(first, second); await first; assert.equal((await pending).error.code, 'DISPOSED'); await assert.rejects(loaded.engine.search('red'), exact('DISPOSED'));
  return { oversizedNonEndingStreamCancellations: overflowCancellations, lateUnacceptedResponseCancellations: lateCancellations, unopened404BodyCancellations: unopenedCancellations, pendingDisplayDisposal: 'Pass', idempotentDisposalPromise: true };
});

await probe('Request timeouts and failed native candidates clear caller listeners and scheduled engine work', async () => {
  const controller = new AbortController(), activeListeners = new Map(), signal = { get aborted() { return controller.signal.aborted; }, addEventListener(type, listener, opts) { activeListeners.set(listener, true); controller.signal.addEventListener(type, listener, opts); }, removeEventListener(type, listener) { activeListeners.delete(listener); controller.signal.removeEventListener(type, listener); } };
  const priorSet = globalThis.setTimeout, priorClear = globalThis.clearTimeout, timers = new Set();
  globalThis.setTimeout = function (callback, delay, ...args) { let handle; handle = priorSet(() => { timers.delete(handle); callback(...args); }, delay); timers.add(handle); return handle; };
  globalThis.clearTimeout = function (handle) { timers.delete(handle); return priorClear(handle); };
  try {
    const broken = rewrite(artifact, 'source', value => { value.format = 'unrecognized'; }); await assert.rejects(loadStaticSearch(options(broken, net(broken), { signal })), error => { assert.equal(error.code, 'INCOMPATIBLE_CAPABILITY'); return true; }); assert.equal(activeListeners.size, 0); assert.equal(timers.size, 0);
    const forever = net(artifact); forever.override = async () => new Promise(() => {}); await assert.rejects(loadStaticSearch(options(artifact, forever, { timeoutMs: 5, signal })), exact('FETCH_FAILED')); assert.equal(activeListeners.size, 0); assert.equal(timers.size, 0);
  } finally { globalThis.setTimeout = priorSet; globalThis.clearTimeout = priorClear; }
  return { failedPrivateRestore: 1, ignoredHostTimeout: 1, callerListenersRemaining: activeListeners.size, scheduledEngineAndRequestTimersRemaining: timers.size, scope: 'Observable work/listener cleanup plus source-inspected finally-dispose; no root GC/allocation proof' };
});

await probe('Reentrant returned fetch/read promise rejections remain observed after cancellation', async () => {
  const client = new URL('../../integrations/astro/dist/client.js', import.meta.url).href;
  const script = `import {loadStaticSearch} from ${JSON.stringify(client)};const result=[];for(const phase of ['fetch','reader']){let leaks=0,cancels=0;const onUnhandled=()=>leaks++;process.on('unhandledRejection',onUnhandled);const caller=new AbortController();const fetcher=phase==='fetch'?()=>{caller.abort();return Promise.reject(new Error('fetch-rejection-probe'));}:()=>{const r=new Response('');Object.defineProperty(r,'body',{value:{getReader(){return{read(){caller.abort();return Promise.reject(new Error('read-rejection-probe'));},cancel(){cancels++;return Promise.resolve();},releaseLock(){}}}}});return Promise.resolve(r)};let code;try{await loadStaticSearch({manifestUrl:'https://review.example/raveldex/manifest.json',expectedBuildId:'reentrant',configuration:{schema:{text:{x:{}}}},signal:caller.signal,fetch:fetcher})}catch(e){code=e.code}await new Promise(setImmediate);await new Promise(setImmediate);process.removeListener('unhandledRejection',onUnhandled);result.push({phase,code,leaks,cancels})}console.log(JSON.stringify(result));`;
  const rows = JSON.parse((await promisify(execFile)(process.execPath, ['--input-type=module', '--eval', script], { cwd: root, encoding: 'utf8' })).stdout);
  assert.deepEqual(rows, [{ phase: 'fetch', code: 'CANCELLED', leaks: 0, cancels: 0 }, { phase: 'reader', code: 'CANCELLED', leaks: 0, cancels: 1 }]); return { childRows: rows };
});

await probe('Actual HTTP gzip and Brotli assets use decoded byte integrity and preserve deployment URLs', async () => {
  const rows = [];
  for (const [encoding, compress] of [['gzip', gzipSync], ['br', brotliCompressSync]]) {
    let requests = 0; const server = createServer((request, response) => { const prefix = '/manual/raveldex/', name = request.url.startsWith(prefix) ? request.url.slice(prefix.length) : ''; const text = artifact.files[name]; if (text === undefined) { response.writeHead(404); response.end(); return; } const encoded = compress(utf8(text)); requests++; response.writeHead(200, { 'Content-Type': 'application/json', 'Content-Encoding': encoding, 'Content-Length': encoded.length }); response.end(encoded); });
    await new Promise((yes, no) => { server.once('error', no); server.listen(0, '127.0.0.1', yes); }); let loaded;
    try { loaded = await loadStaticSearch({ manifestUrl: `http://127.0.0.1:${server.address().port}/manual/raveldex/manifest.json`, expectedBuildId: 'review-1', configuration: config() }); const result = await loaded.engine.search('red'); assert.equal(result.total, 2); const docs = await loaded.loadDocuments(); assert.equal(docs.find(row => row.id === 'one').url, '/manual/first/'); assert.equal(requests, 3); rows.push({ encoding, requests, total: result.total, manifestDecodedBytes: utf8(artifact.files['manifest.json']).length, manifestEncodedBytes: compress(utf8(artifact.files['manifest.json'])).length }); } finally { await loaded?.dispose(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  }
  return { transport: 'Actual temporary localhost HTTP with native Node Fetch decoding', rows };
});

await probe('Exact current Node native artifacts remain distinct from source rebuilds and incompatible qualification', async () => {
  const nativeQualification = qual(), built = await buildStaticSearch({ configuration: config(), entries: allowlist, buildId: 'native-review', nativeQualification }); const results = [];
  for (const format of ['source', 'native']) { const network = net(built), loaded = await loadStaticSearch(options(built, network, { format, ...(format === 'native' ? { nativeQualification } : {}) })); try { const result = await loaded.engine.search('red'); assert.deepEqual(result.hits.map(row => row.id), ['one', 'two']); for (const row of result.hits) near(row.score, numerical('red', row.id)); results.push({ format, total: result.total, requestKind: network.requests[1].includes(`/${format}-`) }); } finally { await loaded.dispose(); } }
  await assert.rejects(loadStaticSearch(options(built, net(built), { format: 'native', nativeQualification: { ...nativeQualification, profileId: 'foreign-profile' } })), error => { assert.equal(error.reason, 'PROFILE_MISMATCH'); return true; });
  await assert.rejects(loadStaticSearch(options(artifact, net(artifact), { format: 'native', nativeQualification })), exact('MISSING_ARTIFACT'));
  return { localNodeResults: results, incompatibleProfiles: 1, absentNativeAsset: 1, nativeFallbacks: 0, scope: 'Exact current Node only, not browser-native portability' };
});

const after = await bind(); assert.deepEqual(after, before, 'reviewed source/dist changed during probes');
const history = [];
for (const [name, finding] of [['late-fetch-probe', 'Late unaccepted Response body was not cancelled'], ['gzip-probe', 'Compressed Content-Length was incorrectly compared with decoded bytes'], ['reentrant-rejection-probe', 'Already-created rejected promise was not observed after synchronous abort']]) {
  const path = `/tmp/raveldex-rx-a100-${name}.log`;
  try { const bytes = await readFile(path); history.push({ path, sha256: sha(bytes), observedBeforeCorrection: bytes.toString('utf8').trim(), finding, state: 'Resolved by the actual final probes above', limitation: 'Pre-fix isolated probes did not capture complete source bindings; final verdict uses bound current sources/dist' }); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const report = { kind: 'raveldex-rx-a100-runtime-review-v1', recordedAt: new Date().toISOString(), environment: { node: process.version, platform: process.platform, arch: process.arch }, authorshipBoundary: 'Independent review of other-authored static builder/client/helpers and public artifact behavior. This reviewer authored runtime.test.mjs and its fixture; neither is imported or counted as independent evidence. Astro hook, own tests and package/browser helper are outside this verdict.', sourceBindings: before, bindingAudit: { status: 'Pass', unchangedDuringProbes: true, count: before.length }, observations, passCount: observations.length, mandatoryFindings: [], resolvedFindings: history, verdict: 'Ready with follow-ups', limitations: ['Trusted callbacks/fetch/structural host signals are not a hostile-code sandbox.', 'Failed-candidate cleanup observes timers/listeners and source-inspected finally-dispose; no GC, retained heap, allocation or transport-copy peak is inferred.', 'Actual HTTP compression uses current Node Fetch; installed-browser/Astro fixture verification remains separately scoped.', 'Native snapshot qualification is exact current Node only; no new browser-native or cross-host support is inferred.', 'No build, npm, Git or remote operation performed by this review.'] };
await writeFile(resolve(root, 'docs/evidence/RX-A100-runtime-review.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify({ verdict: report.verdict, passCount: report.passCount, mandatoryFindings: 0, sourceBindings: before.length }));
