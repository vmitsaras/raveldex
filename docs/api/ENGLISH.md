# Optional English morphology

The English entry supplies a separately selected, versioned analyzer for Raveldex's English documentation use case. Importing or registering it alone leaves `basic-v1` active. Select the descriptor when creating a new empty engine; changing an indexed owner's analyzer requires rebuilding from original records.

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

`createEnglishAnalyzer()` takes no options. `ENGLISH_ANALYZER` is the frozen descriptor `{ id: 'english-porter1980-v1', environmentProfile: 'unqualified' }`. The explicit registration uses the exclusive `analyzer` role with `indexEffect: 'analysis'`; it is required for that ID. Missing/mismatched selection rejects through the typed capability channel. Registrations and handles are captured; they cannot replace the algorithm after owner construction.

The fixed policy applies original `basic-v1` segmentation, well-formed UTF-16 validation, NFKC and locale-independent lowercase, then the **original published Porter 1980** suffix rules to normalized ASCII alphabetic terms longer than two characters. It is the original ABLI/OU variant, including the paper's generic doubled-consonant condition; it is not Porter2 or the later BLI/LOGI variant. Non-ASCII and digit-containing normalized terms pass through. There is no accent stripping, transliteration, stop-word removal, dictionary lookup, exception dictionary or irregular-verb lemmatization. See the [algorithm definition](https://snowballstem.org/algorithms/porter/stemmer.html).

Each original token still emits exactly one term at the same dense position and **full original UTF-16 span**. Source fields/array values remain separate. This preserves analyzed adjacency, including repeated words and stop words: English phrases can match different word forms with equal stems, but cannot skip a word or cross values/fields. Phrase matching under this selected analyzer is not literal original spelling. Original evidence and snippets display/highlight entire original tokens, never fabricated stem-length offsets.

All plain text and typed lexical variants use the same selected pipeline; metadata remains untouched. Explicit prefix variants match prefixes of the analyzed **stem dictionary**, after their raw text is analyzed, with existing complete-expansion limits. They do not guarantee original-spelling prefixes. Canonical terms never reenter stemming. Coalesced stems share actual native DF/TF/length statistics, and native BM25/Inspector report these actual values; morphology can change membership, grouping and ranking.

The existing v1 weighted expansion protocol (including typo and synonym leaves) and token suggestions remain `basic-v1` only and reject when requested under English, including empty requests. Installing those modules without requesting them does not alter English analysis. Source/position/mixed phrases, match evidence and snippets use the selected analyzer. No UI is enabled automatically.

The pack retains constant suffix tables and registration identity, with no corpus side index, original source, positions, cross-search cache or network resource. Per-token work/copies are bounded by the core's 256-unit raw/normalized token ceilings. A single transform work budget (50,000,000 units) spans the whole operation, including provider reanalysis and all restored source records; shared core mutation/search limits (50,000,000/10,000,000 defaults) may be stricter. Existing finite admission/output/work/deadline/cancellation failures reject completely, preserving the committed revision.

Direct/worker configurations must select the same descriptor and explicitly installed canonical manifest/implementation identity. Snapshot headers bind analyzer ID, profile and complete manifests. Source restore rebuilds with the same semantic analyzer ID and compatible capabilities; it does not silently migrate languages. Qualified native round trips require the existing explicit exact-Node qualification and matching runtime/profile. Unqualified browser/worker native restore remains unavailable. Worker source restore/reconciliation validates the receiver's actual selected analyzer descriptor.

English stemming is a retrieval tradeoff. For example `cancell` and “cancellation” both reduce to `cancel`; a typed text query can therefore match without any prefix operator. The frozen English title-navigation set retains this failed intended-empty goal. Accented text, irregular morphology and semantic paraphrases remain limitations. Recorded English reading/relevance review is by an AI evaluator over technical self-documentation, not native-human review or a representative user study. Existing basic results, English-selected outcomes, package sizes, logical work and exact host qualification are reported separately. Code/serialized sizes are not heap/allocation or physical-copy peaks. Historical remote CI and manual AT observations do not qualify this new pack.

## Separate private package

The same native factory and descriptor are also prepared as a separate private `@vmitsaras/raveldex-english` tarball, alongside the main package convenience entry. Its JavaScript is self-contained and imports no core runtime or private path. Its declarations reference the public core types through an exact peer dependency. Install the paired reviewed private tarballs locally; neither package is published:

```sh
npm install ./vmitsaras-raveldex-0.1.0-rc.0.tgz ./vmitsaras-raveldex-english-0.1.0-rc.0.tgz
```

Then import `createEnglishAnalyzer` and `ENGLISH_ANALYZER` from `@vmitsaras/raveldex-english` and use the same explicit new-owner configuration shown above. Choose one factory import; installing both registrations into one owner would conflict over the same provided analyzer. The core candidate must actually implement the analyzer protocol; a reused private version string alone is not compatibility evidence. The [repository preparation procedure](../release/PREPARATION.md#separate-private-english-package) builds the independent artifact without publication.
