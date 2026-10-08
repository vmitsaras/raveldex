import { createRaveldex, RaveldexError } from '@vmitsaras/raveldex';
import { createSnapshots } from '@vmitsaras/raveldex/adapters/snapshots';
import { createIndexedDBPersistence } from '@vmitsaras/raveldex/adapters/indexeddb';
import { createWorkerRaveldex } from '@vmitsaras/raveldex/adapters/worker';
import { createWorkerSnapshots } from '@vmitsaras/raveldex/adapters/worker/snapshots';
import { createSourceProvider } from '@vmitsaras/raveldex/addons/phrases';
import { configuration } from './configuration.mjs';
import { records, queries, evidenceRequests, schema, handBM25 } from './records.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const equal = (actual, expected, label) => { if (JSON.stringify(canonical(actual)) !== JSON.stringify(canonical(expected))) throw Error(`${label}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`); };
const check = (value, label) => { if (!value) throw Error(label); };
const semantic = value => Array.isArray(value) ? value.map(semantic) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).filter(key => key !== 'revision').map(key => [key, semantic(value[key])])) : value;
function changedSnapshot(encoded, update) {
  const envelope = JSON.parse(encoded); update(envelope); const body = JSON.stringify(envelope.body); let hash = 0x811c9dc5;
  for (let index = 0; index < body.length; index++) hash = Math.imul(hash ^ body.charCodeAt(index), 0x01000193) >>> 0;
  envelope.integrity.value = hash.toString(16).padStart(8, '0'); return JSON.stringify(envelope);
}
const outcome = promise => promise.then(value => ({ value }), error => ({ error: { name: error.name, code: error.code, reason: error.reason, details: error.details, operationId: error.operationId, coreClass: error instanceof RaveldexError } }));
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const handles = new Set(), realWorkers = new Set(), persistenceHandles = new Set();
const dbName = 'raveldex-rx3003-browser';
const request = request => new Promise((yes, no) => { request.onsuccess = () => yes(request.result); request.onerror = () => no(request.error); });
const done = transaction => new Promise((yes, no) => { transaction.oncomplete = yes; transaction.onabort = () => no(transaction.error ?? Error('aborted')); transaction.onerror = () => {}; });

function storage(engine, namespace = 'primary', extras = {}) {
  const adapter = createIndexedDBPersistence(createSnapshots(engine), { databaseName: dbName, namespace, openTimeoutMs: 150, operationTimeoutMs: 2000, ...extras });
  persistenceHandles.add(adapter); return adapter;
}
function direct(options = {}) { const engine = createRaveldex(configuration(options)); handles.add(engine); return engine; }
async function populated(options = {}) { const engine = direct(options); await engine.addMany(clone(records)); return engine; }
async function openDatabase(name = dbName, version = 1, upgrade) {
  const opening = indexedDB.open(name, version); if (upgrade) opening.onupgradeneeded = () => upgrade(opening.result, opening.transaction);
  return request(opening);
}
async function databaseRows(name = dbName) {
  const database = await openDatabase(name);
  try {
    const names = [...database.objectStoreNames].sort(); if (!names.length) return { version: database.version, stores: {} };
    const transaction = database.transaction(names, 'readonly'), completion = done(transaction), stores = {};
    await Promise.all(names.map(async name => { stores[name] = await request(transaction.objectStore(name).getAll()); }));
    await completion; return { version: database.version, stores };
  } finally { database.close(); }
}
async function rewriteRows(namespace, update) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(['metadata', 'snapshots'], 'readwrite'), completion = done(transaction);
    const snapshotStore = transaction.objectStore('snapshots'), metaStore = transaction.objectStore('metadata');
    const [snapshot, metadata] = await Promise.all([request(snapshotStore.get(namespace)), request(metaStore.get(namespace))]);
    const changed = update(clone(snapshot), clone(metadata));
    snapshotStore.put(changed.snapshot); metaStore.put(changed.metadata); await completion;
  } finally { database.close(); }
}
const summaryRows = rows => Object.fromEntries(Object.entries(rows.stores).map(([name, entries]) => [name, entries.map(row => ({ namespace: row.namespace, generation: row.generation, version: row.version, ...(row.encodedBytes ? { encodedBytes: row.encodedBytes } : {}) }))]));
function countingSignal() {
  const controller = new AbortController(), listeners = new Set();
  return { controller, listeners, signal: { get aborted() { return controller.signal.aborted; },
    addEventListener(type, listener, options) { listeners.add(listener); controller.signal.addEventListener(type, listener, options); },
    removeEventListener(type, listener) { listeners.delete(listener); controller.signal.removeEventListener(type, listener); } } };
}
function factory(overrideOpen) {
  return new Proxy(indexedDB, { get(target, key) { if (key === 'open') return overrideOpen; const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value; } });
}
async function faultOn(prototype, method, replacement, callback) {
  const original = prototype[method]; prototype[method] = function(...arguments_) { return replacement.call(this, original, arguments_); };
  try { return await callback(); } finally { prototype[method] = original; }
}
async function completeComparisons(actual, expected) {
  const rows = [];
  for (const [query, membership] of queries) {
    for (const options of [{ limit: 100 }, { limit: 0 }, { offset: 1, limit: 2 }, ...evidenceRequests.map(extensions => ({ limit: 100, extensions }))]) {
      const [received, baseline] = await Promise.all([actual.search(query, options), expected.search(query, options)]);
      equal(semantic(received), semantic(baseline), 'complete source-restored semantics');
      if (options.limit === 100 && !options.extensions) equal(received.hits.map(hit => hit.id).sort(), [...membership].sort(), 'independent literal complete membership');
      rows.push({ query, options, result: received });
    }
  }
  const original = await actual.search({ kind: 'text', text: 'red', fields: ['body'] }, { extensions: { 'match-evidence': { ids: ['a'] } } });
  equal(original.extensions['match-evidence'].documents[0].ranges, [
    { field: 'body', valueIndex: 0, position: 0, start: 0, end: 3, term: 'red' },
    { field: 'body', valueIndex: 0, position: 2, start: 9, end: 12, term: 'red' },
  ], 'original hand UTF-16 coordinates');
  const normalized = await actual.search('file café', { extensions: { 'match-evidence': { ids: ['a'] } } });
  equal(normalized.extensions['match-evidence'].documents[0].ranges, [
    { field: 'body', valueIndex: 1, position: 0, start: 0, end: 3, term: 'file' },
    { field: 'body', valueIndex: 1, position: 1, start: 4, end: 9, term: 'café' },
  ], 'original ligature/combining coordinates');
  const numeric = await actual.search({ kind: 'text', text: 'red', fields: ['title'] });
  const numerical = { a: handBM25(2, 3, 2, 4, 3), b: handBM25(1, 2, 2, 4, 3), d: handBM25(1, 2, 2, 4, 3) };
  for (const hit of numeric.hits) check(Math.abs(hit.score - numerical[hit.id]) < 1e-12, `independent hand BM25 ${hit.id}`);
  return { fullComparisons: rows.length + 3, rows, independent: { literalQueries: queries.length, handBm25Assertions: numeric.hits.length, originalUtf16Ranges: 4 } };
}

class InstrumentedWorker {
  constructor(real) {
    this.real = real; this.listeners = new Map(); this.requests = []; this.responses = []; this.terminated = 0; this.dropped = [];
    real.addEventListener('message', event => { this.responses.push(clone(event.data)); if (this.onReply?.(event.data) === false) { this.dropped.push(clone(event.data)); return; } this.emit('message', event); this.afterReply?.(event.data); });
    for (const type of ['error', 'messageerror']) real.addEventListener(type, event => this.emit(type, event));
  }
  postMessage(message) { this.requests.push(clone(message)); if (this.onSend?.(message) !== false) this.real.postMessage(message); }
  addEventListener(type, listener) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(listener); }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  emit(type, event) { for (const listener of [...this.listeners.get(type) ?? []]) typeof listener === 'function' ? listener(event) : listener.handleEvent(event); }
  terminate() { this.terminated++; this.real.terminate(); }
  count() { return [...this.listeners.values()].reduce((sum, listeners) => sum + listeners.size, 0); }
  stats() { return { requests: this.requests.length, actualResponseEvents: this.responses.length, dropped: this.dropped.length, listeners: this.count(), terminated: this.terminated }; }
}
async function workerEngine(options = {}) {
  const name = location.pathname === '/packed' ? './engine-worker-packed.mjs' : './engine-worker.mjs';
  const real = new Worker(new URL(name, import.meta.url), { type: 'module' }); realWorkers.add(real);
  const worker = new InstrumentedWorker(real), engine = await createWorkerRaveldex({ worker, configuration: configuration(), ownership: 'owned', sameHost: true, responseTimeoutMs: 350, ...options });
  handles.add(engine); const snapshots = createWorkerSnapshots(engine);
  const persistence = createIndexedDBPersistence(snapshots, { databaseName: dbName, namespace: 'worker', openTimeoutMs: 150, operationTimeoutMs: 2000 });
  persistenceHandles.add(persistence); return { engine, worker, snapshots, persistence };
}

window.indexedDBHarness = {
  async parity() {
    let opens = 0;
    return faultOn(IDBFactory.prototype, 'open', function(original, args) { opens++; return original.apply(this, args); }, async () => {
      const original = await populated(), saved = storage(original), target = direct(), restored = storage(target);
      await target.add({ id: 'prior', text: { title: 'prior' } }); await pause(25); equal(opens, 0, 'factory construction and ordinary engine mutation do not start persistence');
      const receipt = await saved.save({ expectedGeneration: null }); check(receipt.durable === true && typeof receipt.generation === 'string', 'durable save result');
      const loaded = await restored.load(); equal([loaded.status, loaded.generation, loaded.restore.format, loaded.restore.revision, loaded.restore.reindexed], ['restored', receipt.generation, 'raveldex-source', 2, true], 'validated next-local-revision restore');
      const comparisons = await completeComparisons(target, original);
      const changes = [ ['replace', { id: 'a', text: { title: 'blue car', body: 'blue' }, metadata: { category: ['Reference'], price: 6 } }], ['remove', ['b', 'missing']], ['add', { id: 'new', text: { title: 'new green', body: 'red' }, metadata: { category: ['Guide'], price: 10 } }] ];
      const mutations = [];
      for (const [method, input] of changes) { const actual = await target[method](clone(input)), expected = await original[method](clone(input)); equal(semantic(actual), semantic(expected), 'mutation after recovery'); const result = await target.search({ kind: 'all' }, { extensions: evidenceRequests[0] }); equal(semantic(result), semantic(await original.search({ kind: 'all' }, { extensions: evidenceRequests[0] })), 'complete state after restored mutation'); mutations.push({ method, actual, result }); }
      return { saved: receipt, loaded, ...comparisons, mutations, fullComparisons: comparisons.fullComparisons + mutations.length * 2, opens, noBackgroundPersistence: 'Observed before explicit save' };
    });
  },
  async mutationSave() {
    const engine = await populated(), adapter = storage(engine);
    const callerOptions = { expectedGeneration: null }, pending = adapter.save(callerOptions); callerOptions.expectedGeneration = crypto.randomUUID();
    const first = await pending; await engine.replace({ id: 'a', text: { title: 'green', body: 'green' } });
    const memory = await engine.search('green'), beforeStorage = await databaseRows();
    equal(beforeStorage.stores.metadata[0].generation, first.generation, 'in-memory commit does not imply durable storage');
    const second = await adapter.save({ expectedGeneration: first.generation }); check(second.generation !== first.generation, 'new durable generation');
    const target = direct(), loaded = await storage(target).load(), recovered = await target.search('green');
    equal([loaded.generation, recovered.total, recovered.hits[0].id], [second.generation, 1, 'a'], 'later save persists changed engine');
    equal(semantic(recovered), semantic(memory), 'unrounded scores after later save');
    return { first, memory, beforeStorage: summaryRows(beforeStorage), second, loaded, recovered, fullComparisons: 1 };
  },
  async conflicts() {
    const one = await populated(), two = await populated(), a = storage(one), b = storage(two);
    const concurrent = await Promise.all([outcome(a.save({ expectedGeneration: null })), outcome(b.save({ expectedGeneration: null }))]);
    equal(concurrent.filter(row => row.value).length, 1, 'exactly one transaction wins simultaneous missing-generation CAS');
    const first = concurrent.find(row => row.value).value, stale = await outcome(b.save({ expectedGeneration: crypto.randomUUID() })); check(stale.error, 'stale generation rejects');
    equal(concurrent.find(row => row.error).error.code, 'GENERATION_CONFLICT', 'losing real transaction reports explicit conflict'); equal(stale.error.code, 'GENERATION_CONFLICT', 'stale generation uses conflict category');
    const erased = await a.erase({ expectedGeneration: first.generation }); const recreated = await b.save({ expectedGeneration: null });
    const oldToken = await outcome(a.save({ expectedGeneration: first.generation })); check(oldToken.error, 'pre-erase generation cannot overwrite recreated namespace');
    const observed = await databaseRows(); equal(observed.stores.metadata[0].generation, recreated.generation, 'stale failure preserves later generation');
    return { concurrent, stale, erased, recreated, oldToken, storage: summaryRows(observed) };
  },
  async eraseIsolation() {
    const engine = await populated(), first = storage(engine), other = storage(engine, 'other');
    const saved = await first.save({ expectedGeneration: null }), isolated = await other.save({ expectedGeneration: null });
    const before = await databaseRows(), erased = await first.erase({ expectedGeneration: saved.generation }), after = await databaseRows();
    equal(Object.keys(after.stores).sort(), ['metadata', 'snapshots'], 'inspect every owned database store');
    for (const entries of Object.values(after.stores)) equal(entries.map(row => row.namespace), ['other'], 'all target artifacts absent and other namespace retained');
    equal((await engine.search({ kind: 'all' })).total, records.length, 'erasure separate from memory cleanup');
    const idempotent = await first.erase({ expectedGeneration: null }), missing = await storage(direct()).load();
    equal([idempotent.erased, idempotent.generation, idempotent.durable], [false, null, true], 'idempotent complete erase'); equal(missing, { status: 'missing', generation: null }, 'reopened erased namespace is missing');
    const otherState = await storage(direct(), 'other').load(); equal(otherState.generation, isolated.generation, 'other namespace remains recoverable');
    return { saved, isolated, before: summaryRows(before), erased, after: summaryRows(after), idempotent, missing, otherState };
  },
  async unavailable() {
    const engine = await populated(), adapter = storage(engine, 'unavailable', { indexedDB: factory(() => { throw new DOMException('Injected denied storage', 'SecurityError'); }) });
    const results = [await outcome(adapter.load()), await outcome(adapter.save({ expectedGeneration: null })), await outcome(adapter.erase({ expectedGeneration: null }))];
    check(results.every(row => row.error?.code === 'UNAVAILABLE'), 'unavailable storage has explicit category and no pretend success'); const state = await engine.search('red'); equal(state.total, 3, 'in-memory engine stays usable without storage');
    return { injection: 'IDBFactory.open synchronously throws SecurityError; physical permissions denial not simulated', results, state };
  },
  async writeFailures() {
    const engine = await populated(), adapter = storage(engine), saved = await adapter.save({ expectedGeneration: null });
    const results = [];
    for (const name of ['QuotaExceededError', 'AbortError']) {
      const result = await faultOn(IDBObjectStore.prototype, 'put', function(original, args) {
        if (name === 'QuotaExceededError') throw new DOMException('Injected quota', name);
        const result = original.apply(this, args); this.transaction.abort(); return result;
      }, () => outcome(adapter.save({ expectedGeneration: saved.generation })));
      equal(result.error?.code, name === 'QuotaExceededError' ? 'QUOTA_EXCEEDED' : 'TRANSACTION_FAILED', `injected ${name} explicit category`); const rows = await databaseRows(); equal(rows.stores.metadata[0].generation, saved.generation, 'write fault keeps previous committed generation'); equal(rows.stores.snapshots[0].generation, saved.generation, 'snapshot and metadata remain atomic'); results.push({ name, result, rows: summaryRows(rows) });
    }
    const recovered = await adapter.save({ expectedGeneration: saved.generation }); check(recovered.generation !== saved.generation, 'same adapter recovers after injected failures');
    return { saved, results, recovered, injection: 'Real IDBObjectStore.put wrapper throws QuotaExceededError or actually aborts the real readwrite transaction; physical disk quota unrun' };
  },
  async durableCommitAbort() {
    const engine = await populated(), adapter = storage(engine), signal = countingSignal(); let completed = 0, durability;
    const result = await faultOn(IDBDatabase.prototype, 'transaction', function(original, args) {
      const tx = original.apply(this, args);
      if (args[1] === 'readwrite') { durability = tx.durability; tx.addEventListener('complete', () => { completed++; signal.controller.abort(); }); }
      return tx;
    }, () => outcome(adapter.save({ expectedGeneration: null, signal: signal.signal })));
    check(result.value?.durable === true, 'authoritative real transaction completion remains success across same-event late cancellation');
    equal([completed, durability, signal.listeners.size], [1, 'strict', 0], 'one observed strict-hint commit and released listener'); const rows = await databaseRows(); equal(rows.stores.metadata[0].generation, result.value.generation, 'observed durable generation actually stored');
    return { result, completed, durability, remainingSignalListeners: signal.listeners.size, rows: summaryRows(rows), trigger: 'Real IDB complete listener aborts synchronously before adapter completion-handler Promise delivery' };
  },
  async lostDurableCompletion() {
    const engine = await populated(), adapter = storage(engine, 'primary', { operationTimeoutMs: 500 }); let actualCompleteEvents = 0;
    const failed = await faultOn(IDBDatabase.prototype, 'transaction', function(original, args) {
      const tx = original.apply(this, args); if (args[1] !== 'readwrite') return tx;
      tx.addEventListener('complete', () => actualCompleteEvents++);
      return new Proxy(tx, {
        get(target, key) { const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value; },
        set(target, key, value) { if (key === 'oncomplete' && value !== null) return true; return Reflect.set(target, key, value, target); },
      });
    }, () => outcome(adapter.save({ expectedGeneration: null })));
    equal([failed.error?.code, actualCompleteEvents], ['OUTCOME_UNKNOWN', 1], 'unobserved real committed transaction completion cannot become known rollback');
    const rows = await databaseRows(); equal(rows.stores.metadata.length, 1, 'actual durable data remains present after completion delivery loss'); const loaded = await adapter.load(); equal(loaded.generation, rows.stores.metadata[0].generation, 'explicit load recovers actual selected generation');
    return { failed, actualCompleteEvents, rows: summaryRows(rows), loaded, injection: 'Real IDBTransaction complete event occurs; live transaction proxy deliberately discards only adapter oncomplete assignment while preserving native requests/abort/events' };
  },
  async corruptLoad() {
    const engine = await populated(), adapter = storage(engine), saved = await adapter.save({ expectedGeneration: null }), target = await populated(), recovery = storage(target);
    const before = await target.search('red', { extensions: evidenceRequests[2] }), rows = await databaseRows(), clean = rows.stores.snapshots[0].encoded;
    const cleanSnapshot = clone(rows.stores.snapshots[0]), cleanMetadata = clone(rows.stores.metadata[0]);
    const incompatibleAnalyzer = changedSnapshot(clean, envelope => { envelope.body.header.analyzer.id = 'foreign'; });
    const corruptions = [
      ['malformed encoding', snapshot => ({ ...snapshot, encoded: '{' }), metadata => ({ ...metadata, encodedBytes: 1 })],
      ['incompatible format', snapshot => ({ ...snapshot, encoded: clean.replace('raveldex-source', 'foreign-source') }), metadata => ({ ...metadata, encodedBytes: new TextEncoder().encode(clean.replace('raveldex-source', 'foreign-source')).length })],
      ['metadata format flip', snapshot => snapshot, metadata => ({ ...metadata, format: 'raveldex-native' })],
      ['encoded byte count mismatch', snapshot => snapshot, metadata => ({ ...metadata, encodedBytes: metadata.encodedBytes + 1 })],
      ['generation mismatch', snapshot => ({ ...snapshot, generation: crypto.randomUUID() }), metadata => metadata],
      ['metadata extra property', snapshot => snapshot, metadata => ({ ...metadata, extra: 'not-owned-schema' })],
      ['incompatible analyzer with valid independent checksum', snapshot => ({ ...snapshot, encoded: incompatibleAnalyzer }), metadata => ({ ...metadata, encodedBytes: new TextEncoder().encode(incompatibleAnalyzer).length })],
    ]; const results = [];
    for (const [label, changeSnapshot, changeMetadata] of corruptions) {
      await rewriteRows('primary', () => ({ snapshot: changeSnapshot(clone(cleanSnapshot)), metadata: changeMetadata(clone(cleanMetadata)) }));
      const failed = await outcome(recovery.load()); check(failed.error, 'corrupt snapshot rejects'); equal(await target.search('red', { extensions: evidenceRequests[2] }), before, 'failed restore preserves exact previous root and add-ons'); results.push({ label, failed });
      if (label.startsWith('incompatible analyzer')) equal([failed.error.code, failed.error.details.snapshotReason], ['INCOMPATIBLE_SNAPSHOT', 'ANALYZER_MISMATCH'], 'compatibility decision distinct from corrupt encoded input');
    }
    await rewriteRows('primary', (snapshot, metadata) => ({ snapshot: { ...snapshot, encoded: clean }, metadata: { ...metadata, encodedBytes: new TextEncoder().encode(clean).length } }));
    const native = storage(engine, 'native', { format: 'native' }), nativeRefusal = await outcome(native.save({ expectedGeneration: null })); check(nativeRefusal.error, 'unqualified browser native encoding refuses before durable transaction');
    const recovered = await recovery.load(); equal(recovered.generation, saved.generation, 'explicit corrected durable data restores');
    return { saved, results, nativeRefusal, recovered, fullComparisons: corruptions.length };
  },
  async orphanRecovery() {
    const engine = await populated(), adapter = storage(engine), saved = await adapter.save({ expectedGeneration: null });
    const database = await openDatabase(); const transaction = database.transaction('metadata', 'readwrite'), completion = done(transaction); transaction.objectStore('metadata').delete('primary'); await completion; database.close();
    const failed = await outcome(adapter.load()); equal(failed.error?.code, 'CORRUPT_DATA', 'orphan snapshot is explicit corruption');
    const erased = await adapter.erase({ expectedGeneration: null }), rows = await databaseRows(); equal(erased.erased, true, 'missing generation token explicitly erases orphan payload'); for (const entries of Object.values(rows.stores)) equal(entries, [], 'all orphan namespace artifacts removed');
    const recreated = await adapter.save({ expectedGeneration: null }); check(recreated.generation !== saved.generation, 'explicit recovery creates new generation');
    return { saved, failed, erased, rows: summaryRows(rows), recreated };
  },
  async schemaRecovery() {
    const engine = await populated(), results = [];
    for (const variant of ['future-version', 'unexpected-store', 'unexpected-keypath', 'unexpected-index']) {
      const databaseName = dbName + '-' + variant;
      const database = await openDatabase(databaseName, variant === 'future-version' ? 2 : 1, database => {
        if (variant === 'future-version' || variant === 'unexpected-store') database.createObjectStore('unexpected', { keyPath: 'namespace' });
        else { database.createObjectStore('metadata', { keyPath: 'namespace' }); const store = database.createObjectStore('snapshots', { keyPath: variant === 'unexpected-keypath' ? 'foreign' : 'namespace' }); if (variant === 'unexpected-index') store.createIndex('foreign', 'namespace'); }
      }); database.close();
      const adapter = storage(engine, 'primary', { databaseName }); const failed = await outcome(adapter.load()); equal(failed.error?.code, 'INCOMPATIBLE_DATABASE', 'incompatible owned database rejected explicitly without deleting');
      const inspected = await new Promise((yes, no) => { const r = indexedDB.open(databaseName); r.onsuccess = () => { const db = r.result; yes({ version: db.version, stores: [...db.objectStoreNames] }); db.close(); }; r.onerror = () => no(r.error); });
      equal(inspected.stores.sort(), variant === 'future-version' || variant === 'unexpected-store' ? ['unexpected'] : ['metadata', 'snapshots'], 'schema failure preserves external database'); await adapter.dispose(); await request(indexedDB.deleteDatabase(databaseName));
      const recovered = storage(engine, 'primary', { databaseName }); const saved = await recovered.save({ expectedGeneration: null }); results.push({ variant, failed, preserved: inspected, saved });
    }
    return { results, recovery: 'Application explicitly deletes malformed dedicated test database then opens new owned schema; adapter never destructively migrates it' };
  },
  async blocked() {
    const engine = await populated(), adapter = storage(engine), saved = await adapter.save({ expectedGeneration: null }); await adapter.dispose();
    const held = await openDatabase(); let blockedEvents = 0, lateSuccesses = 0, lateErrors = 0, closes = 0;
    held.onversionchange = () => {}; // Deliberately model an older tab refusing to release its connection.
    return faultOn(IDBDatabase.prototype, 'close', function(original, args) { if (this.name === dbName && this.version === 2) closes++; return original.apply(this, args); }, async () => {
      const blockedFactory = factory(name => {
        const r = indexedDB.open(name, 2); r.addEventListener('blocked', () => blockedEvents++);
        r.addEventListener('success', () => { lateSuccesses++; }); r.addEventListener('error', () => { lateErrors++; }); return r;
      });
      const blockedAdapter = storage(engine, 'primary', { indexedDB: blockedFactory, openTimeoutMs: 50 }); const failed = await outcome(blockedAdapter.load()); equal(failed.error?.code, 'BLOCKED', 'actual blocked event has explicit failure'); check(blockedEvents > 0, 'genuine IndexedDB blocked event observed');
      held.close(); for (let index = 0; index < 100 && !lateErrors; index++) await pause(2); equal([lateSuccesses, lateErrors], [0, 1], 'stopped late incompatible upgrade is aborted before successful connection');
      const unchanged = await databaseRows(); equal(unchanged.version, 1, 'cancelled upgrade preserves existing database version');
      return { saved, failed, blockedEvents, lateSuccesses, lateErrors, closes, unchanged: summaryRows(unchanged), injection: 'Factory wrapper forwards requested v1 open as genuine v2 upgrade against held v1 connection; actual blocked event settles action and later actual upgrade is aborted before a new successful connection' };
    });
  },
  async lateOpen() {
    const engine = await populated(), databaseName = dbName + '-late-open'; let successfulNativeOpens = 0, closes = 0;
    return faultOn(IDBDatabase.prototype, 'close', function(original, args) { if (this.name === databaseName) closes++; return original.apply(this, args); }, async () => {
      const delayedFactory = factory((...args) => {
        const opening = indexedDB.open(...args);
        return new Proxy(opening, {
          get(target, key) { const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value; },
          set(target, key, value) {
            if (key === 'onsuccess' && value !== null) { target.onsuccess = event => { successfulNativeOpens++; setTimeout(() => value.call(target, event), 80); }; return true; }
            return Reflect.set(target, key, value, target);
          },
        });
      });
      const adapter = storage(engine, 'primary', { databaseName, indexedDB: delayedFactory, openTimeoutMs: 20 });
      const failed = await outcome(adapter.load()); equal(failed.error?.code, 'TIMEOUT', 'delayed open delivery exceeds finite open bound');
      for (let index = 0; index < 100 && !closes; index++) await pause(2); equal([successfulNativeOpens, closes], [1, 1], 'late actual successful opened connection is closed');
      await request(indexedDB.deleteDatabase(databaseName));
      return { failed, successfulNativeOpens, closes, injection: 'Real IDBOpenDBRequest success event and database exist; live request proxy delays only adapter success-handler delivery by80ms against20ms open bound' };
    });
  },
  async versionchange() {
    const engine = await populated(); let opened, closes = 0, versionchanges = 0;
    const traced = factory((...arguments_) => {
      const r = indexedDB.open(...arguments_); r.addEventListener('success', () => {
        opened = r.result; const close = opened.close.bind(opened); opened.close = () => { closes++; close(); };
        opened.addEventListener('versionchange', () => versionchanges++);
      }); return r;
    });
    const adapter = storage(engine, 'primary', { indexedDB: traced }); const saved = await adapter.save({ expectedGeneration: null });
    const upgraded = await openDatabase(dbName, 2); upgraded.close();
    equal([versionchanges, closes], [1, 1], 'real external upgrade closes adapter-owned cached connection');
    const failed = await outcome(adapter.load()); equal(failed.error?.code, 'INCOMPATIBLE_DATABASE', 'later action refuses incompatible database version');
    const state = await engine.search('red'); equal(state.total, 3, 'version change leaves memory intact');
    return { saved, versionchanges, closes, failed, state, physical: 'Actual external indexedDB.open(name,2) dispatches versionchange to live adapter v1 connection' };
  },
  async earlyStops() {
    const engine = await populated(); let opens = 0; const adapter = storage(engine, 'stops', { indexedDB: factory((...args) => { opens++; return indexedDB.open(...args); }) });
    const signal = countingSignal(); signal.controller.abort(); const aborted = await outcome(adapter.save({ expectedGeneration: null, signal: signal.signal }));
    const deadline = await outcome(adapter.load({ deadlineMs: 0 }));
    check(aborted.error && deadline.error, 'early stop rejects'); equal([opens, signal.listeners.size], [0, 0], 'no early storage side effects or retained signal');
    return { aborted, deadline, opens, remainingSignalListeners: signal.listeners.size };
  },
  async queuedLifecycle() {
    const engine = await populated(), native = createSnapshots(engine); let release, entered = false;
    const gate = new Promise(yes => { release = yes; });
    const borrowed = { exportSource: async options => { const encoded = await native.exportSource(options); entered = true; await gate; return encoded; }, restore: native.restore.bind(native) };
    const adapter = createIndexedDBPersistence(borrowed, { databaseName: dbName, namespace: 'queue', operationTimeoutMs: 2000 }); persistenceHandles.add(adapter);
    const first = outcome(adapter.save({ expectedGeneration: null }));
    for (let index = 0; index < 100 && !entered; index++) await pause(2); check(entered, 'actual source export reached deliberately held borrowed delivery');
    const signal = countingSignal(), cancelled = outcome(adapter.load({ signal: signal.signal })), deadline = outcome(adapter.load({ deadlineMs: 1 }));
    const queued = Array.from({ length: 61 }, () => outcome(adapter.load()));
    const overflow = await outcome(adapter.load()); equal(overflow.error?.code, 'QUEUE_FULL', '64 pending action cap remains bounded');
    signal.controller.abort(); const cancelledResult = await cancelled, deadlineResult = await deadline;
    equal(cancelledResult.error?.code, 'CANCELLED', 'queued cancellation settles before held predecessor'); equal(deadlineResult.error?.code, 'TIMEOUT', 'queued deadline includes FIFO wait'); equal(signal.listeners.size, 0, 'queued signal released promptly');
    await adapter.dispose(); const firstResult = await first, remaining = await Promise.all(queued); release();
    check(firstResult.error && remaining.every(row => row.error), 'dispose settles pending serialization and queued actions');
    const state = await engine.search('red'); equal(state.total, 3, 'borrowed engine remains usable after adapter queue disposal');
    return { first: firstResult, cancelled: cancelledResult, deadline: deadlineResult, overflow, remaining, state, remainingSignalListeners: signal.listeners.size, injection: 'Public borrowed snapshot handle holds actual completed export delivery; no production/private hook or alternate engine' };
  },
  async cancelSave() {
    const engine = direct(), adapter = storage(engine); const many = Array.from({ length: 40 }, (_, index) => ({ id: `heavy-${index}`, text: { title: 'red apple transaction '.repeat(100), body: 'blue' } })); await engine.addMany(many);
    const signal = countingSignal(), pending = adapter.save({ expectedGeneration: null, signal: signal.signal }); setTimeout(() => signal.controller.abort(), 2); const stopped = await outcome(pending); check(stopped.error, 'mid-serialization signal stops save');
    const durable = await adapter.load(); equal(durable, { status: 'missing', generation: null }, 'cancelled serialization produces no durable namespace');
    const memory = await engine.search('red', { limit: 0 }); equal(memory.total, many.length, 'borrowed memory state intact'); equal(signal.listeners.size, 0, 'serialization stop releases signal');
    return { stopped, durable, memory, remainingSignalListeners: signal.listeners.size, trigger: 'Actual host timer abort during resumable source encoding' };
  },
  async cancelLoad() {
    const source = direct(), many = Array.from({ length: 40 }, (_, index) => ({ id: `heavy-${index}`, text: { title: 'red apple transaction '.repeat(100), body: 'blue' } })); await source.addMany(many); const saved = await storage(source, 'primary', { operationTimeoutMs: 10000 }).save({ expectedGeneration: null });
    const target = await populated(), adapter = storage(target), before = await target.search('red', { extensions: evidenceRequests[2] }), signal = countingSignal();
    const pending = adapter.load({ signal: signal.signal }); setTimeout(() => signal.controller.abort(), 5); const stopped = await outcome(pending); check(stopped.error, 'load abort rejects'); equal(await target.search('red', { extensions: evidenceRequests[2] }), before, 'load abort preserves exact previous core and participants'); equal(signal.listeners.size, 0, 'load stop releases signal');
    return { saved, stopped, before, remainingSignalListeners: signal.listeners.size, fullComparisons: 1, trigger: 'Actual host timer abort during load/validated source restore' };
  },
  async disposal() {
    const engine = await populated(); let opening;
    const adapter = storage(engine, 'dispose', { indexedDB: factory(name => { opening = indexedDB.open(name, 1); return opening; }) });
    const pending = adapter.save({ expectedGeneration: null }); const disposed = adapter.dispose(); const result = await outcome(pending); await disposed; check(result.error, 'dispose settles unfinished action');
    const later = await outcome(adapter.load()); check(later.error, 'disposed persistence handle rejects later action'); const state = await engine.search('red'); equal(state.total, 3, 'borrowed engine remains alive');
    return { result, later, state, requestStarted: !!opening };
  },
  async workerParity() {
    const remote = await workerEngine(), original = await populated(); await remote.engine.add({ id: 'old', text: { title: 'old' } });
    const source = createIndexedDBPersistence(createSnapshots(original), { databaseName: dbName, namespace: 'worker' }); persistenceHandles.add(source);
    const saved = await source.save({ expectedGeneration: null }), loaded = await remote.persistence.load(); equal([loaded.restore.revision, loaded.restore.reindexed], [2, true], 'worker atomic next-revision load');
    const comparisons = await completeComparisons(remote.engine, original);
    await remote.engine.replace({ id: 'a', text: { title: 'green car', body: 'green' } }); const laterSave = await remote.persistence.save({ expectedGeneration: saved.generation });
    const target = direct(), recovery = createIndexedDBPersistence(createSnapshots(target), { databaseName: dbName, namespace: 'worker' }); persistenceHandles.add(recovery); const directLoad = await recovery.load(), state = await target.search('green'); equal(state.hits.map(hit => hit.id), ['a'], 'worker changed/save loads direct');
    await remote.engine.dispose(); equal([remote.worker.count(), remote.worker.terminated], [0, 1], 'worker disposal releases transport exactly once');
    return { saved, loaded, laterSave, directLoad, state, ...comparisons, transport: remote.worker.stats() };
  },
  async workerLostRestore() {
    const donor = await populated(), source = createIndexedDBPersistence(createSnapshots(donor), { databaseName: dbName, namespace: 'worker' }); persistenceHandles.add(source); const saved = await source.save({ expectedGeneration: null });
    const remote = await workerEngine(); remote.worker.onReply = message => !(message.operation === 'snapshotRestore' && message.kind === 'result');
    const failed = await outcome(remote.persistence.load()); check(failed.error, 'lost actual restore reply cannot claim observed success');
    equal(failed.error.code, 'OUTCOME_UNKNOWN', 'dispatched missing restore reply reports unknown, not rollback');
    const operationId = failed.error.details?.operationId; check(typeof operationId === 'string' && operationId.length > 0, 'unknown result retains restore operation identity');
    const receipt = await remote.snapshots.reconcile(operationId); equal(receipt.status, 'committed', 'authoritative restore receipt identifies actual commit');
    const wrongDomain = await outcome(remote.engine.reconcile(operationId)); check(wrongDomain.error, 'ordinary mutation reconcile cannot substitute for snapshot receipt');
    const state = await remote.engine.search('red'); equal(state.total, 3, 'worker actually committed complete restored core');
    return { saved, failed, receipt, wrongDomain, state, transport: remote.worker.stats(), responses: remote.worker.responses.map(row => ({ operation: row.operation, kind: row.kind, id: row.id })), injection: 'Actual worker restore reply received by wrapper then deliberately dropped before client listeners' };
  },
  async workerCommittedAbort() {
    const donor = await populated(), source = createIndexedDBPersistence(createSnapshots(donor), { databaseName: dbName, namespace: 'worker' }); persistenceHandles.add(source); const saved = await source.save({ expectedGeneration: null });
    const remote = await workerEngine(), signal = countingSignal(); let committedReplies = 0;
    remote.worker.afterReply = message => { if (message.operation === 'snapshotRestore' && message.kind === 'result') { committedReplies++; signal.controller.abort(); } };
    const result = await outcome(remote.persistence.load({ signal: signal.signal })); check(result.value?.status === 'restored', 'already observed committed worker restore remains successful across same-event late abort');
    equal([committedReplies, signal.listeners.size], [1, 0], 'one actual result event and no retained cancellation subscription'); const state = await remote.engine.search('red'); equal(state.total, 3, 'late stop cannot undo committed restored root');
    return { saved, result, state, committedReplies, remainingSignalListeners: signal.listeners.size, trigger: 'Signal abort synchronously after actual Worker result event is delivered to client listeners, before Promise microtask delivery to storage' };
  },
  async workerWireLimit() {
    const remote = await workerEngine({ maxMessageBytes: 16384 });
    for (let index = 0; index < 40; index++) await remote.engine.add({ id: `bounded-${index}`, text: { title: 'x '.repeat(250) } });
    const failed = await outcome(remote.persistence.save({ expectedGeneration: null })); check(failed.error, 'complete encoded snapshot reply exceeding negotiated wire cap fails');
    const directTarget = direct(), adapter = createIndexedDBPersistence(createSnapshots(directTarget), { databaseName: dbName, namespace: 'worker' }); persistenceHandles.add(adapter); const durable = await adapter.load(); equal(durable.status, 'missing', 'oversized export produces no persisted data');
    const state = await remote.engine.search({ kind: 'all' }, { limit: 0 }); equal(state.total, 40, 'transport bound does not remove engine data');
    return { failed, durable, state, transport: remote.worker.stats(), negotiatedWireBytes: 16384 };
  },
  async workerDeath() {
    const donor = await populated(), source = createIndexedDBPersistence(createSnapshots(donor), { databaseName: dbName, namespace: 'worker' }); persistenceHandles.add(source); const saved = await source.save({ expectedGeneration: null });
    const remote = await workerEngine(); remote.worker.onSend = message => { if (message.operation === 'snapshotRestore') { remote.worker.terminate(); return false; } };
    const stopped = await outcome(remote.persistence.load()); check(stopped.error, 'actual terminated worker settles pending load');
    const disposal = await outcome(remote.engine.dispose()); handles.delete(remote.engine); check(disposal.error && remote.worker.count() === 0, 'dead host disposal failure remains visible while local transport listeners release');
    const replacement = await workerEngine(), loaded = await replacement.persistence.load(), state = await replacement.engine.search('red'); equal(state.total, 3, 'new real worker recovers same durable generation'); equal(loaded.generation, saved.generation, 'worker death does not erase storage');
    return { saved, stopped, disposal, loaded, state, deadTransport: remote.worker.stats(), recoveredTransport: replacement.worker.stats(), injection: 'Worker terminated immediately before intercepted restore request post; response timeout settles pending transport, unavailable host disposal also rejects explicitly and releases local listeners' };
  },
  async prepareReload() {
    const corpus = await (await fetch('./corpus.json')).json(); const engine = createRaveldex({ schema: corpus.schema, addons: [createSourceProvider({ fields: ['title', 'body'] })] }); handles.add(engine); await engine.addMany(corpus.records);
    const adapter = createIndexedDBPersistence(createSnapshots(engine), { databaseName: dbName, namespace: 'docs-reload' }); persistenceHandles.add(adapter); const saved = await adapter.save({ expectedGeneration: null }); await adapter.dispose(); await engine.dispose(); return saved;
  },
  async completeReload() {
    const corpus = await (await fetch('./corpus.json')).json(), judgments = await (await fetch('./judgments.json')).json(); const engine = createRaveldex({ schema: corpus.schema, addons: [createSourceProvider({ fields: ['title', 'body'] })] }); handles.add(engine);
    const adapter = createIndexedDBPersistence(createSnapshots(engine), { databaseName: dbName, namespace: 'docs-reload' }); persistenceHandles.add(adapter); const receipt = await adapter.load(), rows = [];
    for (const row of judgments) rows.push({ query: row.query, result: await engine.search(row.query, { limit: 100 }) });
    const first = corpus.records[0]; await engine.replace({ ...first, text: { ...first.text, title: 'uniquepersistedreplacement' } }); const changed = await engine.search('uniquepersistedreplacement'); equal(changed.total, 1, 'real documents accept later mutation');
    const saved = await adapter.save({ expectedGeneration: receipt.generation });
    return { receipt, saved, changed, corpusHash: corpus.hash, records: corpus.records, schema: corpus.schema, queries: rows };
  },
  async cleanup() {
    const results = [];
    for (const adapter of persistenceHandles) { try { await adapter.dispose(); results.push({ kind: 'persistence', status: 'Pass' }); } catch (error) { results.push({ kind: 'persistence', error: String(error) }); } }
    for (const engine of handles) { try { await engine.dispose(); results.push({ kind: 'engine', status: 'Pass' }); } catch (error) { results.push({ kind: 'engine', error: String(error) }); } }
    for (const worker of realWorkers) worker.terminate(); persistenceHandles.clear(); handles.clear(); realWorkers.clear(); return results;
  },
};
