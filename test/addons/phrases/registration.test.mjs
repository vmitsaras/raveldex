import test from 'node:test';
import assert from 'node:assert/strict';
import { createRaveldex, RaveldexError } from '../../../dist/index.js';
import { createSourceProvider, createSourcePhrases } from '../../../dist/addons/phrases/index.js';
import { captureConfiguration } from '../../../dist/core/contracts/schema.js';
import { setup, extension } from './helpers.mjs';
const schema = { text: { title: {}, body: {} } }, fields = ['title', 'body'];
const registrations = () => [createSourceProvider({ fields }), createSourcePhrases({ fields })];
const change = (registration, changes) => ({ ...registration, manifest: { ...structuredClone(registration.manifest), ...changes } });
const rejects = (addons, code = 'INCOMPATIBLE_CAPABILITY') => assert.throws(() => createRaveldex({ schema, addons }), { code });

test('registrations validate complete manifests, identities, versions, direct support and handle roles without evaluating getters', () => {
  for (const value of [null, {}, { manifest: {} }, { ...registrations()[0], unknown: true }]) rejects([value]);
  const [source, phrases] = registrations();
  for (const version of ['1.0', '01.0.0', '1.0.0-01', '1.0.0-..', '1.0.0-a..b', '1.0.0+..']) rejects([change(source, { version })]);
  for (const patch of [{ contractVersion: 2 }, { roles: ['arbitrary-hook'] }, { roles: [] }, { roles: ['transaction-participant', 'transaction-participant'] }, { rebuildPolicy: 'live' }, { execution: { direct: false, worker: true, workerRegistration: 'worker' } }, { execution: { direct: true, worker: true } }, { indexEffect: 'none' }, { costs: { ...source.manifest.costs, externalResources: 'fetch' } }, { limits: { ...source.manifest.limits, maxWorkUnits: Infinity } }]) rejects([change(source, patch)]);
  rejects([{ manifest: source.manifest }]); rejects([{ ...phrases, participant: source.participant }]);
  let reads = 0; const manifest = { ...source.manifest }; Object.defineProperty(manifest, 'version', { get() { reads++; return '0.0.0'; } });
  rejects([{ ...source, manifest }]); assert.equal(reads, 0);
  for (const version of ['0.0.0', '1.2.3-alpha.0+build.01', '1.0.0-0A']) assert.ok(captureConfiguration({ schema, addons: [change(source, { version })] }).capabilities);
  const broken = { ...source, participant: { ...source.participant, initialize() { throw Error('private callback content'); } } };
  assert.throws(() => createRaveldex({ schema, addons: [broken] }), error => error instanceof RaveldexError && error.code === 'INTERNAL_ERROR' && !JSON.stringify(error).includes('private callback content'));
  assert.ok(captureConfiguration({ schema, addons: [change(source, { costs: { ...source.manifest.costs, importedCode: 'Unicode description 😀' } })] }).capabilities);
  rejects([change(source, { costs: { ...source.manifest.costs, importedCode: 'malformed \uD800' } })]);
});

test('missing requirements, duplicate IDs, conflicting field providers, contract versions and dependency cycles fail creation', () => {
  const [source, phrases] = registrations();
  rejects([phrases], 'MISSING_CAPABILITY'); rejects([source, source]);
  rejects([source, createSourceProvider({ fields: ['body'], id: 'another-source' })]);
  rejects([change(source, { provides: [{ id: 'source:body', contractVersion: 2 }] })]);
  rejects([createSourceProvider({ fields: ['title'] }), phrases], 'MISSING_CAPABILITY');
  const base = { ...phrases, manifest: { ...phrases.manifest, dataRequirements: { fields: [], source: false, positions: false, offsets: false, metadata: false } } };
  const a = change(base, { id: 'a', provides: [{ id: 'a', contractVersion: 1 }], requires: [{ id: 'b', contractVersion: 1 }] });
  const b = change(base, { id: 'b', provides: [{ id: 'b', contractVersion: 1 }], requires: [{ id: 'a', contractVersion: 1 }] });
  rejects([a, b]); rejects([change(a, { requires: [{ id: 'a', contractVersion: 1 }] })]);
  rejects([createSourceProvider({ fields: ['unknown'] })]);
  rejects(Array(33).fill(source), 'LIMIT_EXCEEDED');
});

test('registration data is captured and dependency order, field provider splitting and unused source preserve ordinary semantics', async () => {
  const mutable = registrations().map(reg => ({ ...reg, manifest: structuredClone(reg.manifest), ...(reg.participant ? { participant: { ...reg.participant } } : {}) }));
  const left = createRaveldex({ schema, addons: mutable }), right = createRaveldex({ schema, addons: registrations().reverse() });
  mutable[0].manifest.id = 'changed'; mutable[0].manifest.provides.length = 0; mutable[0].participant.prepare = function* () { throw Error('changed'); }; mutable.length = 0;
  const records = [{ id: 'a', text: { title: 'red blue', body: 'red blue red' } }, { id: 'b', text: { title: 'red gap blue' } }];
  await left.addMany(records); await right.addMany(records);
  for (const query of ['red blue', extension('red blue'), { kind: 'or', children: [extension('red blue'), { kind: 'all' }] }]) assert.deepEqual(await left.search(query), await right.search(query));
  const split = createRaveldex({ schema, addons: [createSourcePhrases({ fields }), createSourceProvider({ fields: ['body'], id: 'body-source' }), createSourceProvider({ fields: ['title'], id: 'title-source' })] });
  const core = createRaveldex({ schema }), sourceOnly = createRaveldex({ schema, addons: [createSourceProvider({ fields: ['title'] })] });
  await Promise.all([split.addMany(records), core.addMany(records), sourceOnly.addMany(records)]);
  assert.deepEqual(await split.search(extension('red blue')), await left.search(extension('red blue')));
  assert.deepEqual(await sourceOnly.search('red blue'), await core.search('red blue'));
  await Promise.all([left.dispose(), right.dispose(), split.dispose(), core.dispose(), sourceOnly.dispose()]);
});

test('phrase envelopes own plain bounded payloads and reject unsupported fields, versions and unknown data precisely', async () => {
  const { engine, call } = setup(schema, { addons: [createSourceProvider({ fields: ['body'] }), createSourcePhrases({ fields: ['body'] })] });
  await call('add', { id: 'a', text: { title: 'red blue', body: 'red blue' } });
  assert.equal((await call('search', extension('red blue', ['body']))).total, 1);
  for (const text of ['', 'absent', 'red blue']) await assert.rejects(call('search', extension(text)), { code: 'MISSING_CAPABILITY' });
  await assert.rejects(call('search', extension('absent', ['title', 'body'])), { code: 'MISSING_CAPABILITY' });
  for (const payload of [null, {}, { text: 'red', slop: 1 }, { text: undefined }, { text: 'red', fields: [] }, { text: 'red', fields: ['body', 'body'] }, { text: 'red', fields: ['unknown'] }, { text: 'red', fields: undefined }, { text: 'red', variants: [] }]) await assert.rejects(call('search', { kind: 'extension', capability: 'phrases', version: 1, payload }), { code: 'INVALID_QUERY' });
  for (const version of [0, '1', 1.1]) await assert.rejects(call('search', { ...extension('red'), version }), { code: 'INVALID_QUERY' });
  await assert.rejects(call('search', { ...extension('red'), version: 2 }), { code: 'INCOMPATIBLE_CAPABILITY' });
  await assert.rejects(call('search', { ...extension('red'), capability: 'missing' }), { code: 'MISSING_CAPABILITY' });
  await assert.rejects(call('search', extension('\uD800', ['body'])), error => error instanceof RaveldexError && error.code === 'INVALID_QUERY');
  let reads = 0; const payload = {}; Object.defineProperty(payload, 'text', { get() { reads++; return 'red'; } });
  await assert.rejects(call('search', { ...extension('red'), payload }), { code: 'INVALID_QUERY' }); assert.equal(reads, 0);
  await engine.dispose();
});

test('whole-query limits and finite payload/operation work caps apply across every installed leaf', async () => {
  const { engine, call } = setup(schema, { limits: { maxQueryTokens: 1, maxQueryGroups: 1, checkpointWorkUnits: 1 } });
  await call('add', { id: 'a', text: { body: 'red blue red' } });
  assert.equal((await call('search', extension('red', ['body']))).total, 1);
  await assert.rejects(call('search', extension('red blue', ['body'])), { code: 'LIMIT_EXCEEDED' });
  await assert.rejects(call('search', { kind: 'or', children: [extension('red', ['body']), extension('red', ['body'])] }), { code: 'LIMIT_EXCEEDED' });
  await engine.dispose();
  const [source, phrase] = registrations();
  const payloadCap = change(phrase, { limits: { ...phrase.manifest.limits, maxPayloadCodeUnits: 3 } });
  const p = setup(schema, { addons: [source, payloadCap] });
  await assert.rejects(p.call('search', extension('', ['body'])), { code: 'LIMIT_EXCEEDED' }); await p.engine.dispose();
  // Two copies of a callback leaf cannot evade a registration's operation cap.
  const trivial = { ...change(phrase, { limits: { ...phrase.manifest.limits, maxWorkUnits: 3 } }), refinement: { kind: 'exact-token-sequence', maxTokens: 32, *prepare() { yield { workUnits: 2 }; return { *test() { return true; } }; } } };
  const capped = setup(schema, { addons: [source, trivial] });
  assert.equal((await capped.call('search', extension(''))).total, 0);
  await assert.rejects(capped.call('search', { kind: 'or', children: [extension(''), extension('')] }), { code: 'WORK_LIMIT_EXCEEDED' }); await capped.engine.dispose();
});

test('factory options capture field arrays and reject malformed or raised bounds without adding state implicitly', async () => {
  for (const factory of [createSourceProvider, createSourcePhrases]) for (const options of [undefined, {}, { fields: [] }, { fields: ['body', 'body'] }, { fields: ['constructor'] }, { fields: ['body'], unknown: true }, { fields: ['body'], maxWorkUnits: 0 }, { fields: ['body'], maxWorkUnits: Infinity }]) assert.throws(() => factory(options));
  assert.throws(() => createSourceProvider({ fields: ['body'], maxRetainedEntries: -1 }), { code: 'INVALID_OPTIONS' });
  assert.throws(() => createSourceProvider({ fields: ['body'], maxRetainedEntries: Number.MAX_SAFE_INTEGER }), { code: 'LIMIT_EXCEEDED' });
  const names = ['body'], source = createSourceProvider({ fields: names }); names[0] = 'title'; assert.deepEqual(source.manifest.dataRequirements.fields, ['body']);
  const { engine, call } = setup(schema, { addons: [] }); await call('add', { id: 'a', text: { body: 'red blue' } });
  assert.equal(Object.hasOwn(engine.root.configuration, 'capabilities'), false); assert.deepEqual(Object.keys(engine.root.participants), []);
  await assert.rejects(call('search', extension('red blue')), { code: 'MISSING_CAPABILITY' }); await engine.dispose();
});
