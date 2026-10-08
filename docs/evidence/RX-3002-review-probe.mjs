/** Independent RX-3002 review. Bundles the current actual source, uses literal
 * expected data, and never imports a production tokenizer/scorer/codec helper. */
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { join, relative } from 'node:path';
import { tmpdir, release } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const destination = new URL('./RX-3002-review-probe.json', import.meta.url);
const temporary = await mkdtemp(join(tmpdir(), 'raveldex-rx3002-independent-'));
async function sourceHashes() {
  const hashes = {};
  async function scan(directory) { for (const item of await readdir(directory, { withFileTypes: true })) { const path = join(directory, item.name); if (item.isDirectory()) await scan(path); else hashes[relative(root, path)] = createHash('sha256').update(await readFile(path)).digest('hex'); } }
  await scan(join(root, 'src')); return hashes;
}
const beforeHashes = await sourceHashes();
const entry = [
  ['src/core/execution/engine.ts', 'createRaveldex, getExecutionOwner, createOwnedRaveldex, ExecutionOwner, emptyRoot'],
  ['src/core/contracts/schema.ts', 'captureConfiguration'],
  ['src/core/capabilities/participants.ts', 'initializeParticipants'],
  ['src/adapters/snapshots/index.ts', 'createSnapshots, createSnapshotRaveldex, currentNodeSnapshotEnvironment'],
  ['src/adapters/snapshots/snapshots.ts', 'createQualifiedSnapshotEngine'],
  ['src/addons/phrases/store.ts', 'createSourceProvider'],
  ['src/addons/positions/store.ts', 'createPositionProvider'],
  ['src/addons/positions/phrases.ts', 'createPositionPhrases'],
].map(([path, symbols]) => `export { ${symbols} } from ${JSON.stringify(join(root, path))};`).join('\n');
const bundle = await build({ stdin: { contents: entry, resolveDir: root, sourcefile: 'independent-review-entry.ts', loader: 'ts' },
  outfile: join(temporary, 'runtime.mjs'), bundle: true, format: 'esm', platform: 'node', target: 'es2022', metafile: true });
const api = await import(pathToFileURL(join(temporary, 'runtime.mjs')));
const schema = { text: { title: {}, body: {} }, metadata: { tags: { type: 'string', multi: true, nullable: true } } };
const qualification = () => ({ profileId: 'rx-3002-independent-declared-node', scope: 'exact-node-runtime',
  environment: api.currentNodeSnapshotEnvironment(), evidence: ['docs/evidence/RX-3002-review-probe.mjs: exact-runtime attestation contract and literal semantic cases; no cross-host qualification'] });
const sourceAddons = maxWorkUnits => [api.createSourceProvider({ fields: ['title', 'body'], ...(maxWorkUnits ? { maxWorkUnits } : {}) })];
const configuration = (kind = 'source', maxWorkUnits) => ({ schema, addons: kind === 'source' ? sourceAddons(maxWorkUnits) : kind === 'core' ? [] : [
  ...(kind === 'both' ? sourceAddons() : []),
  api.createPositionProvider({ fields: ['title', 'body'], offsets: ['title', 'body'] }), api.createPositionPhrases({ fields: ['title', 'body'] }),
] });
const create = (kind = 'source', qualified = false, cap) => qualified ? api.createSnapshotRaveldex(configuration(kind, cap), { nativeQualification: qualification() }) : api.createRaveldex(configuration(kind, cap));
const observed = promise => promise.then(value => ({ value }), error => ({ error }));
const plain = value => JSON.parse(JSON.stringify(value));
const rows = [];
async function probe(name, execute) {
  try { rows.push({ name, status: 'Pass', observations: await execute() }); }
  catch (error) { rows.push({ name, status: 'Fail', failure: { name: error.name, message: error.message, code: error.code, reason: error.reason, stack: error.stack } }); }
}
function checksum(text) { let hash = 2166136261; for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619); return (hash >>> 0).toString(16).padStart(8, '0'); }
function corrupt(encoded, change) { const value = JSON.parse(encoded); change(value); value.integrity.value = checksum(JSON.stringify(value.body)); return JSON.stringify(value); }
const entries = directory => Object.values(directory.buckets).flatMap(bucket => Object.entries(bucket));
async function rejectUnchanged(target, encoded, expectedReason) {
  const owner = api.getExecutionOwner(target), old = owner.root, before = plain(await target.search({ kind: 'all' }));
  const result = await observed(api.createSnapshots(target).restore(encoded));
  assert.ok(result.error, 'restore must reject');
  if (expectedReason) assert.equal(result.error.reason ?? result.error.code, expectedReason);
  assert.equal(owner.root, old); assert.deepEqual(plain(await target.search({ kind: 'all' })), before);
  return { code: result.error.code, reason: result.error.reason, revision: old.revision };
}
async function pair(kind, execute) { const donor = create(kind, true), target = create(kind, true); try { return await execute(donor, target); } finally { await donor.dispose(); await target.dispose(); } }

await probe('restore returns known commit despite signal changing after publication', async () => {
  const donor = create(), target = create();
  try {
    await donor.add({ id: 'new', text: { title: 'new text' } }); await target.add({ id: 'old', text: { title: 'old text' } });
    const encoded = await api.createSnapshots(donor).exportSource(), owner = api.getExecutionOwner(target);
    const signal = { get aborted() { return owner.root.revision > 1; }, addEventListener() {}, removeEventListener() {} };
    const result = await api.createSnapshots(target).restore(encoded, { signal });
    assert.equal(result.revision, 2); assert.deepEqual((await target.search({ kind: 'all' })).hits.map(hit => hit.id), ['new']);
    return { result, revision: owner.root.revision };
  } finally { await donor.dispose(); await target.dispose(); }
});

await probe('whole source restore shares participant cap across individually admissible colliding donor writes', async () => {
  const donor = create('source', false, 4000), target = create('source', false, 4000);
  try {
    // Independent FNV fixture chooses one bucket. Each donor write is below the
    // cap; one restore accumulates all copy-on-write participant preparation.
    const ids = [];
    for (let index = 0; ids.length < 100; index++) {
      const id = `c${index}`;
      let hash = 2166136261; for (let point = 0; point < id.length; point++) hash = Math.imul(hash ^ id.charCodeAt(point), 16777619);
      if ((hash >>> 0) % 256 === 7) ids.push(id);
    }
    for (const id of ids) await donor.add({ id, text: { title: 'red' } });
    await target.add({ id: 'old', text: { title: 'old' } });
    return { ...(await rejectUnchanged(target, await api.createSnapshots(donor).exportSource(), 'WORK_LIMIT_EXCEEDED')), donorWrites: ids.length, participantCap: 4000 };
  } finally { await donor.dispose(); await target.dispose(); }
});

await probe('source-free native frequencies cannot claim zero original code units', async () => pair('core', async (donor, target) => {
  await donor.add({ id: 'a', text: { title: 'red' } }); await target.add({ id: 'old', text: { title: 'old' } });
  const encoded = await api.createSnapshots(donor).exportNative();
  return rejectUnchanged(target, corrupt(encoded, value => { entries(value.body.payload.documents)[0][1].textCodeUnits = 0; value.body.payload.counts.textCodeUnits = 0; }), 'INVALID_NATIVE_STATE');
}));

await probe('complete retained originals must equal native per-document logical text counts', async () => pair('source', async (donor, target) => {
  await donor.add({ id: 'a', text: { title: 'red' } }); await target.add({ id: 'old', text: { title: 'old' } });
  const encoded = await api.createSnapshots(donor).exportNative();
  return rejectUnchanged(target, corrupt(encoded, value => { entries(value.body.payload.documents)[0][1].textCodeUnits++; value.body.payload.counts.textCodeUnits++; }), 'INVALID_NATIVE_STATE');
}));

await probe('native canonical terms containing punctuation and spaces preserve exact membership without raw reanalysis', async () => pair('core', async (donor, target) => {
  const values = ['½', '⑴', 'Ŀ', 'ﷺ', 'a\u0301', 'ΟΣ', 'İ', '𝔸'];
  const expected = ['1⁄2', '(1)', 'l·', 'صلى الله عليه وسلم', 'á', 'ος', 'i\u0307', 'a'];
  for (let index = 0; index < values.length; index++) await donor.add({ id: `u${index}`, text: { title: values[index] } });
  const encoded = await api.createSnapshots(donor).exportNative(), envelope = JSON.parse(encoded);
  assert.deepEqual(entries(envelope.body.payload.fields.title.terms).map(([term]) => term).sort(), [...expected].sort());
  await api.createSnapshots(target).restore(encoded);
  for (let index = 0; index < values.length; index++) assert.deepEqual((await target.search(values[index])).hits.map(hit => hit.id), [`u${index}`]);
  assert.equal((await target.search('1/2')).total, 0);
  await assert.rejects(api.createSnapshots(target).exportSource(), { reason: 'SOURCE_UNAVAILABLE' });
  return { originalValues: values, nativeTerms: expected, comparisons: values.length + 1, sourceAvailable: false };
}));

await probe('native original UTF16 offsets and strict phrase semantics survive source-free restore and later replacement', async () => pair('positions', async (donor, target) => {
  await donor.add({ id: '__proto__', text: { title: ['', '😀a\u0301 ﬁle ½'], body: ['red', 'blue'] } });
  const encoded = await api.createSnapshots(donor).exportNative(), envelope = JSON.parse(encoded);
  const value = entries(envelope.body.payload.participants.positions.records)[0][1].positions.title[1];
  assert.deepEqual(value.terms['á'], [{ position: 0, positionLength: 1, start: 2, end: 4 }]);
  assert.deepEqual(value.terms.file, [{ position: 1, positionLength: 1, start: 5, end: 8 }]);
  assert.deepEqual(value.terms['1⁄2'], [{ position: 2, positionLength: 1, start: 9, end: 10 }]);
  await api.createSnapshots(target).restore(encoded);
  const phrase = text => ({ kind: 'extension', capability: 'phrases', version: 1, payload: { text } });
  assert.equal((await target.search(phrase('á file ½'))).total, 1); assert.equal((await target.search(phrase('red blue'))).total, 0);
  await target.replace({ id: '__proto__', text: { title: 'red blue' } }); assert.equal((await target.search(phrase('red blue'))).total, 1);
  await assert.rejects(api.createSnapshots(target).exportSource(), { reason: 'SOURCE_UNAVAILABLE' });
  return { nativeCoordinates: value.terms, phraseTotals: [1, 0, 1], sourceAvailable: false };
}));

await probe('duplicate ordinals, overlapping spans and damaged authoritative source reject atomically', async () => pair('both', async (donor, target) => {
  await donor.add({ id: 'a', text: { title: 'red blue', body: 'other' } }); await target.add({ id: 'old', text: { title: 'old' } });
  const encoded = await api.createSnapshots(donor).exportNative();
  const modifications = [
    value => { entries(value.body.payload.participants.positions.records)[0][1].positions.title[0].terms.blue[0].position = 0; },
    value => { entries(value.body.payload.participants.positions.records)[0][1].positions.title[0].terms.blue[0].start = 2; },
    value => { value.body.payload.participants.source.records = null; },
  ];
  const results = []; for (const change of modifications) results.push(await rejectUnchanged(target, corrupt(encoded, change), 'INVALID_NATIVE_STATE')); return results;
}));

await probe('native metadata duplicate membership and undeclared metadata fields reject atomically', async () => pair('core', async (donor, target) => {
  await donor.add({ id: 'a', text: {}, metadata: { tags: ['x', null] } }); await target.add({ id: 'old', text: { title: 'old' } });
  const encoded = await api.createSnapshots(donor).exportNative(), results = [];
  for (const change of [value => entries(value.body.payload.documents)[0][1].metadata.tags.push('x'), value => { entries(value.body.payload.documents)[0][1].metadata.unknown = 'x'; }])
    results.push(await rejectUnchanged(target, corrupt(encoded, change), 'INVALID_NATIVE_STATE'));
  return results;
}));

await probe('native numeric metadata rejects noncanonical negative zero despite valid checksum', async () => {
  const numericConfiguration = { schema: { text: { title: {} }, metadata: { n: { type: 'number' } } } };
  const donor = api.createSnapshotRaveldex(numericConfiguration, { nativeQualification: qualification() });
  const target = api.createSnapshotRaveldex(numericConfiguration, { nativeQualification: qualification() });
  try {
    await donor.add({ id: 'a', text: { title: 'red' }, metadata: { n: 0 } }); await target.add({ id: 'old', text: { title: 'old' } });
    const value = JSON.parse(await api.createSnapshots(donor).exportNative());
    const body = JSON.stringify(value.body).replace('"n":0', '"n":-0');
    const altered = `{"format":"raveldex-native","formatVersion":1,"codec":{"id":"raveldex-json-v1","version":1},"body":${body},"integrity":{"algorithm":"fnv1a32-utf16","value":"${checksum(body)}"}}`;
    return await rejectUnchanged(target, altered, 'INVALID_NATIVE_STATE');
  } finally { await donor.dispose(); await target.dispose(); }
});

await probe('source origin qualification is structurally validated independently of receiving runtime match', async () => pair('source', async (donor, target) => {
  await donor.add({ id: 'a', text: { title: 'red' } }); await target.add({ id: 'old', text: { title: 'old' } });
  const encoded = await api.createSnapshots(donor).exportSource(), results = [];
  for (const change of [value => { value.body.header.nativeQualification.environment = null; }, value => { value.body.header.nativeQualification.evidence = [{}]; }, value => { delete value.body.header.nativeQualification.environment.icu; }])
    results.push(await rejectUnchanged(target, corrupt(encoded, change)));
  return results;
}));

await probe('numeric lexical cap, duplicate keys, malformed surrogate escapes and byte caps preserve old root', async () => pair('source', async (donor, target) => {
  await donor.add({ id: 'a', text: { title: 'red' } }); await target.add({ id: 'old', text: { title: 'old' } });
  const encoded = await api.createSnapshots(donor).exportSource(), bad = [
    encoded.replace('"originRevision":1', `"originRevision":${'1'.repeat(129)}`),
    encoded.replace('"formatVersion":1', '"formatVersion":1,"formatVersion":1'),
    corrupt(encoded, value => { value.body.payload.records[0].id = '\ud800'; }),
  ], results = [];
  for (const value of bad) results.push(await rejectUnchanged(target, value));
  const old = api.getExecutionOwner(target).root;
  await assert.rejects(api.createSnapshots(target, { maxEncodedBytes: 1024 }).restore(encoded), { reason: 'ENCODED_LIMIT_EXCEEDED' }); assert.equal(api.getExecutionOwner(target).root, old);
  return { malformed: results, stricterByteCap: 1024 };
}));

await probe('native qualification cannot promote ordinary engines or silently accept a mismatched runtime', async () => {
  const ordinary = create('core'), declaration = qualification(), qualified = api.createSnapshotRaveldex(configuration('core'), { nativeQualification: declaration });
  try {
    declaration.profileId = 'changed-after-creation'; declaration.evidence[0] = 'changed-after-creation';
    await assert.rejects(api.createSnapshots(ordinary).exportNative(), { reason: 'UNQUALIFIED_PROFILE' });
    const encoded = await api.createSnapshots(qualified).exportNative(); await rejectUnchanged(ordinary, encoded, 'UNQUALIFIED_PROFILE');
    assert.equal(JSON.parse(encoded).body.header.analyzer.environmentProfile, 'rx-3002-independent-declared-node');
    const mismatch = qualification(); mismatch.environment = { ...mismatch.environment, icu: 'wrong-runtime' };
    assert.throws(() => api.createSnapshotRaveldex(configuration('core'), { nativeQualification: mismatch }), { reason: 'PROFILE_MISMATCH' });
    assert.deepEqual(Object.keys(ordinary).sort(), ['add', 'addMany', 'clear', 'dispose', 'remove', 'replace', 'search']);
    return { actualEnvironment: api.currentNodeSnapshotEnvironment(), rootFacadeMethods: Object.keys(ordinary), arbitraryAttestationPromotedDefault: false };
  } finally { await ordinary.dispose(); await qualified.dispose(); }
});

class ManualHost {
  time = 0; sequence = 0; jobs = new Map();
  now() { return this.time; }
  schedule(callback, delay) { const id = ++this.sequence; this.jobs.set(id, { callback, due: this.time + delay }); return () => this.jobs.delete(id); }
  next() { const next = [...this.jobs].find(([, value]) => value.due <= this.time); if (!next) return false; this.jobs.delete(next[0]); next[1].callback(); return true; }
  all() { let count = 0; while (this.next()) assert.ok(++count < 2000000); }
}
function manual(qualified = false) {
  const host = new ManualHost(), config = { ...configuration('source'), limits: { checkpointWorkUnits: 1 } };
  const engine = qualified ? api.createQualifiedSnapshotEngine(config, qualification(), host) : api.createOwnedRaveldex(api.captureConfiguration(config), host);
  return { host, engine, owner: api.getExecutionOwner(engine), snapshots: api.createSnapshots(engine), async call(method, ...args) { const value = engine[method](...args); host.all(); return value; } };
}
await probe('source and native encode/decode suspensions abort with exact old root and host cleanup', async () => {
  const donor = manual(true), results = [];
  try {
    await donor.call('add', { id: 'a', text: { title: 'red blue '.repeat(200), body: 'green' } });
    const source = donor.snapshots.exportSource(), native = donor.snapshots.exportNative(); donor.host.all();
    const encodings = { source: await source, native: await native };
    for (const format of ['source', 'native']) for (const suspension of [0, 1, 64, 512]) {
      const target = manual(true), controller = new AbortController();
      try {
        await target.call('add', { id: 'old', text: { title: 'old' } }); const old = target.owner.root;
        const operation = observed(target.snapshots.restore(encodings[format], { signal: controller.signal }));
        for (let index = 0; index < suspension; index++) assert.equal(target.host.next(), true);
        controller.abort(); const result = await operation; assert.equal(result.error?.code, 'CANCELLED'); assert.equal(target.owner.root, old); assert.equal(target.host.jobs.size, 0);
        results.push({ format, suspension, code: result.error.code, revision: old.revision });
      } finally { await target.engine.dispose(); }
    }
    return results;
  } finally { await donor.engine.dispose(); }
});

await probe('reentrant source stop at final publication check prevents all core and side changes', async () => {
  const donor = manual(), target = manual();
  try {
    await donor.call('add', { id: 'new', text: { title: 'new' } }); await target.call('add', { id: 'old', text: { title: 'old' } });
    const encoding = donor.snapshots.exportSource(); donor.host.all(); const encoded = await encoding, old = target.owner.root;
    let stops = 0; const original = target.owner.adapterOperation.bind(target.owner);
    target.owner.adapterOperation = capture => original(configuration => {
      const request = capture(configuration); return { ...request, start(root, check, publish) {
        return request.start(root, phase => { if (phase === 'snapshot.precommit') { stops++; throw Object.assign(new Error('review stop'), { code: 'CANCELLED' }); } check(phase); }, publish);
      } };
    });
    const operation = observed(target.snapshots.restore(encoded)); target.host.all(); const result = await operation;
    // A trusted injected plain Error is sanitized, while old-state retention is
    // independently asserted. Cancellation itself is covered above with signal.
    assert.equal(result.error.code, 'INTERNAL_ERROR'); assert.equal(stops, 1); assert.equal(target.owner.root, old); assert.equal(target.host.jobs.size, 0);
    return { failureCode: result.error.code, injectedPrecommitStops: stops, oldRevision: old.revision };
  } finally { await donor.engine.dispose(); await target.engine.dispose(); }
});

const hashes = await sourceHashes();
assert.deepEqual(hashes, beforeHashes, 'source changed during independent runtime probe; rerun after writes settle');
const report = { task: 'RX-3002', method: 'Independent live-source esbuild ESM bundle; actual platform API and separate manually controlled host for stop/cleanup probes. Literal memberships and original UTF16 coordinates; no production analyzer/scorer/codec helper used by expected-value logic.',
  environment: { node: process.version, ...process.versions, platform: process.platform, arch: process.arch, osRelease: release() },
  sourceHashes: hashes, bundleInputs: Object.keys(bundle.metafile.inputs).sort(), rows,
  summary: { tests: rows.length, pass: rows.filter(row => row.status === 'Pass').length, fail: rows.filter(row => row.status === 'Fail').length },
  limitations: ['Attestation fixture tests exact running identity and literal semantics, not independent universal Unicode or cross-host equivalence.', 'Controlled host tests are not browser worker observations.', 'No GC/heap/physical paint/assistive technology/remote CI claims.'] };
const packageArgument = process.argv.indexOf('--package');
if (packageArgument !== -1) {
  const path = process.argv[packageArgument + 1]; assert.ok(path);
  try {
  const artifact = JSON.parse(await readFile(path, 'utf8'));
  let moduleChecks = 0, syntheticChecks = 0;
  const sha = bytes => createHash('sha256').update(bytes).digest('hex');
  for (const graph of [artifact.core, artifact.snapshots]) for (const input of graph.inputs) {
    const prefix = 'node_modules/@vmitsaras/raveldex/';
    if (input.path.startsWith(prefix)) { assert.equal(sha(await readFile(join(root, input.path.slice(prefix.length)))), input.sha256, input.path); moduleChecks++; }
    else { const content = input.path === 'snapshot-entry.mjs' ? artifact.snapshots.entry : "export { createRaveldex, RaveldexError, ERROR_CODES } from '@vmitsaras/raveldex';\n"; assert.equal(sha(content), input.sha256, input.path); syntheticChecks++; }
  }
  const rebuilt = [];
  for (const [name, content, graph] of [['core', "export { createRaveldex, RaveldexError, ERROR_CODES } from '@vmitsaras/raveldex';\n", artifact.core], ['snapshots', artifact.snapshots.entry, artifact.snapshots]]) {
    const value = await build({ stdin: { contents: content, resolveDir: root, loader: 'js', sourcefile: `${name}-review-entry.mjs` }, bundle: true,
      platform: 'browser', format: 'esm', target: 'es2022', minify: true, treeShaking: true, legalComments: 'none', charset: 'ascii', sourcemap: false, write: false, logLevel: 'silent' });
    const bytes = value.outputFiles[0].contents, compressed = gzipSync(bytes, { level: 9, windowBits: 15, memLevel: 8, strategy: 0 });
    assert.equal(sha(bytes), graph.sha256, `${name} rebuilt minified identity`); assert.equal(bytes.length, graph.minifiedBytes);
    assert.equal(sha(compressed), graph.gzipSha256, `${name} rebuilt gzip identity`); assert.equal(compressed.length, graph.gzipBytes);
    rebuilt.push({ name, sha256: sha(bytes), gzipSha256: sha(compressed), minifiedBytes: bytes.length, gzipBytes: compressed.length });
  }
  const { buildCorpus } = await import(pathToFileURL(join(root, 'examples/core-docs/corpus.mjs')));
  const corpus = await buildCorpus(); assert.equal(corpus.hash, artifact.packed.documentCorpus.hash); assert.equal(corpus.records.length, artifact.packed.documentCorpus.records);
  report.artifactAudit = { status: 'Pass', path, packageSha256: artifact.package.sha256, packageFiles: artifact.package.files.length,
    distributionInputHashChecks: moduleChecks, syntheticEntryHashChecks: syntheticChecks, rebuiltGraphs: rebuilt, corpus: { hash: corpus.hash, records: corpus.records.length } };
  } catch (error) { report.artifactAudit = { status: 'Fail', path, failure: { message: error.message, stack: error.stack } }; }
}
const costArgument = process.argv.indexOf('--cost');
if (costArgument !== -1) {
  const path = process.argv[costArgument + 1]; assert.ok(path);
  const cost = JSON.parse(await readFile(path, 'utf8'));
  let checks = 0;
  for (const [file, expected] of Object.entries(cost.implementationIdentities)) { assert.equal(createHash('sha256').update(await readFile(join(root, file))).digest('hex'), expected, file); checks++; }
  assert.equal(createHash('sha256').update(await readFile(join(root, cost.runner.path))).digest('hex'), cost.runner.sha256);
  assert.equal(cost.observations.length, 9);
  let pass = 0, rejected = 0;
  for (const row of cost.observations) for (const format of ['native', 'source']) if (row[format]) for (const operation of ['encoding', 'restoration']) {
    const value = row[format][operation];
    if (value.outcome === 'Pass') pass++;
    else { assert.equal(value.outcome, 'Rejected'); assert.equal(format, 'source'); assert.equal(operation, 'restoration'); assert.equal(row.size, 10000);
      assert.equal(value.error.code, 'WORK_LIMIT_EXCEEDED'); assert.equal(value.oldRootPreserved, true); assert.equal(value.workUnits, 49999998); rejected++; }
  }
  assert.equal(pass, 28); assert.equal(rejected, 2);
  report.costAudit = { status: 'Pass', path, implementationHashChecks: checks, runnerHashChecks: 1, cases: 9, successfulOperations: pass, boundedRejectedOperations: rejected,
    meaning: 'Raw actual emitted work and process-memory observations with shared harness; bounded source10000 refusals preserve previous roots. Neither exact physical component memory nor true peak/latency qualification.' };
}
try {
  const previous = JSON.parse(await readFile(destination, 'utf8'));
  report.failedExecutions = [...(previous.failedExecutions ?? []), ...(previous.summary.fail ? [{ summary: previous.summary, sourceHashes: previous.sourceHashes, rows: previous.rows }] : [])];
  report.failedArtifactAudits = [...(previous.failedArtifactAudits ?? []), ...(previous.artifactAudit?.status === 'Fail' ? [previous.artifactAudit] : [])];
} catch {}
for (const execution of report.failedExecutions ?? []) if (execution.rows?.some(row => row.name === 'whole source restore shares participant cap across ten individually admissible donor writes' && row.failure?.stack?.includes('validateNative'))) {
  execution.classification = 'Review fixture defect: source cap 40 correctly rejected full-state export validation before the intended restore. Replaced with 100 individually admissible colliding donor writes/cap 4000, where export succeeds and cumulative restore must reject. Historical failing observation retained.';
}
for (const audit of [...(report.failedArtifactAudits ?? []), ...(report.artifactAudit?.status === 'Fail' ? [report.artifactAudit] : [])]) if (audit.failure?.message?.includes('cced035f82c2a17bc9ecec6c0cf42d7b590e1d4e39439353ec9f89bcd1c8236c') && audit.failure.message.includes('0efa6f9315c829c6a9bcd00cf1221987f52c2374d19f19ecd33ad88cc57cfd94')) {
  audit.classification = 'Historical artifact mismatch: last source-free provenance documentation changed the current corpus after finalfocused package capture. Behavioral14/14 passed; distribution inputs and independently rebuilt code/gzip identities agreed before the corpus identity assertion failed. Final synchronized package evidence must replace this focused historical capture.';
}
for (const audit of report.failedArtifactAudits ?? []) if (audit.failure?.message?.includes('a3c318e00667faccdf8f143a6c0a4b64ad2ae6be873d0de99b3872c6c982ab0a') && audit.failure.message.includes('0efa6f9315c829c6a9bcd00cf1221987f52c2374d19f19ecd33ad88cc57cfd94')) {
  audit.classification = 'Historical artifact mismatch: final approved contract/documentation synchronization changed the current corpus after regression package capture. All 14 behavioral probes and distribution/code/gzip identities passed before the corpus assertion. The final synchronized package audit now verifies the frozen current corpus.';
}
await writeFile(destination, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.summary));
if (report.artifactAudit) console.log(JSON.stringify(report.artifactAudit));
for (const row of rows.filter(row => row.status === 'Fail')) console.log(JSON.stringify({ name: row.name, failure: row.failure }));
if (report.summary.fail || report.artifactAudit?.status === 'Fail') process.exitCode = 1;
