import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeSearch } from '../../dist/core/query/search.js';
import { scanPhraseSourceCorpus, sourcePhraseQueryResult } from '../oracle/phrases.mjs';
import { setup, extension, compare, drain } from '../addons/phrases/helpers.mjs';

export async function measurePhraseWork() {
  const schema = { text: { body: {} } }, rows = [];
  for (const count of [100, 1000, 10000]) {
    const records = Array.from({ length: count }, (_, i) => ({ id: `r${String(i).padStart(5, '0')}`, text: { body: i === count - 1 ? 'red blue' : 'red gap blue' } }));
    const { engine, call } = setup(schema);
    for (let i = 0; i < count; i += 256) await call('addMany', records.slice(i, i + 256));
    const root = engine.root, source = root.participants.source;
    const lexical = drain(executeSearch(root, 'red blue', { limit: 0 })); assert.equal(lexical.value.total, count);
    const phrase = drain(executeSearch(root, extension('red blue'), { limit: 100 }));
    compare(phrase.value, sourcePhraseQueryResult(scanPhraseSourceCorpus(records, schema), { kind: 'phrase', text: 'red blue' }, { limit: 100 }), root.revision);
    assert.equal(phrase.value.total, 1); assert.equal(source.retainedEntries, count * 3);
    const previousFirst = source.records, replacement = await call('replace', { id: records[0].id, text: { body: 'red blue' } });
    const after = engine.root.participants.source;
    assert.notEqual(after.records, previousFirst); assert.equal(source.textCodeUnits, (count - 1) * 12 + 8);
    assert.equal((await call('search', extension('red blue'), { limit: 0 })).total, 2);
    await call('clear'); assert.equal(engine.root.participants.source.retainedEntries, 0); assert.equal(engine.root.participants.source.records.size, 0);
    rows.push({ documents: count, revision: root.revision, lexicalCandidates: lexical.value.total, phraseMatches: phrase.value.total, lexicalWorkUnits: lexical.workUnits, phraseWorkUnits: phrase.workUnits, sourceRetainedEntries: source.retainedEntries, sourceTextCodeUnits: source.textCodeUnits, sourceDirectoryBuckets: Object.keys(source.records.buckets).length,
      replacementRevision: replacement.revision, clearedRevision: engine.root.revision });
    await engine.dispose(); assert.equal(engine.root, undefined);
  }
  return { environment: { node: process.version, platform: process.platform, arch: process.arch }, policy: 'work-v1', sourceEntryMeaning: 'one record + one present selected field + one original value', limitations: 'Logical entries/code units/work only; no heap bytes, peak memory, physical latency or capacity guarantee.', rows };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await measurePhraseWork(); if (process.argv[2]) await writeFile(resolve(process.argv[2]), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report));
}
