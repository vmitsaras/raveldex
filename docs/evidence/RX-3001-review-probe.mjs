// Independent transport/lifecycle review, using actual source bundles and a
// structured-clone endpoint pair. Browser/packed qualification is separate.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir, platform, release, arch } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../../', import.meta.url));
const directory = await mkdtemp(join(tmpdir(), 'raveldex-independent-worker-'));
const output = join(directory, 'runtime.mjs');
const report = { kind: 'raveldex-independent-worker-review-v1', startedAt: new Date().toISOString(),
  environment: { node: process.version, platform: platform(), release: release(), arch: arch() },
  method: 'Actual source, independently esbuild-bundled; paired endpoints use platform structuredClone and asynchronous microtask delivery. This is not a browser module-worker execution.',
  limitations: ['Browser and installed-package observations are separate owner artifacts.', 'Physical peak copies, worker heap, cross-host compatibility and latency are not inferred from this probe.'], probes: [] };
try {
  const previous = JSON.parse(await readFile(join(dirname(fileURLToPath(import.meta.url)), 'RX-3001-review-probe.json'), 'utf8'));
  report.failedExecutions = previous.failedExecutions ?? [];
  if (previous.summary?.fail) report.failedExecutions.push({ startedAt: previous.startedAt, completedAt: previous.completedAt,
    sourceHashes: previous.sourceHashes, summary: previous.summary,
    probes: previous.probes.filter(row => row.status === 'Fail' || row.status === 'Observation') });
} catch { report.failedExecutions = []; }
const bundled = await build({ absWorkingDir: root, stdin: { contents: `
export { createRaveldex } from './src/index.ts';
export { createWorkerRaveldex } from './src/adapters/worker/index.ts';
export { serveRaveldexWorker } from './src/adapters/worker/host.ts';
export { captureMessage, searchResult, mutationResult } from './src/adapters/worker/protocol.ts';
export { createFacets } from './src/addons/facets/index.ts';
export { createInspector } from './src/addons/inspector/index.ts';
export { createSourceProvider } from './src/addons/phrases/source.ts';
export { createMatchEvidence } from './src/addons/evidence/index.ts';
export { createSnippetEvidence } from './src/addons/snippets/index.ts';
`, resolveDir: root, sourcefile: 'independent-review-entry.mjs' }, bundle: true, platform: 'node', format: 'esm',
  target: 'es2022', outfile: output, metafile: true, logLevel: 'silent' });
const api = await import(pathToFileURL(output).href);
const modules = Object.keys(bundled.metafile.inputs).filter(name => name.startsWith('src/')).sort();
report.sourceHashes = Object.fromEntries(await Promise.all(modules.map(async name => [name,
  createHash('sha256').update(await readFile(join(root, name))).digest('hex')])));
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const copy = value => JSON.parse(JSON.stringify(value));
const schema = { text: { body: {} }, metadata: { tag: { type: 'string' } } };
const configuration = addons => ({ schema, ...(addons === undefined ? {} : { addons }) });
const outcome = promise => promise.then(value => ({ value }), error => ({ error: { name: error.name, code: error.code, details: error.details } }));
function pair() {
  const listeners = { client: new Map(), host: new Map() }, traffic = { requests: [], responses: [], terminated: 0 };
  const emit = (side, type, event) => { for (const listener of [...listeners[side].get(type) ?? []]) listener(event); };
  const endpoint = side => ({
    addEventListener(type, listener) { if (!listeners[side].has(type)) listeners[side].set(type, new Set()); listeners[side].get(type).add(listener); },
    removeEventListener(type, listener) { listeners[side].get(type)?.delete(listener); },
    postMessage(message) {
      const cloned = structuredClone(message), rows = side === 'client' ? traffic.requests : traffic.responses;
      rows.push(copy(cloned));
      const target = side === 'client' ? 'host' : 'client';
      const dispatch = () => emit(target, 'message', { data: cloned });
      if (transport.hook?.(side, cloned, dispatch) === false) return;
      queueMicrotask(dispatch);
    },
    ...(side === 'client' ? { terminate() { traffic.terminated++; } } : {}),
  });
  const transport = { client: endpoint('client'), scope: endpoint('host'), hook: undefined, traffic,
    count(side) { return [...listeners[side].values()].reduce((sum, set) => sum + set.size, 0); },
    emit(side, type, event) { emit(side, type, event); } };
  return transport;
}
async function open({ addons, hostAddons = addons, ownership = 'owned', timeout = 1000, ...extra } = {}) {
  const transport = pair();
  const host = api.serveRaveldexWorker(transport.scope, { ...(hostAddons ? { addons: hostAddons } : {}) });
  try {
    const engine = await api.createWorkerRaveldex({ worker: transport.client, configuration: configuration(addons), ownership,
      sameHost: true, responseTimeoutMs: timeout, ...extra });
    return { transport, host, engine, async close() { await engine.dispose(); await host.dispose(); } };
  } catch (error) { await host.dispose(); throw error; }
}
async function probe(name, run) {
  try { const evidence = await run(); report.probes.push({ name, status: 'Pass', evidence }); }
  catch (error) { report.probes.push({ name, status: 'Fail', error: { name: error.name, code: error.code, message: error.message, stack: error.stack } }); }
}

await probe('protocol rejects invalid ranking, Unicode, mutation counts and code-bearing data', async () => {
  const base = { revision: 1, model: 'raveldex-bm25-v1', completeness: 'complete', total: 2 };
  const invalidResults = [
    { ...base, hits: [{ id: 'a', score: 0 }, { id: 'b', score: 1 }] },
    { ...base, hits: [{ id: 'z', score: 1 }, { id: 'a', score: 1 }] },
    { ...base, total: 1, hits: [{ id: '\ud800', score: 1 }] },
  ];
  for (const result of invalidResults) assert.throws(() => api.searchResult(api.captureMessage(result, 8388608), 10000, 0, result.hits.length, []), error => error.code === 'INVALID_TRANSPORT');
  assert.throws(() => api.mutationResult(api.captureMessage({ revision: 1, changed: true, added: 10000, replaced: 10000, removed: 10000 }, 8388608), 10000), error => error.code === 'INVALID_TRANSPORT');
  assert.throws(() => api.mutationResult(api.captureMessage({ revision: 1, changed: false, added: 0, replaced: 0, removed: 0 }, 8388608), 10000, 'replace', 1), error => error.code === 'INVALID_TRANSPORT');
  let invoked = 0; const accessor = {}; Object.defineProperty(accessor, 'value', { get() { invoked++; return 'hostile'; } });
  const cycle = {}; cycle.self = cycle;
  for (const value of [accessor, { value() {} }, { value: Symbol('x') }, cycle, new Date(), new Array(2)]) assert.throws(() => api.captureMessage(value, 8388608), error => error.code === 'INVALID_TRANSPORT');
  assert.equal(invoked, 0);
  for (const value of ['a\u0000"\\\n😀'.repeat(20), { b: -0, a: [null, true, false, 'é', '\ud800'] }]) {
    const expected = Buffer.byteLength(JSON.stringify(value));
    assert.deepEqual(copy(api.captureMessage(value, expected)), copy(value));
    assert.throws(() => api.captureMessage(value, expected - 1), error => error.code === 'TRANSPORT_LIMIT');
  }
  return { rejectedResultCases: 5, rejectedDataCases: 6, getterInvocations: invoked, exactUtf8BoundaryCases: 2 };
});
await probe('one corpus has hand-derived BM25 and mutation/statistical parity', async () => {
  const remote = await open(), direct = api.createRaveldex(configuration());
  const records = [{ id: 'a', text: { body: 'red red car' } }, { id: 'b', text: { body: 'red car' } }, { id: 'c', text: { body: 'blue' } }];
  try {
    assert.deepEqual(copy(await remote.engine.addMany([...records].reverse())), copy(await direct.addMany(records)));
    const result = await remote.engine.search('red car');
    assert.deepEqual(copy(result), copy(await direct.search('red car')));
    assert.deepEqual(result.hits.map(hit => hit.id), ['a', 'b']);
    const idf = Math.log(1 + 1.5 / 2.5);
    const expected = [idf * (2 * 2.2 / (2 + 1.2 * (.25 + .75 * 1.5)) + 2.2 / (1 + 1.2 * (.25 + .75 * 1.5))), 2 * idf];
    result.hits.forEach((hit, index) => assert.ok(Math.abs(hit.score - expected[index]) < 1e-12));
    assert.ok(Object.isFrozen(result) && Object.isFrozen(result.hits) && Object.isFrozen(result.hits[0]));
    assert.throws(() => { result.hits[0].score = 100; }, TypeError);
    const old = copy(result), operations = [
      ['replace', { id: 'c', text: { body: 'red' } }], ['remove', ['b', 'absent']], ['remove', 'absent'], ['clear'], ['clear'],
    ];
    for (const [method, ...args] of operations) {
      assert.deepEqual(copy(await remote.engine[method](...args)), copy(await direct[method](...args)));
      assert.deepEqual(copy(await remote.engine.search({ kind: 'all' })), copy(await direct.search({ kind: 'all' })));
    }
    assert.deepEqual(copy(result), old);
    return { literalOrdering: ['a', 'b'], independentScores: expected, completeResultsCompared: 6, mutationsCompared: 6,
      originalResultStableAfterWrites: true, immutable: true };
  } finally { await remote.close(); await direct.dispose(); }
});
await probe('native malformed-input codes match and public facade is bounded', async () => {
  const remote = await open(), direct = api.createRaveldex(configuration());
  let invoked = 0; const record = { id: 'x', text: {} }; Object.defineProperty(record.text, 'body', { enumerable: true, get() { invoked++; return 'red'; } });
  const query = { kind: 'text' }; Object.defineProperty(query, 'text', { enumerable: true, get() { invoked++; return 'red'; } });
  const cases = [['add', record], ['add', { id: 'x', text: { body() {} } }], ['search', query], ['search', { kind: 'text', text() {} }]];
  try {
    const errors = [];
    for (const [method, value] of cases) {
      const actual = await outcome(remote.engine[method](value)), expected = await outcome(direct[method](value));
      assert.deepEqual(actual, expected); errors.push(actual.error);
    }
    assert.equal(invoked, 0);
    assert.deepEqual(Object.keys(remote.engine).sort(), ['add', 'addMany', 'clear', 'destroy', 'dispose', 'reconcile', 'remove', 'replace', 'search']);
    assert.equal(Object.isFrozen(remote.engine), true); assert.equal(Object.getPrototypeOf(remote.engine), Object.prototype);
    const { search } = remote.engine; assert.equal((await search({ kind: 'all' })).total, 0);
    await remote.engine.dispose();
    const options = {}; Object.defineProperty(options, 'deadlineMs', { get() { invoked++; return 1; } });
    assert.equal((await outcome(remote.engine.search(query, options))).error.code, 'DISPOSED');
    assert.equal((await outcome(remote.engine.add(record, options))).error.code, 'DISPOSED'); assert.equal(invoked, 0);
    return { errors, getterInvocations: invoked, facadeFrozen: true, disposedPrecedence: true };
  } finally { await remote.close(); await direct.dispose(); }
});
await probe('hidden add-on caps are exact, normalized handshake identities', async () => {
  const identities = [
    [api.createFacets({ fields: ['tag'], maxBucketsPerField: 1 }), api.createFacets({ fields: ['tag'], maxBucketsPerField: 100 })],
    [api.createFacets({ fields: ['tag'], maxDistinctValuesPerField: 1 }), api.createFacets({ fields: ['tag'], maxDistinctValuesPerField: 10000 })],
    [api.createInspector({ maxFacts: 32 }), api.createInspector({ maxFacts: 4096 })],
    [api.createMatchEvidence({ fields: { body: 'source' }, maxRanges: 32 }), api.createMatchEvidence({ fields: { body: 'source' }, maxRanges: 4096 })],
    [api.createSnippetEvidence({ fields: { body: 'source' }, maxCodeUnits: 32 }), api.createSnippetEvidence({ fields: { body: 'source' }, maxCodeUnits: 240 })],
  ];
  for (const [a, b] of identities) assert.notEqual(a.manifest.execution.workerRegistration, b.manifest.execution.workerRegistration);
  assert.equal(api.createInspector().manifest.execution.workerRegistration, api.createInspector({ maxFacts: 4096 }).manifest.execution.workerRegistration);
  const transport = pair(), host = api.serveRaveldexWorker(transport.scope, { addons: [identities[0][1]] });
  try {
    const result = await outcome(api.createWorkerRaveldex({ worker: transport.client, configuration: configuration([identities[0][0]]), sameHost: true, ownership: 'owned', responseTimeoutMs: 1000 }));
    assert.equal(result.error.code, 'INCOMPATIBLE_WORKER'); assert.equal(transport.traffic.terminated, 1); assert.equal(transport.count('client'), 0);
    return { differingPrivateCapIdentities: identities.length, normalizedDefaultsEqual: true, startup: result, terminated: 1, remainingClientListeners: 0 };
  } finally { await host.dispose(); }
});
await probe('lost commit reply stays unknown and receipt establishes exact commit', async () => {
  const remote = await open({ timeout: 50 });
  remote.transport.hook = (side, message) => side === 'host' && message.operation === 'add' ? false : undefined;
  try {
    const pending = remote.engine.add({ id: 'lost', text: { body: 'red' } }), result = await outcome(pending);
    assert.equal(result.error.code, 'OUTCOME_UNKNOWN'); assert.equal(result.error.details.operationId, pending.operationId);
    const receipt = await remote.engine.reconcile(pending.operationId); assert.equal(receipt.status, 'committed');
    assert.deepEqual(copy(receipt.result), { revision: 1, changed: true, added: 1, replaced: 0, removed: 0 });
    assert.equal((await remote.engine.search('red')).total, 1);
    assert.equal(remote.transport.traffic.requests.filter(message => message.operation === 'add').length, 1);
    return { result, receipt, transmittedMutationCount: 1 };
  } finally { remote.transport.hook = undefined; await remote.close(); }
});
await probe('transport delay counts against owner deadline before commit', async () => {
  const remote = await open();
  remote.transport.hook = (side, message, dispatch) => {
    if (side === 'client' && message.operation === 'add') { setTimeout(dispatch, 50); return false; }
  };
  try {
    const pending = remote.engine.add({ id: 'delayed', text: { body: 'red' } }, { deadlineMs: 10 }), result = await outcome(pending);
    assert.equal(result.error.code, 'DEADLINE_EXCEEDED');
    const receipt = await remote.engine.reconcile(pending.operationId); assert.equal(receipt.status, 'rejected');
    assert.equal(receipt.error.code, 'DEADLINE_EXCEEDED'); const state = await remote.engine.search({ kind: 'all' });
    assert.deepEqual([state.revision, state.total], [0, 0]);
    return { result, receipt, authoritativeRevision: state.revision, authoritativeTotal: state.total, delayedDeliveryMs: 50, deadlineMs: 10 };
  } finally { remote.transport.hook = undefined; await remote.close(); }
});
await probe('replayed live mutation frame cannot replace authoritative first outcome', async () => {
  const remote = await open();
  remote.transport.hook = (side, message, dispatch) => {
    if (side === 'client' && message.operation === 'add') { queueMicrotask(dispatch); queueMicrotask(dispatch); return false; }
  };
  try {
    const pending = remote.engine.add({ id: 'replay', text: { body: 'red' } }), result = await outcome(pending);
    const receipt = await remote.engine.reconcile(pending.operationId), state = await remote.engine.search({ kind: 'all' });
    report.probes.push({ name: 'raw live-mutation replay observation', status: 'Observation', evidence: { result, receipt, state } });
    assert.ok(result.value || result.error?.code === 'OUTCOME_UNKNOWN', 'A replay rejection cannot establish the original mutation outcome');
    assert.equal(receipt.status, 'committed'); assert.deepEqual([state.revision, state.total], [1, 1]);
    if (result.value) assert.deepEqual(copy(result.value), copy(receipt.result));
    return { result, receipt, authoritativeRevision: state.revision, authoritativeTotal: state.total };
  } finally { remote.transport.hook = undefined; await remote.close(); }
});
await probe('failed post-commit result delivery reports commit or explicit unknown', async () => {
  const remote = await open();
  remote.transport.hook = (side, message) => {
    if (side === 'host' && message.operation === 'add' && message.kind === 'result') throw new Error('Injected result-send failure');
  };
  try {
    const pending = remote.engine.add({ id: 'post-failure', text: { body: 'red' } }), result = await outcome(pending);
    const receipt = await remote.engine.reconcile(pending.operationId), state = await remote.engine.search({ kind: 'all' });
    report.probes.push({ name: 'raw post-commit result-send failure observation', status: 'Observation', evidence: { result, receipt, state } });
    assert.ok(result.value || result.error?.code === 'OUTCOME_UNKNOWN', 'A failed result-send after commit must preserve honest mutation outcome');
    assert.equal(receipt.status, 'committed'); assert.deepEqual([state.revision, state.total], [1, 1]);
    return { result, receipt, authoritativeRevision: state.revision, authoritativeTotal: state.total };
  } finally { remote.transport.hook = undefined; await remote.close(); }
});
await probe('256 terminal receipts evict oldest without retrying', async () => {
  const remote = await open();
  try {
    const first = remote.engine.add({ id: 'one', text: { body: 'red' } }); await first;
    const ids = [first.operationId];
    for (let i = 0; i < 256; i++) { const pending = remote.engine.remove(`absent-${i}`); ids.push(pending.operationId); await pending; }
    assert.equal(new Set(ids).size, 257);
    const expired = await remote.engine.reconcile(ids[0]), newest = await remote.engine.reconcile(ids.at(-1));
    assert.equal(expired.status, 'expired'); assert.equal(newest.status, 'committed'); assert.equal(newest.result.changed, false);
    assert.equal((await remote.engine.search({ kind: 'all' })).total, 1);
    return { terminalMutations: 257, uniqueMutationIds: 257, expired, newest, authoritativeTotal: 1 };
  } finally { await remote.close(); }
});
await probe('failed startup and external disposal release resources exactly once', async () => {
  const transport = pair();
  const failed = await outcome(api.createWorkerRaveldex({ worker: transport.client, configuration: configuration(), ownership: 'owned', sameHost: true, responseTimeoutMs: 20 }));
  assert.ok(failed.error); assert.equal(transport.traffic.terminated, 1); assert.equal(transport.count('client'), 0);
  const external = await open({ ownership: 'external' });
  const d1 = external.engine.dispose(), d2 = external.engine.dispose(); assert.equal(d1, d2); await d1;
  assert.equal(external.transport.traffic.terminated, 0); assert.equal(external.transport.count('client'), 0); await external.host.dispose();
  assert.equal(external.transport.count('host'), 0);
  return { failed, ownedTerminations: 1, ownedListeners: 0, externalTerminations: 0, externalListeners: 0, hostListeners: 0, repeatedDisposalPromiseIdentity: true };
});
await probe('reentrant live signal registration preserves admission FIFO', async () => {
  const remote = await open({ timeout: 50 }), direct = api.createRaveldex(configuration());
  let remoteNested, directNested;
  const signal = enqueue => ({ aborted: false, addEventListener() { enqueue(); }, removeEventListener() {} });
  try {
    const outer = remote.engine.add({ id: 'outer', text: { body: 'red' } }, { signal: signal(() => {
      remoteNested = outcome(remote.engine.add({ id: 'nested', text: { body: 'red' } }));
    }) });
    const directOuter = direct.add({ id: 'outer', text: { body: 'red' } }, { signal: signal(() => {
      directNested = outcome(direct.add({ id: 'nested', text: { body: 'red' } }));
    }) });
    const actual = await outcome(outer), expected = await outcome(directOuter);
    const nested = await remoteNested, expectedNested = await directNested;
    const state = await remote.engine.search({ kind: 'all' });
    report.probes.push({ name: 'raw reentrant signal registration observation', status: 'Observation', evidence: { actual, expected, nested, expectedNested, state } });
    assert.deepEqual(actual, expected); assert.deepEqual(nested, expectedNested);
    assert.deepEqual([state.revision, state.total], [2, 2]);
    return { actual, nested, revision: state.revision, total: state.total };
  } finally { await remote.close(); await direct.dispose(); }
});
await probe('reentrant live signal capture preserves completed-admission order', async () => {
  const remote = await open({ timeout: 50 }), direct = api.createRaveldex(configuration());
  let remoteNested, directNested;
  const signal = enqueue => {
    let fired = false;
    return { get aborted() { if (!fired) { fired = true; enqueue(); } return false; }, addEventListener() {}, removeEventListener() {} };
  };
  try {
    const outer = remote.engine.add({ id: 'outer', text: { body: 'red' } }, { signal: signal(() => {
      remoteNested = outcome(remote.engine.add({ id: 'nested', text: { body: 'red' } }));
    }) });
    const directOuter = direct.add({ id: 'outer', text: { body: 'red' } }, { signal: signal(() => {
      directNested = outcome(direct.add({ id: 'nested', text: { body: 'red' } }));
    }) });
    const actual = await outcome(outer), expected = await outcome(directOuter), nested = await remoteNested, expectedNested = await directNested;
    const state = await remote.engine.search({ kind: 'all' });
    report.probes.push({ name: 'raw reentrant signal capture observation', status: 'Observation', evidence: { actual, expected, nested, expectedNested, state } });
    assert.deepEqual(actual, expected); assert.deepEqual(nested, expectedNested); assert.deepEqual([state.revision, state.total], [2, 2]);
    return { actual, nested, revision: state.revision, total: state.total };
  } finally { await remote.close(); await direct.dispose(); }
});
await probe('one scope cannot install two worker engine owners', async () => {
  const transport = pair(), first = api.serveRaveldexWorker(transport.scope);
  let second, failure;
  try {
    try { second = api.serveRaveldexWorker(transport.scope); } catch (error) { failure = { name: error.name, code: error.code }; }
    report.probes.push({ name: 'raw duplicate-host installation observation', status: 'Observation', evidence: { failure: failure ?? null, extraHandle: !!second, hostListenerCount: transport.count('host') } });
    assert.equal(failure?.code, 'INCOMPATIBLE_WORKER'); assert.equal(transport.count('host'), 2);
    return { failure, hostListenerCount: 2 };
  } finally { await second?.dispose(); await first.dispose(); }
});
await probe('duplicate client cannot terminate first owner and external recovery releases guards', async () => {
  const remote = await open({ ownership: 'external' });
  let second;
  try {
    const duplicate = await outcome(api.createWorkerRaveldex({ worker: remote.transport.client, configuration: configuration(), ownership: 'owned', sameHost: true, responseTimeoutMs: 20 }));
    second = duplicate.value;
    report.probes.push({ name: 'raw duplicate-client installation observation', status: 'Observation', evidence: { result: duplicate.error ? duplicate : { value: 'unexpected second facade' }, terminations: remote.transport.traffic.terminated, clientListenerCount: remote.transport.count('client') } });
    assert.equal(duplicate.error?.code, 'INCOMPATIBLE_WORKER'); assert.equal(remote.transport.traffic.terminated, 0);
    assert.equal((await remote.engine.add({ id: 'first', text: { body: 'red' } })).revision, 1);
    await remote.close();
    const freshHost = api.serveRaveldexWorker(remote.transport.scope), fresh = await api.createWorkerRaveldex({ worker: remote.transport.client,
      configuration: configuration(), ownership: 'external', sameHost: true, responseTimeoutMs: 1000 });
    try {
      assert.deepEqual([(await fresh.search({ kind: 'all' })).revision, (await fresh.search({ kind: 'all' })).total], [0, 0]);
      assert.equal((await fresh.add({ id: 'fresh', text: { body: 'blue' } })).revision, 1);
    } finally { await fresh.dispose(); await freshHost.dispose(); }
    assert.deepEqual([remote.transport.count('client'), remote.transport.count('host'), remote.transport.traffic.terminated], [0, 0, 0]);
    return { duplicate, existingOwnerUsable: true, explicitSameEndpointFreshOwner: true, terminations: 0, remainingListeners: 0 };
  } finally { await second?.dispose().catch(() => {}); await remote.close(); }
});
report.completedAt = new Date().toISOString();
report.summary = { pass: report.probes.filter(row => row.status === 'Pass').length, fail: report.probes.filter(row => row.status === 'Fail').length };
await writeFile(join(dirname(fileURLToPath(import.meta.url)), 'RX-3001-review-probe.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ summary: report.summary, probes: report.probes.map(({ name, status, error }) => ({ name, status, ...(error ? { error } : {}) })) }, null, 2));
if (report.summary.fail) process.exitCode = 1;
