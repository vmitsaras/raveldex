import { createRaveldex, RaveldexError } from '@vmitsaras/raveldex';
import { createWorkerRaveldex, WorkerAdapterError } from '@vmitsaras/raveldex/adapters/worker';
import { configuration, records, queries, evidenceRequests, text, phrase, mismatchedAddonVariants } from './shared-fixture.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const equal = (actual, expected, label) => { if (JSON.stringify(canonical(clone(actual))) !== JSON.stringify(canonical(clone(expected)))) throw new Error(`${label}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`); };
const check = (value, label) => { if (!value) throw new Error(label); };
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const outcome = promise => promise.then(value => ({ value }), error => ({ error: {
  name: error.name, code: error.code, details: error.details, operationId: error.operationId,
  coreClass: error instanceof RaveldexError, adapterClass: error instanceof WorkerAdapterError,
} }));
const handles = new Set(), realWorkers = new Set();
const wireBytes = data => new TextEncoder().encode(JSON.stringify(data)).length;

class InstrumentedWorker {
  constructor(real) {
    this.real = real; this.listeners = new Map(); this.requests = []; this.responses = [];
    this.bytesSent = 0; this.bytesReceived = 0; this.terminated = 0; this.held = []; this.posted = []; this.delivered = []; this.diagnostics = [];
    this.onSend = undefined; this.onReply = undefined;
    for (const type of ['message', 'error', 'messageerror']) real.addEventListener(type, event => {
      if (type !== 'message') { this.emit(type, event); return; }
      this.responses.push(clone(event.data)); this.bytesReceived += wireBytes(event.data);
      if (event.data?.fixture === 'duplicate-host') { this.diagnostics.push(clone(event.data)); return; }
      if (this.onReply?.(event.data, this) === false) return;
      this.emit('message', event);
    });
  }
  postMessage(message) {
    this.requests.push(clone(message)); this.bytesSent += wireBytes(message);
    if (this.onSend?.(message, this) === false) return;
    this.forward(message);
  }
  forward(message) { this.posted.push(clone(message)); this.real.postMessage(message); }
  addEventListener(type, listener) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(listener); }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  emit(type, event) { if (type === 'message') this.delivered.push(clone(event.data)); for (const listener of [...this.listeners.get(type) ?? []]) typeof listener === 'function' ? listener(event) : listener.handleEvent(event); }
  reply(data) { this.emit('message', { data }); }
  release() { for (const data of this.held.splice(0)) this.reply(data); }
  terminate() { this.terminated++; this.real.terminate(); }
  listenerCount() { return [...this.listeners.values()].reduce((sum, list) => sum + list.size, 0); }
  stats() { return { requests: this.requests.length, responses: this.responses.length, bytesSent: this.bytesSent, bytesReceived: this.bytesReceived,
    largestSentEnvelope: Math.max(0, ...this.requests.map(wireBytes)), largestReceivedEnvelope: Math.max(0, ...this.responses.map(wireBytes)),
    actualPostMessageCalls: this.posted.length, actualPostedEnvelopeBytes: this.posted.reduce((sum, message) => sum + wireBytes(message), 0),
    actualWorkerResponseEvents: this.responses.length, clientDeliveredMessageEvents: this.delivered.length, deliveredEnvelopeBytes: this.delivered.reduce((sum, message) => sum + wireBytes(message), 0),
    listenerCount: this.listenerCount(), terminated: this.terminated }; }
}
function spawn(strategy = 'source', parameters = '') {
  const url = new URL('./engine-worker.mjs', import.meta.url); url.search = `?strategy=${strategy}${parameters}`;
  // This is the documented public bundler path, exercised after real tarball installation.
  const real = new Worker(url, { type: 'module' }); realWorkers.add(real);
  return new InstrumentedWorker(real);
}
async function engine(strategy = 'source', options = {}, configurationExtras = {}, params = '') {
  const worker = spawn(strategy, params);
  const result = await createWorkerRaveldex({ worker, configuration: configuration(strategy, configurationExtras), ownership: 'owned', sameHost: true, responseTimeoutMs: 400, ...options });
  handles.add(result); return { engine: result, worker };
}
function countingSignal() {
  const controller = new AbortController(), listeners = new Set();
  return { controller, listeners, signal: { get aborted() { return controller.signal.aborted; },
    addEventListener(type, listener, options) { listeners.add(listener); controller.signal.addEventListener(type, listener, options); },
    removeEventListener(type, listener) { listeners.delete(listener); controller.signal.removeEventListener(type, listener); },
  } };
}
const heavy = () => Array.from({ length: 160 }, (_, index) => ({ id: `large-${index}`, text: { title: 'red apple transaction '.repeat(600) } }));

window.workerHarness = {
  async reentrantSignalFIFO() {
    const remote = await engine('core', { responseTimeoutMs: 750 }), direct = createRaveldex(configuration('core')); handles.add(direct);
    async function run(owner) {
      const attached = new Set(); let nested;
      const signal = { aborted: false,
        addEventListener(type, listener) { attached.add(listener); if (!nested) nested = owner.add({ id: 'nested', text: { title: 'blue' } }); },
        removeEventListener(type, listener) { attached.delete(listener); },
      };
      const outer = owner.add({ id: 'outer', text: { title: 'red' } }, { signal });
      const results = await Promise.all([outcome(outer), outcome(nested)]);
      const state = await owner.search({ kind: 'all' });
      return { results, state, remainingSignalListeners: attached.size };
    }
    const expected = await run(direct), actual = await run(remote.engine);
    equal(actual, expected, `reentrant signal callback preserves direct FIFO ${JSON.stringify(actual)}`);
    equal(actual.results.map(row => row.value?.revision), [1, 2], 'outer publication precedes synchronous nested signal callback');
    equal([actual.state.revision, actual.state.total, actual.remainingSignalListeners], [2, 2, 0], 'both writes one owner and all signal listeners released');
    await remote.engine.dispose(); await direct.dispose(); return { expected, actual, fullComparisons: 3, transport: remote.worker.stats(),
      trigger: 'Structural user signal.addEventListener synchronously invokes nested ordinary add during outer call admission' };
  },
  async singleOwners() {
    const remote = await engine('core', { responseTimeoutMs: 300 }, {}, '&fault=duplicate-host');
    while (!remote.worker.diagnostics.length) await pause(2);
    const host = remote.worker.diagnostics[0];
    equal(host.second, { name: 'WorkerAdapterError', code: 'INCOMPATIBLE_WORKER' }, `duplicate same-scope host guard ${JSON.stringify(host)}`);
    equal([host.before, host.after], [2, 2], 'duplicate host installs no extra listeners/owner');
    await remote.engine.add({ id: 'first-owner', text: { title: 'red' } });
    const beforeTermination = remote.worker.terminated;
    const duplicate = await outcome(createWorkerRaveldex({ worker: remote.worker, configuration: configuration('core'), ownership: 'owned', sameHost: true, responseTimeoutMs: 100 }));
    equal(duplicate.error?.code, 'INCOMPATIBLE_WORKER', 'duplicate live client rejects before second handshake');
    equal(remote.worker.terminated, beforeTermination, 'duplicate client cannot terminate existing owned worker');
    const state = await remote.engine.search('red'); equal([state.revision, state.total, state.hits[0].id], [1, 1, 'first-owner'], 'original client stays searchable');
    await remote.engine.dispose(); equal([remote.worker.terminated, remote.worker.listenerCount()], [1, 0], 'original client owns one termination');
    const concurrentWorker = spawn('core');
    const pending = createWorkerRaveldex({ worker: concurrentWorker, configuration: configuration('core'), ownership: 'owned', sameHost: true, responseTimeoutMs: 500 });
    const simultaneous = await outcome(createWorkerRaveldex({ worker: concurrentWorker, configuration: configuration('core'), ownership: 'owned', sameHost: true, responseTimeoutMs: 100 }));
    equal(simultaneous.error?.code, 'INCOMPATIBLE_WORKER', 'duplicate concurrent startup rejects');
    equal(concurrentWorker.terminated, 0, 'concurrent duplicate cannot terminate starting worker');
    const first = await pending; handles.add(first); await first.add({ id: 'concurrent-owner', text: { title: 'blue' } });
    const concurrentState = await first.search('blue'); equal(concurrentState.hits.map(hit => hit.id), ['concurrent-owner'], 'first concurrent startup usable');
    await first.dispose(); equal([concurrentWorker.terminated, concurrentWorker.listenerCount()], [1, 0], 'concurrent first releases once');
    return { host, duplicate, state, simultaneous, concurrentState, firstOwner: remote.worker.stats(), concurrentOwner: concurrentWorker.stats() };
  },
  async parity(strategy) {
    const remote = await engine(strategy), direct = createRaveldex(configuration(strategy)); handles.add(direct);
    const results = [], compare = async (name, method, ...args) => {
      const actual = await outcome(remote.engine[method](...args));
      const expected = await outcome(direct[method](...args)); equal(actual, expected, `${strategy}/${name}`); results.push({ name, actual }); return actual;
    };
    const input = clone(records), admittedRemote = remote.engine.addMany(input), admittedDirect = direct.addMany(input);
    input[0].text.title = 'caller changed'; input[0].metadata.category.push('caller changed');
    equal(await admittedRemote, await admittedDirect, 'capture input ownership');
    for (const [query, membership] of queries) {
      const complete = await compare(`query-${results.length}`, 'search', query, { limit: 100 });
      equal(complete.value.hits.map(hit => hit.id).sort(), [...membership].sort(), 'literal independent membership');
      for (const options of [{ limit: 0 }, { offset: 1, limit: 2 }, { offset: 5, limit: 1 }]) await compare('page', 'search', query, options);
      for (const extensions of evidenceRequests) await compare(Object.keys(extensions)[0], 'search', query, { limit: 2, offset: 1, extensions });
    }
    const original = await remote.engine.search({ kind: 'text', text: 'red', fields: ['body'] }, { extensions: { 'match-evidence': { ids: ['a'] } } });
    equal(original.extensions['match-evidence'].documents[0].ranges, [
      { field: 'body', valueIndex: 0, position: 0, start: 0, end: 3, term: 'red' },
      { field: 'body', valueIndex: 0, position: 2, start: 9, end: 12, term: 'red' },
    ], 'hand UTF-16 spans');
    const normalized = await remote.engine.search('file café', { extensions: { 'match-evidence': { ids: ['a'] } } });
    equal(normalized.extensions['match-evidence'].documents[0].ranges, [
      { field: 'body', valueIndex: 1, position: 0, start: 0, end: 3, term: 'file' },
      { field: 'body', valueIndex: 1, position: 1, start: 4, end: 9, term: 'café' },
    ], 'hand original ligature/combining UTF-16 spans');
    await compare('duplicate add', 'add', clone(records[0]));
    await compare('absent replace', 'replace', { id: 'missing', text: { title: 'red' } });
    await compare('atomic duplicate batch', 'addMany', [{ id: 'new', text: { title: 'red' } }, clone(records[0])]);
    await compare('malformed query', 'search', { kind: 'not', child: { kind: 'invalid' } });
    await compare('invalid record', 'add', { id: 'x', text: { title: ['ok', 1] } });
    await compare('missing capability', 'search', { kind: 'extension', capability: 'alien', version: 1, payload: {} });
    await compare('revision mismatch', 'search', 'red', { extensions: { inspector: { ids: ['a'], expectedRevision: 999 } } });
    await compare('remove absent noop', 'remove', 'missing');
    await compare('replace exact noop', 'replace', clone(records[1]));
    await compare('replace changed', 'replace', { id: 'a', text: { title: 'blue car', body: 'blue' }, metadata: { category: ['Reference'], price: 6 } });
    await compare('after replace', 'search', 'red', { extensions: evidenceRequests[0] });
    await compare('remove multiple', 'remove', ['b', 'missing']);
    await compare('after remove', 'search', { kind: 'all' }, { extensions: evidenceRequests[1] });
    await compare('clear changed', 'clear'); await compare('clear noop', 'clear');
    await compare('empty after clear', 'search', 'red');
    await remote.engine.dispose(); await direct.dispose();
    check(remote.worker.listenerCount() === 0 && remote.worker.terminated === 1, 'owned cleanup');
    return { strategy, fullComparisons: results.length + 1, literalQueries: queries.length, originalUtf16Checks: 4, results, transport: remote.worker.stats() };
  },
  async admissionCliffs() {
    const options = { schema: { text: { title: {} } }, limits: { maxAdmissionEntries: 64 } };
    const worker = spawn('core'), remote = await createWorkerRaveldex({ worker, configuration: options, ownership: 'owned', sameHost: true, responseTimeoutMs: 1000 }); handles.add(remote);
    const direct = createRaveldex(options); handles.add(direct); const outcomes = [];
    for (const [name, count, inputOptions, accepted] of [
      ['exact record budget', 60, undefined, true], ['one record entry over', 61, undefined, false],
      ['exact with deadline', 59, { deadlineMs: 1000 }, true], ['one over with deadline', 60, { deadlineMs: 1000 }, false],
    ]) {
      const record = { id: name, text: { title: Array.from({ length: count }, () => 'red') } };
      const actual = await outcome(remote.add(record, inputOptions)), expected = await outcome(direct.add(record, inputOptions)); equal(actual, expected, name);
      check(accepted ? !!actual.value : actual.error?.code === 'LIMIT_EXCEEDED', `${name} exact admission boundary`); outcomes.push({ name, count, actual });
    }
    const signal = countingSignal();
    for (const [name, count, accepted] of [['exact caller signal/deadline budget', 58, true], ['one over caller signal/deadline budget', 59, false]]) {
      const record = { id: name, text: { title: Array.from({ length: count }, () => 'red') } };
      const inputOptions = { signal: signal.signal, deadlineMs: 1000 };
      const actual = await outcome(remote.add(record, inputOptions)), expected = await outcome(direct.add(record, inputOptions)); equal(actual, expected, name);
      check(accepted ? !!actual.value : actual.error?.code === 'LIMIT_EXCEEDED', `${name} exact admission boundary`); outcomes.push({ name, count, actual });
    }
    const query = { kind: 'or', children: Array.from({ length: 20 }, () => ({ kind: 'text', text: 'red' })) };
    for (const [name, inputOptions, accepted] of [['exact query budget', { limit: 1 }, true], ['one query entry over', { limit: 1, offset: 0 }, false]]) {
      const actual = await outcome(remote.search(query, inputOptions)), expected = await outcome(direct.search(query, inputOptions)); equal(actual, expected, name);
      check(accepted ? !!actual.value : actual.error?.code === 'LIMIT_EXCEEDED', `${name} exact query admission boundary`); outcomes.push({ name, actual });
    }
    await remote.dispose(); await direct.dispose(); equal(signal.listeners.size, 0, 'cliff caller signal released');
    return { maxAdmissionEntries: 64, outcomes, fullComparisons: outcomes.length, independentCounts: 'record2keys+text1key+array(length+1)+calleroptionkeys; query2keys+children21keys+20textnodes*2keys+calleroptionkeys; transport live signal must not add caller entries', transport: worker.stats() };
  },
  async numeric() {
    const options = { schema: { text: { title: {} } }, addons: [] };
    const worker = spawn('core'), remote = await createWorkerRaveldex({ worker, configuration: options, ownership: 'owned', sameHost: true, responseTimeoutMs: 500 }); handles.add(remote);
    const direct = createRaveldex(options); handles.add(direct);
    const corpus = [{ id: 'a', text: { title: 'red red car' } }, { id: 'b', text: { title: 'red car' } }, { id: 'c', text: { title: 'blue' } }, { id: 'empty', text: { title: '!!!' } }];
    await remote.addMany(corpus); await direct.addMany(corpus);
    const expected = [.956771409650921, .940007258491471];
    const result = await remote.search('red car'); equal(result, await direct.search('red car'), 'numeric full parity');
    equal(result.hits.map(hit => hit.id), ['a', 'b'], 'numeric literal order');
    result.hits.forEach((hit, i) => check(Math.abs(hit.score - expected[i]) < 1e-12, 'hand-derived numeric BM25'));
    await remote.dispose(); await direct.dispose(); return { result, independentlyExpected: expected, formula: 'N=3,totalLength=6,df(red)=df(car)=2; idf=log(1.6); a length=3,tf red=2; b length=2,tf each=1; k1=1.2,b=.75' };
  },
  async startup() {
    const outcomes = [];
    for (const [name, strategy, extras, params] of [
      ['capability mismatch', 'core', {}, ''],
      ['analyzer mismatch', 'source', { analyzer: { id: 'basic-v1', environmentProfile: 'different-host' } }, ''],
      ['failed worker module', 'source', {}, '&startup=crash'],
    ]) {
      const worker = spawn(strategy, params);
      const result = await outcome(createWorkerRaveldex({ worker, configuration: configuration('source', extras), ownership: 'owned', sameHost: true, responseTimeoutMs: 250 }));
      const expectedCode = name === 'capability mismatch' ? 'INCOMPATIBLE_WORKER' : name === 'analyzer mismatch' ? 'INCOMPATIBLE_CAPABILITY' : 'STARTUP_FAILED';
      equal(result.error?.code, expectedCode, `${name} typed startup outcome`); check(worker.listenerCount() === 0 && worker.terminated === 1, `${name} cleanup`); outcomes.push({ name, result, transport: worker.stats() });
    }
    const worker = spawn('source'); const absentPairing = await outcome(createWorkerRaveldex({ worker, configuration: configuration(), ownership: 'owned', sameHost: false, responseTimeoutMs: 250 }));
    check(!!absentPairing.error, 'unqualified non-same-host rejects'); worker.terminate(); outcomes.push({ name: 'unqualified pairing', result: absentPairing });
    for (const variant of mismatchedAddonVariants()) {
      const worker = spawn('source');
      const result = await outcome(createWorkerRaveldex({ worker, configuration: configuration('source', { addons: variant.addons }), ownership: 'owned', sameHost: true, responseTimeoutMs: 500 }));
      check(result.error?.code === 'INCOMPATIBLE_WORKER', `${variant.name} semantic options mismatch startup rejects`);
      check(worker.listenerCount() === 0 && worker.terminated === 1, `${variant.name} mismatch cleanup`);
      outcomes.push({ name: variant.name, result, transport: worker.stats() });
    }
    return outcomes;
  },
  async reordered() {
    const remote = await engine('core'); await remote.engine.addMany(records);
    remote.worker.onReply = (message, proxy) => {
      if (message.operation === 'search') { proxy.held.push(clone(message)); if (proxy.held.length === 2) { const reversed = proxy.held.splice(0).reverse(); for (const reply of reversed) { proxy.reply(reply); proxy.reply(reply); } } return false; }
    };
    const results = await Promise.all([remote.engine.search('red'), remote.engine.search('blue')]);
    equal(results.map(result => result.hits.map(hit => hit.id).sort()), [['a', 'b', 'd'], ['a', 'c']], 'reordered/duplicate IDs preserve identity');
    remote.worker.onReply = undefined; await remote.engine.dispose();
    return { results, transport: remote.worker.stats(), delivery: 'two actual search replies reversed and each duplicated' };
  },
  async replayLiveMutation() {
    const remote = await engine('core', { responseTimeoutMs: 2000 }, { limits: { checkpointWorkUnits: 64 } });
    let duplicated = false;
    remote.worker.onSend = (message, proxy) => { if (message.operation === 'add' && !duplicated) { duplicated = true; proxy.forward(message); proxy.forward(message); return false; } };
    const pending = remote.engine.add({ id: 'replay', text: { title: 'red apple '.repeat(100) } });
    const result = await outcome(pending); check(!!result.value || result.error?.code === 'OUTCOME_UNKNOWN', 'active replay cannot turn committed write into false rollback');
    const receipt = await remote.engine.reconcile(pending.operationId); equal(receipt.status, 'committed', 'active replay receipt conclusive');
    check(receipt.result.added === 1 && receipt.result.revision === 1, 'replayed ID executes once');
    const state = await remote.engine.search({ kind: 'all' }); equal([state.revision, state.total], [1, 1], 'same mutation ID no double publication');
    remote.worker.onSend = undefined; await remote.engine.dispose(); return { result, receipt, state, duplication: 'Same actual mutation envelope postMessage twice while native owner yields before first completion', transport: remote.worker.stats() };
  },
  async hostPostCommitLoss() {
    const remote = await engine('core', { responseTimeoutMs: 250 }, {}, '&fault=postcommit-loss');
    const pending = remote.engine.add({ id: 'post-failure', text: { title: 'red' } });
    const result = await outcome(pending); check(result.error?.code === 'OUTCOME_UNKNOWN', 'host send failure cannot replace known commit with false error');
    const receipt = await remote.engine.reconcile(pending.operationId); equal(receipt.status, 'committed', 'postcommit sendfailure keeps receipt');
    const state = await remote.engine.search('red'); equal([state.revision, state.total, state.hits[0].id], [1, 1, 'post-failure'], 'postcommit state authoritative');
    await remote.engine.dispose(); return { result, receipt, state, injection: 'Public host scope wrapper throws for actual add result delivery after engine publication', transport: remote.worker.stats() };
  },
  async knownCommit() {
    const remote = await engine('core', { responseTimeoutMs: 500 });
    remote.worker.onReply = (message, proxy) => { if (message.operation === 'add') { proxy.held.push(clone(message)); return false; } };
    const control = countingSignal(), pending = remote.engine.add({ id: 'committed', text: { title: 'red' } }, { signal: control.signal });
    while (!remote.worker.held.length) await pause(2);
    control.controller.abort(); remote.worker.release(); const result = await outcome(pending);
    check(!!result.value && result.value.changed === true, 'known committed after abort reports commit');
    const receipt = await remote.engine.reconcile(pending.operationId); equal(receipt.status, 'committed', 'receipt committed');
    equal(receipt.result, result.value, 'same actual mutation receipt'); check(control.listeners.size === 0, 'signal cleanup');
    remote.worker.onReply = undefined; await remote.engine.dispose(); return { result, receipt, listenerCount: control.listeners.size, transport: remote.worker.stats() };
  },
  async lostMutation() {
    const remote = await engine('core', { responseTimeoutMs: 60 });
    remote.worker.onReply = message => message.operation === 'add' ? false : undefined;
    const pending = remote.engine.add({ id: 'lost-reply', text: { title: 'red' } }), result = await outcome(pending);
    check(result.error?.code === 'OUTCOME_UNKNOWN', 'lost mutation honest unknown');
    equal(result.error.operationId, pending.operationId, 'unknown has operation identity');
    const receipt = await remote.engine.reconcile(pending.operationId); equal(receipt.status, 'committed', 'lost response receipt proves commit');
    const authoritative = await remote.engine.search('red'); equal(authoritative.hits.map(hit => hit.id), ['lost-reply'], 'state corroborates commit');
    remote.worker.onReply = undefined; await remote.engine.dispose(); return { result, receipt, authoritative, transport: remote.worker.stats() };
  },
  async receiptExpiry() {
    const remote = await engine('core', { responseTimeoutMs: 1000 });
    const first = remote.engine.add({ id: 'one', text: { title: 'red' } }); await first;
    const last = [];
    for (let index = 0; index < 256; index++) { const noop = remote.engine.remove(`absent-${index}`); await noop; if (index > 253) last.push(await remote.engine.reconcile(noop.operationId)); }
    const receipt = await remote.engine.reconcile(first.operationId); equal(receipt.status, 'expired', '256 receipt window expires first');
    check(last.every(row => row.status === 'committed' && row.result.changed === false), 'noop receipts retained truthfully');
    await remote.engine.dispose(); return { mutations: 257, firstOperationId: first.operationId, expired: receipt, newest: last, transport: remote.worker.stats() };
  },
  async cancellation() {
    const remote = await engine('core', { responseTimeoutMs: 5000 }, { limits: { checkpointWorkUnits: 64 } });
    const control = countingSignal();
    const pending = remote.engine.addMany(heavy(), { signal: control.signal, deadlineMs: 5000 }); control.controller.abort();
    const cancelled = await outcome(pending); check(cancelled.error?.code === 'CANCELLED', 'actual precommit worker cancellation');
    const receipt = await remote.engine.reconcile(pending.operationId); equal(receipt.status, 'rejected', 'cancel receipt establishes rollback');
    const state = await remote.engine.search({ kind: 'all' }); equal([state.revision, state.total], [0, 0], 'cancel no root publication');
    check(control.listeners.size === 0, 'cancel signal listener removed');
    const deadline = await outcome(remote.engine.addMany(heavy(), { deadlineMs: 1 })); check(deadline.error?.code === 'DEADLINE_EXCEEDED', 'actual owner deadline');
    const afterDeadline = await remote.engine.search({ kind: 'all' }); equal([afterDeadline.revision, afterDeadline.total], [0, 0], 'deadline no root publication');
    const preaborted = countingSignal(); preaborted.controller.abort(); const requestsBefore = remote.worker.requests.length;
    const aborted = await outcome(remote.engine.add({ id: 'never-sent', text: { title: 'red' } }, { signal: preaborted.signal }));
    check(aborted.error?.code === 'CANCELLED', 'preaborted code'); check(remote.worker.requests.length === requestsBefore, 'preaborted no dispatch');
    await remote.engine.dispose(); return { cancelled, receipt, state, deadline, afterDeadline, aborted, signalListeners: control.listeners.size, transport: remote.worker.stats() };
  },
  async delayedDeadline() {
    const remote = await engine('core', { responseTimeoutMs: 1000 });
    remote.worker.onSend = (message, proxy) => { if (message.operation === 'add') { setTimeout(() => proxy.forward(message), 60); return false; } };
    const pending = remote.engine.add({ id: 'expired-in-transit', text: { title: 'red' } }, { deadlineMs: 10 });
    const result = await outcome(pending); check(result.error?.code === 'DEADLINE_EXCEEDED', 'transport time counts towards native deadline');
    const receipt = await remote.engine.reconcile(pending.operationId); equal(receipt.status, 'rejected', 'expired admission receipt conclusive');
    const state = await remote.engine.search({ kind: 'all' }); equal([state.revision, state.total], [0, 0], 'expired transit no publication');
    remote.worker.onSend = undefined; await remote.engine.dispose(); return { injectedTransportDelayMs: 60, admittedDeadlineMs: 10, result, receipt, state, transport: remote.worker.stats() };
  },
  async failureEvent() {
    const remote = await engine('core', { responseTimeoutMs: 500 });
    remote.worker.onReply = message => message.operation === 'search' ? false : undefined;
    const read = outcome(remote.engine.search('red'));
    remote.worker.emit('error', new Event('error')); const result = await read;
    check(result.error?.code === 'TERMINATED', 'worker error event terminates pending read honestly');
    check(remote.worker.listenerCount() === 0 && remote.worker.terminated === 1, 'error lifecycle release');
    await remote.engine.dispose(); return { result, transport: remote.worker.stats(), event: 'Injected standard Worker error event at facade; actual explicit worker death is tested separately.' };
  },
  async lostSearch() {
    const remote = await engine('core', { responseTimeoutMs: 50 });
    remote.worker.onReply = message => message.operation === 'search' ? false : undefined;
    const result = await outcome(remote.engine.search('red')); check(result.error?.code === 'TIMEOUT', 'lost read timeout');
    remote.worker.onReply = undefined; const recovery = await remote.engine.search({ kind: 'all' }); equal(recovery.total, 0, 'reads can continue');
    await remote.engine.dispose(); return { result, recovery, transport: remote.worker.stats() };
  },
  async corruptResponses() {
    const outcomes = [];
    for (const [name, change] of [
      ['wrong protocol', message => ({ ...message, protocol: 99 })],
      ['wrong session', message => ({ ...message, session: '00000000-0000-0000-0000-000000000000' })],
      ['wrong operation', message => ({ ...message, operation: 'clear' })],
      ['wrong ID', message => ({ ...message, id: -1 })],
      ['unallocated positive ID', message => ({ ...message, id: message.id + 10000 })],
      ['unsorted hits', message => ({ ...message, value: { ...message.value, hits: [...message.value.hits].reverse() } })],
      ['ill-formed UTF-16 ID', message => ({ ...message, value: { ...message.value, hits: message.value.hits.map((hit, index) => index ? hit : { ...hit, id: '\ud800' }) } })],
      ['malformed value', message => ({ ...message, value: { revision: 0, total: 0, hits: [{ id: 'invented', score: Infinity }] } })],
      ['unknown envelope metadata', message => ({ ...message, rawQuery: 'private value must never be allowed' })],
    ]) {
      const remote = await engine('core', { responseTimeoutMs: 100 }); await remote.engine.addMany(records);
      remote.worker.onReply = (message, proxy) => { if (message.operation === 'search') { proxy.reply(change(message)); return false; } };
      const result = await outcome(remote.engine.search('red')); check(!!result.error && result.error.code !== 'CANCELLED', `${name} cannot accepted`);
      await remote.engine.dispose(); check(remote.worker.listenerCount() === 0, `${name} cleanup`); outcomes.push({ name, result, transport: remote.worker.stats() });
    }
    return outcomes;
  },
  async boundedPayload() {
    const remote = await engine('core', { maxMessageBytes: 8192 }, {}, '&cap=8192');
    const before = remote.worker.requests.length;
    const large = await outcome(remote.engine.add({ id: 'large', text: { title: 'x'.repeat(9000) } }));
    check(large.error?.code === 'TRANSPORT_LIMIT', 'bounded outgoing envelope'); check(remote.worker.requests.length === before, 'large envelope never dispatched');
    const good = await remote.engine.add({ id: 'good', text: { title: 'red' } });
    const result = await remote.engine.search('red'); equal(result.hits.map(hit => hit.id), ['good'], 'transport failure atomic/local');
    const template = clone(remote.worker.requests.find(message => message.operation === 'add'));
    template.id = remote.worker.requests.at(-1).id + 1; template.payload.input = { id: 'edge', text: { title: '' } };
    const nativeNow = Object.getOwnPropertyDescriptor(performance, 'now'), fixedNow = performance.now();
    Object.defineProperty(performance, 'now', { configurable: true, value: () => fixedNow });
    let exact, sentBoundary, overBoundary;
    try {
      template.payload.admittedAt = performance.timeOrigin + fixedNow;
      const padding = 8192 - wireBytes(template); template.payload.input.text.title = 'a '.repeat(Math.ceil(padding / 2)).slice(0, padding);
      exact = await outcome(remote.engine.add(template.payload.input)); check(!!exact.value, 'exact encoded payload cap admitted');
      sentBoundary = remote.worker.requests.at(-1); equal(wireBytes(sentBoundary), 8192, 'envelope including metadata exactly fills cap');
      const nextTemplate = clone(sentBoundary); nextTemplate.id++; nextTemplate.payload.input.id = 'more'; nextTemplate.payload.input.text.title += 'a';
      overBoundary = await outcome(remote.engine.add(nextTemplate.payload.input)); check(overBoundary.error?.code === 'TRANSPORT_LIMIT', 'one encoded byte above cap rejected');
    } finally { if (nativeNow) Object.defineProperty(performance, 'now', nativeNow); else delete performance.now; }
    remote.worker.onReply = (message, proxy) => { if (message.operation === 'search') { proxy.reply({ ...message, value: { ...message.value, extensions: { excess: 'x'.repeat(9000) } } }); return false; } };
    const inbound = await outcome(remote.engine.search('red')); check(inbound.error?.code === 'TRANSPORT_LIMIT', 'oversized response rejected including metadata');
    await remote.engine.dispose(); return { capBytes: 8192, large, good, result, exact, exactEnvelopeBytes: wireBytes(sentBoundary), overBoundary, inbound, transport: remote.worker.stats(), clockMethod: 'Freeze only client performance.now while deriving exact envelope length; worker time remains real; restore original method in finally.', method: 'TextEncoder UTF-8 length of JSON envelope including protocol/session/id/operation/kind and payload/value metadata; no heap or peak-copy inference.' };
  },
  async malformedRequests() {
    const outcomes = [];
    for (const [name, change] of [
      ['unknown operation', message => ({ ...message, operation: 'eval' })],
      ['extra envelope metadata', message => ({ ...message, execute: 'arbitrary code' })],
      ['wrong protocol', message => ({ ...message, protocol: 12 })],
      ['invalid request ID', message => ({ ...message, id: -1 })],
      ['malformed payload', message => ({ ...message, payload: { unsupported: true } })],
    ]) {
      const remote = await engine('core', { responseTimeoutMs: 80 });
      remote.worker.onSend = (message, proxy) => { if (message.operation === 'add') { proxy.forward(change(message)); return false; } };
      const result = await outcome(remote.engine.add({ id: 'must-not-commit', text: { title: 'red' } })); check(!!result.error, `${name} rejected/unknown`);
      remote.worker.onSend = undefined;
      const state = await outcome(remote.engine.search({ kind: 'all' })); if (state.value) equal([state.value.total, state.value.revision], [0, 0], `${name} no state change`);
      await remote.engine.dispose(); outcomes.push({ name, result, state, transport: remote.worker.stats() });
    }
    return outcomes;
  },
  async deathAndRecovery() {
    const remote = await engine('core', { responseTimeoutMs: 80 });
    remote.worker.onReply = message => message.operation === 'add' ? false : undefined;
    const pending = remote.engine.add({ id: 'death', text: { title: 'red' } });
    while (!remote.worker.responses.some(message => message.operation === 'add')) await pause(2);
    remote.worker.real.terminate(); // Actual Worker death, browsers do not emit an error for explicit terminate.
    const unknown = await outcome(pending); check(unknown.error?.code === 'OUTCOME_UNKNOWN', 'actual dead worker mutation unknown');
    const disposal = await outcome(remote.engine.dispose()); check(disposal.error?.code === 'TIMEOUT', 'dead worker disposal acknowledgement times out honestly');
    check(remote.worker.listenerCount() === 0 && remote.worker.terminated === 1, 'dead release finally clears listeners and owned worker'); handles.delete(remote.engine);
    const recovered = await engine('core'); await recovered.engine.add({ id: 'recovered', text: { title: 'blue' } });
    const state = await recovered.engine.search({ kind: 'all' }); equal([state.revision, state.hits[0].id], [1, 'recovered'], 'new owner explicit recovery');
    await recovered.engine.dispose(); return { unknown, disposal, state, died: remote.worker.stats(), recovered: recovered.worker.stats(), recovery: 'Explicit new module worker and corpus rebuild; no lost mutation automatic replay.' };
  },
  async boundedPending() {
    const remote = await engine('core', { responseTimeoutMs: 1500 });
    remote.worker.onReply = (message, proxy) => { if (message.operation === 'search') { proxy.held.push(clone(message)); return false; } };
    const before = remote.worker.requests.length;
    const pending = Array.from({ length: 65 }, () => outcome(remote.engine.search({ kind: 'all' })));
    const overflow = await pending[64]; check(!!overflow.error, '65th request rejected by bounded pending map');
    check(remote.worker.requests.length - before <= 64, 'at most 64 requests dispatched');
    while (remote.worker.held.length < 64) await pause(2);
    remote.worker.release(); const settled = await Promise.all(pending);
    check(settled.length === 65, 'all pending promises settled');
    remote.worker.onReply = undefined;
    const nativeSetTimeout = window.setTimeout, nativeClearTimeout = window.clearTimeout, active = new Set();
    window.setTimeout = (callback, delay, ...args) => { let id; id = nativeSetTimeout(() => { active.delete(id); callback(...args); }, delay); active.add(id); return id; };
    window.clearTimeout = id => { active.delete(id); nativeClearTimeout(id); };
    let lifecycle;
    try {
      remote.worker.onReply = message => message.operation === 'search' ? false : undefined;
      const signal = countingSignal(), calls = Array.from({ length: 4 }, () => outcome(remote.engine.search('red', { signal: signal.signal })));
      await remote.engine.destroy(); const results = await Promise.all(calls);
      lifecycle = { results, remainingClientTimers: active.size, remainingSignalListeners: signal.listeners.size, remainingWorkerListeners: remote.worker.listenerCount() };
      check(results.every(row => row.error), 'destroy settles all four requests');
      equal([active.size, signal.listeners.size, remote.worker.listenerCount()], [0, 0, 0], 'client timers and signal/worker listeners removed');
    } finally { for (const id of active) nativeClearTimeout(id); window.setTimeout = nativeSetTimeout; window.clearTimeout = nativeClearTimeout; }
    return { capacity: 64, dispatched: remote.worker.requests.length - before, overflow, resolvedCount: settled.filter(row => row.value).length,
      coreQueueRejectedCount: settled.filter(row => row.error?.code === 'QUEUE_FULL').length, lifecycle, transport: remote.worker.stats(),
      timerMethod: 'Wrap the browser client setTimeout/clearTimeout around four pending requests and explicit destroy; actual worker-native timers are outside this client timer observation.' };
  },
  async externalOwnership() {
    const remote = await engine('core', { ownership: 'external' }); await remote.engine.add({ id: 'external', text: { title: 'red' } });
    remote.worker.onReply = message => message.operation === 'search' ? false : undefined;
    const pending = remote.engine.search('red'); await remote.engine.dispose(); const disposed = await outcome(pending);
    check(!!disposed.error, 'pending settled on dispose'); check(remote.worker.terminated === 0 && remote.worker.listenerCount() === 0, 'external not terminated; all client listeners removed');
    const after = await outcome(remote.engine.search('red')); check(after.error?.code === 'DISPOSED', 'postdestroy disposed');
    await remote.engine.dispose(); check(remote.worker.terminated === 0, 'repeat external dispose stable');
    remote.worker.real.terminate(); return { disposed, after, transport: remote.worker.stats() };
  },
  async cleanup() {
    const outcomes = [];
    for (const handle of handles) outcomes.push(await outcome(handle.dispose())); handles.clear();
    for (const worker of realWorkers) worker.terminate(); realWorkers.clear();
    return outcomes;
  },
};
