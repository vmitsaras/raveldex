# Migrating LocalSearch source data

RX-3004 provides an explicit converter for source snapshots from the audited
[LocalSearch companion commit](https://github.com/vmitsaras/LocalSearch/tree/5f334a8ca4f7d9d95b6b731ac539f4b1dda302cb).
The companion is MIT © 2026 Vasileios Mitsaras and uses MiniSearch 7.2.0.
Its source data is reusable; its index, ranking and historical verification are
separate from Raveldex. The converter is available only through
`@vmitsaras/raveldex/integrations/localsearch`.

## Supported input

Use the companion's public `engine.exportSnapshot()` to obtain an ordinary
`Uint8Array`. The supported canonical envelope has `format: 1`,
`contract: 'companion-v1'`, `dependency: 'minisearch@7.2.0'`,
`analyzerId: 'basic-v1'`, and `scoreModel: 'minisearch-7.2.0-companion-v1'`.
The converter checks the domain-prefixed SHA-256, exact canonical encoding,
configuration, original records, source counts and provenance before returning
an owned, frozen migration plan. The checksum detects corruption; it does not
authenticate the sender or establish that the source is current.

Opaque MiniSearch JSON, serialized postings, worker messages, IndexedDB rows,
unknown snapshot versions and edited/noncanonical source envelopes are refused.
Export original source through the companion rather than renaming a foreign
index or changing its header. Companion storage namespaces and database layouts
are not upgraded, copied or erased by conversion.

## Data and configuration mapping

| Companion input | Native mapping | Boundary |
| --- | --- | --- |
| Flat record `id` and declared fields | `{id, text, metadata}` | Preserve IDs and source values; own the returned data. |
| `text` / `text[]` | Declared native text field | Each original value stays separate; scalar text becomes one value. |
| Text boost | Native field boost | Preserve values in `(0,16]`; legacy boosts up to 1,000 need an explicit application decision. |
| `keyword` | Scalar string metadata | Exact case/spacing remain meaningful; no lexical score. |
| `number` / `boolean` | Scalar metadata of the same type | Finite numbers only; native `-0` becomes `0`. |
| Missing declared field / empty string or array | Missing field / empty value | Never synthesize a null or join array values. |
| `returnFields` | Separate plan information for the application | No automatic source retention or result projection. |
| `origin.sessionId`, `origin.generation`, `sourceRevision` | Separate provenance | Never set the receiving engine's revision or durable generation. |
| Mandatory legacy source and ephemeral match evidence | Explicit optional native providers | Select source, positions, offsets, snippets, UI and Inspector separately. |
| MiniSearch dictionary/postings/statistics | New native index | Reanalyze originals and rebuild; no imported foreign score state. |

Companion admission already rejects IDs with surrounding whitespace and reserves
`id` as a schema field. Its source-string count includes IDs and keyword values;
that historical count is checked as historical data and never substituted for
native corpus text/token counts. Native statistics count emitted occurrences,
while the MiniSearch adapter's field lengths count distinct terms.

Supported source is the intersection of both contracts. In particular, native
text arrays allow at most 64 values, scalar metadata strings at most 1,024
UTF-16 units, text boosts at most 16, and raw/normalized tokens at most 256 units.
Native field names, well-formed UTF-16, per-record structure/text/token bounds
and corpus bounds also apply. The converter never truncates values, reduces
boosts, strips combining marks or silently changes an incompatible field.
An incompatible source needs an application-authored revision of its data or
configuration, followed by a new companion export. Native runtime work,
dictionary, posting and admission limits still apply when rebuilding.

## Rebuild into a new owner

```ts
import { createRaveldex } from '@vmitsaras/raveldex';
import { convertLocalSearchSnapshot } from '@vmitsaras/raveldex/integrations/localsearch';

// bytes comes from the companion's public source export.
const plan = await convertLocalSearchSnapshot(bytes);
const candidate = createRaveldex(plan.configuration);
try {
  // Native addMany is bounded. Each admitted batch is atomic.
  for (let offset = 0; offset < plan.records.length; offset += 32) {
    await candidate.addMany(plan.records.slice(offset, offset + 32));
  }
  const result = await candidate.search('red car');
  console.log(result.total, result.model, result.hits);
  // Publish this new owner to the application only after the complete rebuild.
} catch (error) {
  await candidate.dispose();
  throw error;
}
```

The converter performs no engine mutation. Batch commits during a rebuild are
local to the new candidate; they are not a whole-migration transaction. Keep the
current application owner until the complete rebuild succeeds, and dispose a
failed candidate. A dense batch can exceed the structural admission bound even
when its record count fits; reduce that application's batch size, down to one
record if necessary. Do not increase native defensive limits to hide a refused
collection. Stricter application limits or optional participant limits may
refuse otherwise convertible input.

Conversion is a bounded offline operation, distinct from the engine's queued
execution. Its input ceiling is 32 MiB. Copying, UTF-8 decoding, JSON preflight,
parse, canonical encoding and validation include synchronous host work; SHA-256
requires `crypto.subtle`. The conversion API has no signal/deadline and makes no
interactive latency guarantee. Importing the entry starts no job and accesses
no host capability. Release physical latency/heap qualification remains N4.

## Query and ranking differences

| Companion behavior | Native behavior / migration action |
| --- | --- |
| Text `{value, combine:'all'|'any'}` | `{kind:'text', text, operator:'and'|'or'}`; ordinary strings mean AND. |
| `where: {field:{eq:value}}` | Explicit `eq` leaves joined by `and` with the lexical query. |
| `kind:'all'` | Native `all`; both intentionally browse all records without lexical scoring. |
| `prefixLast` | Explicit native prefix group(s); no implicit query translation. Prefix weight differs. |
| Global `mode:'phrase'` | Explicit source/position/mixed phrase extension with selected providers. |
| Facets restricted to projected keyword fields | Explicit native facet provider/request with its own contract and bounds. |
| `limit` in query; no native pagination contract | Native limit/offset in search options; exact total independent of the page. |
| Result projections, snippets and ephemeral evidence | Stable IDs/scores from core; optional evidence and application display records. |
| `{sessionId,generation}` receipts | Next-local numeric revisions and native add/replace/remove counts. |

These are mappings for application authors, not a compatibility query facade.
The converter does not execute or translate old queries. Shared semantic tests
cover ordinary lexical membership, Boolean all/any, scalar equality and strict
phrases on source values where the two analyzers agree. Ranking agreement with
MiniSearch is never the native correctness oracle.

The historical `basic-v1` label hides different algorithms. The companion
recognizes runs of letters/marks/numbers, keeps a run if it contains a letter or
number, then applies NFC → lowercase → NFC. Native analysis begins a token with
a letter or number, consumes following letters/numbers/marks, and applies NFKC
→ lowercase once. Compatibility characters such as `ＦＯＯ` and leading
combining marks can therefore change membership. Originals are preserved and
reindexed under the native analyzer; these are intentional migration outcomes.

The companion uses `minisearch-7.2.0-companion-v1`, MiniSearch BM25 settings
`k=1.2, b=0.7, d=0.5` and prefix weight `0.375`. Raveldex uses the complete
[`raveldex-bm25-v1` contract](../specs/RANKING.md), including field-local positive
populations, `b=0.75`, canonical group participation, no phrase bonus and
deterministic ID ties. Scores and ranks can change after a faithful rebuild.
Expected rank changes are reported separately from data loss, incorrect
conversion or native membership defects.

## Persistence and optional features

For source snapshot export/recovery, construct the candidate with
`createSourceProvider({fields:Object.keys(plan.configuration.schema.text)})`
from `/addons/phrases/source`. Install phrase verification separately if the
application needs phrase queries. Borrow that new owner through
`createSnapshots(candidate)` from `/adapters/snapshots`, and explicitly save
through `createIndexedDBPersistence` from `/adapters/indexeddb` in a native
database/namespace. Use generation CAS exactly as documented in the
[storage contract](../architecture/ADDONS_AND_ADAPTERS.md#indexeddb-adapter-contract-rx-3003).

Source snapshots rebuild under the receiving native analyzer. A legacy origin
or source revision is informational and does not confer native snapshot
qualification. Worker protocol, native snapshots, CSS, UI, event listeners,
database connections, cancellation and durable generation tokens must be
recreated through the corresponding native public APIs. The companion's
whole-state rebuild/cancellation checkpoints do not become native incremental
execution guarantees.

## Comparator and provenance boundaries

Foreign comparison support lives under `integrations/minisearch/` outside the
native source/build/export graph. It requires an explicitly supplied pinned
companion implementation, declares the foreign scorer, source phrase checks,
whole-state write strategy, cancellation limits and unavailable numerical
decomposition, and returns foreign results under their actual identity. It is
not a runtime dependency, public native adapter or automatic fallback.

The source codec adaptation carries the companion's MIT notice. No MiniSearch
engine/scorer, companion owner/UI/worker/storage implementation, or historical
test result is imported into the native runtime. Historical companion evidence
remains in its original repository at the audited commit, under its original
claims and limitations. New native behavior belongs in
[RX-3004 evidence](../evidence/RX-3004.md); file identities and licensing are
recorded in [the provenance audit](../evidence/RX-3004-provenance.json).
