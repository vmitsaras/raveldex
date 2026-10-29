# Core API

Import runtime values and readonly types from `@vmitsaras/raveldex`. The [root quick start](../../README.md) runs a complete source-free search; [core.mjs](examples/core.mjs) exposes the same flow as `runCoreExample()`.

## Configuration and records

`createRaveldex(configuration: Configuration): Raveldex` synchronously validates configuration and returns an empty revision-0 engine. Configuration is `{ schema, limits?, analyzer?, addons? }`.

| Type / property | Contract |
| --- | --- |
| `Schema.text` | Nonempty map of field names to `TextField` (`{ boost?: number }`). Boost defaults to 1; finite `(0,16]`. |
| `Schema.metadata?` | Map to `MetadataField` (`{ type: 'string' \| 'number' \| 'boolean', multi?: boolean, nullable?: boolean }`). Both flags default to false. |
| `RecordInput` | `{ id: string, text: Record<string, string \| readonly string[]>, metadata?: Record<string, Scalar \| readonly Scalar[]> }`. Only declared fields are accepted. |
| `Scalar` | `string \| number \| boolean \| null`. Null requires a nullable field; numbers are finite. A multi field requires an array. Missing is distinct from null. |
| `AnalyzerDescriptor` | `{ id, environmentProfile }`; ordinary default is `{ id: 'basic-v1', environmentProfile: 'unqualified' }`. This is an identity descriptor, not a custom tokenizer function. |
| `LimitOverrides` | Partial `Limits`. Limits may be reduced from the defaults below; `minPrefixCodePoints` can be raised. |
| `addons` | Explicit readonly `AddonRegistration[]`; source, positions and other capabilities are absent unless selected. |

Names match `[A-Za-z][A-Za-z0-9_]{0,63}`; `constructor` and `prototype` are forbidden, and text/metadata names cannot overlap. IDs are opaque well-formed Unicode strings of 1–256 UTF-16 code units. Case and whitespace are significant. Records accept plain data, including null-prototype objects, rather than accessors, arbitrary instances or executable objects. Unknown properties fail validation. Caller structure and primitive values are captured at admission; later caller mutations do not change queued work.

Missing declared text values and empty strings/arrays are valid. Text-array elements remain separate values. Core keeps IDs, declared equality metadata and native index/statistical state. Keep application display records separately, or explicitly install a [source provider](ADDONS.md#source-positions-and-phrases).

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

`MutationResult` is `{ revision, changed, added, replaced, removed }`. A state-changing operation commits one new revision atomically across core and installed providers. No-op results preserve revision. `SearchResult` is `{ revision, model: 'raveldex-bm25-v1', completeness: 'complete', total, hits, extensions? }`, with `hits: readonly { id, score }[]`. The total is independent of pagination. Scores are finite and unrounded; order is descending score, then ascending ID by UTF-16 comparison.

`MutationOptions` is `{ signal?: CancellationSignal, deadlineMs?: number }`. `SearchOptions` adds `{ limit?: number, offset?: number, extensions?: Record<string, unknown> }`. The default page size is `min(20, maxHits, maxDocuments - offset)`; offset defaults to zero. `limit: 0` still computes the exact total. Explicit `offset + limit` must fit the configured document capacity. Optional outputs are available under their registered extension keys.

## Query shapes

Plain strings are exact-token AND text queries across declared text fields. They never interpret quotes, `AND`, minus signs or other punctuation as a query language. An application can explicitly compile [optional query syntax](QUERY_SYNTAX.md) to a typed tree before calling search.

| `Query.kind` | Properties / meaning |
| --- | --- |
| `text` | `{ text, operator?: 'and' \| 'or', fields?: string[] }`; default AND. |
| `group` | `{ variants: Variant[], fields?: string[] }`; alternative terms/fields. `Variant` is `{ text, match: 'exact' \| 'prefix', weight?: number }`. Each text analyzes to exactly one token; finite weight `(0,1]`, default 1. |
| `and`, `or` | `{ children: Query[] }`; nonempty Boolean groups. |
| `not` | `{ child: Query }`; complement against all live IDs, contributes no lexical score. |
| `eq` | `{ field, value: Scalar }`; strict declared metadata equality, including any matching member of multi metadata. |
| `all`, `none` | No additional properties; explicit browse-all or match-none. |
| `extension` | `{ capability, version, payload }`; requires a matching installed capability. |

Omitted `fields` means all text fields; explicit lists must be nonempty and unique. Empty analyzed text matches nothing. Equality preserves string case/spacing, never coerces types, and distinguishes missing from null. `not(eq(...))` includes missing values. Metadata-only and negative-only queries can return zero-scored matches.

For example, request prefix explicitly:

```js
const query = {
  kind: 'group', fields: ['title'],
  variants: [{ text: 'atom', match: 'prefix', weight: 0.8 }],
};
```

Prefix expansion enumerates complete matching dictionary terms. It needs at least two normalized code points; overflow rejects the complete search rather than truncating candidates. [Bounded typo tolerance](TYPO.md) requires its explicit optional extension leaf. [Directional synonyms](SYNONYMS.md) also require a separate explicit extension leaf and preserve required original groups. Infix, proximity and query-string syntax remain deferred.

## Analysis and ranking

`basic-v1` recognizes tokens equivalent to `/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu`, then applies NFKC normalization followed by locale-independent lowercase once per original token. It does not retokenize normalized output, remove stop words, strip accents, stem words or segment Japanese linguistically. `café` differs from `cafe`; `Straße` differs from `strasse`. Original half-open UTF-16 spans identify the complete source token even when normalization changes its length. Positions reset for each original array value.

`raveldex-bm25-v1` uses field-local positive-length populations, `k1 = 1.2`, `b = 0.75`, explicit field boosts and `ln(1 + (N - df + 0.5)/(df + 0.5))` IDF. It selects the best weighted alternative per canonical group/field and sums participating groups/fields deterministically. Only positive groups in successful Boolean branches score; repeated equivalent groups contribute once. Phrases add no hidden bonus. Metadata/facets do not recompute IDF. The repository [ranking contract](https://github.com/vmitsaras/raveldex/blob/main/docs/specs/RANKING.md) gives normative arithmetic and hand-derived cases. [Inspector](ADDONS.md#native-inspector) returns selected actual arithmetic.

## Execution, errors and bounds

All ordinary methods share one bounded FIFO. An operation uses the revision selected when it begins execution. Deadlines include queue time and use a monotonic admission deadline; the default is `min(30_000, maxDeadlineMs)` and the maximum is 60,000 ms. Cancellation is cooperative at charged boundaries, not a hard real-time interruption. Stop priority is disposal, caller cancellation, deadline, then work bound. Once committed, a mutation reports its committed result even if a stop arrives afterward. Failed precommit work preserves the prior revision. Disposal rejects pending/new operations and does not fabricate a rollback of committed work.

Configuration errors throw synchronously; ordinary operational validation/execution failures reject promises. `RaveldexError` has a fixed `message`, `code` and frozen sanitized `details: { path?, limit?, actual? }`. Diagnostics do not echo submitted records/query text. `ERROR_CODES` is the readonly runtime array:

```text
INVALID_SCHEMA INVALID_RECORD INVALID_QUERY INVALID_OPTIONS
ID_EXISTS ID_NOT_FOUND LIMIT_EXCEEDED QUEUE_FULL WORK_LIMIT_EXCEEDED
DEADLINE_EXCEEDED CANCELLED DISPOSED MISSING_CAPABILITY INCOMPATIBLE_CAPABILITY
REVISION_MISMATCH REVISION_EXHAUSTED RESOURCE_EXHAUSTED UNSUPPORTED_ENVIRONMENT INTERNAL_ERROR
```

Default `Limits` values are logical defensive bounds, not guaranteed usable capacity, memory or latency. Interacting structure, work and deadline limits can refuse a collection below the document ceiling.

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

Root also exports the trusted extension protocol types. They are implementation contracts, not an untrusted-code sandbox or a promise of arbitrary scorer/analyzer replacement. First-party factories are the usual application interface.

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

The optional [token suggestions](SUGGESTIONS.md) output is requested through `SearchOptions.extensions.suggestions`. It reads selected whole-corpus dictionaries at the execution revision and never alters query membership, scores or pagination.

## Explicit language analysis

`basic-v1` remains the default. The optional [English analyzer](ENGLISH.md) requires both its registered pack and explicit `Configuration.analyzer` descriptor at new-owner construction. Its one-to-one original-token transform changes lexical terms and native statistics, while preserving original positions/spans; metadata is unchanged. Installed but unselected packs leave ordinary basic results unchanged. Core imports no language implementation/table. Other segmentation graphs/languages remain unavailable as first-party packs.
