# Directional token synonyms

Import this optional entry and register an explicit domain vocabulary. Installation alone never changes a query. Keep the vocabulary version under your application's control.

```js
import assert from 'node:assert/strict';
import { createRaveldex } from '@vmitsaras/raveldex';
import { createSynonyms, SYNONYMS_POLICY } from '@vmitsaras/raveldex/addons/synonyms';

const engine = createRaveldex({
  schema: { text: { title: {} } },
  addons: [createSynonyms({ fields: ['title'], vocabularyVersion: 'docs-v1', mappings: [
    { from: 'backup', to: 'snapshot' },
    { from: 'snapshot', to: 'archive' },
  ] })],
});
try {
  await engine.addMany([
    { id: 'saved', text: { title: 'snapshot guide' } },
    { id: 'old', text: { title: 'archive guide' } },
  ]);
  assert.equal((await engine.search('backup')).total, 0);
  const result = await engine.search({ kind: 'extension', capability: 'synonyms', version: 1,
    payload: { text: 'backup guide', fields: ['title'] } });
  assert.deepEqual(result.hits.map(hit => hit.id), ['saved']);
  assert.equal(result.extensions.synonyms.policy, `${SYNONYMS_POLICY}:docs-v1`);
  console.log(result.extensions.synonyms.policy);
} finally { await engine.dispose(); }
```

`createSynonyms({ fields, vocabularyVersion, mappings, id?, maxAlternatives?, maxWorkUnits? })` owns its finite plain input. Each mapping is directional `{ from, to }`. Endpoints must each produce exactly one `basic-v1` token; NFKC/lowercase is applied once, with duplicate and self edges ignored. Zero/multiple tokens or malformed UTF-16 reject. `fields` is a nonempty set of enabled schema text fields. The explicit query payload is exactly `{ text, fields? }`; omitted fields selects all schema text fields, each of which must be enabled. Default registration ID/provided capability is `synonyms`; protocol version is 1. Custom `id` changes only registration identity.

The named policy is `directional-one-step-v1`. Original terms retain weight 1; live direct mapped targets get weight 0.5, including when the original exists. Required original words stay AND groups with OR alternatives inside. Native BM25 chooses the best alternative per field/group and sums participating groups. Duplicate original groups do not multiply scores; distinct original aliases sharing a target stay distinct. No universal exact-first ranking guarantee follows.

Expansion takes one step. Reverse edges must be configured; cycles do not recurse. Absent targets are omitted. Ordinary exact/prefix, typo and phrase leaves remain independent and strict. Multiword synonyms, positional graphs, accent folding and automatic UI input changes are unavailable. No corpus side index/cache/source/positions is retained, but the immutable vocabulary and worker identity are retained configuration. Mutations use the current execution revision's dictionaries.

Bounds: 128 input mapping objects, 4096 total raw endpoint UTF-16 units, 256 per endpoint, at most 15 normalized nonself targets/source (narrow with `maxAlternatives` 1–15), 32 fields and 32 ASCII version units. A canonical identity exceeding 8192 UTF-16 units rejects. Empty mapping arrays are permitted. A fanout overflow rejects during factory capture even if targets would be absent. Work defaults to 10,000,000 units and can narrow via `maxWorkUnits`; shared core/query/output/expansion limits may be stricter. Complete bound/cancellation/deadline failure returns no partial result.

`result.extensions.synonyms` is deeply frozen `{ policy, groups }`; `policy` includes `:<vocabularyVersion>`. Each group has `{ term, fields, alternatives, dictionaryEntriesVisited, workUnits }`; each alternative has `{ term, match: 'exact', weight }`. Nonself alternatives identify applied `group.term → alternative.term` mappings. A live original is reported at weight 1. Groups include materialized branches, not only score contributors. [Inspector](ADDONS.md#native-inspector) supplies actual selected term, weight, frequency and arithmetic facts; [match evidence](ADDONS.md#original-ranges-and-snippets) can locate the matched target's original spelling. Dictionary visits count selected field entries including repeats; work counts only add-on yielded units. Neither represents memory bytes or physical transport copies.

Workers require an explicitly installed host registration with the same canonical fields, vocabulary version, complete normalized table and limits. Reordering/duplicate-equivalent configuration is compatible; different table contents reject even under the same version. Replace the engine to change vocabulary; there is no mutable table-update API. See the [add-on contract](ADDONS.md) for trusted registration and execution boundaries.
