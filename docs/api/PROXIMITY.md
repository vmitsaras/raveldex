# Ordered proximity

`/addons/proximity` exports `createProximity(options)`, `PROXIMITY_POLICY` (`ordered-adjacent-gap-v1`) and readonly `ProximityOptions` / `ProximityPayload` types. Positions must be installed explicitly; proximity adds no retained corpus state, codec, source copy, worker or startup activity.

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

Factory options are `{ fields: readonly string[], id?: string, maxWorkUnits?: number }`. Fields must be unique declared text fields. Capability is always `proximity`, independent of the registration ID. Query `fields` defaults to these enabled fields; an explicit selection must be a nonempty subset. Missing required position providers fail with `MISSING_CAPABILITY`; incompatible providers fail explicitly. Source alone is insufficient.

Payload is `{ groups: readonly (readonly string[])[], maxGap: number, fields?: readonly string[] }`. Each nonempty alternative must analyze to exactly one original query token. The selected basic, English or identifier analyzer is used once. Empty and multi-token alternatives reject `INVALID_QUERY`; normalized duplicate alternatives deduplicate for scoring while still counting toward admission/token limits. Prefixes and automatic typo/synonym expansions are not supported here.

`maxGap` is required, from 0 through 32. It limits skipped original tokens **between each adjacent pair**, not total slack across the whole sequence. For `[['a'], ['b'], ['c']]` with gap 1, `a x b y c` matches. A path must consume strictly increasing positions in one original value; repeated and overlapping groups cannot reuse a position. Values/fields never join. Identifier components are excluded: `foo`, `bar` do not match inside `fooBar`. A whole `fooBar` alternative can match its original identifier.

Gap zero with singleton groups has the same eligibility and unrounded native scores as strict phrases. Equal-weight exact alternative groups use native BM25, including the existing best-alternative-per-field rule, deterministic UTF-16 ID ties and canonical group deduplication. Successful Boolean branches supply groups; failed branches and NOT do not. Gap length adds no score or ranking bonus. Ordinary strings, typed exact/prefix groups and strict phrases retain their contracts.

At most 32 ordered groups and 16 alternatives per group are accepted, subject to lower configured limits. All raw alternatives together count against the shared 64-query-token default, 2,048 lexical UTF-16 units and existing query-node/string/group limits. Factory `maxWorkUnits` defaults to 10,000,000 and can only narrow it; one budget covers every proximity leaf in the search. Shared work, deadlines, cancellation and disposal can reject the complete operation, with no partial results. Position providers retain and atomically replace their own state; proximity retains none.

Inspector can explain actual native membership and numerical facts. Proximity ranges/snippets are outside this slice: requesting token range or snippet evidence on a query containing an ordered leaf rejects `MISSING_CAPABILITY`, including failed/negative branches or empty selected IDs. No adjacent-phrase highlights are fabricated. Use an ordinary query in a separate operation for existing token evidence. No UI, text syntax, unordered distance, multiword synonym graph, distance weight or automatic n-gram index is added.

Worker identities bind policy/options/providers; source/native snapshots reuse the selected position providers and exact analyzer/capability compatibility. Native snapshots retain their explicit qualified-Node restrictions. Local behavioral/package evidence does not qualify remote CI, manual assistive technology, heap peaks, transport copies or universal completion at the configured record ceiling. See the [adopted specification](../specs/ORDERED_PROXIMITY.md).
