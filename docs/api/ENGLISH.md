# Optional English morphology

Choose the English analyzer when you want word forms such as `searches` and `search` to match. It applies a fixed version of the Porter 1980 stemming rules. Register the pack and select its descriptor when creating an empty engine; importing or registering it alone leaves `basic-v1` active. To change an existing index's analyzer, rebuild from your original records.

Run this example in an installed Node ESM application. It searches **Running searches** using `run search`:

```js
import assert from 'node:assert/strict';
import { createRaveldex } from '@vmitsaras/raveldex';
import { createEnglishAnalyzer, ENGLISH_ANALYZER } from '@vmitsaras/raveldex/integrations/languages/english';

const engine = createRaveldex({
  schema: { text: { title: {} } },
  analyzer: ENGLISH_ANALYZER,
  addons: [createEnglishAnalyzer()],
});
try {
  await engine.add({ id: 'record', text: { title: 'Running searches' } });
  const result = await engine.search('run search');
  assert.deepEqual(result.hits.map(hit => hit.id), ['record']);
  console.log(ENGLISH_ANALYZER.id);
} finally { await engine.dispose(); }
```

The search finds record `record`, the assertion passes, and the example prints `english-porter1980-v1`. It disposes the engine afterward.

`createEnglishAnalyzer()` takes no options. Pass the frozen descriptor `ENGLISH_ANALYZER` (`{ id: 'english-porter1980-v1', environmentProfile: 'unqualified' }`) as `analyzer`, and the registration as an add-on. The registration uses the exclusive `analyzer` role with `indexEffect: 'analysis'`. Missing or mismatched selection produces a typed capability error. You cannot replace the algorithm after the engine is created.

The fixed policy applies original `basic-v1` segmentation, well-formed UTF-16 validation, NFKC and locale-independent lowercase, then the **original published Porter 1980** suffix rules to normalized ASCII alphabetic terms longer than two characters. It is the original ABLI/OU variant, including the paper's generic doubled-consonant condition; it is not Porter2 or the later BLI/LOGI variant. Non-ASCII and digit-containing normalized terms pass through. There is no accent stripping, transliteration, stop-word removal, dictionary lookup, exception dictionary or irregular-verb lemmatization. See the [algorithm definition](https://snowballstem.org/algorithms/porter/stemmer.html).

Each original token still produces one term at the same position and keeps its full original UTF-16 span. Fields and array values stay separate. English phrases can therefore match different spellings with the same stems, but cannot skip stop words, reuse repeated words or cross field values.

Phrase matching follows analyzed word forms rather than literal spelling. Highlights and snippets still show complete original words, not shortened stem-length ranges.

All plain text and typed lexical variants use the same selected pipeline; metadata remains untouched. Explicit prefix variants match prefixes of the analyzed **stem dictionary**, after their raw text is analyzed, with existing complete-expansion limits. They do not guarantee original-spelling prefixes. Canonical terms never reenter stemming. Coalesced stems share actual native DF/TF/length statistics, and native BM25/Inspector report these actual values; morphology can change membership, grouping and ranking.

The current typo, synonym and token-suggestion requests support only `basic-v1`. Requesting them under English analysis rejects, even with empty input. Merely installing them does not change English analysis. Source, position and mixed phrases, match evidence and snippets do use the selected analyzer. Selecting a language does not mount any UI.

The pack retains constant suffix tables and registration identity, with no corpus side index, original source, positions, cross-search cache or network resource. Per-token work/copies are bounded by the core's 256-unit raw/normalized token ceilings. A single transform work budget (50,000,000 units) spans the whole operation, including provider reanalysis and all restored source records; shared core mutation/search limits (50,000,000/10,000,000 defaults) may be stricter. Existing finite admission/output/work/deadline/cancellation failures reject completely, preserving the committed revision.

Direct/worker configurations must select the same descriptor and explicitly installed canonical manifest/implementation identity. Snapshot headers bind analyzer ID, profile and complete manifests. Source restore rebuilds with the same semantic analyzer ID and compatible capabilities; it does not silently migrate languages. Qualified native round trips require the existing explicit exact-Node qualification and matching runtime/profile. Unqualified browser/worker native restore remains unavailable. Worker source restore/reconciliation validates the receiver's actual selected analyzer descriptor.

Stemming can also join words you intended to keep separate. For example, `cancell` and `cancellation` both reduce to `cancel`. Check your own vocabulary before choosing it. It does not solve accented spelling, irregular morphology or differences in meaning.

## Separate package

You can also install `@vmitsaras/raveldex-english` separately instead of using the main package's convenience subpath. It exports the same factory and descriptor. Its JavaScript is self-contained; its TypeScript declarations use the public core types through an exact-version peer dependency.

Place matching core and English tarballs in your application directory, or replace these paths with their actual locations:

```sh
npm install ./vmitsaras-raveldex-0.1.0-rc.0.tgz ./vmitsaras-raveldex-english-0.1.0-rc.0.tgz
```

This installs both packages. Import `createEnglishAnalyzer` and `ENGLISH_ANALYZER` from `@vmitsaras/raveldex-english` and use the same engine configuration shown above. Choose one import path; registering both copies on the same engine would conflict. See [building the packages](GETTING_STARTED.md#build-tarballs-from-a-source-checkout) if you need to create the files yourself.
