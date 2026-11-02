# Directional token synonyms

Use synonyms to connect words your users search for with words in your documents. You supply the one-way mappings and a vocabulary version. Registering them does not change ordinary searches; request a synonym query when you want to use them.

Run this example in an installed Node ESM application. It maps `backup` to `snapshot` and searches for `backup guide`:

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

The ordinary `backup` search finds nothing. The synonym query finds only record `saved`, whose title is `snapshot guide`, then prints `directional-one-step-v1:docs-v1`. It does not also find `archive guide`: mappings are followed for one step only.

Register `createSynonyms({ fields, vocabularyVersion, mappings, id?, maxAlternatives?, maxWorkUnits? })`. The factory copies its finite plain-data input. Each mapping is directional `{ from, to }`. Endpoints must each produce exactly one `basic-v1` token; NFKC/lowercase is applied once, with duplicate and self edges ignored. Zero/multiple tokens or malformed UTF-16 reject. `fields` is a nonempty set of enabled schema text fields. The explicit query payload is exactly `{ text, fields? }`; omitted fields selects all schema text fields, each of which must be enabled. Default registration ID/provided capability is `synonyms`; protocol version is 1. Custom `id` changes only registration identity.

Under `directional-one-step-v1`, original terms have weight `1` and indexed direct targets have weight `0.5`, even when the original term exists. Each original word still needs a match, but one of its mapped alternatives can supply that match. BM25 selects the best alternative per field and group, then sums the participating groups.

Repeating the same original group does not multiply its score. Different aliases stay separate even if they share a target. These weights do not guarantee that every exact match ranks above every synonym match.

Mappings are directional and stop after one step. Add a reverse mapping yourself if you need it; cycles never recurse. Targets absent from the current dictionary are left out. Ordinary exact, prefix, typo and phrase queries keep their separate rules.

This add-on does not support multiword synonyms, positional graphs or accent folding, and it does not change the UI's input. It retains your immutable vocabulary and worker identity as configuration, but no extra corpus index, cache, source text or positions. Searches use the dictionaries at their execution revision.

Bounds: 128 input mapping objects, 4096 total raw endpoint UTF-16 units, 256 per endpoint, at most 15 normalized nonself targets/source (narrow with `maxAlternatives` 1–15), 32 fields and 32 ASCII version units. A canonical identity exceeding 8192 UTF-16 units rejects. Empty mapping arrays are permitted. A fanout overflow rejects during factory capture even if targets would be absent. Work defaults to 10,000,000 units and can narrow via `maxWorkUnits`; shared core/query/output/expansion limits may be stricter. Complete bound/cancellation/deadline failure returns no partial result.

`result.extensions.synonyms` is deeply frozen `{ policy, groups }`; `policy` includes `:<vocabularyVersion>`. Each group has `{ term, fields, alternatives, dictionaryEntriesVisited, workUnits }`; each alternative has `{ term, match: 'exact', weight }`. Nonself alternatives identify applied `group.term → alternative.term` mappings. A live original is reported at weight 1. Groups include materialized branches, not only score contributors. [Inspector](ADDONS.md#native-inspector) supplies actual selected term, weight, frequency and arithmetic facts; [match evidence](ADDONS.md#original-ranges-and-snippets) can locate the matched target's original spelling. Dictionary visits count selected field entries including repeats; work counts only add-on yielded units. Neither represents memory bytes or physical transport copies.

For workers, install the same fields, vocabulary version, normalized mappings and limits on the host. Reordered or equivalent duplicate input is compatible; different mappings are rejected even with the same version label. Create a new engine to change the vocabulary. See [optional search capabilities](ADDONS.md) for setup and execution details.
