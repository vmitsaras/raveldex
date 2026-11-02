# Core API

Use core to define your searchable fields, add records and retrieve matches. Import its functions and TypeScript types from `@vmitsaras/raveldex`. Start with the [complete quick start](../../README.md), or copy [core.mjs](examples/core.mjs) and call `runCoreExample()` to get a result you can inspect.

## Configuration and records

Create an engine with `createRaveldex(configuration: Configuration): Raveldex`. Pass `{ schema, limits?, analyzer?, addons? }`. The function checks your configuration immediately and returns an empty engine at revision `0`. Invalid configuration throws before an engine is returned.

| Type / property | Contract |
| --- | --- |
| `Schema.text` | Nonempty map of field names to `TextField` (`{ boost?: number }`). Boost defaults to 1; finite `(0,16]`. |
| `Schema.metadata?` | Map to `MetadataField` (`{ type: 'string' \| 'number' \| 'boolean', multi?: boolean, nullable?: boolean }`). Both flags default to false. |
| `RecordInput` | `{ id: string, text: Record<string, string \| readonly string[]>, metadata?: Record<string, Scalar \| readonly Scalar[]> }`. Only declared fields are accepted. |
| `Scalar` | `string \| number \| boolean \| null`. Null requires a nullable field; numbers are finite. A multi field requires an array. Missing is distinct from null. |
| `AnalyzerDescriptor` | `{ id, environmentProfile }`; ordinary default is `{ id: 'basic-v1', environmentProfile: 'unqualified' }`. This is an identity descriptor, not a custom tokenizer function. |
| `LimitOverrides` | Partial `Limits`. Limits may be reduced from the defaults below; `minPrefixCodePoints` can be raised. |
| `addons` | Explicit readonly `AddonRegistration[]`; source, positions and other capabilities are absent unless selected. |

Choose field names that match `[A-Za-z][A-Za-z0-9_]{0,63}`. Do not use `constructor` or `prototype`, or reuse a name for both text and metadata.

Give each record a well-formed Unicode ID of 1–256 UTF-16 code units. IDs are used exactly as supplied, including case and whitespace. Pass plain data objects, including null-prototype objects; getters, arbitrary class instances, executable values and unknown properties are rejected. Raveldex copies accepted input when you submit it, so changing your object later does not alter queued work.

You may omit a declared text field or give it an empty string or array. Each item in a text array remains a separate value. Core stores the index, IDs and declared metadata, but not the original text. Keep display titles and URLs in your application. Add a [source provider](ADDONS.md#source-positions-and-phrases) if you also need Raveldex to keep original field values.

## Methods and results

| Method | Behavior |
| --- | --- |
| `search(query: string \| Query, options?: SearchOptions)` | `Promise<SearchResult>` with complete membership, exact total and requested page. |
| `add(record, options?)` | `Promise<MutationResult>`; existing ID rejects `ID_EXISTS`. |
| `addMany(records, options?)` | One atomic add-only batch; any conflict/refusal preserves prior state. |
| `replace(record, options?)` | Complete replacement; missing ID rejects `ID_NOT_FOUND`. Optional direct-owner [patch convenience](RECORD_PATCH.md) compiles to this path. |
| `remove(idOrIds, options?)` | One string or readonly string array. Missing IDs are no-ops. |
| `clear(options?)` | Clears the whole collection and selected transactional providers. |
| `dispose()` | Idempotent `Promise<void>`; closes admission and safely releases owner state/resources. |

Updates return `MutationResult`: `{ revision, changed, added, replaced, removed }`. A change is applied completely across core and its installed providers, then gets one new revision. An operation that changes nothing keeps the existing revision.

Searches return `SearchResult`: `{ revision, model: 'raveldex-bm25-v1', completeness: 'complete', total, hits, extensions? }`. Read it as follows:

- `revision` identifies the collection used for this search.
- `total` counts all matching records, regardless of the page you requested.
- `hits` contains readonly `{ id, score }` entries for that page.
- `extensions` contains any optional output you requested.

Hits are ordered by descending, finite, unrounded score. Ties use ascending ID order with UTF-16 comparison.

Pass `MutationOptions` (`{ signal?: CancellationSignal, deadlineMs?: number }`) to control cancellation and deadlines. For searches, `SearchOptions` also accepts `{ limit?: number, offset?: number, extensions?: Record<string, unknown> }`.

Pagination starts at offset `0`. The default page size is `min(20, maxHits, maxDocuments - offset)`. Set `limit: 0` if you only need the exact total. When you supply a limit, `offset + limit` must fit the configured document capacity.

## Query shapes

A plain string searches all declared text fields and requires every complete analyzed term to match. Quotes, the word `AND` and minus signs do not enable a query language. Use a typed query below for more control, or explicitly parse [query syntax](QUERY_SYNTAX.md) before calling `search`.

| `Query.kind` | Properties / meaning |
| --- | --- |
| `text` | `{ text, operator?: 'and' \| 'or', fields?: string[] }`; default AND. |
| `group` | `{ variants: Variant[], fields?: string[] }`; alternative terms/fields. `Variant` is `{ text, match: 'exact' \| 'prefix', weight?: number }`. Each text analyzes to exactly one token; finite weight `(0,1]`, default 1. |
| `and`, `or` | `{ children: Query[] }`; nonempty Boolean groups. |
| `not` | `{ child: Query }`; complement against all live IDs, contributes no lexical score. |
| `eq` | `{ field, value: Scalar }`; strict declared metadata equality, including any matching member of multi metadata. |
| `all`, `none` | No additional properties; explicit browse-all or match-none. |
| `extension` | `{ capability, version, payload }`; requires a matching installed capability. |

Leave out `fields` to search all text fields, or provide a nonempty list without duplicates. Text that produces no terms matches nothing.

Metadata equality uses the original type, case and spacing: it does not turn `"1"` into `1`. Missing values differ from `null`, and `not(eq(...))` includes records where the field is missing. Queries containing only metadata or exclusions can return matches with a score of zero.

This is a query fragment for an engine with a `title` field. Pass it to `engine.search(query)` to find title terms beginning with `atom`:

```js
const query = {
  kind: 'group', fields: ['title'],
  variants: [{ text: 'atom', match: 'prefix', weight: 0.8 }],
};
```

For example, a title containing `Atomic updates` can match this query. The `0.8` weight reduces that alternative's score contribution. This block only creates the query; it does not create an engine or print results.

A prefix needs at least two normalized Unicode code points. Raveldex finds every matching complete term in the dictionary; if expansion exceeds a limit, the search rejects rather than silently dropping terms.

Choose [typo tolerance](TYPO.md), [synonyms](SYNONYMS.md), [literal/infix matching](LITERAL.md), [ordered proximity](PROXIMITY.md) or [query syntax](QUERY_SYNTAX.md) explicitly when you need those behaviors. A plain string does not turn them on.

## Analysis and ranking

The default analyzer, `basic-v1`, finds words and numbers with boundaries equivalent to `/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu`. It applies NFKC normalization and locale-independent lowercase once to each original token. It does not split the normalized result again.

Accents and word forms remain significant: `café` differs from `cafe`, and `Straße` differs from `strasse`. The analyzer does not remove stop words, stem words or perform linguistic Japanese segmentation. When you request positions or offsets, each source token keeps its full original UTF-16 span; the end offset is exclusive. Positions start again for each text-array value.

`raveldex-bm25-v1` uses field-local positive-length populations, `k1 = 1.2`, `b = 0.75`, explicit field boosts and `ln(1 + (N - df + 0.5)/(df + 0.5))` IDF. It selects the best weighted alternative per canonical group/field and sums participating groups/fields deterministically. Only positive groups in successful Boolean branches score; repeated equivalent groups contribute once. Phrases add no hidden bonus. Metadata/facets do not recompute IDF. The repository [ranking contract](https://github.com/vmitsaras/raveldex/blob/main/docs/specs/RANKING.md) gives normative arithmetic and hand-derived cases. [Inspector](ADDONS.md#native-inspector) returns selected actual arithmetic.

## Execution, errors and bounds

Operations run through one bounded queue in submission order. Each uses the collection revision available when it starts. A deadline includes time spent waiting in that queue; the default is `min(30_000, maxDeadlineMs)` and the maximum is 60,000 ms.

Cancellation takes effect at work checkpoints, so it is not an immediate real-time interruption. If several stop conditions apply, the order is disposal, caller cancellation, deadline, then work limit. A change that already committed still returns its committed result. A failure before commit leaves the previous revision in place. Disposing rejects pending and new work; it does not undo completed updates.

Catch configuration errors around `createRaveldex` itself, and catch operation errors around your awaited calls. `RaveldexError` provides a fixed `message`, a `code` and frozen `details: { path?, limit?, actual? }`. Its diagnostics do not include your record or query text.

The following is the list exported as `ERROR_CODES`, not a command to run. Use a code to choose the appropriate recovery action:

```text
INVALID_SCHEMA INVALID_RECORD INVALID_QUERY INVALID_OPTIONS
ID_EXISTS ID_NOT_FOUND LIMIT_EXCEEDED QUEUE_FULL WORK_LIMIT_EXCEEDED
DEADLINE_EXCEEDED CANCELLED DISPOSED MISSING_CAPABILITY INCOMPATIBLE_CAPABILITY
REVISION_MISMATCH REVISION_EXHAUSTED RESOURCE_EXHAUSTED UNSUPPORTED_ENVIRONMENT INTERNAL_ERROR
```

For example, `CANCELLED` can mean a newer search replaced an older request, while `QUEUE_FULL` means you need to reduce pending work. A work or deadline error does not contain a successful partial search.

The defaults below bound input and work; they are not promises about memory, response time or usable document capacity. One limit can be reached before another, even below the maximum record count.

| Keys | Defaults |
| --- | --- |
| `maxDocuments`, `maxTextFields`, `maxMetadataFields` | 10,000; 32; 32 |
| `maxFieldNameCodeUnits`, `maxIdCodeUnits`, `maxTextValuesPerField` | 64; 256; 64 |
| `maxMetadataValuesPerField`, `maxMetadataStringCodeUnits`, `maxMetadataCodeUnitsPerRecord` | 128; 1,024; 32,768 |
| `maxTextCodeUnitsPerValue`, `maxTextCodeUnitsPerRecord`, `maxCorpusTextCodeUnits` | 65,536; 262,144; 67,108,864 |
| `maxRawTokenCodeUnits`, `maxTermCodeUnits`, `maxTokensPerRecord`, `maxCorpusTokens` | 256; 256; 32,768; 4,000,000 |
| `maxDictionaryEntries`, `maxPostingEntries`, `maxMutationBatch`, `maxAdmissionEntries` | 250,000; 2,000,000; 256; 16,384 |
| `maxQueryNodes`, `maxQueryDepth`, `maxQueryLexicalCodeUnits`, `maxQueryCodeUnits` | 128; 16; 2,048; 16,384 |
| `maxQueryTokens`, `maxQueryGroups`, `maxVariantsPerGroup` | 64; 64; 16 |
| `maxExpansionsPerGroup`, `maxQueryExpansions`, `minPrefixCodePoints` | 256; 1,024; 2 |
| `maxHits`, `maxQueuedOperations` | 100; 32 |
| `maxSearchWorkUnits`, `maxMutationWorkUnits`, `checkpointWorkUnits`, `maxDeadlineMs` | 10,000,000; 50,000,000; 2,048; 60,000 |

The structural `CancellationSignal` type requires `aborted`, `addEventListener('abort', listener, options?)` and `removeEventListener('abort', listener)`. A native `AbortSignal` is usable; core declarations require neither DOM nor Node type libraries.

## Registration types

Most applications can use the provided add-on factories. If you are writing an extension, the root package also exports the protocol types below. Extensions run as trusted code; this protocol does not sandbox them or allow arbitrary replacement of the scorer or analyzer.

| Exported types | Role |
| --- | --- |
| `AddonRegistration`, `CapabilityManifest`, `CapabilityReference` | Manifest identity/version, roles, provides/requires, selected data, direct/worker execution, limits, codec and costs; optional trusted role handles. |
| `ParticipantContext`, `ParticipantImplementation` | Initialize selected state; resumably prepare next state for atomic mutation publication. |
| `RefinementContext`, `RefinementImplementation`, `PreparedRefinement` | Exact-token-sequence leaf refinement; selected declared state, fields and terms; resumable membership test. |
| `MetadataContext`, `PayloadContext`, `CapturedPayload` | Owned payload, schema/revision/limits and bounded capture. |
| `PredicateImplementation`, `PreparedPredicate` | Capture and prepare a resumable predicate over owned metadata. |
| `AggregationImplementation`, `PreparedAggregation`, `AggregationOutput` | Capture string-field aggregation, consume complete matches, finish bounded owned output. |
| `EvidenceContext`, `EvidenceResultContext`, `EvidenceImplementation`, `PreparedEvidence` | Explicit selected factual trace/evidence, declared provider state and bounded output. |

The exported declarations are authoritative for exact generator/context shapes. See the repository [extension contract](https://github.com/vmitsaras/raveldex/blob/main/docs/architecture/ADDONS_AND_ADAPTERS.md) before authoring a trusted registration. No private owner/root/scheduler API is supported.

To request [token suggestions](SUGGESTIONS.md), use `SearchOptions.extensions.suggestions`. Suggestions read the selected dictionaries at the search revision. They do not change which records match, their scores or the page of hits.

## Explicit language analysis

Use `basic-v1` unless you deliberately choose another analyzer. To select [English analysis](ENGLISH.md), pass both its registration in `addons` and its descriptor in `Configuration.analyzer` when creating the engine.

English analysis changes the terms and ranking statistics, while keeping original token positions and spans. Metadata stays unchanged. Installing the pack without selecting it leaves basic analysis active. Core itself imports no language implementation or language tables, and no other first-party language or segmentation-graph pack is available.
