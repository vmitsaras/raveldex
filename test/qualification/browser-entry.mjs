import { createRaveldex, RaveldexError } from '@vmitsaras/raveldex';
import { createWorkerRaveldex } from '@vmitsaras/raveldex/adapters/worker';
import { createWorkerSnapshots } from '@vmitsaras/raveldex/adapters/worker/snapshots';
import { createSnapshots } from '@vmitsaras/raveldex/adapters/snapshots';
import { createIndexedDBPersistence } from '@vmitsaras/raveldex/adapters/indexeddb';
import { mountRaveldexUI } from '@vmitsaras/raveldex/addons/ui';
import { configuration, visibleRecords } from './browser-config.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
function equal(actual, expected, name) { if (JSON.stringify(canonical(actual)) !== JSON.stringify(canonical(expected))) throw Error(`${name}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`); }
function check(value, name) { if (!value) throw Error(name); }
const ids = value => value.hits.map(hit => hit.id).sort();
const errorData = error => ({ name: error.name, code: error.code, reason: error.reason, details: error.details, operationId: error.operationId });
const outcome = promise => promise.then(value => ({ value }), error => ({ error: errorData(error) }));
const handles = new Set(), workers = new Set(), storage = new Set();
function direct(strategy = 'source') { const engine = createRaveldex(configuration(strategy)); handles.add(engine); return engine; }
async function worker(strategy = 'source', responseTimeoutMs = 65_000) {
  const real = new Worker(new URL(`./browser-worker.mjs?strategy=${strategy}`, import.meta.url), { type: 'module' }); workers.add(real);
  const engine = await createWorkerRaveldex({ worker: real, configuration: configuration(strategy), ownership: 'owned', sameHost: true, responseTimeoutMs });
  handles.add(engine); return { engine, real };
}
async function cleanup() {
  if (visibleUI) { visibleUI.destroy(); visibleUI = undefined; }
  const results = [];
  for (const adapter of storage) { results.push(await outcome(adapter.dispose())); } storage.clear();
  for (const engine of handles) { results.push(await outcome(engine.dispose())); } handles.clear();
  for (const real of workers) real.terminate(); workers.clear();
  return results;
}

window.qualification = {
  visibleRecoveryDisposals: [],
  visibleSearchErrors: [],
  async semantics() {
    const fixtures = [
      { id: 'compat', text: { title: 'ﬁle cafe\u0301 ＣＡＲ ½ 東京都 𐐀' } },
      { id: 'literal', text: { title: 'file café car 1/2 strasse' } },
      { id: 'sharp', text: { title: 'Straße hello_world can’t 😀' } },
      { id: 'empty', text: { title: '!!!' } },
    ];
    const expected = [
      ['file café', ['compat', 'literal']], ['ＣＡＲ', ['compat', 'literal']], ['½', ['compat']], ['1/2', ['literal']],
      ['straße', ['sharp']], ['strasse', ['literal']], ['hello world', ['sharp']], ['can t', ['sharp']],
      ['東京都', ['compat']], ['𐐨', ['compat']], ['😀', []],
      [{ kind: 'not', child: { kind: 'text', text: 'car' } }, ['empty', 'sharp']],
      [{ kind: 'or', children: [{ kind: 'text', text: 'straße' }, { kind: 'text', text: '½' }] }, ['compat', 'sharp']],
      [{ kind: 'and', children: [{ kind: 'text', text: 'car' }, { kind: 'not', child: { kind: 'text', text: '1/2' } }] }, ['compat']],
      [{ kind: 'all' }, ['compat', 'empty', 'literal', 'sharp']], [{ kind: 'none' }, []],
    ];
    const rows = [];
    for (const strategy of ['core', 'source', 'offsets']) {
      const one = direct(strategy), remote = await worker(strategy); await one.addMany(clone(fixtures)); await remote.engine.addMany(clone(fixtures));
      for (const [query, membership] of expected) {
        const actual = await one.search(query, { limit: 100 }), received = await remote.engine.search(query, { limit: 100 });
        equal(ids(actual), membership, 'independently specified complete membership'); equal(actual.total, membership.length, 'exact total'); equal(received, actual, 'complete direct/worker result including scores and revision');
        rows.push({ strategy, query, expected: membership, direct: actual, worker: received });
      }
      if (strategy !== 'core') {
        const query = { kind: 'extension', capability: 'phrases', version: 1, payload: { text: 'file café', fields: ['title'] } };
        const options = { extensions: { snippets: { ids: ['compat', 'literal'] } } };
        const actual = await one.search(query, options), received = await remote.engine.search(query, options);
        equal(ids(actual), ['compat', 'literal'], 'strict phrase normalization'); equal(received, actual, 'complete phrase/snippet direct/worker parity');
        const ranges = actual.extensions.snippets.documents.find(row => row.id === 'compat').ranges;
        equal(ranges.map(({ start, end, term }) => ({ start, end, term })), [ { start: 0, end: 3, term: 'file' }, { start: 4, end: 9, term: 'café' } ], 'original ligature/combining UTF-16 coordinates');
        rows.push({ strategy, query, direct: actual, worker: received, originalCoordinateAssertions: 2 });
      }
      const malformed = await outcome(one.add({ id: 'invalid', text: { title: '\ud800' } })); equal(malformed.error?.code, 'INVALID_RECORD', 'malformed UTF-16 rejects');
      equal((await one.search({ kind: 'all' })).total, fixtures.length, 'rejected write preserves whole state');
      rows.push({ strategy, malformed }); await one.dispose(); handles.delete(one); await remote.engine.dispose(); handles.delete(remote.engine); workers.delete(remote.real);
    }
    const scoreEngine = createRaveldex({ schema: { text: { title: {} } } }); handles.add(scoreEngine);
    await scoreEngine.addMany([{ id: 'a', text: { title: 'red red' } }, { id: 'b', text: { title: 'red blue' } }, { id: 'c', text: { title: 'blue' } }]);
    const scores = await scoreEngine.search('red');
    // Independent arithmetic: N=3, df=2, avgdl=5/3, k1=1.2, b=.75.
    const score = (tf, dl) => Math.log(1 + 1.5 / 2.5) * tf * 2.2 / (tf + 1.2 * (.25 + .75 * dl / (5 / 3)));
    const wanted = { a: score(2, 2), b: score(1, 2) }; equal(scores.hits.map(hit => hit.id), ['a', 'b'], 'hand score order');
    for (const hit of scores.hits) check(Math.abs(hit.score - wanted[hit.id]) < 1e-12, 'independent hand numerical BM25');
    await scoreEngine.dispose(); handles.delete(scoreEngine);
    return { rows, scores, expectedScores: wanted, independentMembershipQueries: expected.length * 3 + 2, numericalAssertions: 2, scope: 'Literal cases; no all-Unicode portability declaration.' };
  },
  async resource(size, kind) {
    check([1000, 10000].includes(size), 'admitted workload only');
    const remote = kind === 'worker-source' ? await worker('source') : undefined;
    const engine = remote?.engine ?? direct('core'), rows = [], batchSize = 256;
    const records = Array.from({ length: size }, (_, index) => ({ id: `record-${String(index).padStart(5, '0')}`, text: { title: index % 1000 === 0 ? 'red blue common needle' : 'red blue common' }, metadata: { category: index % 2 ? 'Guide' : 'Reference' } }));
    let admitted = 0;
    for (let offset = 0; offset < records.length; offset += batchSize) {
      const result = await outcome(engine.addMany(records.slice(offset, offset + batchSize)));
      rows.push({ offset, length: records.slice(offset, offset + batchSize).length, ...result });
      if (result.error) break; admitted += Math.min(batchSize, size - offset);
    }
    const all = await engine.search({ kind: 'all' }, { limit: 20 }); equal(all.total, admitted, 'every whole admitted batch represented');
    const common = await outcome(engine.search('red', { limit: 20 })), selective = await outcome(engine.search('needle', { limit: 20 }));
    if (common.value) equal(common.value.total, admitted, 'complete common result total');
    if (selective.value) equal(selective.value.total, Math.ceil(admitted / 1000), 'independent selective total');
    const phrase = kind === 'worker-source' ? await outcome(engine.search({ kind: 'extension', capability: 'phrases', version: 1, payload: { text: 'red blue', fields: ['title'] } }, { limit: 20,
      extensions: { facets: { fields: [{ field: 'category', limit: 10 }] } } })) : undefined;
    if (phrase?.value) equal(phrase.value.total, admitted, 'source phrase complete membership');
    equal(await engine.search({ kind: 'all' }, { limit: 20 }), all, 'ordinary and failed query attempts preserve prior total/page/order/revision');
    const before = all.revision, replacement = await outcome(engine.replace({ ...records[0], text: { title: 'green changed' } }));
    const after = await engine.search('green', { limit: 20 });
    if (replacement.value) equal([after.total, after.revision], [1, before + 1], 'one atomic revision and changed content');
    else {
      equal([after.total, after.revision], [0, before], 'rejected replacement preserves prior content and revision');
      equal(await engine.search({ kind: 'all' }, { limit: 20 }), all, 'rejected replacement preserves prior complete total/order/revision');
      if (common.value) equal(await engine.search('red', { limit: 20 }), common.value, 'rejected replacement preserves common prior result');
      if (selective.value) equal(await engine.search('needle', { limit: 20 }), selective.value, 'rejected replacement preserves complete selective result');
    }
    const operationFailures = [...rows.filter(row => row.error).map(row => ({ operation: 'addMany', ...row })),
      ...[['common search', common], ['selective search', selective], ['source phrase/facets', phrase], ['replace', replacement]].filter(([, row]) => row?.error).map(([operation, row]) => ({ operation, ...row }))];
    const boundedRefusals = operationFailures.length > 0 && operationFailures.every(row => row.error.name === 'RaveldexError' && ['WORK_LIMIT_EXCEEDED', 'DEADLINE_EXCEEDED', 'RESOURCE_EXHAUSTED'].includes(row.error.code));
    const result = { kind, configurationOutcome: admitted === size && operationFailures.length === 0 ? 'Pass' : boundedRefusals ? 'RejectedOutcome' : 'Fail', operationFailures,
      requestedRecords: size, admittedRecords: admitted, batchSize, rows, all, common, selective, phrase, replacement, after,
      method: 'Untimed admission, exact complete query totals, replacement, and disposal. No physical memory or timing claim.' };
    await engine.dispose(); handles.delete(engine); if (remote) workers.delete(remote.real); return result;
  },
  async persistence() {
    const source = await worker('source'); await source.engine.addMany(clone(visibleRecords));
    const databaseName = `raveldex-rx4002-${crypto.randomUUID()}`, namespace = 'qualification';
    const adapter = createIndexedDBPersistence(createWorkerSnapshots(source.engine), { databaseName, namespace }); storage.add(adapter);
    const saved = await adapter.save({ expectedGeneration: null }); check(saved.durable === true, 'observed IndexedDB commit');
    await source.engine.clear(); equal((await source.engine.search({ kind: 'all' })).total, 0, 'cleared source worker');
    const loaded = await adapter.load(), actual = await source.engine.search('red', { limit: 100 });
    equal([loaded.status, loaded.generation, actual.total], ['restored', saved.generation, 2], 'explicit source rebuild recovery');
    const other = direct('source'), directStorage = createIndexedDBPersistence(createSnapshots(other), { databaseName, namespace }); storage.add(directStorage);
    const secondLoad = await directStorage.load(), expected = await other.search('red', { limit: 100 });
    const withoutRevision = ({ revision, ...value }) => value; equal(withoutRevision(actual), withoutRevision(expected), 'worker/direct recovered full results');
    const erased = await adapter.erase({ expectedGeneration: saved.generation });
    const missing = await directStorage.load(); equal(missing, { status: 'missing', generation: null }, 'explicit namespace erase');
    await adapter.dispose(); storage.delete(adapter); await directStorage.dispose(); storage.delete(directStorage);
    await other.dispose(); handles.delete(other); await source.engine.dispose(); handles.delete(source.engine); workers.delete(source.real);
    const deleted = await new Promise(resolve => { const request = indexedDB.deleteDatabase(databaseName); request.onsuccess = () => resolve('deleted'); request.onerror = () => resolve('error'); request.onblocked = () => resolve('blocked'); });
    return { saved, loaded, actual, secondLoad, expected, erased, missing, databaseCleanup: deleted,
      scope: 'Observed strict-hint IndexedDB transaction completion; physical power-loss and eviction durability not observed.' };
  }, cleanup,
  async startVisible() { await recoverVisible(); },
  terminateVisible() { visibleWorker?.real.terminate(); },
  async recoverVisible() { await recoverVisible(); },
  injectVisibleError() { injectError = true; },
};

let visibleWorker, visibleUI, injectError = false;
async function recoverVisible() {
  visibleUI?.destroy(); if (visibleWorker) {
    const disposed = await outcome(visibleWorker.engine.dispose()); window.qualification.visibleRecoveryDisposals.push(disposed);
    handles.delete(visibleWorker.engine); workers.delete(visibleWorker.real);
    // The dead host cannot acknowledge disposal. The public client still
    // releases/terminates in its finally block; preserve the explicit timeout.
    if (disposed.error && !['TIMEOUT', 'TERMINATED'].includes(disposed.error.code)) throw Error(`Prior worker disposal failed: ${disposed.error.code}`);
  }
  visibleWorker = await worker('source', 2500);
  await visibleWorker.engine.addMany(clone(visibleRecords));
  const borrowed = Object.freeze({ ...visibleWorker.engine, search(query, options) {
    if (injectError) { injectError = false; return Promise.reject(new RaveldexError('WORK_LIMIT_EXCEEDED', { path: 'qualification.injected' })); }
    return visibleWorker.engine.search(query, options).catch(error => { window.qualification.visibleSearchErrors.push(errorData(error)); throw error; });
  } });
  visibleUI = mountRaveldexUI({ root: document.querySelector('#worker-root'), engine: borrowed,
    documents: visibleRecords.map(record => ({ id: record.id, title: record.text.title, url: `/docs/${record.id}` })),
    facets: [{ field: 'category', label: 'Category' }], snippetFields: ['title', 'body'], pageSize: 2, debounceMs: 35 });
  await visibleUI.search();
}
for (const [id, action] of [['inject-error', () => { window.qualification.injectVisibleError(); }], ['terminate-worker', () => { window.qualification.terminateVisible(); }], ['recover-worker', () => window.qualification.recoverVisible()]]) {
  document.getElementById(id)?.addEventListener('click', async () => {
    const status = document.getElementById('fixture-status');
    try { await action(); status.textContent = id === 'recover-worker' ? 'Recovered a new worker from authoritative fixture source.' : id === 'inject-error' ? 'The next search will display a deliberately injected WORK_LIMIT_EXCEEDED.' : 'Worker terminated. Submit a search to observe transport failure.'; }
    catch (error) { status.textContent = `Fixture action failed: ${error.code ?? error.message}`; }
  });
}
if (document.getElementById('worker-root')) window.qualification.startVisible().catch(error => { document.getElementById('fixture-status').textContent = `Initialization failed: ${error.code ?? error.message}`; });
