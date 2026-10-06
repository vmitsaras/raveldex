// Reproducible structure/work diagnostics, not timing or heap-memory benchmarks.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { platform, release, arch } from 'node:os';
import { IndexConstruction } from '../../dist/core/index/construction.js';
import { directoryEntries } from '../../dist/core/index/directory.js';
import { inspectIndex } from '../../dist/core/index/invariants.js';
import { exactIds } from '../../dist/core/retrieval/exact.js';
import { EXACT_SCHEMA, EXACT_CORPUS_SEEDS, generatedExactCorpus } from '../fixtures/corpora/exact.mjs';
import { sourceExactIds } from '../oracle/exact.mjs';

function drain(iterator) {
  let workUnits = 0, steps = 0;
  while (true) {
    const step = iterator.next();
    if (step.done) return { value: step.value, workUnits, steps };
    workUnits += step.value.workUnits;
    steps++;
  }
}
function retained(root) {
  let dictionaryBuckets = 0, postingBuckets = 0, reverseFields = 0, reverseTerms = 0, metadataFields = 0, metadataValues = 0;
  for (const field of Object.values(root.fields)) {
    dictionaryBuckets += Object.keys(field.terms.buckets).length;
    for (const [, term] of directoryEntries(field.terms)) postingBuckets += Object.keys(term.postings.buckets).length;
  }
  for (const [, doc] of directoryEntries(root.documents)) {
    reverseFields += Object.keys(doc.fields).length;
    for (const field of Object.values(doc.fields)) reverseTerms += Object.keys(field.terms).length;
    metadataFields += Object.keys(doc.metadata).length;
    for (const value of Object.values(doc.metadata)) metadataValues += Array.isArray(value) ? value.length : 1;
  }
  const seen = new Set();
  function visit(value) {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value); for (const child of Object.values(value)) visit(child);
  }
  visit(root);
  return { reachableObjects: seen.size, documentBuckets: Object.keys(root.documents.buckets).length, dictionaryBuckets, postingBuckets, reverseFields, reverseTerms, metadataFields, metadataValues };
}

const rows = [];
for (const size of [100, 1_000, 10_000]) {
  const records = generatedExactCorpus(size, EXACT_CORPUS_SEEDS[0]);
  const construction = new IndexConstruction({ schema: EXACT_SCHEMA });
  const batches = [];
  for (let i = 0; i < records.length; i += 256) batches.push(drain(construction.append(records.slice(i, i + 256))));
  const finished = drain(construction.finish());
  const root = finished.value;
  const invariant = drain(inspectIndex(root));
  const common = drain(exactIds(root, 'common'));
  assert.deepEqual([...common.value].sort(), sourceExactIds(records, EXACT_SCHEMA, 'common').sort());
  assert.equal(common.value.length, size);
  const structure = retained(root);
  assert.equal(structure.reverseTerms, root.counts.postingEntries);
  assert.equal(construction.workUnits, batches.reduce((sum, row) => sum + row.workUnits, 0) + finished.workUnits);
  rows.push({ records: size, seed: `0x${EXACT_CORPUS_SEEDS[0].toString(16)}`, corpusSha256: createHash('sha256').update(JSON.stringify(records)).digest('hex'), admittedBatches: batches.length, constructionWorkUnits: construction.workUnits, constructionSteps: batches.reduce((sum, row) => sum + row.steps, 0) + finished.steps, maxBatchWorkUnits: Math.max(...batches.map((row) => row.workUnits)), finalizationWorkUnits: finished.workUnits, invariantWorkUnits: invariant.workUnits, commonLookupWorkUnits: common.workUnits, exactCommonMembers: common.value.length, liveCounts: root.counts, retainedStructureCounts: structure });
}
process.stdout.write(JSON.stringify({ task: 'RX-1002', policy: 'work-v1', configuration: 'basic-v1/unqualified, frequency-only, EXACT_SCHEMA', environment: { node: process.version, v8: process.versions.v8, icu: process.versions.icu, unicode: process.versions.unicode, platform: platform(), osRelease: release(), arch: arch() }, notes: ['Internal construction uses separately captured batches of at most 256 records plus finalization; these are not public engine commits/revisions.', 'Counts describe the completed frequency-only root. They exclude caller fixture data, captured batches, old/staged overlap, runtime/harness allocations and collector effects.', 'Reachable-object and bucket counts are not retained/peak heap bytes. No latency, memory capacity, package cost or host scheduling qualification is claimed.'], rows }, null, 2) + '\n');
