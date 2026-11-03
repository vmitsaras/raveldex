import assert from 'node:assert/strict';
import test from 'node:test';
import { createRaveldex, RaveldexError } from '../../dist/index.js';
import { createFilters } from '../../dist/addons/filters/index.js';
import { createFacets } from '../../dist/addons/facets/index.js';
import { createDirectory, connectDirectoryURL } from '../../dist/addons/ui/directory.js';
import { schema, groups, records, cases, generated } from '../fixtures/directory.mjs';
import { directoryExpected } from '../oracle/directory.mjs';

const plain = value => JSON.parse(JSON.stringify(value));
const params = { query: 'q', page: 'p', filters: { kind: 'k', tags: 'tag' } };
const gate = () => { let release; return { promise: new Promise(resolve => { release = resolve; }), release: value => release(value) }; };
async function setup(t, options = {}) {
  const actualGroups = options.groups ?? groups, inputs = options.records ?? records;
  const engine = createRaveldex({ schema: options.schema ?? schema,
    ...(options.limits ? { limits: options.limits } : {}),
    addons: options.addons ?? [createFilters({ fields: ['kind', 'tags'] }), createFacets({ fields: ['kind', 'tags'] })] });
  let directory; t.after(async () => { directory?.destroy(); await engine.dispose(); });
  await engine.addMany(inputs);
  const requests = []; let disposed = 0;
  const borrowed = { ...engine, search: (query, queryOptions) => {
    requests.push({ query: plain(query), options: queryOptions });
    return options.search ? options.search(engine, query, queryOptions) : engine.search(query, queryOptions);
  }, dispose: async () => { disposed++; await engine.dispose(); } };
  directory = createDirectory({ engine: borrowed, groups: actualGroups, pageSize: options.pageSize ?? 2, mode: options.mode ?? 'prefix' });
  return { directory, engine, borrowed, requests, disposed: () => disposed, groups: actualGroups };
}
function compare(actual, expected) {
  assert.equal(actual.status, 'ready');
  assert.equal(actual.result.total, expected.total);
  assert.deepEqual(actual.result.hits.map(h => h.id), expected.hits.map(h => h.id));
  actual.result.hits.forEach((hit, i) => assert.ok(Math.abs(hit.score - expected.hits[i].score) <= Math.max(1e-12, Math.abs(hit.score) * 1e-12)));
  assert.deepEqual(plain(actual.result.facets), expected.facets);
}
function host(initial = 'https://example.test/resources/?tracked=a%20b&raw=%2f#anchor%20raw') {
  let href = initial, reads = 0;
  const listeners = new Set(), calls = [], preserved = { unrelated: ['keep', 7] };
  const target = { location: { get href() { reads++; return href; } }, history: {
    state: preserved,
    pushState(data, unused, url) { assert.equal(data, preserved); calls.push({ kind: 'push', url }); href = new URL(url, href).href; },
    replaceState(data, unused, url) { assert.equal(data, preserved); calls.push({ kind: 'replace', url }); href = new URL(url, href).href; },
  }, addEventListener(type, listener) { assert.equal(type, 'popstate'); listeners.add(listener); },
  removeEventListener(type, listener) { assert.equal(type, 'popstate'); listeners.delete(listener); } };
  return { target, calls, listeners, reads: () => reads, href: () => href,
    setURL(url) { href = url; }, traverse(url) { href = url; for (const listener of [...listeners]) listener(); } };
}

test('directory is initially inert; empty input browses native pages and publishes owned snapshots', { timeout: 20_000 }, async t => {
  const { directory: d, requests, disposed } = await setup(t);
  assert.equal(requests.length, 0); assert.equal(d.getSnapshot().status, 'idle');
  const notifications = []; d.subscribe(value => notifications.push(value)); assert.equal(notifications.length, 0);
  const work = d.refresh(); assert.equal(d.getSnapshot().status, 'loading'); await work;
  compare(d.getSnapshot(), directoryExpected(records, schema, { kind: 'all' }, {}, groups, 2));
  assert.deepEqual(d.getSnapshot().result.hits.map(h => h.id), ['a', 'b']);
  assert.ok(d.getSnapshot().result.hits.every(h => h.score === 0));
  assert.deepEqual(notifications.map(x => x.status), ['loading', 'ready']);
  assert.throws(() => { d.getSnapshot().state.page = 99; }, TypeError);
  assert.throws(() => { d.getSnapshot().result.hits.push({ id: 'bad', score: 1 }); }, TypeError);
  assert.equal(disposed(), 0);
});

test('handwritten multi-groups retain native scores, full own-filter facet counts and every page', { timeout: 20_000 }, async t => {
  const { directory: d } = await setup(t);
  let comparisons = 0;
  const selections = [{}, { kind: ['guide'] }, { kind: ['manual', 'guide'], tags: ['red', 'green'] },
    { tags: ['red', 'blue'] }, { tags: [''] }, { kind: ['absent'] }, { tags: ['ghost', 'red'] }];
  for (const item of cases) for (const filters of selections) {
    await d.update({ text: item.text, filters }); await d.setPage(1);
    const expected = directoryExpected(records, schema, item.query, filters, groups, 2);
    const all = [];
    for (let page = 1; page <= Math.max(1, Math.ceil(expected.total / 2)); page++) {
      await d.setPage(page); compare(d.getSnapshot(), directoryExpected(records, schema, item.query, filters, groups, 2, page));
      all.push(...d.getSnapshot().result.hits.map(h => h.id)); comparisons++;
    }
    assert.deepEqual(all, expected.allIDs);
  }
  assert.equal(comparisons, 40);
  await d.update({ text: '', filters: { kind: ['guide'], tags: ['red', 'green'] } });
  assert.deepEqual(d.getSnapshot().result.facets[0].buckets, [{ kind: 'value', value: 'guide', count: 2 }]);
  assert.equal(d.getSnapshot().result.facets[1].buckets.find(b => b.value === 'blue').count, 1);
});

test('fixed-seed directories agree with a full independent scan, deterministic scores, counts and complete pages', { timeout: 20_000 }, async t => {
  let comparisons = 0;
  const queries = [{ text: '', query: { kind: 'all' } }, { text: 'alpha', query: { kind: 'group', variants: [{ text: 'alpha', match: 'prefix' }] } },
    { text: 'alpha tr', query: { kind: 'and', children: [{ kind: 'text', text: 'alpha' }, { kind: 'group', variants: [{ text: 'tr', match: 'prefix' }] }] } }];
  for (const seed of [11, 97, 429]) {
    const inputs = generated(seed), { directory: d } = await setup(t, { records: inputs, pageSize: 7 });
    for (const q of queries) for (const kind of [[], ['guide'], ['guide', 'manual'], ['absent']]) for (const tags of [[], ['red', 'blue'], ['é', 'e\u0301'], ['ghost', 'red']]) {
      const filters = { kind, tags }; await d.update({ text: q.text, filters }); await d.setPage(1);
      const expected = directoryExpected(inputs, schema, q.query, filters, groups, 7), all = [];
      for (let page = 1; page <= Math.max(1, Math.ceil(expected.total / 7)); page++) {
        await d.setPage(page); compare(d.getSnapshot(), directoryExpected(inputs, schema, q.query, filters, groups, 7, page));
        all.push(...d.getSnapshot().result.hits.map(hit => hit.id)); comparisons++;
      }
      assert.deepEqual(all, expected.allIDs);
    }
  }
  assert.ok(comparisons > 180); t.diagnostic(JSON.stringify({ independentPageComparisons: comparisons }));
});

test('filtering preserves hand-derived corpus-wide BM25 rather than rescoring the selected subset', { timeout: 20_000 }, async t => {
  const inputs = ['a', 'b', 'c'].map((id, i) => ({ id, text: { title: 'alpha' }, metadata: { kind: i ? 'manual' : 'guide' } }));
  const { directory: d } = await setup(t, { records: inputs, groups: [groups[0]], pageSize: 3 });
  await d.update({ text: 'alpha', filters: { kind: ['guide'] } });
  assert.deepEqual(d.getSnapshot().result.hits.map(h => h.id), ['a']);
  assert.ok(Math.abs(d.getSnapshot().result.hits[0].score - Math.log(8 / 7)) < 1e-12);
});

test('zero and projected-out selections remain recoverable without inventing a zero for omitted buckets', { timeout: 20_000 }, async t => {
  const limited = [{ ...groups[0], limit: 1 }, { ...groups[1], limit: 1 }];
  const { directory: d } = await setup(t, { groups: limited });
  await d.update({ filters: { tags: ['red', 'blue'] } });
  assert.deepEqual(d.getSnapshot().result.selected.tags, [{ value: 'blue', count: 2 }, { value: 'red', count: null }]);
  assert.equal(d.getSnapshot().result.facets[1].omittedBucketCount, 1);
  await d.update({ filters: { tags: ['ghost'] } });
  assert.deepEqual(d.getSnapshot().state.filters.tags, ['ghost']);
  assert.deepEqual(d.getSnapshot().result.selected.tags, [{ value: 'ghost', count: 0 }]);
  const complete = await setup(t); await complete.directory.update({ filters: { tags: ['red', 'ghost'] } });
  assert.deepEqual(complete.directory.getSnapshot().result.selected.tags, [{ value: 'ghost', count: 0 }, { value: 'red', count: 2 }]);
});

test('effective edits reset paging while equal input is inert, and native text mode remains exact', { timeout: 20_000 }, async t => {
  const { directory: d, requests } = await setup(t);
  await d.refresh(); await d.setPage(3); const count = requests.length;
  await d.update({ text: '', filters: {} }); assert.equal(d.getSnapshot().state.page, 3); assert.equal(requests.length, count);
  await d.update({ filters: { kind: ['guide'] } }); assert.equal(d.getSnapshot().state.page, 1);
  await d.setPage(2); await d.update({ text: 'shared' }); assert.equal(d.getSnapshot().state.page, 1);
  const exact = await setup(t, { mode: 'text' }); await exact.directory.update({ text: 'shared tra' }); assert.equal(exact.directory.getSnapshot().result.total, 0);
});

test('restored out-of-range pages recover coherently once; reduced native bounds remain explicit', { timeout: 20_000 }, async t => {
  const { directory: d, requests } = await setup(t);
  await d.restore({ text: '', filters: {}, page: 50 });
  assert.equal(d.getSnapshot().state.page, 1); assert.equal(d.getSnapshot().status, 'ready'); assert.equal(requests.length, 2);
  const small = await setup(t, { records: records.slice(0, 3), limits: { maxDocuments: 4 }, pageSize: 3 });
  await small.directory.setPage(2); assert.equal(small.directory.getSnapshot().status, 'error');
  assert.equal(small.directory.getSnapshot().error, 'LIMIT_EXCEEDED'); assert.equal(small.directory.getSnapshot().result, undefined);
});

test('new revisions clear mixed page presentation and refresh explicitly obtains the current revision', { timeout: 20_000 }, async t => {
  const { directory: d, engine } = await setup(t); await d.refresh();
  await engine.add({ id: 'z', text: { title: 'new' }, metadata: { kind: 'guide' } });
  await d.setPage(2); assert.equal(d.getSnapshot().status, 'stale'); assert.equal(d.getSnapshot().state.page, 1);
  assert.equal(d.getSnapshot().error, 'REVISION_MISMATCH'); assert.equal(d.getSnapshot().result, undefined);
  await d.refresh(); assert.equal(d.getSnapshot().result.revision, 2); assert.equal(d.getSnapshot().result.total, 9);
  let calls = 0;
  const race = await setup(t, { search: async (owner, q, o) => {
    const found = await owner.search(q, o);
    if (++calls === 1) await owner.add({ id: 'later', text: { title: 'later' } });
    return found;
  } });
  await race.directory.restore({ text: '', filters: {}, page: 50 });
  assert.equal(calls, 2); assert.equal(race.directory.getSnapshot().status, 'stale'); assert.equal(race.directory.getSnapshot().result, undefined);
});

test('held ignored-abort results cannot replace newer query state or revive destroyed observers', { timeout: 20_000 }, async t => {
  const entered = gate(), held = gate(); let calls = 0;
  const { directory: d, engine, disposed } = await setup(t, { search: async (owner, q, o) => {
    const { signal, ...uninterrupted } = o; const found = await owner.search(q, uninterrupted);
    if (++calls === 1) { entered.release(); await held.promise; } return found;
  } });
  const first = d.update({ text: 'shared' }); await entered.promise;
  await d.update({ text: 'quiet' }); const current = d.getSnapshot(); held.release(); await first;
  assert.equal(d.getSnapshot(), current); assert.deepEqual(current.result.hits.map(h => h.id).sort(), ['d', 'h']);
  let destroyed = 0; d.subscribe(value => { if (value.status === 'destroyed') destroyed++; });
  d.destroy(); d.destroy(); await d.update({ text: 'shared' }); assert.equal(destroyed, 1); assert.equal(disposed(), 0);
  assert.equal((await engine.search({ kind: 'all' })).total, 8);
});

test('observer and abort reentry preserve the newest intent and isolate observer exceptions', { timeout: 20_000 }, async t => {
  const { directory: d, requests } = await setup(t); let newer;
  d.subscribe(value => { if (value.status === 'loading' && value.state.text === 'shared') newer = d.update({ text: 'quiet' }); });
  d.subscribe(() => { throw Error('observer'); });
  const delivered = []; d.subscribe(value => delivered.push(value.state.text));
  await d.update({ text: 'shared' }); await newer;
  assert.equal(d.getSnapshot().state.text, 'quiet'); assert.ok(delivered.every(x => x === 'quiet')); assert.equal(requests.length, 1);
  const entered = gate(), hold = gate(); let triggered, first = true, pending;
  const reentry = await setup(t, { search: async (owner, q, o) => {
    if (first) {
      first = false; o.signal.addEventListener('abort', () => { triggered = pending.update({ text: 'quiet' }); }, { once: true });
      const { signal, ...uninterrupted } = o; const result = await owner.search(q, uninterrupted); entered.release(); await hold.promise; return result;
    }
    return owner.search(q, o);
  } });
  pending = reentry.directory; const old = pending.update({ text: 'shared' }); await entered.promise;
  await pending.update({ text: 'alpha' }); await triggered; hold.release(); await old;
  assert.equal(pending.getSnapshot().state.text, 'quiet'); assert.equal(reentry.requests.length, 2);
});

test('capability and malformed output refusals retain selections instead of pretending to search', { timeout: 20_000 }, async t => {
  const alone = await setup(t, { addons: [], groups: [] }); await alone.directory.refresh();
  assert.equal(alone.directory.getSnapshot().result.total, 8); assert.deepEqual(alone.directory.getSnapshot().result.facets, []);
  const absent = await setup(t, { addons: [] }); await absent.directory.refresh();
  assert.equal(absent.directory.getSnapshot().error, 'MISSING_CAPABILITY');
  const filtersAbsent = await setup(t, { addons: [createFacets({ fields: ['kind', 'tags'] })] });
  await filtersAbsent.directory.update({ filters: { kind: ['guide'] } });
  assert.equal(filtersAbsent.directory.getSnapshot().error, 'MISSING_CAPABILITY');
  assert.deepEqual(filtersAbsent.directory.getSnapshot().state.filters.kind, ['guide']);
  for (const defect of ['duplicate', 'facets', 'accessor']) {
    const bad = await setup(t, { search: async (owner, q, o) => {
      const found = await owner.search(q, o);
      if (defect === 'duplicate') return { ...found, hits: [found.hits[0], found.hits[0]] };
      if (defect === 'facets') return { ...found, extensions: { facets: { fields: [] } } };
      return Object.defineProperty({ ...found }, 'total', { get() { throw Error('must not invoke'); } });
    } });
    await bad.directory.refresh(); assert.equal(bad.directory.getSnapshot().error, 'INCOMPATIBLE_CAPABILITY'); assert.equal(bad.directory.getSnapshot().result, undefined);
  }
});

test('configuration/state capture refuses invalid data before cancellation and owns caller arrays', { timeout: 20_000 }, async t => {
  const editable = structuredClone(groups), { engine } = await setup(t), d = createDirectory({ engine, groups: editable, pageSize: 2 });
  t.after(() => d.destroy()); editable[0].values.push('new');
  const values = ['guide']; const work = d.update({ filters: { kind: values } }); values.push('new'); await work;
  assert.deepEqual(d.getSnapshot().state.filters.kind, ['guide']); const current = d.getSnapshot();
  for (const patch of [{ text: '\ud800' }, { text: 'x\ny' }, { text: 'x'.repeat(2049) }, { filters: { kind: ['new'] } }, { filters: { kind: undefined } }, { filters: { other: [] } }])
    assert.throws(() => d.update(patch), error => error instanceof RaveldexError);
  assert.equal(d.getSnapshot(), current);
  let getter = 0; assert.throws(() => d.update(Object.defineProperty({}, 'text', { get() { getter++; return 'shared'; } })));
  assert.equal(getter, 0);
  assert.throws(() => d.setPage(5001)); assert.throws(() => createDirectory({ engine, groups: [{ field: 'kind', values: ['guide', 'guide'] }] }));
});

test('URL binding is explicit and preserves raw unrelated bytes, hash and history.state', { timeout: 20_000 }, async t => {
  const { directory: d } = await setup(t), h = host();
  const binding = connectDirectoryURL({ controller: d, host: h.target, parameters: params }); t.after(binding.destroy);
  assert.equal(h.reads(), 0); assert.equal(d.getSnapshot().status, 'idle');
  await binding.read(); assert.equal(d.getSnapshot().result.total, 8); assert.equal(h.calls.length, 0);
  await d.setPage(2); assert.equal(h.calls.length, 1); assert.equal(h.calls[0].kind, 'replace');
  assert.equal(h.href(), 'https://example.test/resources/?tracked=a%20b&raw=%2f&p=2#anchor%20raw');
  await d.update({ text: ' shared  ', filters: { kind: ['guide'] } });
  assert.ok(h.href().includes('tracked=a%20b&raw=%2f&q=%20shared%20%20&k=guide#anchor%20raw'));
  const count = h.calls.length; await d.refresh(); assert.equal(h.calls.length, count);
  binding.destroy(); assert.equal(h.listeners.size, 0); const previous = h.href(); await d.update({ text: 'quiet' }); assert.equal(h.href(), previous);
});

test('URL push policy uses commits only and replays/corrects with replace without loops', { timeout: 20_000 }, async t => {
  const { directory: d } = await setup(t), h = host();
  const binding = connectDirectoryURL({ controller: d, host: h.target, parameters: params, history: 'push' }); t.after(binding.destroy);
  await binding.read(); await d.setPage(2); await d.setPage(3); assert.deepEqual(h.calls.map(c => c.kind), ['push', 'push']);
  h.setURL('https://example.test/resources/?tracked=x&p=2#keep'); await binding.read();
  assert.equal(d.getSnapshot().state.page, 2); assert.equal(h.calls.length, 2);
  h.setURL('https://example.test/resources/?tracked=x&q=shared&q=quiet&p=0002&k=guide&k=unknown&tag=red&tag=red#keep');
  await binding.read(); assert.equal(d.getSnapshot().state.text, ''); assert.equal(d.getSnapshot().state.page, 1);
  assert.deepEqual(d.getSnapshot().state.filters.kind, ['guide']); assert.deepEqual(d.getSnapshot().state.filters.tags, ['red']);
  assert.equal(h.calls.at(-1).kind, 'replace'); assert.equal(binding.getSnapshot().issues.length, 4);
  assert.ok(h.href().startsWith('https://example.test/resources/?tracked=x&k=guide&tag=red#keep'));
});

test('URL admission preserves raw Unicode/empty filters and recovers invalid or stale owned values', { timeout: 20_000 }, async t => {
  const { directory: d } = await setup(t), h = host(); const b = connectDirectoryURL({ controller: d, host: h.target, parameters: params }); t.after(b.destroy);
  const raw = '  é e\u0301 😀 % & +  ';
  h.setURL('https://example.test/resources/?q=' + encodeURIComponent(raw) + '&tag=#frag%20x'); await b.read();
  assert.equal(d.getSnapshot().state.text, raw); assert.deepEqual(d.getSnapshot().state.filters.tags, ['']);
  assert.equal(new URL(h.href()).searchParams.get('q'), raw); assert.equal(new URL(h.href()).hash, '#frag%20x');
  for (const q of ['%ED%A0%80', '%ZZ', 'line%0Abreak', encodeURIComponent('x'.repeat(2049))]) {
    h.setURL('https://example.test/resources/?untouched=%2f&q=' + q + '&p=2#keep'); await b.read();
    assert.equal(d.getSnapshot().state.text, ''); assert.equal(d.getSnapshot().state.page, 1); assert.equal(b.getSnapshot().issues[0].parameter, 'q');
    assert.equal(h.href(), 'https://example.test/resources/?untouched=%2f#keep');
  }
  h.setURL('https://example.test/resources/?k=absent&p=99'); await b.read();
  assert.equal(d.getSnapshot().result.total, 0); assert.deepEqual(d.getSnapshot().state.filters.kind, ['absent']); assert.equal(d.getSnapshot().state.page, 1);
  h.setURL('https://example.test/resources/?q=' + 'x'.repeat(17000)); await b.read(); assert.equal(d.getSnapshot().state.text, ''); assert.equal(b.getSnapshot().issues[0].reason, 'limit');
});

test('URL write refusal/limits leave in-memory search usable and explicit write retries current state', { timeout: 20_000 }, async t => {
  const { directory: d } = await setup(t), h = host(), b = connectDirectoryURL({ controller: d, host: h.target, parameters: params }); t.after(b.destroy);
  await b.read(); const previous = h.href(), original = h.target.history.replaceState;
  h.target.history.replaceState = () => { throw Error('native history refused'); };
  await d.update({ text: 'shared' }); assert.equal(d.getSnapshot().status, 'ready'); assert.equal(h.href(), previous); assert.equal(b.getSnapshot().error, 'write-refused');
  h.target.history.replaceState = original; b.write(); assert.equal(new URL(h.href()).searchParams.get('q'), 'shared'); assert.equal(b.getSnapshot().status, 'connected');
  const long = '字'.repeat(2048); await d.update({ text: long }); assert.equal(d.getSnapshot().state.text, long); assert.equal(b.getSnapshot().error, 'url-limit');
  await d.update({ text: 'quiet' }); assert.equal(d.getSnapshot().status, 'ready'); assert.equal(b.getSnapshot().status, 'connected');
  h.setURL('https://example.test/resources/?unrelated=' + 'x'.repeat(66000)); const exact = h.href(); await b.read();
  assert.equal(h.href(), exact); assert.equal(b.getSnapshot().error, 'url-limit'); assert.equal(d.getSnapshot().state.text, 'quiet');
});

test('URL parameter claims reject conflicts before mutation and release on binding/controller destruction', { timeout: 20_000 }, async t => {
  const a = await setup(t), second = await setup(t), h = host();
  const one = connectDirectoryURL({ controller: a.directory, host: h.target, parameters: params });
  assert.throws(() => connectDirectoryURL({ controller: second.directory, host: h.target, parameters: params }));
  assert.equal(h.reads(), 0); assert.equal(h.calls.length, 0); assert.equal(h.listeners.size, 1);
  const two = connectDirectoryURL({ controller: second.directory, host: h.target, parameters: { query: 'otherQ', page: 'otherPage', filters: { kind: 'otherKind', tags: 'otherTags' } } });
  await one.read(); await two.read(); await a.directory.update({ text: 'shared' }); await second.directory.update({ text: 'quiet' });
  assert.equal(new URL(h.href()).searchParams.get('q'), 'shared'); assert.equal(new URL(h.href()).searchParams.get('otherQ'), 'quiet');
  a.directory.destroy(); assert.equal(one.getSnapshot().status, 'destroyed'); assert.equal(h.listeners.size, 1);
  const fresh = await setup(t); const again = connectDirectoryURL({ controller: fresh.directory, host: h.target, parameters: params }); again.destroy(); two.destroy();
  assert.equal(h.listeners.size, 0);
});

test('URL host accessors and history callbacks cannot write after destruction or override a newer operation', { timeout: 20_000 }, async t => {
  const { directory: d } = await setup(t), h = host(); const b = connectDirectoryURL({ controller: d, host: h.target, parameters: params });
  await b.read(); const original = Object.getOwnPropertyDescriptor(h.target.history, 'state'), value = h.target.history.state;
  Object.defineProperty(h.target.history, 'state', { configurable: true, get() { b.destroy(); return value; } });
  await d.update({ text: 'shared' }); assert.equal(h.calls.length, 0); assert.equal(b.getSnapshot().status, 'destroyed');
  Object.defineProperty(h.target.history, 'state', original);
  const binding = connectDirectoryURL({ controller: d, host: h.target, parameters: params }); t.after(binding.destroy);
  let once = true, newest;
  const replace = h.target.history.replaceState;
  h.target.history.replaceState = function(data, unused, url) {
    replace.call(this, data, unused, url);
    if (once) { once = false; newest = d.update({ text: 'quiet' }); }
  };
  await d.update({ text: 'alpha' }); await newest;
  assert.equal(d.getSnapshot().state.text, 'quiet'); assert.equal(new URL(h.href()).searchParams.get('q'), 'quiet');
});

test('configuration and URL construction enforce bounds and ownership across wrapped host callbacks', { timeout: 20_000 }, async t => {
  const { engine, directory } = await setup(t);
  const values = Array.from({ length: 64 }, (_, i) => String(i).padStart(4, '0') + 'x'.repeat((i === 63 ? 1020 : 1024) - 4));
  assert.throws(() => createDirectory({ engine, groups: [{ field: 'kind', values }, { field: 'tags', values: [] }] }), e => e.code === 'LIMIT_EXCEEDED');
  const h = host(), original = h.target.history;
  let nested, once = true;
  Object.defineProperty(h.target, 'history', { get() {
    if (once) { once = false; nested = connectDirectoryURL({ controller: directory, host: h.target, parameters: params }); }
    return original;
  } });
  assert.throws(() => connectDirectoryURL({ controller: directory, host: h.target, parameters: params }), e => e.code === 'INVALID_OPTIONS');
  assert.equal(h.listeners.size, 1); assert.equal(nested.getSnapshot().status, 'connected'); nested.destroy(); assert.equal(h.listeners.size, 0);
  const second = await setup(t), wrapped = host(); const install = wrapped.target.addEventListener;
  wrapped.target.addEventListener = function(type, listener) { second.directory.destroy(); install.call(this, type, listener); };
  const ended = connectDirectoryURL({ controller: second.directory, host: wrapped.target, parameters: params });
  assert.equal(ended.getSnapshot().status, 'destroyed'); assert.equal(wrapped.listeners.size, 0); assert.equal(wrapped.calls.length, 0);
  const unsubscribers = Array.from({ length: 64 }, () => directory.subscribe(() => {}));
  assert.throws(() => directory.subscribe(() => {}), e => e.code === 'LIMIT_EXCEEDED');
  assert.throws(() => connectDirectoryURL({ controller: directory, host: h.target, parameters: params }), e => e.code === 'LIMIT_EXCEEDED');
  assert.equal(h.listeners.size, 0); unsubscribers.forEach(fn => fn());
  const fresh = connectDirectoryURL({ controller: directory, host: h.target, parameters: params }); fresh.destroy();
});
