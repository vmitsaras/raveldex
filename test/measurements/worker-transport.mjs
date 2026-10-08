/** Count actual bounded-capture work; known copy overlap is an explicit fixture,
 * not browser internal buffers, physical retained bytes or worker heap. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build, version } from 'esbuild';
import { buildCorpus } from '../../examples/core-docs/corpus.mjs';
import { REPO_ROOT, digest } from '../../scripts/lib/packed-consumer.mjs';

const target = resolve(process.argv[2] ?? '/tmp/raveldex-rx3001-transport-work.json');
const path = join(REPO_ROOT, 'src/adapters/worker/protocol.ts');
const original = await readFile(path, 'utf8');
assert.ok(original.includes('return visit(input, 0);'));
const instrumented = original.replace('let bytes = 0, nodes = 0;',
  'let bytes = 0, nodes = 0; const observed = { visitedNodes: 0, encodedBytes: 0, chargeCalls: 0, stringScanIterations: 0, ownedObjects: 0, ownedArrays: 0, maxDepth: 0 };')
  .replace('bytes += amount;', 'observed.chargeCalls++; bytes += amount; observed.encodedBytes = bytes;')
  .replace('const point = value.charCodeAt(i);', 'observed.stringScanIterations++; const point = value.charCodeAt(i);')
  .replace('function visit(value: unknown, depth: number): unknown {',
    'function visit(value: unknown, depth: number): unknown { observed.visitedNodes++; observed.maxDepth = Math.max(observed.maxDepth, depth);')
  .replace('if (array) {', 'if (array) { observed.ownedArrays++;')
  .replace('const result: Record<string, unknown> = Object.create(null)', 'observed.ownedObjects++; const result: Record<string, unknown> = Object.create(null)')
  .replace('return visit(input, 0);', 'try { return visit(input, 0); } finally { lastCapture = Object.freeze(observed); }')
  + '\nexport let lastCapture: Readonly<Record<string,number>>;\n';
const built = await build({ entryPoints: [path], bundle: true, platform: 'node', format: 'esm', target: 'es2022', write: false,
  plugins: [{ name: 'count-worker-capture', setup(build) { build.onLoad({ filter: /adapters\/worker\/protocol\.ts$/ }, () => ({ contents: instrumented, loader: 'ts', resolveDir: dirname(path) })); } }], logLevel: 'silent' });
const directory = await realpath(await mkdtemp(join(tmpdir(), 'raveldex-transport-count-')));
const modulePath = join(directory, 'capture.mjs'); await writeFile(modulePath, built.outputFiles[0].contents);
const module = await import(pathToFileURL(modulePath).href);
const session = '11111111-1111-4111-8111-111111111111';
const corpus = buildCorpus(REPO_ROOT);
const samples = [
  { name: 'ordinary query', payload: { query: 'term contribution', options: { limit: 5, offset: 0 }, admittedAt: 1000 }, operation: 'search' },
  { name: 'actual current documentation corpus', payload: { input: corpus.records, options: {}, admittedAt: 1000 }, operation: 'addMany' },
  ...[100, 1000, 10000].map(count => ({ name: `${count} bounded records`, operation: 'addMany', payload: {
    input: Array.from({ length: count }, (_, i) => ({ id: `d${i}`, text: { body: 'red blue car' } })), options: {}, admittedAt: 1000,
  } })),
];
const measurements = samples.map(({ name, operation, payload }) => {
  const envelope = { protocol: 1, session, id: 2, operation, payload };
  const encodedBytes = Buffer.byteLength(JSON.stringify(envelope), 'utf8');
  const started = performance.now(); const clientCapture = module.captureMessage(envelope, module.MAX_MESSAGE_BYTES);
  const captureMs = performance.now() - started; const clientWork = module.lastCapture;
  assert.equal(clientWork.encodedBytes, encodedBytes);
  const receivedClone = structuredClone(clientCapture);
  const hostCapture = module.captureMessage(receivedClone, module.MAX_MESSAGE_BYTES); const hostWork = module.lastCapture;
  assert.deepEqual(hostCapture, clientCapture); assert.deepEqual(hostWork, clientWork);
  // At this exact checkpoint the fixture deliberately holds these four distinct
  // graph roots. Strings can be shared internally; browser transport may hold
  // additional buffers whose lifetimes cannot be established here.
  assert.notEqual(envelope, clientCapture); assert.notEqual(clientCapture, receivedClone); assert.notEqual(receivedClone, hostCapture);
  return { name, encodedBytes, captureMs, clientWork, hostWork,
    knownFixturePeakDistinctGraphRoots: 4, graphRoles: ['caller input', 'client bounded capture', 'platform structured clone', 'host bounded capture'] };
});
const report = { kind: 'raveldex-worker-transport-capture-work-v1', time: new Date().toISOString(),
  environment: { node: process.version, platform: process.platform, arch: process.arch, esbuild: version },
  source: { path: 'src/adapters/worker/protocol.ts', sha256: digest(original) }, corpus: { sections: corpus.records.length, sha256: corpus.hash },
  method: 'Non-production observer inserts counters into the current capture loop; exact unchanged byte/shape results are checked against JSON UTF-8 and one platform structuredClone. String scan iterations count loop visits, not UTF-16 units or lookahead reads. Known peak copy roots are deliberately held in this isolated synchronous fixture.',
  limits: { messageBytes: module.MAX_MESSAGE_BYTES }, measurements,
  limitations: ['Not a browser-worker buffer or garbage-collection measurement.', 'Large transport fixtures do not assert admission as one native mutation batch; core batch/admission/work bounds remain separate.', 'Distinct graph roots do not measure physical copies of immutable strings.', 'Browser internal peak transport copies and worker retained/peak heap remain unmeasured.', 'Single smoke capture timings are observations, not latency qualification.'] };
await writeFile(target, JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify({ report: target, samples: measurements.map(({ name, encodedBytes, clientWork }) => ({ name, encodedBytes, clientWork })) }));
