import test from 'node:test';
import assert from 'node:assert/strict';
import { IndexConstruction } from '../../dist/core/index/construction.js';
import { MutationOwner } from '../../dist/core/mutations/owner.js';
import { DirectoryStage, emptyDirectory } from '../../dist/core/index/staging.js';
import { bucketOf, directoryGet, directoryEntries } from '../../dist/core/index/directory.js';
import { inspectIndex } from '../../dist/core/index/invariants.js';
import { executeSearch } from '../../dist/core/query/search.js';
import { RaveldexError } from '../../dist/core/errors/error.js';
import { captureConfiguration } from '../../dist/core/contracts/schema.js';

const schema = { text: { title: { boost: 2 }, body: {} }, metadata: { tags: { type: 'string', multi: true }, value: { type: 'number', nullable: true } } };
const record = (id, title = 'common red', body = 'stable blue') => ({ id, text: { title, body }, metadata: { tags: ['Tag', 'Tag'], value: -0 } });
function drain(iterator) {
  let units = 0, steps = 0, maxStep = 0;
  for (;;) {
    const step = iterator.next();
    if (step.done) return { value: step.value, units, steps, maxStep };
    units += step.value.workUnits; steps++; maxStep = Math.max(maxStep, step.value.workUnits);
  }
}
function build(records = [], limits = {}) {
  const construction = new IndexConstruction({ schema, limits });
  for (let i = 0; i < records.length; i += 256) drain(construction.append(records.slice(i, i + 256)));
  return drain(construction.finish()).value;
}
function diagnostics() {
  const copies = () => ({ directories: 0, directoryPointers: 0, buckets: 0, bucketEntries: 0, writes: 0, deletes: 0, insertions: 0 });
  return { analysis: { records: 0, values: 0, textCodeUnits: 0 }, copies: { documents: copies(), dictionary: copies(), postings: copies(), fieldUpdates: 0, termUpdates: 0 }, workUnits: 0 };
}
function search(root, query = 'common') { return drain(executeSearch(root, query, { limit: Math.min(100, root.configuration.limits.maxDocuments) })).value; }
function rejects(owner, kind, input, code, options) {
  const old = owner.root, data = JSON.stringify(old), results = search(old);
  assert.throws(() => drain(owner.mutate(kind, input, options)), e => e.code === code);
  assert.equal(owner.root, old); assert.equal(JSON.stringify(old), data); assert.deepEqual(search(old), results);
  drain(inspectIndex(old));
}
function sourceParticipant(id = 'source', observe = () => {}) {
  return { id, *prepare(previous, context) {
    observe(context);
    const next = Object.create(null);
    if (context.kind !== 'clear') {
      for (const key of Object.keys(previous)) { yield { workUnits: key.length + 1 }; next[key] = previous[key]; }
      for (const change of context.changes) if (change.previous) { yield { workUnits: change.previous.id.length + 1 }; delete next[change.previous.id]; }
      for (const input of context.records) { yield { workUnits: input.id.length + input.textCodeUnits + 1 }; next[input.id] = input; }
    }
    return Object.freeze(next);
  } };
}
function withSource(records = [], extra = []) {
  const source = Object.create(null);
  // Fixture installation is coherent supplied state, not retroactive source recovery.
  function freeze(value) { if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; }
  for (const input of records) source[input.id] = freeze(input);
  const root = Object.freeze({ ...build(records), participants: Object.freeze(Object.assign(Object.create(null), { source: Object.freeze(source) }, ...extra.map(p => ({ [p.id]: Object.freeze({}) })))) });
  return root;
}

test('admission owns records, removals and options; conflict selection uses execution-start state', () => {
  const owner = new MutationOwner(build());
  const input = record('__proto__'), opts = { deadlineMs: 5 };
  const first = owner.capture('add', input, opts), second = owner.capture('add', input);
  input.id = 'changed'; input.text.title = 'later'; input.metadata.tags.push('Later'); opts.deadlineMs = 1;
  assert.equal(first.options.deadlineMs, 5); assert.ok(Object.isFrozen(first));
  assert.equal(drain(owner.execute(first)).value.added, 1);
  assert.throws(() => drain(owner.execute(second)), e => e.code === 'ID_EXISTS');
  assert.deepEqual(search(owner.root).hits.map(h => h.id), ['__proto__']);
  assert.deepEqual(directoryGet(owner.root.documents, '__proto__').metadata.tags, ['Tag']);
  const ids = ['__proto__'], removal = owner.capture('remove', ids);
  ids[0] = 'changed'; ids.push('another');
  assert.equal(drain(owner.execute(removal)).value.removed, 1);
  assert.throws(() => owner.execute(removal), e => e.code === 'INTERNAL_ERROR');
  const other = new MutationOwner(build());
  assert.throws(() => other.execute(owner.capture('clear')), e => e.code === 'INTERNAL_ERROR');
  const third = owner.capture('replace', record('next'));
  drain(owner.mutate('add', record('next')));
  assert.equal(drain(owner.execute(third)).value.replaced, 1);
  const bounded = new MutationOwner(build([], { maxAdmissionEntries: 14 }));
  const tiny = Array.from({ length: 4 }, (_, i) => ({ id: `a${i}`, text: {} })), signal = new AbortController().signal;
  assert.equal(drain(bounded.mutate('addMany', tiny, { deadlineMs: 5 })).value.added, 4); // array 5 + record keys 8 + options 1
  assert.throws(() => bounded.capture('addMany', tiny, { deadlineMs: 5, signal }), e => e.code === 'LIMIT_EXCEEDED' && e.details.actual === 15);
  const selected = Array.from({ length: 12 }, (_, i) => `a${i}`);
  assert.equal(bounded.capture('remove', selected, { deadlineMs: 5 }).options.deadlineMs, 5);
  assert.throws(() => bounded.capture('remove', selected, { deadlineMs: 5, signal }), e => e.code === 'LIMIT_EXCEEDED' && e.details.actual === 15);
});

test('malformed late input and duplicate offending paths preserve all state and permit reuse', () => {
  const owner = new MutationOwner(build([record('a')]));
  for (const [kind, input, code] of [
    ['addMany', [record('new'), record('bad', 'x\ud800')], 'INVALID_RECORD'],
    ['addMany', [record('new'), { id: 'bad', text: {}, metadata: { tags: ['\ud800'] } }], 'INVALID_RECORD'],
    ['add', record('\ud800'), 'INVALID_RECORD'], ['remove', ['a', '\ud800'], 'INVALID_OPTIONS'],
    ['addMany', [record('new'), record('a')], 'ID_EXISTS'],
    ['remove', ['a', 'a'], 'INVALID_OPTIONS'], ['replace', record('missing'), 'ID_NOT_FOUND'],
  ]) rejects(owner, kind, input, code);
  assert.throws(() => owner.mutate('addMany', [record('new'), record('new')]), e => e.code === 'INVALID_RECORD' && e.details.path === 'records[1].id');
  const property = { id: 'x', text: {} }; Object.defineProperty(property, 'metadata', { get() { throw new Error('Getter ran'); }, enumerable: true });
  rejects(owner, 'add', property, 'INVALID_RECORD');
  assert.equal(drain(owner.mutate('add', record('new'))).value.revision, 1);
});

test('one publication selects core/source/side roots together; old readers cannot see staging', () => {
  const original = record('a'), root = withSource([original]);
  let owner, calls = 0;
  const source = sourceParticipant('source', context => {
    calls++; assert.equal(owner.root, root); assert.equal(owner.root.participants.source.a, original);
    assert.equal(context.core.revision, 1); assert.equal(context.previous, root);
    assert.ok(Object.isFrozen(context) && Object.isFrozen(context.changes) && Object.isFrozen(context.records));
    assert.deepEqual(search(context.core, 'green').hits.map(h => h.id), ['a']);
  });
  owner = new MutationOwner(root, [source]);
  const work = owner.mutate('replace', record('a', 'green green'));
  for (;;) {
    const step = work.next();
    if (step.done) { assert.deepEqual(step.value, { revision: 1, changed: true, added: 0, replaced: 1, removed: 0 }); break; }
    assert.equal(owner.root, root); assert.equal(owner.root.participants.source.a, original);
    assert.equal(search(root).total, 1);
  }
  assert.equal(calls, 1); assert.equal(search(owner.root, 'green').total, 1);
  assert.equal(owner.root.participants.source.a.text.title[0], 'green green');
  assert.equal(search(root, 'green').total, 0);
  drain(inspectIndex(owner.root));
  assert.ok(Object.isFrozen(owner.root.participants));
});

test('batch stages source once, clear resets every participant, noops never call prepare', () => {
  let calls = 0;
  const owner = new MutationOwner(withSource(), [sourceParticipant('source', () => calls++)]);
  for (const [kind, input] of [['clear', undefined], ['addMany', []], ['remove', []], ['remove', ['missing']]]) assert.equal(drain(owner.mutate(kind, input)).value.changed, false);
  assert.equal(calls, 0);
  assert.equal(drain(owner.mutate('addMany', [record('a'), record('b')])).value.revision, 1);
  assert.equal(calls, 1); assert.equal(Object.keys(owner.root.participants.source).length, 2);
  const same = record('a'); assert.equal(drain(owner.mutate('replace', same)).value.revision, 2);
  assert.equal(drain(owner.mutate('clear')).value.removed, 2);
  assert.equal(calls, 3); assert.equal(owner.root.documents.size, 0); assert.equal(Object.keys(owner.root.participants.source).length, 0);
  assert.equal(drain(owner.mutate('clear')).value.revision, 3); assert.equal(calls, 3);
  assert.equal(drain(owner.mutate('add', record('repopulated'))).value.revision, 4);
});

test('faults at every phase roll back prepared roots and preserve the specific first error', () => {
  for (const phase of ['start', 'validation', 'analysis', 'staging', 'core', 'participant', 'prepared', 'precommit']) {
    const old = withSource([record('a')]), owner = new MutationOwner(old, [sourceParticipant()]);
    const previous = JSON.stringify(old), expected = search(old), failure = new RaveldexError(phase === 'staging' ? 'RESOURCE_EXHAUSTED' : 'INTERNAL_ERROR', { path: `test.${phase}` });
    assert.throws(() => drain(owner.execute(owner.capture('replace', record('a', 'green')), { checkpoint(at) { if (at === phase) throw failure; } })), e => e === failure);
    assert.equal(owner.root, old); assert.equal(JSON.stringify(old), previous); assert.deepEqual(search(old), expected);
    assert.equal(drain(owner.mutate('replace', record('a', 'green'))).value.revision, 1);
  }
});

test('failure in a later participant cannot publish an earlier prepared root; cleanup preserves original error', () => {
  const failure = new RaveldexError('RESOURCE_EXHAUSTED'), cleanup = new Error('cleanup');
  const failing = { id: 'second', prepare() { return { next() { throw failure; }, return() { throw cleanup; } }; } };
  const old = withSource([record('a')], [failing]), before = JSON.stringify(old);
  let firstFinished = false;
  const first = sourceParticipant('source', () => firstFinished = true);
  const owner = new MutationOwner(old, [first, failing]);
  assert.throws(() => drain(owner.mutate('replace', record('a', 'changed'))), e => e === failure);
  assert.ok(firstFinished); assert.equal(owner.root, old); assert.equal(JSON.stringify(old), before);
  assert.equal(search(old).total, 1);
});

test('abort at every yielded boundary including final precommit leaves root unchanged; late abort stays success', t => {
  const original = withSource([record('a')]);
  const steps = drain(new MutationOwner(original, [sourceParticipant()]).mutate('replace', record('a', 'new red red'))).steps;
  for (let stop = 0; stop <= steps; stop++) {
    const controller = new AbortController(), owner = new MutationOwner(original, [sourceParticipant()]);
    const cursor = owner.mutate('replace', record('a', 'new red red'), { signal: controller.signal });
    for (let i = 0; i < stop; i++) assert.equal(cursor.next().done, false);
    controller.abort(); assert.throws(() => drain(cursor), e => e.code === 'CANCELLED');
    assert.equal(owner.root, original); assert.equal(search(original).total, 1);
    assert.equal(drain(owner.mutate('replace', record('a', 'new red red'))).value.revision, 1);
  }
  t.diagnostic(`${steps + 1} abort injection positions, including immediately before commit`);
  const controller = new AbortController(), owner = new MutationOwner(original, [sourceParticipant()]);
  const result = drain(owner.mutate('replace', record('a'), { signal: controller.signal })).value;
  controller.abort(); assert.equal(result.revision, 1); assert.equal(owner.root.revision, 1);
  for (const [kind, input] of [['clear', undefined], ['addMany', []], ['remove', ['missing']]]) {
    const empty = new MutationOwner(build()); rejects(empty, kind, input, 'CANCELLED', { signal: controller.signal });
  }
});

test('abandoning every cursor position releases the owner, including unstarted and participant preparation', t => {
  const original = withSource([record('a')]), replacement = record('a', 'new new red');
  const steps = drain(new MutationOwner(original, [sourceParticipant()]).mutate('replace', replacement)).steps;
  for (let stop = 0; stop <= steps; stop++) {
    const owner = new MutationOwner(original, [sourceParticipant()]), cursor = owner.mutate('replace', replacement);
    for (let i = 0; i < stop; i++) assert.equal(cursor.next().done, false);
    cursor.return(undefined); assert.equal(owner.root, original);
    assert.equal(drain(owner.mutate('replace', replacement)).value.revision, 1);
  }
  t.diagnostic(`${steps + 1} abandonment injection positions`);
  const owner = new MutationOwner(original, [sourceParticipant()]), cursor = owner.mutate('replace', replacement);
  cursor.next(); const error = new Error('injected'); assert.throws(() => cursor.throw(error), e => e === error);
  assert.equal(owner.root, original); assert.equal(drain(owner.mutate('clear')).value.revision, 1);
});

test('only one cursor can run; unstarted captures and abandoned cursors do not claim the owner', () => {
  const owner = new MutationOwner(build()), first = owner.mutate('add', record('a')), abandoned = owner.mutate('add', record('b'));
  abandoned.return(undefined); first.next();
  assert.throws(() => drain(owner.mutate('add', record('c'))), e => e.code === 'INTERNAL_ERROR');
  assert.equal(owner.root.revision, 0); drain(first); assert.equal(owner.root.revision, 1);
  assert.equal(drain(owner.mutate('add', record('c'))).value.revision, 2);
});

test('net live-state bounds are inclusive; replacement does not reject temporary old/new overlap', () => {
  const limits = { maxDocuments: 1, maxCorpusTextCodeUnits: 3, maxCorpusTokens: 1, maxDictionaryEntries: 1, maxPostingEntries: 1 };
  const owner = new MutationOwner(build([{ id: 'a', text: { title: 'aaa' } }], limits));
  const result = drain(owner.mutate('replace', { id: 'a', text: { title: 'bbb' } })).value;
  assert.equal(result.revision, 1); assert.equal(search(owner.root, 'aaa').total, 0); assert.equal(search(owner.root, 'bbb').total, 1);
  rejects(owner, 'add', { id: 'new', text: {} }, 'LIMIT_EXCEEDED');
  rejects(owner, 'replace', { id: 'a', text: { title: 'long' } }, 'LIMIT_EXCEEDED');
  for (const [key, maximum, batch] of [
    ['maxCorpusTokens', 2, [{ id: 'b', text: { title: 'a b c' } }]],
    ['maxDictionaryEntries', 2, [{ id: 'b', text: { title: 'a b c' } }]],
    ['maxPostingEntries', 2, [{ id: 'b', text: { title: 'same' } }, { id: 'c', text: { title: 'same' } }]],
  ]) {
    const bounded = new MutationOwner(build([{ id: 'a', text: { title: 'same' } }], { [key]: maximum }));
    rejects(bounded, 'addMany', batch, 'LIMIT_EXCEEDED');
    assert.equal(drain(bounded.mutate('remove', 'a')).value.removed, 1);
  }
});

test('one work budget covers analysis, core copying and participant work through final publication', () => {
  const old = withSource([record('a')]);
  const d = diagnostics(), replacement = record('a', 'green red red');
  const owner = new MutationOwner(old, [sourceParticipant()]);
  const baseline = drain(owner.execute(owner.capture('replace', replacement), { diagnostics: d }));
  assert.equal(d.workUnits, baseline.units); assert.equal(d.analysis.records, 1);
  for (const cap of [baseline.units, baseline.units - 1]) {
    const bounded = Object.freeze({ ...old, configuration: captureConfiguration({ schema, limits: { maxMutationWorkUnits: cap, checkpointWorkUnits: 1 } }) });
    const target = new MutationOwner(bounded, [sourceParticipant()]);
    if (cap === baseline.units) assert.equal(drain(target.mutate('replace', replacement)).value.revision, 1);
    else rejects(target, 'replace', replacement, 'WORK_LIMIT_EXCEEDED');
  }
  const expensive = { id: 'source', *prepare() { yield { workUnits: 50_000_000 }; return Object.freeze({}); } };
  const target = new MutationOwner(old, [expensive]);
  rejects(target, 'replace', replacement, 'WORK_LIMIT_EXCEEDED');
});

test('replacement shares unrelated records, dictionary buckets and common posting buckets', () => {
  const records = Array.from({ length: 100 }, (_, i) => ({ id: `id:${i}`, text: { title: 'common red', ...(i ? { body: 'stable blue' } : {}) } }));
  const old = build(records), owner = new MutationOwner(old), d = diagnostics(), id = records[0].id;
  drain(owner.execute(owner.capture('replace', { id, text: { title: 'common common green' } }), { diagnostics: d }));
  const next = owner.root;
  assert.equal(d.analysis.records, 1); assert.equal(d.analysis.values, 1); assert.equal(d.analysis.textCodeUnits, 19);
  assert.equal(next.fields.body, old.fields.body, 'unrelated field root shared');
  for (const [other, doc] of directoryEntries(old.documents)) if (other !== id) assert.equal(directoryGet(next.documents, other), doc);
  for (const [slot, bucket] of Object.entries(old.documents.buckets)) {
    if (slot !== bucketOf(id)) assert.equal(next.documents.buckets[slot], bucket);
    else assert.notEqual(next.documents.buckets[slot], bucket);
  }
  const previous = directoryGet(old.fields.title.terms, 'common'), current = directoryGet(next.fields.title.terms, 'common');
  assert.equal(current.df, 100); assert.equal(current.frequency, 101);
  for (const [slot, bucket] of Object.entries(previous.postings.buckets)) {
    if (slot !== bucketOf(id)) assert.equal(current.postings.buckets[slot], bucket);
    else assert.notEqual(current.postings.buckets[slot], bucket);
  }
  assert.equal(previous.frequency, 100); assert.equal(directoryGet(previous.postings, id), 1);
  drain(inspectIndex(next));
});

test('collision buckets copy once per whole batch and remove empty term/posting buckets', () => {
  const ids = [], slot = bucketOf('collision:0');
  for (let i = 0; ids.length < 40; i++) if (bucketOf(`collision:${i}`) === slot) ids.push(`collision:${i}`);
  const old = build(ids.map(id => ({ id, text: { title: 'common' } }))), owner = new MutationOwner(old), d = diagnostics();
  const removed = ids.slice(0, 30);
  const result = drain(owner.execute(owner.capture('remove', removed), { diagnostics: d })).value;
  assert.equal(result.removed, 30); assert.equal(result.revision, 1);
  assert.equal(d.analysis.records, 0);
  assert.equal(d.copies.documents.buckets, 1); assert.equal(d.copies.documents.bucketEntries, 40);
  assert.equal(d.copies.postings.buckets, 1); assert.equal(d.copies.postings.bucketEntries, 40);
  assert.equal(d.copies.dictionary.buckets, 1); assert.equal(d.copies.dictionary.bucketEntries, 1);
  assert.equal(directoryGet(owner.root.fields.title.terms, 'common').df, 10);
  drain(inspectIndex(owner.root));
  drain(owner.mutate('remove', ids.slice(30)));
  assert.equal(owner.root.fields.title.terms.size, 0); assert.deepEqual(Object.keys(owner.root.fields.title.terms.buckets), []);
  assert.equal(owner.root.fields.title.documents, 0); assert.equal(owner.root.fields.title.length, 0);
  assert.equal(owner.root.counts.postingEntries, 0); assert.equal(owner.root.documents.size, 0);
  drain(inspectIndex(owner.root));
});

test('directory stage caches an empty touched bucket across delete/set and seals terminally', () => {
  const count = diagnostics().copies.documents, charge = workUnits => ({ workUnits });
  const original = emptyDirectory(), stage = new DirectoryStage(original, charge, count);
  drain(stage.set('__proto__', 1)); drain(stage.delete('__proto__')); drain(stage.set('__proto__', 2));
  assert.equal(count.buckets, 1); const final = drain(stage.finish()).value;
  assert.equal(final.size, 1); assert.equal(directoryGet(final, '__proto__'), 2); assert.equal(original.size, 0);
  assert.throws(() => drain(stage.finish()), e => e.code === 'INTERNAL_ERROR');
  assert.throws(() => drain(stage.set('new', 1)), e => e.code === 'INTERNAL_ERROR');
});

test('revision exhaustion rejects changing operations, while noops preserve maximum revision', () => {
  const old = Object.freeze({ ...build([record('a')]), revision: Number.MAX_SAFE_INTEGER }), owner = new MutationOwner(old);
  for (const [kind, input] of [['add', record('new')], ['addMany', [record('new')]], ['replace', record('a')], ['remove', 'a'], ['clear', undefined]]) rejects(owner, kind, input, 'REVISION_EXHAUSTED');
  for (const [kind, input] of [['addMany', []], ['remove', []], ['remove', 'missing']]) assert.equal(drain(owner.mutate(kind, input)).value.revision, old.revision);
  const empty = new MutationOwner(Object.freeze({ ...build(), revision: Number.MAX_SAFE_INTEGER }));
  assert.equal(drain(empty.mutate('clear')).value.changed, false);
  for (const revision of [-1, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => new MutationOwner(Object.freeze({ ...build(), revision })), e => e.code === 'INTERNAL_ERROR');
});

test('live configuration stays immutable and incompatible participant roots/handlers fail explicitly', () => {
  const old = build([record('a')]), owner = new MutationOwner(old);
  assert.throws(() => { owner.root.configuration.schema.text.title.boost = 9; }, TypeError);
  rejects(owner, 'replace', { ...record('a'), schema: { text: { other: {} } } }, 'INVALID_RECORD');
  rejects(owner, 'replace', { ...record('a'), analyzer: { id: 'other' } }, 'INVALID_RECORD');
  rejects(owner, 'add', { id: 'x', text: { other: 'new schema' } }, 'INVALID_RECORD');
  assert.equal(drain(owner.mutate('replace', record('a'))).value.revision, 1); assert.equal(owner.root.configuration, old.configuration);
  assert.throws(() => new MutationOwner(old, [sourceParticipant()]), e => e.code === 'INCOMPATIBLE_CAPABILITY');
  assert.throws(() => new MutationOwner(withSource()), e => e.code === 'INCOMPATIBLE_CAPABILITY');
  assert.throws(() => new MutationOwner(withSource(), [sourceParticipant(), sourceParticipant()]), e => e.code === 'INCOMPATIBLE_CAPABILITY');
  const otherSchema = { text: { other: {} } }, next = new IndexConstruction({ schema: otherSchema });
  drain(next.append([{ id: 'a', text: { other: 'rebuilt' } }]));
  const rebuilt = drain(next.finish()).value;
  assert.equal(rebuilt.revision, 0); assert.equal(search(rebuilt, 'rebuilt').total, 1); assert.equal(search(owner.root, 'rebuilt').total, 0);
});

test('affected invalid reverse/term/statistics fail before publication rather than clamping', () => {
  const original = build([record('a')]);
  function brokenTerm(change) {
    const field = original.fields.title, slot = bucketOf('common'), entry = directoryGet(field.terms, 'common');
    const bucket = Object.freeze(Object.assign(Object.create(null), field.terms.buckets[slot], { common: Object.freeze({ ...entry, ...change }) }));
    const terms = Object.freeze({ ...field.terms, buckets: Object.freeze(Object.assign(Object.create(null), field.terms.buckets, { [slot]: bucket })) });
    return Object.freeze({ ...original, fields: Object.freeze({ ...original.fields, title: Object.freeze({ ...field, terms }) }) });
  }
  for (const root of [brokenTerm({ df: 2 }), brokenTerm({ frequency: 0 }), brokenTerm({ df: -1 }), Object.freeze({ ...original, counts: Object.freeze({ ...original.counts, documents: 0 }) })]) {
    const owner = new MutationOwner(root);
    assert.throws(() => drain(owner.mutate('remove', 'a')), e => e.code === 'INTERNAL_ERROR'); assert.equal(owner.root, root);
  }
});
