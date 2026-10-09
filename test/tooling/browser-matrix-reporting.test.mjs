import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { createMatrixRecorder, readMatrixBody, MATRIX_BODY_LIMIT } from '../qualification/browser-matrix-reporting.mjs';

// Protocol fixtures deliberately do not execute or stand in for engine tests.
const searchResult = (total = 2) => ({ revision: 1, model: 'raveldex-bm25-v1', completeness: 'complete', total,
  hits: [{ id: 'a', score: 0.5 }, ...(total >= 2 ? [{ id: 'b', score: 0.25 }] : [])] });
const semanticEvidence = () => ({ independentMembershipQueries: 50, numericalAssertions: 2,
  rows: Array.from({ length: 53 }, (_, index) => ({ fixtureRow: index })), scores: searchResult(), expectedScores: { a: 0.5, b: 0.25 } });
const persistenceEvidence = () => ({ saved: { generation: 'test-generation', format: 'raveldex-source', durable: true, encodedBytes: 123 },
  loaded: { status: 'restored', generation: 'test-generation', restore: {} }, secondLoad: { status: 'restored', generation: 'test-generation', restore: {} },
  actual: searchResult(), expected: searchResult(), erased: { erased: true, generation: null, durable: true },
  missing: { status: 'missing', generation: null }, databaseCleanup: 'deleted' });
const resourceEvidence = () => ({ kind: 'worker-source', requestedRecords: 10000, admittedRecords: 10000,
  configurationOutcome: 'Pass', operationFailures: [], rows: [{ offset: 0, length: 256 }], all: searchResult(10000), after: searchResult(1),
  common: { value: searchResult(10000) }, selective: { value: searchResult(10) }, replacement: { value: { revision: 41 } }, phrase: { value: searchResult(10000) } });

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'raveldex-matrix-report-test-'));
  const packageIdentity = { package: { sha256: 'actual-tarball-identity' }, graphs: { bundle: { sha256: 'actual-bundle-identity' } } };
  const harnessIdentity = [{ path: 'actual-runner', sha256: 'source-identity' }];
  const recorder = await createMatrixRecorder({ directory, origin: 'http://127.0.0.1:1234', packageIdentity, harnessIdentity });
  let closed = false;
  t.after(async () => { if (!closed) await recorder.close(); await rm(directory, { recursive: true, force: true }); });
  const identity = { sessionId: recorder.sessionId, clientId: 'native-client', attemptId: 'attempt-1', scenarioId: 'semantics', label: 'Firefox' };
  const start = { ...identity, activation: { isTrusted: true, eventTimeStamp: 100 } };
  const result = { ...identity, startedAt: '2026-10-09T10:00:00.000Z', finishedAt: '2026-10-09T10:00:00.100Z',
    outcome: 'Pass', evidence: semanticEvidence(), cleanup: [], pageErrors: [] };
  const headers = { origin: 'http://127.0.0.1:1234', host: '127.0.0.1:1234', 'content-type': 'application/json', 'user-agent': 'Actual request UA/157.0' };
  const request = (path, input, extra = {}) => recorder.accept({ path, method: 'POST', headers, bytes: Buffer.from(JSON.stringify(input)), ...extra });
  const rows = async () => (await readFile(recorder.artifactPath, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  return { recorder, directory, packageIdentity, harnessIdentity, headers, identity, start, result, request, rows,
    async close() { await recorder.close(); closed = true; } };
}
const status = expected => error => error.status === expected;

test('matrix journal exclusively creates a capture and binds immutable actual identities', async t => {
  const f = await fixture(t), [header] = await f.rows();
  assert.equal(header.type, 'manifest');
  assert.equal(header.manifestSha256, createHash('sha256').update(JSON.stringify(header.manifest)).digest('hex'));
  f.packageIdentity.package.sha256 = 'later-self-metadata'; f.harnessIdentity[0].sha256 = 'later-source';
  assert.equal(f.recorder.session().packageSha256, 'actual-tarball-identity');
  assert.equal(header.manifest.harness[0].sha256, 'source-identity');
  await assert.rejects(createMatrixRecorder({ directory: f.directory, origin: 'http://127.0.0.1:1234', packageIdentity: f.packageIdentity, harnessIdentity: [] }), { code: 'EEXIST' });
});

test('matrix start/result acknowledgements bind UA, session, scenario and operator label', async t => {
  const f = await fixture(t);
  const startAck = await f.request('/matrix/start', f.start); assert.equal(startAck.recorded, true);
  const endAck = await f.request('/matrix/result', f.result); assert.equal(endAck.outcome, 'Pass');
  const rows = await f.rows(); assert.deepEqual(rows.map(row => row.type), ['manifest', 'start', 'result']);
  for (const row of rows.slice(1)) {
    assert.equal(row.requestUserAgent, f.headers['user-agent']); assert.equal(row.label, 'Firefox');
    assert.equal(row.manifestSha256, rows[0].manifestSha256); assert.equal(row.sessionId, f.identity.sessionId);
  }
  assert.equal(f.recorder.session().active, undefined);
});

test('matrix rejects off-origin, wrong host, unsupported methods/content and malformed identities', async t => {
  const f = await fixture(t);
  await assert.rejects(f.request('/matrix/start', f.start, { headers: { ...f.headers, origin: 'https://other.test' } }), status(403));
  await assert.rejects(f.request('/matrix/start', f.start, { headers: { ...f.headers, host: 'other.test' } }), status(403));
  await assert.rejects(f.request('/matrix/start', f.start, { method: 'GET' }), status(405));
  await assert.rejects(f.request('/matrix/start', f.start, { headers: { ...f.headers, 'content-type': 'text/plain' } }), status(415));
  await assert.rejects(f.request('/matrix/start', f.start, { bytes: Buffer.from('{') }), status(400));
  for (const input of [{ ...f.start, sessionId: 'old-session' }, { ...f.start, scenarioId: '100000-direct-core' },
    { ...f.start, label: 'Verified browser claim' }, { ...f.start, path: '/chosen-by-browser.json' }, { ...f.start, clientId: '../traversal' }]) {
    await assert.rejects(f.request('/matrix/start', input), status(400));
  }
  assert.equal((await f.rows()).length, 1);
});

test('matrix serializes simultaneous starts and preserves the sole admitted attempt', async t => {
  const f = await fixture(t);
  const outcomes = await Promise.allSettled([f.request('/matrix/start', f.start), f.request('/matrix/start', { ...f.start, attemptId: 'attempt-2' })]);
  assert.equal(outcomes.filter(row => row.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find(row => row.status === 'rejected').reason.status, 409);
  assert.equal(f.recorder.session().active.attemptId, 'attempt-1');
  assert.equal((await f.rows()).filter(row => row.type === 'start').length, 1);
});

test('matrix refuses stale/mismatched results and accepts an exact save retry without rerunning', async t => {
  const f = await fixture(t);
  await assert.rejects(f.request('/matrix/result', f.result), status(409));
  await f.request('/matrix/start', f.start);
  for (const input of [{ ...f.result, attemptId: 'another-attempt' }, { ...f.result, label: 'Safari' }, { ...f.result, scenarioId: 'persistence' }])
    await assert.rejects(f.request('/matrix/result', input), status(409));
  await assert.rejects(f.request('/matrix/result', f.result, { headers: { ...f.headers, 'user-agent': 'Different UA' } }), status(409));
  await f.request('/matrix/result', f.result);
  const retry = await f.request('/matrix/result', f.result); assert.equal(retry.duplicate, true);
  await assert.rejects(f.request('/matrix/result', { ...f.result, evidence: { changed: true } }), status(409));
  await assert.rejects(f.request('/matrix/start', f.start), status(409));
  assert.equal((await f.rows()).filter(row => row.type === 'result').length, 1);
});

test('matrix refuses Pass when cleanup or page execution failed and retains honest Fail', async t => {
  const f = await fixture(t); await f.request('/matrix/start', f.start);
  const failedCleanup = { ...f.result, cleanup: [{ error: { name: 'FixtureCleanupError', message: 'Database blocked' } }] };
  await assert.rejects(f.request('/matrix/result', failedCleanup), status(400));
  await assert.rejects(f.request('/matrix/result', { ...f.result, pageErrors: [{ name: 'PageError', message: 'Uncaught failure' }] }), status(400));
  await assert.rejects(f.request('/matrix/result', { ...f.result, error: { name: 'Error', message: 'Assertion failed' } }), status(400));
  await f.request('/matrix/result', { ...failedCleanup, outcome: 'Fail' });
  assert.equal((await f.rows()).at(-1).outcome, 'Fail');
});

test('matrix cannot turn incomplete or wrong resource configurations into Pass', async t => {
  const f = await fixture(t), scenarioId = '10000-worker-source';
  await f.request('/matrix/start', { ...f.start, scenarioId });
  const evidence = resourceEvidence();
  const result = { ...f.result, scenarioId, evidence };
  for (const changed of [{ admittedRecords: 1000 }, { requestedRecords: 1000 }, { kind: 'direct-core' },
    { configurationOutcome: 'RejectedOutcome' }, { operationFailures: [{ error: { code: 'WORK_LIMIT_EXCEEDED' } }] }])
    await assert.rejects(f.request('/matrix/result', { ...result, evidence: { ...evidence, ...changed } }), status(400));
  await assert.rejects(f.request('/matrix/result', { ...result, outcome: 'RejectedOutcome' }), status(400));
  await f.request('/matrix/result', { ...result, outcome: 'RejectedOutcome', evidence: { ...evidence, admittedRecords: 9984, all: searchResult(9984), configurationOutcome: 'RejectedOutcome', operationFailures: [{ error: { code: 'WORK_LIMIT_EXCEEDED' } }] } });
  const row = (await f.rows()).at(-1); assert.equal(row.outcome, 'RejectedOutcome'); assert.equal(row.evidence.admittedRecords, 9984);
});

test('matrix requires successful storage database cleanup before Pass', async t => {
  const f = await fixture(t), scenarioId = 'persistence'; await f.request('/matrix/start', { ...f.start, scenarioId });
  for (const databaseCleanup of ['error', 'blocked', undefined])
    await assert.rejects(f.request('/matrix/result', { ...f.result, scenarioId, evidence: { ...persistenceEvidence(), databaseCleanup } }), status(400));
  for (const evidence of [{ databaseCleanup: 'deleted' }, { ...persistenceEvidence(), loaded: { status: 'missing' } },
    { ...persistenceEvidence(), erased: { erased: true, durable: false, generation: null } }])
    await assert.rejects(f.request('/matrix/result', { ...f.result, scenarioId, evidence }), status(400));
  await f.request('/matrix/result', { ...f.result, scenarioId, evidence: persistenceEvidence() });
});

test('matrix rejects missing observations, noncanonical/backward timestamps and malformed error rows', async t => {
  const f = await fixture(t); await f.request('/matrix/start', f.start);
  for (const change of [{ evidence: undefined }, { startedAt: undefined }, { finishedAt: undefined }, { startedAt: '2026-10-09' },
    { finishedAt: '2026-10-09T09:59:59.999Z' }, { startedAt: 'invalid' }, { cleanup: [null] }, { cleanup: ['success'] },
    { cleanup: [{ error: 'failure' }] }, { cleanup: [{ error: { name: 'Error', message: 'failure' }, value: 'success' }] },
    { pageErrors: [null] }, { pageErrors: ['failure'] }, { pageErrors: [{ message: 'missing name' }] },
    { evidence: { ...semanticEvidence(), numericalAssertions: 0 } }, { evidence: { ...semanticEvidence(), independentMembershipQueries: 0 } },
    { evidence: { ...semanticEvidence(), rows: [] } }, { evidence: { ...semanticEvidence(), scores: null } }])
    await assert.rejects(f.request('/matrix/result', { ...f.result, ...change }), status(400));
  await f.request('/matrix/result', { ...f.result, cleanup: [{}] });
});

test('matrix body capture is bounded before JSON admission', async t => {
  const f = await fixture(t);
  await assert.rejects(f.request('/matrix/start', f.start, { bytes: Buffer.alloc(MATRIX_BODY_LIMIT + 1) }), status(413));
  await assert.rejects(readMatrixBody(Readable.from([Buffer.alloc(MATRIX_BODY_LIMIT), Buffer.from('x')])), status(413));
  assert.deepEqual(await readMatrixBody(Readable.from([Buffer.from('{'), Buffer.from('}')])), Buffer.from('{}'));
});

test('matrix server close records unfinished execution as unknown, never Pass', async t => {
  const f = await fixture(t); await f.request('/matrix/start', f.start); await f.close();
  const last = (await f.rows()).at(-1); assert.equal(last.type, 'unfinished'); assert.equal(last.outcome, 'Not completed');
  assert.equal(last.attemptId, f.identity.attemptId);
});
