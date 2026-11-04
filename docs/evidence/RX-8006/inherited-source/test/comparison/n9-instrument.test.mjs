import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRaveldex } from '../../dist/index.js';
import { createSourceProvider } from '../../dist/addons/phrases/index.js';
import { createSnapshots } from '../../dist/adapters/snapshots/index.js';
import { createInspector } from '../../dist/addons/inspector/index.js';
import { collectDiagnostics, diagnosticKey, instrumentPackage } from '../../bench/n9/instrument.mjs';

const repository = new URL('../../', import.meta.url);
async function fixture(t, changed = false) {
  const directory = await mkdtemp(join(tmpdir(), 'raveldex-n9-instrument-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await cp(new URL('dist/', repository), join(directory, 'dist'), { recursive: true });
  await cp(new URL('package.json', repository), join(directory, 'package.json'));
  if (changed) await writeFile(join(directory, 'dist/core/query/search.js'), 'export {};\n');
  return directory;
}
const records = [{ id: 'a', text: { body: 'red blue' } }, { id: 'b', text: { body: 'red green' } }, { id: 'c', text: { body: 'blue' } }];
const schema = { text: { body: {} } };
const load = (directory, path) => import(pathToFileURL(join(directory, path)).href);

test('private instrumentation counts executed paths independently and preserves complete results and scores', async t => {
  const directory = await fixture(t), sourceBefore = await readFile(new URL('dist/core/query/search.js', repository));
  const report = await instrumentPackage(directory);
  assert.equal(report.patches.length, 5);
  assert.equal(report.prefixProfile, 'ordered-seek-with-cap-fallback');
  assert.ok(report.patches.every(row => row.originalSha256 !== row.instrumentedSha256));
  const patched = await load(directory, 'dist/index.js');
  const normal = createRaveldex({ schema, limits: { checkpointWorkUnits: 32 } });
  const diagnostic = patched.createRaveldex({ schema, limits: { checkpointWorkUnits: 32 } });
  t.after(async () => { await normal.dispose(); await diagnostic.dispose(); });
  await normal.addMany(records); await diagnostic.addMany(records);
  for (const query of ['red', { kind: 'group', variants: [{ text: 're', match: 'prefix' }] }, { kind: 'not', child: { kind: 'text', text: 'red' } }]) {
    const expected = await normal.search(query, { limit: 20 });
    const actual = await collectDiagnostics(() => diagnostic.search(query, { limit: 20 }));
    assert.equal(actual.error, undefined); assert.deepEqual(actual.result, expected);
    const counts = actual.counters;
    assert.equal(counts.candidates, query.kind === 'not' ? 3 : 2);
    assert.equal(counts.documentsEvaluated, query.kind === 'not' ? 3 : 2);
    assert.equal(counts.documentsScored, query.kind === 'not' ? 1 : 2);
    assert.equal(counts.postingsVisited, 2);
    assert.equal(counts.exactDictionaryProbes, query.kind === 'group' ? 0 : 1);
    assert.equal(counts.prefixDictionaryVisits, query.kind === 'group' ? 3 : 0);
    assert.ok(counts.emittedSteps > 0); assert.ok(counts.emittedWorkUnits > counts.emittedSteps);
    assert.ok(counts.hostYields > 0); assert.equal(counts.hostYields, counts.continuationsScheduled);
    assert.equal(counts.deadlineCallbacks, 0); assert.deepEqual(counts.restorePhases, {});
  }
  assert.deepEqual(await readFile(new URL('dist/core/query/search.js', repository)), sourceBefore);
  assert.equal(globalThis[diagnosticKey], undefined);
});

test('restore phases account actual emitted work; malformed/cancelled operations retain old root and typed errors', async t => {
  const directory = await fixture(t); await instrumentPackage(directory);
  const p = await load(directory, 'dist/index.js'), source = await load(directory, 'dist/addons/phrases/index.js'), snapshots = await load(directory, 'dist/adapters/snapshots/index.js');
  const normal = createRaveldex({ schema, addons: [createSourceProvider({ fields: ['body'] })] });
  const patched = p.createRaveldex({ schema, addons: [source.createSourceProvider({ fields: ['body'] })] });
  t.after(async () => { await normal.dispose(); await patched.dispose(); });
  await normal.addMany(records);
  const encoded = await createSnapshots(normal).exportSource();
  const observed = await collectDiagnostics(() => snapshots.createSnapshots(patched).restore(encoded));
  assert.equal(observed.error, undefined); assert.equal(observed.result.reindexed, true);
  assert.deepEqual(Object.keys(observed.counters.restorePhases), ['snapshot.decode', 'snapshot.integrity', 'snapshot.compatibility', 'snapshot.staging', 'snapshot.precommit']);
  assert.equal(Object.values(observed.counters.restorePhases).reduce((sum, row) => sum + row.emittedWorkUnits, 0), observed.counters.emittedWorkUnits);
  assert.ok(observed.counters.restorePhases['snapshot.decode'].emittedWorkUnits > 0);
  assert.ok(observed.counters.restorePhases['snapshot.staging'].emittedWorkUnits > 0);
  const before = await patched.search({ kind: 'all' });
  const failed = await collectDiagnostics(() => snapshots.createSnapshots(patched).restore('invalid'));
  assert.equal(failed.error.code, 'INCOMPATIBLE_CAPABILITY'); assert.equal(failed.error.reason, 'MALFORMED_SNAPSHOT'); assert.equal(failed.counters.restorePhase, 'snapshot.decode');
  assert.deepEqual(await patched.search({ kind: 'all' }), before);
  const controller = new AbortController(); controller.abort();
  const cancelled = await collectDiagnostics(() => patched.search('red', { signal: controller.signal }));
  assert.equal(cancelled.error.code, 'CANCELLED'); assert.equal(cancelled.counters.emittedSteps, 0);
  assert.deepEqual(await patched.search({ kind: 'all' }), before);
  assert.equal(globalThis[diagnosticKey], undefined);
});

test('bounded candidate counters distinguish requested Inspector nonmatches from query candidates', async t => {
  const directory = await fixture(t); await instrumentPackage(directory);
  const patched = await load(directory, 'dist/index.js');
  const inspector = await load(directory, 'dist/addons/inspector/index.js');
  const normal = createRaveldex({ schema, addons: [createInspector()] });
  const diagnostic = patched.createRaveldex({ schema, addons: [inspector.createInspector()] });
  t.after(async () => { await normal.dispose(); await diagnostic.dispose(); });
  await normal.addMany(records); await diagnostic.addMany(records);
  const options = { extensions: { inspector: { ids: ['a', 'missing'] } } };
  const actual = await collectDiagnostics(() => diagnostic.search('green', options));
  assert.equal(actual.error, undefined);
  assert.deepEqual(actual.result, await normal.search('green', options));
  assert.equal(actual.counters.candidates, 1);
  assert.equal(actual.counters.documentsEvaluated, 2);
  assert.equal(actual.counters.documentsScored, 1);
  assert.deepEqual(actual.result.extensions.inspector.documents.map(document => [document.id, document.eligibility]), [['a', 'excluded'], ['missing', 'absent']]);
});

test('anchor drift fails closed before any files change and repository output cannot be instrumented', async t => {
  await assert.rejects(instrumentPackage(new URL('../../', import.meta.url)), /Refusing to instrument repository/);
  const directory = await fixture(t, true), before = await readFile(join(directory, 'dist/core/execution/engine.js'));
  await assert.rejects(instrumentPackage(directory), /Instrumentation anchor drift/);
  assert.deepEqual(await readFile(join(directory, 'dist/core/execution/engine.js')), before);
  const clean = await fixture(t); await instrumentPackage(clean);
  await assert.rejects(instrumentPackage(clean), /Instrumentation anchor drift/);
});

test('diagnostic scope rejects nested observers and always clears after thrown operations', async () => {
  const row = await collectDiagnostics(() => collectDiagnostics(() => Promise.resolve()));
  assert.match(row.error.message, /serial and non-nested/);
  assert.equal(globalThis[diagnosticKey], undefined);
  const error = new Error('literal failure');
  assert.equal((await collectDiagnostics(() => { throw error; })).error, error);
  assert.equal(globalThis[diagnosticKey], undefined);
});

test('fired host continuation and deadline callbacks stay distinct from cancelled scheduled resumes', async t => {
  const directory = await fixture(t); await instrumentPackage(directory);
  const { createOwnedRaveldex } = await load(directory, 'dist/core/execution/engine.js');
  const { captureConfiguration } = await load(directory, 'dist/core/contracts/schema.js');
  const { FakeHost } = await import('../fixtures/execution/host.mjs');
  const host = new FakeHost(), engine = createOwnedRaveldex(captureConfiguration({ schema, limits: { checkpointWorkUnits: 1 } }), host);
  t.after(() => engine.dispose());
  const adding = engine.addMany(records); host.runReady(); await adding;
  const controller = new AbortController();
  const cancelled = await collectDiagnostics(() => {
    const pending = engine.search('red', { signal: controller.signal }); controller.abort(); return pending;
  });
  assert.equal(cancelled.error.code, 'CANCELLED');
  assert.equal(cancelled.counters.continuationsScheduled, 1);
  assert.equal(cancelled.counters.hostYields, 0);
  assert.equal(cancelled.counters.deadlineCallbacks, 0);
  const expired = await collectDiagnostics(() => {
    const pending = engine.search('red', { deadlineMs: 1 }); host.advance(1); host.runNext({ timersOnly: true }); return pending;
  });
  assert.equal(expired.error.code, 'DEADLINE_EXCEEDED');
  assert.equal(expired.counters.continuationsScheduled, 1);
  assert.equal(expired.counters.hostYields, 0);
  assert.equal(expired.counters.deadlineCallbacks, 1);
  assert.equal(host.pending, 0);
});
