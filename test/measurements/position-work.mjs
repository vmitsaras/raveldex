import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureConfiguration } from '../../dist/core/contracts/schema.js';
import { initializeParticipants } from '../../dist/core/capabilities/participants.js';
import { emptyRoot } from '../../dist/core/execution/engine.js';
import { MutationOwner } from '../../dist/core/mutations/owner.js';
import { executeSearch } from '../../dist/core/query/search.js';
import { createSourceProvider, createSourcePhrases } from '../../dist/addons/phrases/index.js';
import { createPositionProvider } from '../../dist/addons/positions/index.js';
import { createPositionPhrases } from '../../dist/addons/positions/phrases.js';
import { scanPhraseSourceCorpus, sourcePhraseQueryResult } from '../oracle/phrases.mjs';
import { compare, drain, extension } from '../addons/phrases/helpers.mjs';

export function measurePositionWork() {
  const schema = { text: { body: {} } }, rows = [];
  for (const count of [100, 1000, 10000]) {
    const records = Array.from({ length: count }, (_, i) => ({ id: `r${String(i).padStart(5, '0')}`, text: { body: i === count - 1 ? 'red blue' : 'red gap blue' } }));
    const expected = sourcePhraseQueryResult(scanPhraseSourceCorpus(records, schema), { kind: 'phrase', text: 'red blue' }, { limit: 100 });
    const configs = {
      frequencies: [],
      source: [createSourceProvider({ fields: ['body'] }), createSourcePhrases({ fields: ['body'] })],
      positions: [createPositionProvider({ fields: ['body'] }), createPositionPhrases({ fields: ['body'] })],
      positionsOffsets: [createPositionProvider({ fields: ['body'], offsets: ['body'] }), createPositionPhrases({ fields: ['body'] })],
    };
    let phraseResult;
    for (const [representation, addons] of Object.entries(configs)) {
      const configuration = captureConfiguration({ schema, addons });
      const installed = initializeParticipants(configuration), owner = new MutationOwner(emptyRoot(configuration, installed.states), installed.participants);
      let buildWorkUnits = 0;
      for (let i = 0; i < count; i += 256) buildWorkUnits += drain(owner.mutate('addMany', records.slice(i, i + 256))).workUnits;
      const root = owner.root;
      const query = representation === 'frequencies' ? 'red blue' : extension('red blue');
      const search = drain(executeSearch(root, query, { limit: 100 }));
      if (representation !== 'frequencies') {
        compare(search.value, expected, root.revision);
        if (phraseResult) assert.deepEqual(search.value, phraseResult); else phraseResult = search.value;
      } else { assert.equal(search.value.total, count); assert.deepEqual(Object.keys(root.participants), []); }
      const side = root.participants.source ?? root.participants.positions;
      const replacement = drain(owner.mutate('replace', { id: records[0].id, text: { body: 'red blue' } }));
      if (representation !== 'frequencies') assert.equal(drain(executeSearch(owner.root, query, { limit: 0 })).value.total, 2);
      const clear = drain(owner.mutate('clear'));
      for (const value of Object.values(owner.root.participants)) { assert.equal(value.records.size, 0); assert.equal(value.retainedEntries, 0); }
      rows.push({ documents: count, representation, revision: root.revision, buildWorkUnits,
        searchWorkUnits: search.workUnits, queryTotal: search.value.total,
        retained: side ? Object.fromEntries(['retainedEntries', 'textCodeUnits', 'occurrenceCount', 'offsetCount', 'termEntries', 'termCodeUnits'].filter(key => key in side).map(key => [key, side[key]])) : {},
        sideDirectoryBuckets: side ? Object.keys(side.records.buckets).length : 0,
        replacementWorkUnits: replacement.workUnits, replacementRevision: replacement.value.revision,
        clearWorkUnits: clear.workUnits, clearRevision: clear.value.revision });
    }
  }
  return { environment: { node: process.version, platform: process.platform, arch: process.arch }, policy: 'work-v1',
    method: 'Complete internal MutationOwner and search cursors; actual incremental batches, replacement and clear with installed first-party participants.',
    limitations: 'Logical retained structures and charged cursor work; no heap bytes, peak memory, physical latency or capacity guarantee. Frequency query qualifies every record; phrase queries qualify one, so query costs are not a speed comparison.', rows };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = measurePositionWork(); if (process.argv[2]) await writeFile(resolve(process.argv[2]), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report));
}
