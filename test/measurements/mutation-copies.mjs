// Deterministic work/logical structure counts; no heap or latency claims.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { platform, release, arch } from 'node:os';
import { IndexConstruction } from '../../dist/core/index/construction.js';
import { MutationOwner } from '../../dist/core/mutations/owner.js';
import { directoryGet, directoryEntries, bucketOf } from '../../dist/core/index/directory.js';
import { inspectIndex } from '../../dist/core/index/invariants.js';
import { executeSearch } from '../../dist/core/query/search.js';
import { EXACT_SCHEMA, EXACT_CORPUS_SEEDS, generatedExactCorpus } from '../fixtures/corpora/exact.mjs';
import { scanSourceCorpus, sourceQueryResult } from '../oracle/query.mjs';
import { reconstructSourceState } from '../oracle/mutations.mjs';

function drain(iterator) {
  let workUnits = 0, steps = 0, largestStep = 0;
  for (;;) {
    const step = iterator.next();
    if (step.done) return { value: step.value, workUnits, steps, largestStep };
    workUnits += step.value.workUnits; steps++; largestStep = Math.max(largestStep, step.value.workUnits);
  }
}
function counters() {
  const copy = () => ({ directories: 0, directoryPointers: 0, buckets: 0, bucketEntries: 0, writes: 0, deletes: 0, insertions: 0 });
  return { analysis: { records: 0, values: 0, textCodeUnits: 0 }, copies: { documents: copy(), dictionary: copy(), postings: copy(), fieldUpdates: 0, termUpdates: 0 }, workUnits: 0 };
}
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const sorted = entries => [...entries].sort(([a], [b]) => compare(a, b));
function observed(root) {
  return {
    revision: root.revision, counts: root.counts,
    documents: sorted(directoryEntries(root.documents)).map(([id, doc]) => [id, { id, textCodeUnits: doc.textCodeUnits, metadata: sorted(Object.entries(doc.metadata)), fields: sorted(Object.entries(doc.fields)).map(([name, field]) => [name, { length: field.length, terms: sorted(Object.entries(field.terms)) }]) }]),
    fields: sorted(Object.entries(root.fields)).map(([name, field]) => [name, { documents: field.documents, length: field.length, terms: sorted(directoryEntries(field.terms)).map(([key, term]) => [key, { df: term.df, frequency: term.frequency, postings: sorted(directoryEntries(term.postings)) }]) }]),
  };
}
function verify(root, records) {
  drain(inspectIndex(root));
  assert.deepEqual(observed(root), reconstructSourceState(records, EXACT_SCHEMA, root.revision));
  const corpus = scanSourceCorpus(records, EXACT_SCHEMA);
  for (const query of ['common', 'replacement', { kind: 'group', variants: [{ text: 'co', match: 'prefix' }] }, { kind: 'all' }]) {
    const options = { limit: 20 }, actual = drain(executeSearch(root, query, options)).value, expected = sourceQueryResult(corpus, query, options);
    assert.equal(actual.total, expected.total); assert.deepEqual(actual.hits.map(h => h.id), expected.hits.map(h => h.id));
    for (let i = 0; i < expected.hits.length; i++) assert.ok(Math.abs(actual.hits[i].score - expected.hits[i].score) <= Math.max(1e-12, Math.abs(expected.hits[i].score) * 1e-12));
  }
}
function sharing(previous, next, changedId) {
  let reusedDocuments = 0, reusedDocumentBuckets = 0, reusedDictionaryBuckets = 0, reusedPostingBuckets = 0;
  for (const [id, doc] of directoryEntries(previous.documents)) if (id !== changedId && directoryGet(next.documents, id) === doc) reusedDocuments++;
  for (const [slot, bucket] of Object.entries(previous.documents.buckets)) if (next.documents.buckets[slot] === bucket) reusedDocumentBuckets++;
  for (const [name, field] of Object.entries(previous.fields)) {
    for (const [slot, bucket] of Object.entries(field.terms.buckets)) if (next.fields[name].terms.buckets[slot] === bucket) reusedDictionaryBuckets++;
    for (const [key, term] of directoryEntries(field.terms)) {
      const current = directoryGet(next.fields[name].terms, key);
      if (current) for (const [slot, bucket] of Object.entries(term.postings.buckets)) if (current.postings.buckets[slot] === bucket) reusedPostingBuckets++;
    }
  }
  return { reusedDocuments, reusedDocumentBuckets, reusedDictionaryBuckets, reusedPostingBuckets };
}
const rows = [];
for (const size of [100, 1000, 10000]) {
  const records = generatedExactCorpus(size, EXACT_CORPUS_SEEDS[0]);
  const builder = new IndexConstruction({ schema: EXACT_SCHEMA });
  for (let i = 0; i < size; i += 256) drain(builder.append(records.slice(i, i + 256)));
  const old = drain(builder.finish()).value, target = records[0];
  const replacement = { id: target.id, text: { title: 'common replacement red red', body: ['common common blue', 'ＦＯＯ café'] }, ...(target.metadata ? { metadata: target.metadata } : {}) };
  const owner = new MutationOwner(old), diagnostics = counters();
  const operation = drain(owner.execute(owner.capture('replace', replacement), { diagnostics }));
  const expected = records.map(record => record.id === target.id ? replacement : record);
  verify(owner.root, expected); verify(old, records);
  assert.equal(diagnostics.analysis.records, 1); assert.equal(diagnostics.analysis.values, 3);
  assert.equal(diagnostics.analysis.textCodeUnits, Object.values(replacement.text).flat().reduce((sum, value) => sum + value.length, 0));
  assert.equal(diagnostics.workUnits, operation.workUnits);
  const common = directoryGet(old.fields.body.terms, 'common');
  const slot = bucketOf(target.id), copiedCommonBucketSize = Object.keys(common.postings.buckets[slot]).length;
  assert.equal(directoryGet(owner.root.fields.body.terms, 'common').df, size);
  const shared = sharing(old, owner.root, target.id); assert.equal(shared.reusedDocuments, size - 1);
  rows.push({ records: size, corpusSha256: createHash('sha256').update(JSON.stringify(records)).digest('hex'), operation: 'replace one record (three values, frequent common terms)', changedId: target.id, mutationResult: operation.value, workUnits: operation.workUnits, steps: operation.steps, largestStep: operation.largestStep, commonBodyDfBefore: common.df, commonBodyPostingBucketEntriesCopied: copiedCommonBucketSize, diagnostics, sharing: shared });
}
process.stdout.write(JSON.stringify({ task: 'RX-1004', policy: 'work-v1', seed: `0x${EXACT_CORPUS_SEEDS[0].toString(16)}`, environment: { node: process.version, v8: process.versions.v8, icu: process.versions.icu, unicode: process.versions.unicode, platform: platform(), osRelease: release(), arch: arch() }, notes: [
  'Construction, diagnostics verification and source oracle work are excluded from mutation counts. Frequency-only mode: no participant/source/positions retained.',
  'Actual analyzeRecord/analyzeValue entry counters visit only one supplied replacement record and its three original values. Other records and bucket references are inspected only after the measured operation.',
  'copies.directories/buckets count new staging pointer directories/key buckets; directoryPointers/bucketEntries count copied entries. writes/deletes/insertions count logical updates/new bucket keys. These are partial logical allocation counts, not allocation-byte, retained-heap or peak-memory measurements.',
  'A common posting list has 100/1000/10000 members; replacement copies its affected hash bucket, not the whole list. Directory pointers and collision buckets have real work; no constant-time claim.',
  'Full source state reconstruction and complete query IDs/totals/scores are verified for both old and new roots at every size.',
  'Native Object.keys/freeze/hash/normalization/allocation are bounded indivisible primitives. Largest yielded charge is not interruption time. Public FIFO/clock/host yielding remain RX-1005; no latency/package-size/browser qualification is claimed.',
], rows }, null, 2) + '\n');
