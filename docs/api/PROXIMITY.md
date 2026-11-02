# Ordered proximity

Use ordered proximity when words must appear in order but do not have to be adjacent. Import `createProximity` from `/addons/proximity` and install a position provider for the fields you want to search. The add-on uses those positions without keeping another corpus copy.

The entry also exports `PROXIMITY_POLICY` (`ordered-adjacent-gap-v1`) and readonly `ProximityOptions` / `ProximityPayload` types. Run this example in an installed ESM application:

```js
import { createRaveldex } from '@vmitsaras/raveldex';
import { createPositionProvider } from '@vmitsaras/raveldex/addons/positions';
import { createProximity } from '@vmitsaras/raveldex/addons/proximity';

const engine = createRaveldex({
  schema: { text: { body: {} } },
  addons: [createPositionProvider({ fields: ['body'] }), createProximity({ fields: ['body'] })],
});
try {
  await engine.add({ id: 'guide', text: { body: 'red small apple' } });
  const page = await engine.search({
    kind: 'extension', capability: 'proximity', version: 1,
    payload: { groups: [['red'], ['apple', 'pear']], maxGap: 1 },
  });
  console.log(page.total, page.hits[0].id); // 1 guide
} finally {
  await engine.dispose();
}
```

The example prints `1 guide`. `red small apple` matches because `red` appears before `apple` with one skipped word between them. The alternative `pear` would also be accepted in the second group. The engine is disposed when the example finishes.

Factory options are `{ fields: readonly string[], id?: string, maxWorkUnits?: number }`. Fields must be unique declared text fields. Capability is always `proximity`, independent of the registration ID. Query `fields` defaults to these enabled fields; an explicit selection must be a nonempty subset. Missing required position providers fail with `MISSING_CAPABILITY`; incompatible providers fail explicitly. Source alone is insufficient.

Payload is `{ groups: readonly (readonly string[])[], maxGap: number, fields?: readonly string[] }`. Each nonempty alternative must analyze to exactly one original query token. The selected basic, English or identifier analyzer is used once. Empty and multi-token alternatives reject `INVALID_QUERY`; normalized duplicate alternatives deduplicate for scoring while still counting toward admission/token limits. Prefixes and automatic typo/synonym expansions are not supported here.

Set `maxGap` from `0` to `32`. It limits skipped original tokens between each neighboring pair, not the total gaps in the sequence. For example, `[['a'], ['b'], ['c']]` with gap `1` matches `a x b y c`.

Each group must use a later position in the same original value. Repeated groups cannot reuse a position, and values or fields never join. Identifier components are not original positions: `foo`, `bar` do not match inside `fooBar`, but a whole `fooBar` alternative can match that name.

Gap zero with singleton groups has the same eligibility and unrounded native scores as strict phrases. Equal-weight exact alternative groups use native BM25, including the existing best-alternative-per-field rule, deterministic UTF-16 ID ties and canonical group deduplication. Successful Boolean branches supply groups; failed branches and NOT do not. Gap length adds no score or ranking bonus. Ordinary strings, typed exact/prefix groups and strict phrases retain their contracts.

At most 32 ordered groups and 16 alternatives per group are accepted, subject to lower configured limits. All raw alternatives together count against the shared 64-query-token default, 2,048 lexical UTF-16 units and existing query-node/string/group limits. Factory `maxWorkUnits` defaults to 10,000,000 and can only narrow it; one budget covers every proximity leaf in the search. Shared work, deadlines, cancellation and disposal can reject the complete operation, with no partial results. Position providers retain and atomically replace their own state; proximity retains none.

Use Inspector to explain matching and scoring. Token ranges and snippets are not available for proximity queries: requesting either on a query containing a proximity leaf rejects with `MISSING_CAPABILITY`, even for failed or negative branches or an empty ID selection. Make a separate ordinary search if you need its token evidence.

This add-on supplies ordered matching only. It does not add UI, text syntax, unordered distance, multiword synonyms, distance-based scores or an automatic n-gram index.

Worker identities bind policy/options/providers; source/native snapshots reuse the selected position providers and exact analyzer/capability compatibility. Native snapshots retain their explicit qualified-Node restrictions. See [snapshot requirements](COMPATIBILITY.md#snapshot-compatibility).
