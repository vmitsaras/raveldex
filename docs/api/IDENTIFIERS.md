# Code and identifier analysis

Select the optional global analyzer when your text contains developer identifiers. Importing or registering it alone leaves basic-v1 selected. It adds no runtime dependency, side index, source or positions automatically.

```js
import { createRaveldex } from '@vmitsaras/raveldex';
import { createIdentifierAnalyzer, IDENTIFIER_ANALYZER } from '@vmitsaras/raveldex/addons/identifiers';

const engine = createRaveldex({
  schema: { text: { name: {} } },
  analyzer: IDENTIFIER_ANALYZER,
  addons: [createIdentifierAnalyzer()],
});
try {
  await engine.add({ id: 'queue', text: { name: 'maxQueuedOperations' } });
  const components = await engine.search('queued operations'); // total: 1
  const original = await engine.search('maxQueuedOperations'); // total: 1
  console.log(components.total, original.total);
} finally {
  await engine.dispose();
}
```

`createIdentifierAnalyzer()` accepts no options. The frozen `IDENTIFIER_ANALYZER` descriptor is `{ id: 'code-identifiers-v1', environmentProfile: 'unqualified' }`. Registration ID is `identifier-analyzer`; its exclusive analyzer role and exact worker policy identify the implementation. Changing analyzer requires a new index/rebuild, never live mutation of existing terms.

## Whole names and components

An original starts with a Unicode letter or number and continues through letters, numbers, combining marks and underscores. Derived components split original spelling at underscores, lowercase-to-uppercase camel transitions, acronym-to-capitalized-word transitions, and letter/number transitions. Uppercase includes Lu/Lt, lowercase Ll and numbers all N categories. Uncased letters have no camel transition. Combining marks stay with their base; an orphan mark after an underscore stays in the whole name but does not start a component. Normalize each original/component span with NFKC followed by default lowercase.

| Text | Retained dictionary terms |
| --- | --- |
| `maxQueuedOperations` | `maxqueuedoperations`, `max`, `queued`, `operations` |
| `HTTP2Response` | `http2response`, `http`, `2`, `response` |
| `WORK_LIMIT_EXCEEDED` | `work_limit_exceeded`, `work`, `limit`, `exceeded` |
| `fooFoo` | `foofoo`, `foo` (earliest component span) |
| `src/core/query/search.ts` | `src`, `core`, `query`, `search`, `ts` |

Slashes, backslashes, dots, dollar signs, hyphens and other punctuation delimit names. Leading underscores before a letter/number delimit; underscores after the start remain in the whole name. Full paths and literal punctuation are not a distinct exact-name matching feature. RX-A060 remains separate. Case/NFKC-equivalent whole spellings intentionally collide; this is not a case-sensitive identifier comparison API. Accents remain significant; there is no stemming, accent folding, transliteration or automatic language detection.

Ordinary query analysis emits only whole names. `fooBar` searches `foobar`; it is not rewritten to require `foo` and `bar` or to allow either fragment. `foo` can match the component of `fooBar`. `foo bar` uses ordinary AND between its two query groups and can find both components in the same original. Explicit OR/NOT, weighted exact/prefix groups, fields, deterministic pages and exact totals keep native semantics. Prefixes operate on the selected dictionary, including whole names and components; they are not infix matching.

Every retained whole/component term has weight 1. Native BM25 counts the distinct emitted term occurrences in TF, DF and field lengths. A canonical term occurs at most once per original identifier; repeated components keep the earliest component span and a component equal to the canonical whole is suppressed. Whole-name hits have no hidden bonus or guaranteed ranking over a different query's component hits. Explicit Inspector traces report actual field/group arithmetic.

## Phrases and original evidence

Strict source, positions and mixed phrases use original identifiers only. The phrase `foo bar` does not match inside `fooBar`; `fooBar next` can match those two adjacent originals in one value. A phrase never crosses values/fields. Components share an original ordinal and never create adjacent original positions. This implements the fixed original/component policy, not arbitrary token graphs or component phrase search.

Explicit match evidence exposes a range with `kind: 'original'` or `kind: 'component'`. Component ranges include `original: { term, start, end }` for the whole original identifier; the range's own start/end refer to its actual component. Coordinates are half-open original UTF-16 indices with the existing field/value/position coordinates. Repeated normalized components report their earliest retained span only. Snippets keep original spelling and truthful highlight ranges. Without an explicitly selected source or offset provider, source evidence is unavailable as usual.

Selected code positions use tagged `raveldex-positions-v2` data under the explicit existing positions codec family. Parsing requires the selected code analyzer and distinguishes original counts from all retained occurrences. Old dense v1 position parsing stays strict; co-position/overlapping component data is never treated as v1. The analyzer/manifest/root tag jointly bind compatibility. Existing basic and English position data keep v1 shape.

## Limits and compatibility

Existing raw span (256 UTF-16 units), normalized term (256), value (65,536), record/corpus tokens, dictionary/postings, query, work, deadline and output bounds apply. Derived occurrences count toward record/corpus limits; a short original can therefore generate more than one retained token. Reject a complete operation when a bound is exceeded; never truncate alternatives, ranges or totals. The analyzer has one 50,000,000-unit module ceiling shared across the complete operation and provider reanalysis; existing search/mutation ceilings can be stricter. Charge scanning, classification, normalization, deduplication and validation through resumable work. Input capture owns bounded raw data before queued execution.

Existing v1 typo, synonym and suggestion requests remain basic-only and fail explicitly under this analyzer, including empty requests; installing them unrequested does not alter code searches. English and identifier analysis are separately selected global policies, not a per-field or automatic mixture. Metadata and opaque record IDs remain untransformed.

Workers and source/native snapshots require exact analyzer/profile/module policy compatibility. Native restore retains its existing explicit exact-Node qualification boundary. Logical counters and code sizes are not heap/allocation/transport peaks; finite tests do not qualify every Unicode runtime or a manual assistive-technology session. This feature changes no DOM UI or announcements. The adopted behavior and required evidence are in the [identifier contract](../specs/IDENTIFIER_ANALYSIS.md).
