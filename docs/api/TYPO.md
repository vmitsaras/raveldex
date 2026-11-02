# Optional bounded typo tolerance

Use typo tolerance when a search should accept one missing, extra, replaced or swapped character. Import `createTypoTolerance` and `TYPO_POLICY` from `@vmitsaras/raveldex/addons/typo`. You must both register the add-on and request a typo query; ordinary searches stay exact.

Run this example in an installed ESM application. It indexes **Source ownership**, then searches for the misspelling `sorce`:

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

You should get a total of `1`. `result.extensions.typo` shows the normalized alternative `source` that made the record match. The example disposes the engine after printing the result.

`TypoOptions` takes `{ fields: readonly string[], id?: string, maxAlternatives?: number, maxWorkUnits?: number }`. Declare those text fields in the schema. Query fields default to all schema text fields, so supply `payload.fields` if you enabled only some of them. Raveldex copies the accepted options and query before queued work starts.

The policy is `unicode-osa1-exact-first-v1`:

- A query term needs at least four normalized Unicode code points.
- If the exact term exists in any selected field, it is the only alternative and has weight `1`.
- Otherwise, indexed terms one insertion, deletion, substitution or adjacent swap away have weight `0.5`. An alternative may have three code points.

There is no accent folding. For example, `cafe` can repair to `café` only when an exact `cafe` term is absent.

Every original query word still needs a match, with alternatives allowed for that word. Repeating the same word does not multiply it; different misspellings stay separate even if they lead to the same repair. BM25 uses the actual matched alternatives and their weights. Exact-first selection works per word and does not guarantee an overall ranking order in a mixed Boolean query.

You can allow up to 15 alternatives per term, which is also the default. Core reserves another slot for the original term, and lower core variant, group or expansion limits still apply. The default and maximum add-on work budget is 10,000,000 work-v1 units across the whole search. Shared work limits, deadlines and cancellation also apply.

Too many alternatives or output entries reject with `LIMIT_EXCEEDED`; too much work rejects with `WORK_LIMIT_EXCEEDED`. Neither returns an incomplete search.

An explicit leaf returns `result.extensions.typo` with `TypoResult` shape `{ policy, groups: TypoGroup[] }`. A group has `{ term, fields, alternatives, dictionaryEntriesVisited, workUnits }`; each `TypoAlternative` has `{ term, match: 'exact', weight }`. These are actual live normalized terms, excluding an absent original variant. Repeated identical requests share one output group. Empty input returns no matches and an empty groups array. Output is owned/immutable and merges with facets or one evidence request. Visits/work are logical counters, not latency or heap measurements.

Typo tolerance reads the live dictionary at the search revision and keeps no extra source, side index or cross-search cache. In a worker, install matching options on the host. Inspector and original-range/snippet providers can explain the alternatives that matched; those alternatives do not become phrases. See [practical matching limits](LIMITATIONS.md#matching-text).
