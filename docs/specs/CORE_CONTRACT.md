# Core contract: data, analysis, queries, results, and limits

Status: Approved. Owner tasks: RX-1001 through RX-1006. RX-1001–1006 input/analysis, frequency indexing, query/BM25 evaluation, atomic mutations, ordinary execution and the packed public core pilot are implemented and verified locally; see [package evidence](../evidence/RX-1006.md). See [RX-1001 evidence](../evidence/RX-1001.md), [RX-1002 evidence](../evidence/RX-1002.md), [RX-1003 evidence](../evidence/RX-1003.md), [RX-1004 evidence](../evidence/RX-1004.md) and [RX-1005 evidence](../evidence/RX-1005.md).

## Goal

Make the native core useful by itself: index declared local records, search them with explicit lexical/Boolean/equality semantics, and return a coherent ranked page with an exact total.

## User / system outcome

An application can create an engine, add records, submit ordinary text or a typed query, read stable IDs/scores, mutate records, and dispose the engine using public ESM imports. It does not need a DOM, worker, database, MiniSearch, retained display text, or an add-on for this flow.

## Current-system facts and constraints

This is the approved contract for a fresh repository. The ordinary methods and empty-engine factory are exported from the root ESM package and verified by an isolated local-tarball consumer. The native architecture is in [NATIVE_ARCHITECTURE.md](../architecture/NATIVE_ARCHITECTURE.md). Current native verification is recorded in the task evidence linked above.

Pure ESM TypeScript; no core runtime dependency or DOM import. The 10,000-document ceiling and finite bounds below are adopted initial design limits, not measurements. Limit increases require a reviewed contract change; consumers may configure stricter bounds.

## Decisions

- C-D01: Document IDs are opaque strings; there is no implicit numeric/string conversion.
- C-D02: Only declared text and metadata fields enter the index.
- C-D03: `basic-v1` is the same analyzer for indexing and querying within an engine owner.
- C-D04: Empty analyzed text means no matches. Listing everything requires explicit `all`.
- C-D05: Boolean membership, scoring groups, predicates, and pagination are separate concerns.
- C-D06: Every successful search establishes complete membership and an exact total.

## Public API contract

These names and call shapes are implemented and qualified through the root package in RX-1006. The frozen factory result exposes only bound ordinary methods; private roots, scheduler handles and execution callbacks remain internal. Root exports include the factory, `RaveldexError`, `ERROR_CODES` and readonly contract types; internal subpaths are excluded by the exports map.

| Entry | Required call/result contract |
| --- | --- |
| `createRaveldex({ schema, limits?, analyzer?, addons? })` | Synchronously validates configuration and returns an empty engine at revision 0. Invalid configuration throws a typed configuration/schema error. No records are indexed by the factory. |
| `engine.search(query, options?)` | Returns `Promise<SearchResult>`. `query` is a string or the typed AST below. Options are `{ limit?, offset?, signal?, deadlineMs?, extensions? }`; extensions require explicitly installed handlers. |
| `engine.add(record, options?)` | Returns `Promise<MutationResult>`; existing ID rejects. |
| `engine.addMany(records, options?)` | Returns one atomic `Promise<MutationResult>` for a bounded add-only batch. |
| `engine.replace(record, options?)` | Returns `Promise<MutationResult>`; missing ID rejects. This is complete replacement, not a patch. |
| `engine.remove(idOrIds, options?)` | Accepts one ID or a bounded readonly ID array; returns `Promise<MutationResult>`. Missing IDs are no-ops. |
| `engine.clear(options?)` | Returns `Promise<MutationResult>` for clearing the complete collection. |
| `engine.dispose()` | Returns an idempotent `Promise<void>`; closes admission immediately and releases state after active work settles safely. |

Mutation options are `{ signal?, deadlineMs? }`. All operational validation failures reject the returned promise; they do not escape as synchronous throws. Implementations still capture/copy bounded input structures and primitive values before returning that promise. Character-by-character UTF-16 validation and analysis occur later in charged resumable execution; admission does not scan all text in a large batch. There is no public arbitrary callback, mixed-command transaction, in-place schema update, or source projection in the initial API.

`analyzer` defaults to `{ id: 'basic-v1', environmentProfile: 'unqualified' }`. It is a descriptor, not an executable string. A selected non-default analyzer requires a compatible explicitly installed registration. `addons` defaults to `[]`; registrations use the capability contract and trusted implementation handles in [ADDONS_AND_ADAPTERS.md](../architecture/ADDONS_AND_ADAPTERS.md). The core imports none automatically. RX-2001 implements explicit direct source participants and exact-token-sequence leaf refinement; RX-2002 adds optional position/offset participants and position/mixed phrase strategies. Other roles/custom analyzers remain unavailable.

`MutationResult` is exactly `{ revision: number, changed: boolean, added: number, replaced: number, removed: number }`, with nonnegative safe-integer counts. All methods share the queue, revision, cancellation, conflict, and no-op rules in [MUTATIONS_AND_EXECUTION.md](MUTATIONS_AND_EXECUTION.md). Public TypeScript declarations must express these contracts, readonly input/output data, and the known error codes.

## Data contracts

### Schema

The schema declares named text fields and metadata fields. This is its required top-level shape, illustrated with an example schema:

```ts
{
  text: {
    title: { boost: 2 },
    body: { boost: 1 }
  },
  metadata: {
    kind: { type: 'string', multi: false, nullable: false },
    tags: { type: 'string', multi: true, nullable: false },
    year: { type: 'number', multi: false, nullable: true }
  }
}
```

These are schema data, not implementation code. Defaults are `boost: 1`, `multi: false`, and `nullable: false`. `metadata` may be omitted or empty; at least one text field is required. Metadata types are `string`, `number`, and `boolean`.

Names match `[A-Za-z][A-Za-z0-9_]{0,63}`. Reject the names `constructor` and `prototype`; implementations must still use prototype-safe dictionaries. A name may not occur in both text and metadata declarations. An object API cannot detect duplicate same-name keys already overwritten during JavaScript construction or parsing; do not claim to reject information discarded before the API call. Unknown schema keys fail validation.

Text-field boosts are finite numbers greater than zero and at most 16. Schema/analyzer changes on a live engine require a new index/reindex operation; they cannot silently change existing state.

### Record

```ts
{
  id: 'guide:storage#recovery',
  text: {
    title: 'Recover a saved collection',
    body: ['First paragraph.', 'Second paragraph.']
  },
  metadata: {
    kind: 'guide',
    tags: ['storage', 'recovery'],
    year: null
  }
}
```

The only top-level keys are `id`, `text`, and `metadata`. `text` is required and may be empty; `metadata` is optional. Reject unknown field names. A declared text field may be missing, a string, or an array of strings. `null`, `undefined`, mixed arrays, and nested arrays are invalid text values. Empty strings/arrays are valid and emit no tokens. Array values are analyzed separately; their positions and offsets never share a coordinate space.

An ID contains 1–256 UTF-16 code units, is well-formed Unicode, and is compared byte-for-code-unit without trimming, normalization, numeric conversion, or locale collation. Whitespace and case are significant. The empty string is invalid. Internal storage must support ordinary opaque IDs such as `__proto__` without treating them as object property operations.

For a single metadata field, a present value must have the declared scalar type, or be `null` when nullable. For a multi field, a present value must be an array of allowed scalar/null values; a scalar is not automatically wrapped. Empty arrays are valid. Duplicate array values have one logical membership, and facet counts count a document at most once per value.

Numbers must be finite. Canonicalize `-0` to `0`. `NaN`, infinities, bigint, dates, functions, symbols, accessors, and arbitrary class instances are rejected. `undefined` is never a synonym for a missing property. String values are well-formed UTF-16. Metadata strings preserve their original case/spacing and are not analyzed.

Accept plain data objects with ordinary or null prototypes. Validate own data properties and copy accepted input into engine-owned data. Do not execute getters, call an input's `toJSON`, or use an input object as an internal dictionary. Proxies and code-bearing objects are outside the accepted data contract; the engine is not a sandbox for caller-supplied JavaScript.

### Ownership and retention

At method admission, copy the bounded object/array structure and capture primitive values. Perform cheap type, property, array-length, and string-length checks then; scan string contents and analyze tokens inside queued resumable work. Caller mutations after the call cannot change queued work. Strings are immutable values; capturing them does not require inventing a second byte buffer. Synchronous ownership capture is a bounded, nonpreemptible section, not an interruptible scan of all string characters.

Core retains IDs, canonical equality metadata, reverse per-document term frequencies, field lengths, and index/statistical data. It does not retain the original `text` strings after a successful operation unless an explicitly installed transactional source participant requests them. It never retains arbitrary undeclared record properties.

## `basic-v1` analyzer

### Normative algorithm

Process each original text value independently:

1. Validate well-formed UTF-16 and input limits. Scan by Unicode code point while retaining JavaScript UTF-16 indices.
2. Recognize original tokens equivalent to the ECMAScript Unicode expression `/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu`. A token begins with a letter or number, then consumes letters/numbers/marks. Other code points delimit tokens. Leading combining marks outside a token are delimiters.
3. For each complete original token span, reject a raw span beyond the token limit; do not truncate or split it to fit.
4. Normalize that span using `raw.normalize('NFKC').toLowerCase()` in that order. This is default locale-independent lowercasing, not `toLocaleLowerCase`, full Unicode case folding, accent stripping, stemming, or language-specific segmentation.
5. Emit exactly one normalized term for that original span. Do not retokenize normalized output, even if compatibility normalization introduces punctuation or a space. Enforce the normalized-term limit after transformation.
6. Emit `{ term, valueIndex, position, start, end }`, with zero-based `position` in that original value and the half-open original UTF-16 range `[start, end)`. Positions increment once per emitted token. There are no stop-word holes in this analyzer.

The implementation may use a bounded scanner rather than allocating every regex result at once, but must have the stated behavior. It must not normalize a whole unbounded record in one operation or derive offsets from the normalized string.

### Examples and intentional limits

| Original value | Terms | Consequence |
| --- | --- | --- |
| `Hello_world` | `hello`, `world` | Underscores split words; code/identifier preservation is a later analyzer. |
| `can't` | `can`, `t` | Apostrophes are separators in `basic-v1`. |
| `red—blue` | `red`, `blue` | Punctuation is ignored by token adjacency, not retained as a literal phrase requirement. |
| `café` / `cafe` | `café` / `cafe` | Accents are significant. |
| `a\u0301` | `á`, original range `[0,2)` | The normalized term may have a different UTF-16 length. |
| `ﬁle` | `file`, original range `[0,3)` | Compatibility expansion does not produce normalized-string offsets. |
| `Straße` | `straße` | `strasse` is a different term; this is lowercasing, not full case folding. |
| `½` | one term `1⁄2` | It is not re-tokenized into two number tokens. Literal `1/2` is analyzed as two tokens. |
| `東京都` | one contiguous letter token | Linguistically segmented Japanese search is not claimed. |
| `😀` or whitespace only | no terms | Plain empty analysis returns no matches. |

Case behavior, including contextual lowercase mappings, follows the host's default lowercase algorithm. The engine does not claim locale-specific equivalence, transliteration, or perfect caseless matching across scripts.

### Source mapping

Token ranges refer to the entire original token. They are sufficient for token occurrences and original-source phrase evidence. They do not constitute a character-by-character normalization map. A prefix match initially highlights the entire matching original token; a shorter normalized prefix is not converted into a fabricated shorter original range.

Array indices are original indices, including empty values. Positions reset to zero for each value. Ranges are local to the identified value. Surrogate pairs must not be split. Presentation-level grapheme-safe snippet clipping is a separate evidence add-on concern.

### Environment compatibility

Identity contains `id: basic-v1`, the complete analyzer configuration, and an environment qualification profile. The logical ID alone is not a Unicode-data-version guarantee. ECMAScript property tables, normalization, and lowercasing are host supplied.

The default profile is **unqualified**: useful for same-owner indexing/querying, without a cross-host native-snapshot portability promise. A qualified profile must record tested runtime/browser versions and its compatibility evidence. A small fingerprint/probe set is diagnostic, not proof of equivalence for all Unicode.

Direct and worker execution must use the same implementation/configuration and compatible qualified profiles, or an explicitly same-host unqualified pairing supported by the worker contract. Importing native state across incompatible or unqualified profiles is rejected. A source snapshot may be rebuilt under a receiving profile with an explicit reindex result; this is not a score/membership equivalence claim.

## Query contract

The public search method accepts a plain string or a validated `query-v1` tree. A string is shorthand for `text` with AND semantics and all declared text fields. It is never interpreted as an operator/query-language string.

### Core nodes

| Node | Data | Meaning |
| --- | --- | --- |
| `text` | `text`, optional `operator: 'and' | 'or'`, optional `fields` | Analyze text into original token groups; AND is the default. Every group initially has one exact variant. |
| `group` | nonempty `variants`, optional `fields` | OR between variants and selected fields. Each variant has `text`, `match: 'exact' | 'prefix'`, and optional `weight` defaulting to 1. |
| `and` | nonempty `children` | Every child must qualify. |
| `or` | nonempty `children` | At least one child must qualify. |
| `not` | one `child` | Complement within all live documents in the operation's revision; contributes no score. |
| `eq` | declared metadata `field`, scalar/null `value` | Strict typed equality, as defined below. |
| `all` | no additional keys | Every live document, including records with no tokens. |
| `none` | no additional keys | No documents. |

The discriminator key is `kind`. Unknown kinds/keys, empty Boolean children, invalid fields, duplicate field selections, cyclic data, and excessive depth/size fail validation. An omitted `fields` means every declared text field. A supplied field list must be nonempty.

An installed module may validate a reserved `{ kind: 'extension', capability, version, payload }` leaf. With no matching registration, this fails with `MISSING_CAPABILITY`. Search-option `extensions` is a bounded data map keyed by registered capability ID; every payload is validated by that capability, and absent handlers fail. No capability is inferred from payload contents. See the [extension contracts](../architecture/ADDONS_AND_ADAPTERS.md).

Each `group` variant's raw `text` must analyze to exactly one token. Its weight is finite, greater than zero, and at most 1; it discounts an alternative, never boosts it beyond its ordinary contribution. Weights and exact/prefix variants are represented explicitly so later expansion add-ons need not corrupt original-group AND semantics. v1 has no arbitrary user-supplied score callback.

A `text` node with zero tokens canonicalizes to `none`, even with operator OR. It does not become `all` or an unconstrained filter. Callers seeking filter-only results submit `eq` or a Boolean expression with an explicit `all`. A negative-only query is allowed and is evaluated against the complete live ID set.

Analyze raw lexical input exactly once at its boundary. Internal canonical groups carry normalized terms directly; they must not feed those terms back through the raw-text analyzer. This matters for compatibility output such as the single normalized term from `½`, which contains a separator that was not a separator in the original token. Phrase candidate compilation and snapshot term validation must preserve the same distinction.

### Boolean groups and repeated terms

For `red car`, default text search requires the `red` group AND the `car` group. Within a future expanded `car` group, variants such as `car` OR `automobile` remain alternatives; they do not become two required words.

Equivalent normalized lexical groups are deduplicated for scoring. Ordinary repeated query words do not create a hidden query-frequency boost. Repetition inside a strict phrase remains significant to phrase membership; that is a separate capability.

Canonicalization may flatten the same Boolean operator, sort its children, and deduplicate equivalent children. It must preserve matching and the scoring-contribution rules in [RANKING.md](RANKING.md). It cannot rewrite a negative filter into a positive scoring clause or turn empty analysis into match-all.

A group may qualify from any selected field. Separate AND groups may qualify from different fields. Core AND is not same-field phrase matching.

### Exact and prefix terms

Exact means equality with a complete normalized dictionary term. Prefix means that a complete normalized dictionary term starts with the normalized query term. Matching is binary and never locale collation.

Prefix terms require at least two Unicode code points after normalization. Enumerate qualifying live terms in the selected fields; count distinct `(field, term)` expansions. The per-group and whole-query caps below apply before result evaluation. The whole-query count unions these pairs across canonical groups; selecting the same pair through different clauses or weights does not count it twice. If an expansion cap is exceeded, fail the entire operation; do not take the first alphabetic expansions or the most frequent terms.

Prefix matching is not automatically enabled on the final word of plain-string search. A caller requests it using a typed group. Fuzzy, infix, phrase, synonym, and query-language operators are not inferred from punctuation or misspellings.

### Scalar equality

`eq` requires a scalar of the field's declared type, or `null` only for a nullable field. Wrong-type queries fail validation, rather than returning a guessed coercion result.

- String equality is exact UTF-16 equality with no trimming/analysis.
- Number equality is ordinary equality between finite numbers, with `-0` canonicalized to `0`.
- Boolean equality is exact.
- Explicit null matches explicit null only. Missing does not equal null.
- For multi metadata, equality means at least one array element equals the requested scalar. An empty array has no matching value.
- Missing metadata makes `eq` false. Therefore `not(eq(...))` includes missing metadata: this is two-valued Boolean set logic, not SQL NULL logic.

Equality-only matches have score zero. Ordering among them uses the normal ID tie-breaker.

## Results and errors

The planned search result shape is:

```ts
{
  revision: 3,
  model: 'raveldex-bm25-v1',
  completeness: 'complete',
  total: 27,
  hits: [{ id: 'guide:storage#recovery', score: 1.234 }]
}
```

The example numbers illustrate shape only. `total` counts all unique documents satisfying the complete query before pagination. Sort by score descending, then opaque ID ascending by UTF-16 lexicographic comparison. Do not use locale collation or insertion order. Return unrounded finite score numbers.

Search options include `limit` (normally 20, maximum 100), `offset` (default 0), `signal`, and a bounded deadline option. A supplied offset is an integer from zero through document capacity. When limit is omitted its effective default is `min(20, maxHits, maxDocuments - offset)`, so a deliberately reduced engine capacity remains usable. `limit: 0` is valid and still obtains an exact total. An explicit limit must be a nonnegative integer no greater than `maxHits`; `offset + limit` must not exceed document capacity. Core results return IDs and scores, not automatically retained source or arbitrary application records.

An explicitly requested installed capability may add its validated data under an `extensions` result map, keyed by capability ID. Otherwise that property is absent. Capability output cannot overwrite revision, model, total, completeness, or core hits.

All operational methods settle through their promised result/error channel. A successful operation never returns `completeness: partial`, an estimated total, or undisclosed dropped expansions. Result pagination is the explicit requested projection of fully evaluated membership.

Use a stable `RaveldexError`-style shape with `code`, a sanitized `message`, and bounded structured details such as `path`, `limit`, and `actual`. The exact class export is implemented in RX-1001. Error details must not embed raw query strings, text bodies, metadata values, or worker stacks by default.

| Code | Meaning |
| --- | --- |
| `INVALID_SCHEMA`, `INVALID_RECORD`, `INVALID_QUERY`, `INVALID_OPTIONS` | Input does not satisfy its declared contract. |
| `ID_EXISTS`, `ID_NOT_FOUND` | Add/replace membership conflict when the mutation executes. |
| `LIMIT_EXCEEDED` | A named input, state, expansion, result, or capability bound would be exceeded. |
| `QUEUE_FULL` | Bounded admission cannot accept another queued operation. |
| `WORK_LIMIT_EXCEEDED`, `DEADLINE_EXCEEDED` | Execution cannot finish within the selected operation budget. |
| `CANCELLED`, `DISPOSED` | The operation was cancelled before its commit/delivery boundary, or the engine has been disposed. |
| `MISSING_CAPABILITY`, `INCOMPATIBLE_CAPABILITY` | A query/adapter requests absent or incompatible behavior/data. |
| `REVISION_MISMATCH`, `REVISION_EXHAUSTED` | A revision precondition fails or another safe-integer revision cannot be created. |
| `RESOURCE_EXHAUSTED`, `INTERNAL_ERROR` | A recoverable resource failure or invariant failure prevented success. |

Adapters may add documented transport/storage/codec errors. An unknown transport outcome is not core `CANCELLED`; see the lifecycle and adapter contracts.

## Finite initial limits

All values below are adopted defensive design caps. They are not benchmark results or recommended dataset sizes. Each configurable upper bound may be reduced; implementation must validate interdependent bounds. The minimum prefix length may be increased, never reduced below two.

The accepted `limits` keys are `maxDocuments`, `maxTextFields`, `maxMetadataFields`, `maxFieldNameCodeUnits`, `maxIdCodeUnits`, `maxTextValuesPerField`, `maxMetadataValuesPerField`, `maxMetadataStringCodeUnits`, `maxMetadataCodeUnitsPerRecord`, `maxTextCodeUnitsPerValue`, `maxTextCodeUnitsPerRecord`, `maxCorpusTextCodeUnits`, `maxRawTokenCodeUnits`, `maxTermCodeUnits`, `maxTokensPerRecord`, `maxCorpusTokens`, `maxDictionaryEntries`, `maxPostingEntries`, `maxMutationBatch`, `maxAdmissionEntries`, `maxQueryNodes`, `maxQueryDepth`, `maxQueryLexicalCodeUnits`, `maxQueryCodeUnits`, `maxQueryTokens`, `maxQueryGroups`, `maxVariantsPerGroup`, `maxExpansionsPerGroup`, `maxQueryExpansions`, `minPrefixCodePoints`, `maxHits`, `maxQueuedOperations`, `maxSearchWorkUnits`, `maxMutationWorkUnits`, `checkpointWorkUnits`, and `maxDeadlineMs`. Unknown keys or noninteger bounds fail configuration validation. Positive bounds have a minimum of one; `maxMetadataFields` and `maxQueuedOperations` may be zero. The default operation deadline is `min(30,000, maxDeadlineMs)`; `maxDeadlineMs` defaults to 60,000.

| Resource | Initial default / hard cap | Counting rule |
| --- | ---: | --- |
| Live documents | 10,000 | Published plus proposed mutation state, not cumulative historical additions. |
| Text / metadata fields | 32 / 32 | At most 64 declared fields in total. |
| Field name / ID | 64 / 256 UTF-16 code units | ID minimum is one. |
| Text array values per field | 64 | Empty values count toward this bound. |
| Metadata array values per field | 128 | Validate before deduplication. |
| One metadata string | 1,024 UTF-16 code units | No truncation. |
| Total metadata string content per record | 32,768 UTF-16 code units | All present values before deduplication. |
| One original text value | 65,536 UTF-16 code units | Validate before analysis. |
| Original text per record | 262,144 UTF-16 code units | Sum across fields/values. |
| Original text across live corpus | 67,108,864 UTF-16 code units | Logical input-size accounting remains available even without retaining source. |
| Raw token / normalized term | 256 / 256 UTF-16 code units | Oversized tokens reject the operation. |
| Emitted tokens per record | 32,768 | Sum across fields/values. |
| Emitted tokens across live corpus | 4,000,000 | Sum of field token frequencies. |
| Distinct `(field, term)` dictionary entries | 250,000 | Live entries only. |
| Distinct `(field, term, document)` posting entries | 2,000,000 | Repeated occurrences change tf, not this count. |
| Mutation batch records/IDs | 256 | Includes duplicates before rejection. |
| Admission structure entries | 16,384 | Own data properties and array elements inspected/captured per call; immutable string contents are not scanned at admission. |
| Query tree nodes / depth | 128 / 16 | Before canonicalization. |
| Raw lexical query text in total | 2,048 UTF-16 code units | All text/group payload strings before analysis. |
| All query string content | 16,384 UTF-16 code units | Includes field names, scalar strings, and extension payload strings. |
| Analyzed original query tokens / canonical groups | 64 / 64 | Token count is measured before duplicate elimination. |
| Declared variants per group | 16 | Before equivalent-variant deduplication. |
| Distinct prefix/exact expansions per group / query | 256 / 1,024 | Distinct `(field, term)` pairs; duplicate alternatives do not evade counting. |
| Returned hits | 100 | Default 20. Offset plus limit is at most document capacity. |
| Waiting operations | 32 | Excludes the single running operation. |
| Search work / mutation work | 10,000,000 / 50,000,000 units | Versioned deterministic accounting; see execution contract. |
| Work between checkpoints | 2,048 units | Upper target for owned resumable loops, with separately bounded primitives. |
| Operation deadline | 30,000 ms default / 60,000 ms maximum | From admission, including queue time; observed cooperatively. |

Counters use safe integers. Per-record/corpus bounds apply to proposed committed state. Updates may transiently hold old and staged structures simultaneously; admission limits are not a heap-memory cap. Recoverable overflow must reject before root publication.

## Acceptance criteria

- C-AC01: Schema/record validation rejects unknown data, unsafe/coerced values, invalid UTF-16, and each boundary violation with a stable code/path.
- C-AC02: Mutation of caller-owned arrays/objects after admission cannot alter accepted work or returned data.
- C-AC03: Analyzer fixtures prove the stated tokens, original ranges, value boundaries, normalization cases, and same-owner index/query behavior.
- C-AC04: Empty text, explicit all/none, negative-only queries, nested Boolean trees, repeated groups, and strict metadata equality match an independent full-scan evaluator.
- C-AC05: Prefix overflow, work overflow, and missing capabilities fail explicitly without a successful partial result.
- C-AC06: Exact totals precede pagination; limit zero, offsets, deterministic ties, and no-token documents behave as specified.
- C-AC07: A packed-package core-only consumer uses public imports without a DOM, worker, storage dependency, or hidden foreign-engine fallback.
- C-AC08: A tested environment record describes analyzer portability limits and does not equate a probe hash with universal Unicode equivalence.

## Expected affected areas

`src/core/`, `test/core/`, independent oracle/fixture directories, package exports, and `examples/core-docs/`. Exact filenames are local implementation choices; public behavior is not.

## Verification strategy

| Criteria | Required evidence |
| --- | --- |
| C-AC01–02 | Adversarial boundary/ownership tests, including null-prototype IDs, missing vs undefined, duplicate arrays, and caller mutation while queued. |
| C-AC03 | Hand-authored original-text token/range fixtures plus host-version records; no expected offsets derived from the implementation under test. |
| C-AC04–06 | Independent record-scanning membership oracle, hand-checked fixtures, generated small corpora, and deterministic query/mutation sequences. |
| C-AC07 | Actual build/pack/install/import/run consumer and inspected core dependency graph; a source-relative import does not qualify. |
| C-AC08 | Recorded runtime analyzer fixtures and adapter compatibility/reindex tests when N3 is implemented. |

N1 tasks must collect relevant evidence incrementally. A bootstrap typecheck or documentation validator does not mark these runtime criteria Pass.

## Explicitly out of scope

Language dictionaries, a text query-language parser, schema mutation in place, fuzzy/infix matching, relevance learning, custom score callbacks, automatic persistence, remote data acquisition, generic hooks, and public release.

## Open questions

None blocks RX-1001. Qualified host profiles and broader language analysis are later evidence/design work. If implementation exposes a contradiction in this contract, record a specification finding and resolve that narrow contradiction before changing behavior.
