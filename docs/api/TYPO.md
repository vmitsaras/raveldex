# Optional bounded typo tolerance

Import `createTypoTolerance` and `TYPO_POLICY` from `@vmitsaras/raveldex/addons/typo`. Merely importing or installing the registration leaves ordinary searches unchanged.

```js
import { createRaveldex } from '@vmitsaras/raveldex';
import { createTypoTolerance } from '@vmitsaras/raveldex/addons/typo';

const engine = createRaveldex({
  schema: { text: { title: {} } },
  addons: [createTypoTolerance({ fields: ['title'] })],
});
try {
  await engine.add({ id: 'guide', text: { title: 'Source ownership' } });
  const result = await engine.search({
    kind: 'extension', capability: 'typo', version: 1,
    payload: { text: 'sorce', fields: ['title'] },
  });
  console.log(result.total, result.extensions?.typo);
} finally {
  await engine.dispose();
}
```

`TypoOptions` is `{ fields: readonly string[], id?: string, maxAlternatives?: number, maxWorkUnits?: number }`. Fields must be schema text fields. Query fields default to **all schema text fields**, and every requested field must be enabled. Supply `payload.fields` when enabling only part of a larger schema. Options and queries are owned before deferred work.

`TYPO_POLICY` is `unicode-osa1-exact-first-v1`: one normalized Unicode code-point insertion, deletion, substitution or adjacent swap; query tokens need at least four code points. If a term already exists exactly in any selected field, only exact matches are selected at weight 1. Otherwise all live distance-one alternatives receive weight 0.5. A candidate may have three code points. There is no accent folding: `cafe` can repair to `café` only when exact `cafe` is absent.

Original words remain AND requirements with OR alternatives inside each group. Repeats deduplicate; distinct misspellings remain separate even if they share repairs. Native BM25 uses actual alternatives and discounts. Exact-first selects dictionary terms per token; it does not guarantee ranking for mixed Boolean queries. Ordinary text, exact/prefix groups and strict phrases stay strict.

The alternative ceiling defaults to 15, maximum 15, with an additional core slot for the original term. Lower core variant/group/expansion limits also apply. The default/max add-on work cap is 10,000,000 work-v1 units across all its leaves, additionally limited by shared search work, deadline and cancellation. Alternatives/output/core-expansion overflow rejects `LIMIT_EXCEEDED`; work overflow rejects `WORK_LIMIT_EXCEEDED`. No incomplete mode exists.

An explicit leaf returns `result.extensions.typo` with `TypoResult` shape `{ policy, groups: TypoGroup[] }`. A group has `{ term, fields, alternatives, dictionaryEntriesVisited, workUnits }`; each `TypoAlternative` has `{ term, match: 'exact', weight }`. These are actual live normalized terms, excluding an absent original variant. Repeated identical requests share one output group. Empty input returns no matches and an empty groups array. Output is owned/immutable and merges with facets or one evidence request. Visits/work are logical counters, not latency or heap measurements.

No optional side index, source or cross-search cache is retained. Searches use the current atomic revision; workers require matching host options. Actual alternatives feed Inspector and original-range/snippet providers without becoming phrases. See the repository [complete policy and bounds](https://github.com/vmitsaras/raveldex/blob/main/docs/specs/TYPO_TOLERANCE.md). This selected optional development slice extends the historical private candidate; earlier artifact hashes/remote qualification do not verify changed code.
