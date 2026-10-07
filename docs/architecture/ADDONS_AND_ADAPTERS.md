# Add-ons and adapters

Status: Approved boundary/behavior contract. Primary tasks: RX-2001–RX-2006 and RX-3001–RX-3004. RX-2001 registration, transactional source and source phrases are verified locally; [evidence](../evidence/RX-2001.md). Other roles/strategies and adapters remain planned.

## Goal and outcome

Let consumers select the search, data, presentation, and environment capabilities they need while keeping the native core independently useful. Installing an unused capability must not change an existing query's membership, ranking, total, or lifecycle.

## Current facts and non-goals

This is a fresh native repository. Existing companion phrase/UI/storage behavior is an input to design and potential reuse, not an installed native module or native verification result.

N2/N3 implement the explicitly listed first-party capabilities. Generic plugin marketplaces, arbitrary hook chains, live analyzer/schema changes, multi-worker sharding, vectors, language models, and copying every competing library feature are outside this scope. Later optional tracks stay separate from the native 0.1 candidate.

## Decisions

- A-D01: Add-ons declare semantic effects; adapters preserve engine semantics.
- A-D02: Core-only import graphs exclude optional runtime code and have no retained optional side indexes.
- A-D03: Any index-dependent side representation commits atomically with core state.
- A-D04: Source phrase verification and positional verification implement one strict token-phrase meaning.
- A-D05: Positions, original offsets, and display source remain independent storage choices.
- A-D06: Missing or incompatible capability/data is a typed error, not a silent fallback or omitted field.

## Registration and effect contracts

`createRaveldex({ schema, analyzer?, limits?, addons? })` accepts an explicit ordered list of trusted capability registrations. The owner validates the complete set before creating an engine: duplicate IDs, missing requirements, conflicting providers, incompatible versions, dependency cycles, and incompatible execution support reject creation. Input list order cannot change semantics; validated dependency order governs preparation only.

Each registration has a data manifest and implementation handles conforming to its declared role. Required manifest fields:

| Field | Contract |
| --- | --- |
| `id`, `version` | Stable capability identity and SemVer package/module version; no anonymous registration. |
| `contractVersion` | Exact supported capability protocol version, initially 1. |
| `roles` | Selected roles from analyzer, term expansion, leaf refinement, aggregation, evidence, transaction participant, and host adapter. |
| `provides`, `requires` | Named capabilities and compatible contract versions; requirements resolved before use. |
| `dataRequirements` | Selected fields and required source/positions/offsets/metadata; no hidden retention. |
| `indexEffect` | `none` or a declared transactional side representation/analyzer change. |
| `rebuildPolicy` | Whether creation requires an empty/new index or an explicit rebuild; never a silent live upgrade. |
| `execution` | Direct/worker support and worker registration identity; no serializing functions as strings. |
| `limits` | Finite payload, work, retained-entry, and output caps applied with the core's stricter bounds. |
| `costs` | Imported code, retained representation, transient work, and external resource/network behavior. |
| `codec` | State format/version when its side representation can be snapshotted; absent otherwise. |

The implementation handles have narrow interfaces:

- **Analyzer:** bounded resumable analysis from original values into terms/positions/original ranges, with an explicit compatibility identity. It is not enabled by merely importing a package.
- **Term expansion:** returns weighted alternatives inside an existing original group. It cannot change the outer required-group Boolean relation or bypass expansion/work limits.
- **Leaf refinement:** receives a conservative candidate membership for its own AST leaf and a read-only view at one revision. It may remove ineligible candidates for that leaf, not globally filter a different successful OR branch or rewrite score facts.
- **Aggregation:** consumes complete qualifying membership before pagination and returns bounded data; it cannot add/remove matches or modify scores.
- **Evidence:** produces bounded presentation/diagnostic data without changing search eligibility. If its requested exact data cannot be produced, the requested operation fails or returns an explicitly specified unavailable evidence state; it never fabricates source ranges.
- **Transaction participant:** prepares a private side root using owned changed inputs and its previous root. It returns that root before publication. Root selection at core commit makes the side state current; no throwing after-commit callback is permitted.
- **Host adapter:** provides validated transport, persistence, or application integration around public engine behavior, without changing the model or query.

Trusted add-on code is not sandboxed. Work accounting and manifest checks constrain supported implementations; they do not make arbitrary hostile callbacks safe. Do not expose unrestricted `beforeSearch`/`afterSearch` hooks or arbitrary predicate functions in query data.

### Query and result extensions

An extended leaf is `{ kind: 'extension', capability, version: 1, payload }`. Core validates the envelope and the installed handler validates the entire bounded payload. For example, the phrase capability payload contains `{ text, fields? }` with the meaning below.

Search options may contain `extensions: { [capabilityId]: payload }` for aggregations/evidence. Returned additional data appears only under the corresponding result `extensions` key; it cannot replace core hits, total, revision, or completeness. Unknown capability IDs or missing handlers fail explicitly. Ordinary queries with no extension requests remain ordinary core queries.

## Representation choices

| Retained representation | What it enables | What it does not establish |
| --- | --- | --- |
| Core frequencies/reverse records | Exact/prefix queries and numeric ranking facts. | Token order, original text, snippets, or original ranges. |
| Transactional original source | Reanalyzed source phrases and original-token evidence. | Constant-time phrase evaluation or no additional memory cost. |
| Selected-field positions | Token-order phrase verification without retained display text. | Original offsets or snippets. |
| Positions plus original offsets | Direct occurrence ranges in identified original values. | Display text when source is unavailable. |

Offsets are token-level half-open UTF-16 ranges in original values. Normalized term indices are not original offsets. A source participant may be shared by phrases/evidence/source snapshots to avoid duplicate retention. Its utility lives separately from phrase-evaluator imports under `src/addons/phrases/`; importing the utility alone must not pull in phrase evaluation/UI code.

## Strict phrase capability

Primary task RX-2001; positional strategy RX-2002.

A phrase is an ordered sequence of analyzed tokens occurring at adjacent token positions in one original value of one selected field. Analyze phrase input with exactly the index analyzer/configuration. Retain repeated terms and their order. Raw punctuation is not literal: `red—blue` and `red blue` have the same token adjacency under `basic-v1`. A phrase cannot cross fields or two array values, even adjacent values of the same field.

v1 accepts exact phrase terms only: no prefix/fuzzy terms, slop, stop-word graphs, multiword synonym graph, or hidden phrase bonus. Empty analyzed phrase input is a nonmatching leaf. A one-token phrase has ordinary token membership but still uses a valid installed phrase capability. Maximum phrase length is 32 analyzed tokens, within the core's shared query limits.

The phrase leaf first obtains a complete lexical candidate superset from its required token groups. It then verifies that leaf's strict adjacency. Repeated tokens may share a deduplicated scoring group while still requiring distinct consecutive occurrences for membership. When a phrase qualifies, only its defined lexical groups contribute ordinary native scores; installing a positional strategy cannot change those scores.

### Two conforming strategies

| Strategy | Required data | Required behavior |
| --- | --- | --- |
| Source | Complete immutable original field values at the operation revision. | Reanalyze candidates and establish adjacent token occurrence; scan enough source to establish the exact leaf membership/total. |
| Positions | `(document, field, valueIndex, term, position)` side entries at the same revision. | Intersect term occurrences with the required offsets, correctly handling repeats and value boundaries. |

At construction, phrase configuration declares a strategy/provider for every enabled field. A query-selected field with no valid provider is `MISSING_CAPABILITY`, even if another selected field has data. It cannot be silently excluded. A consumer can explicitly select different strategies for different fields. Installing positions later requires an explicit new index/rebuild; it is not an automatic search-time mutation.

The initial first-party source provider participates in the engine transaction and captures originals from the accepted record inputs. An arbitrary mutable external fetch/map is not an authoritative eligibility provider merely because it returns a claimed revision. Later external providers require a reviewed consistency protocol. Offsets-only data cannot substitute for missing source when a source strategy was requested.

Phrase work is charged to the search budget. If complete verification cannot finish within a selected budget, return a typed failure; never verify only the first top-k lexical candidates or report an estimated total as exact.

Before reusing companion phrase code in RX-2001, record the actual source repository/commit/license, inspect coupling, and add native contract tests. Do not postpone that provenance check until N3. Old passing phrase tests are not native parity evidence.

### Implemented source protocol and costs — RX-2001

Public `/addons/phrases` exports `createSourceProvider({ fields, id?, maxRetainedEntries?, maxWorkUnits? })` and `createSourcePhrases({ fields, id?, maxWorkUnits? })`; `/addons/phrases/source` exports only the source factory. Options are owned/frozen. Default registration IDs are `source` and `source-phrases`, providing `source:<field>` and `phrases` with contract version 1. No implicit installation, source getter or live registration/rebuild API exists.

Implemented manifest role names are `transaction-participant` and `leaf-refinement`. Unsupported roles/execution fail `INCOMPATIBLE_CAPABILITY`; direct execution is supported, workers remain deferred. Complete bounded manifests/handles are captured before initialization; dependency order is deterministic and independent of input order. Missing requirements fail `MISSING_CAPABILITY`; duplicate IDs, conflicting providers, cycles, incompatible versions/data/handles fail `INCOMPATIBLE_CAPABILITY`. SemVer module identity is validated; compatibility resolution uses exact protocol versions, not package-version ranges. Arbitrary trusted implementations are not sandboxed.

The initial refinement handle is `exact-token-sequence`. Core validates/owns the whole `{ text, fields? }` payload, counts text plus selected-field strings within payload/global bounds, analyzes it once with `basic-v1`, and passes the ordered normalized terms including repeats. Complete lexical groups do not reanalyze normalized output. Phrase preparation validates every selected field/provider/revision/analyzer, even for empty/unmatched phrases. A missing field on an accepted record is an ordinary nonmatch; a missing authoritative candidate record is a typed consistency failure. Other search-option extension roles remain unsupported and fail explicitly.

Source state has one immutable revision/analyzer header and a sparse copy-on-write ID directory containing only selected original field/value arrays. It retains no metadata, tokens, positions, offsets or core roots. Preparation receives owned changed records, actual removal IDs and revisions; source/core publish together. No-ops skip preparation; clear removes source records; disposal releases the owned root. Unchanged immutable buckets may be shared with previous snapshots. Physical heap reclamation is not measured.

A logical entry is one record, one present selected field or one original value. Default entry cap is `maxDocuments × (1 + enabledFields × (1 + maxTextValuesPerField))`, narrowed by configured core limits and an optional smaller provider cap. Logical text is bounded by `maxCorpusTextCodeUnits`. Default source prepare/phrase work caps are 50,000,000/10,000,000 work-v1 units. A phrase registration cap aggregates all its preparation/scans across every leaf in one search; the source cap covers its transaction preparation. Shared core budgets/checkpoints/deadlines remain stricter. Query token/group limits also apply before deduplication. Exhaustion rejects the whole operation, with no partial total.

Streaming native reanalysis and a prefix table of at most 32 entries verify repeated-term overlap. Comparisons/scans are charged and resumable; every value resets matching. Verification can stop when one document's membership is established; every lexical candidate is considered before totals/page selection. The source utility excludes the verifier. Measured complete minified/gzip graphs are core 49,102/15,131 bytes, source utility 10,436/3,544 and core plus phrases 57,713/17,371, using pinned esbuild 0.28.2 and gzip level 9. Graphs overlap and are not additive costs. Core's 30 inputs exclude optional code. [Raw package/work evidence](../evidence/RX-2001.md) distinguishes logical counters from heap/latency claims.

Before adaptation, the actual companion was audited: `vmitsaras/LocalSearch`, clean commit `5f334a8ca4f7d9d95b6b731ac539f4b1dda302cb`, MIT © 2026 Vasileios Mitsaras, especially `src/evidence/source.ts:16–55`. Only the conceptual per-value adjacency approach is adapted; no source is copied/imported. Companion NFC differs from native NFKC despite the shared historical `basic-v1` label. Its global phrase mode, mandatory source, whole-state rebuild and snippet coupling are not reused; old tests are not native evidence.

## Structured filters and facets

Primary task RX-2003.

Structured filters extend the existing Boolean tree with explicitly typed numeric range and set-membership leaves. A range declares `{ field, gt? | gte?, lt? | lte? }` on a numeric metadata field. Bounds are finite numbers; at least one is supplied, at most one lower and one upper operator are allowed, and inverted bounds reject validation. Equal exclusive endpoints validly match no value. Both bounds must be satisfied by the **same** array element; `[5,25]` does not satisfy a range from 10 through 20.

Set membership declares `{ field, values }`, with 1–128 values of the declared metadata type/nullability. Any record array element may match a requested scalar. No string/number coercion. Missing metadata fails a positive predicate; NOT follows the core's two-valued complement rule. Specialized numeric/set indexes are not required initially; exact bounded evaluation is sufficient.

The first facet capability targets declared string metadata fields, including multi-valued fields. Counts are **conjunctive**: every query/filter, including a facet's own current selection, remains applied. Different selected facet fields combine with AND; selected values within one field combine with OR through the normal query tree.

Count each qualifying document at most once per distinct value before hits are limited or offset. Empty string is an ordinary value. A missing bucket is opt-in and structurally tagged; it cannot collide with an actual string such as `__missing__`. Explicit nullable values and missing values remain distinct.

Initial facet request caps: eight fields, at most 10,000 distinct counted values per field, at most 100 returned buckets per field (default 20). Counts for returned buckets are exact. Sort count descending, then null before strings and strings by UTF-16 order; a separately tagged missing bucket follows regular values for a count tie. Expose `distinctValueTotal` and `omittedBucketCount` when requested output selects fewer buckets than were counted. Those values count buckets, not documents; multi-valued counts do not sum to total documents.

Exceeding the counting/work cap fails the requested operation. Choosing a bounded displayed subset is explicit output projection, analogous to result pagination; it never authorizes incomplete candidate traversal. v1 does not remove a selected facet's own filter to compute disjunctive navigation counts.

## Evidence, snippets, and Inspector

Primary tasks RX-2004 and RX-2005.

Evidence returns original field/value/token occurrences and source text only when its required providers exist at the same revision. Prefix evidence marks the complete original matching token; it does not guess a shorter original span from normalized length. Offsets without original text can support ranges but not snippets. Reanalyzed and stored-offset evidence must agree on the declared original coordinates.

Initial display bounds: at most three snippets per hit, target at most 240 UTF-16 code units per snippet, and at most 32 highlighted ranges per snippet. Clipping must preserve grapheme boundaries. If a single grapheme would exceed the configured snippet cap, return an explicit unavailable snippet reason rather than splitting it or silently exceeding the bound. Limit choice affects display only; requested match evidence/totals remain honest.

The first grapheme-aware presentation implementation may require `Intl.Segmenter` with grapheme granularity in its qualified host profile. Missing segmentation support is reported as `UNSUPPORTED_ENVIRONMENT` for requested snippets; code-point clipping is not relabeled grapheme-safe. Original source is never normalized before slicing. Render data through safe text nodes/escaping; snippet HTML strings are not the data contract.

Inspector gathers the actual core evaluator/scorer facts defined in [RANKING.md](../specs/RANKING.md). The selected-facts cap is 4,096 entries per explain operation. Its complete selected score facts reconstruct the result; fuller variant traces require a bounded scoped request. A trace overflow fails explanation rather than rewriting search. Requests for an expected revision reject a mismatch; historical roots are not retained automatically.

Explain why a candidate qualified, failed a predicate/phrase, or ranked below a returned page using factual paths and numbers. A record absent from top-k is not necessarily a nonmatch. Inspector exports must identify revision/model/configuration and avoid original source by default; source inclusion is explicit because it changes exported data content.

## DOM UI and real consumer

Primary task RX-2006, under `src/addons/ui/` and `examples/docs-search/`.

Use native HTML controls and explicit labels/status. Define keyboard behavior, result update announcements, error/no-results states, focus preservation, composition handling, cancellation versus stale-response suppression, and teardown. Facets and Inspector must participate in those actual interaction flows. CSS remains separately imported and scoped; no framework is required.

The example uses the actual package's public imports with an explicit current-document allowlist. It must not index archived plans or verification logs as current product documentation by accident. Source/positions configurations should be selectable for parity inspection without changing phrase meaning.

Automated accessibility checks support but do not replace recorded screen-reader interaction. N4 records the actual OS/browser/AT versions, flow, and observations behind any accessibility claim. No broad claim of complete accessibility is made by this plan or by adding ARIA attributes.

## Worker adapter

Primary task RX-3001.

One module worker owns one complete native engine. No independent scoring shards. The adapter validates bounded request/response envelopes, request IDs, supported operations, configuration/capability versions, and same-index statistics. It never transports executable function strings or evaluates caller code.

Handshake requires identical engine/model/analyzer configuration and matching qualified environment profiles, or an explicitly verified same-host unqualified pairing for browser main thread plus its own worker. It must not claim general cross-host compatibility from a handful of probe strings. Analyzer/feature mismatch rejects startup with an actionable typed error.

Initial transport payload cap is 8 MiB per message, including encoded payload metadata; stricter platform/application limits win. Transport work and peak copies must be measured separately from worker heap. Batching/chunking, if implemented, stages all parts and commits once; it cannot change an atomic addMany into visible partial writes.

Every mutation request has an operation ID. The adapter retains a bounded 256-receipt reconciliation window and never reuses request IDs within the worker session. A known precommit cancellation is `CANCELLED`; a known commit reports its result. Lost responses or termination without a conclusive receipt produce `OUTCOME_UNKNOWN`. Do not retry automatically. Reconcile authoritative state or recover explicitly when the receipt window cannot establish an outcome.

Disposal cleans request maps/listeners and terminates an adapter-owned worker. Externally supplied workers are released according to explicit ownership, not terminated silently. Ordinary cancellation checkpoints remain inside the native engine; ignoring a late result alone does not prove cancellation.

## Snapshots and IndexedDB

Primary tasks RX-3002 and RX-3003.

Keep two named codecs:

- **Source snapshot:** canonical IDs/metadata and complete original values for every indexed field, plus origin metadata. Restoring rebuilds using the receiving analyzer. It requires a source provider with every indexed original field; partial retained source cannot be advertised as a complete portable snapshot.
- **Native-state snapshot:** dictionary/postings/reverse/statistical/side data plus schema, model, analyzer-environment compatibility, limits, and codec manifests. Restore requires a qualified matching profile; unqualified or mismatched native data is rejected. An opaque foreign-engine index is never native state.

Both validate shape, safe integer/count/range invariants, resource bounds, compatibility, and payload integrity before publication. A checksum detects accidental damage and is not proof that hostile input is trustworthy. Initial encoded snapshot cap: 64 MiB. This can be narrower than the largest admitted live collection; report oversize explicitly and do not claim every possible indexed corpus can be snapshotted under that cap.

Import is atomic. On an existing engine, a successful import creates its next local revision, rather than resetting/reusing the snapshot's origin revision. Failure leaves current state intact. Source rebuild explicitly reports the receiving profile and does not promise old scores/membership after an analyzer change. Missing providers, unknown codecs, or invalid side-state references fail; no silent field omission or partial restore.

IndexedDB is an optional adapter around validated snapshots and explicit save/load/erase. Database/namespace ownership is explicit; no background network sync or silent persistence. Save/load conflict handling must not overwrite a newer committed generation silently. Recovery distinguishes missing data, incompatible data, corruption, quota, permissions, and unavailable storage.

Erase affects only the selected namespace and all of its owned records/artifacts. It includes source data and side representations. Disposal alone is not erasure. Define and test interrupted writes/recovery and namespace isolation using the actual adapter, without treating serialized size as retained memory.

## Compatibility and later modules

RX-3004 reconciles reusable APIs/data and any MiniSearch compatibility support. Keep foreign scoring identity, capacity, cancellation, and state limitations explicit. Source migration may rebuild a native index; opaque engine state cannot be relabeled.

Later optional tracks may add typo alternatives, suggestions, directional one-step synonyms, language analyzers, code identifiers, literal/infix search, proximity, text query syntax, patch convenience, or an Astro/static-build adapter. Each gets its own accepted contract and measured cost. Multiword synonyms require additional graph semantics; reserving a metadata slot does not implement them.

## Verification and acceptance criteria

| ID | Criterion | Evidence |
| --- | --- | --- |
| A-AC01 | Unused modules add no core import code, retained side index, startup job, or network work. | Built public consumer graphs and allocation/state inspection for core and selected module combinations. |
| A-AC02 | Registration rejects incompatible/missing providers before queries or writes. | Manifest/dependency/field/provider/version tests with precise errors. |
| A-AC03 | Core and every participant commit/rollback together. | Fault injection at each participant preparation and prepublication point. |
| A-AC04 | Source/positional phrase membership, total, and score agree; original coordinates agree when the corresponding source/offset providers are enabled. | Independent repeated-word/boundary/normalization fixtures and AND/OR/NOT queries on multiple representations; no original-coordinate demand for positions-only state. |
| A-AC05 | Range/set semantics and conjunctive facet counts are exact before pagination. | Independent array/null/missing/range/count oracle, own-filter checks, limit-zero and output-projection cases. |
| A-AC06 | Explanation/evidence is factual and bounded. | Numeric reconstruction, original-source slice checks, grapheme fixtures, and deliberate overflow/missing-source cases. |
| A-AC07 | The UI/pilot uses public package APIs and defined interactions. | Actual packaged integration plus keyboard/focus/status/composition/teardown checks; AT evidence separately recorded. |
| A-AC08 | Direct and worker execution agree and transport outcomes are honest. | Identical corpus/query/mutation sequences, handshake mismatch, lost reply, receipt expiry, and disposal tests. |
| A-AC09 | Snapshot/storage restore/recovery/erase is bounded, compatible, and atomic. | Packaged codec/IndexedDB scenarios including corrupt/oversized/missing-source/profile-mismatch input and namespace isolation. |
| A-AC10 | Reuse and compatibility claims have provenance and retain foreign limitations. | Actual source-commit/license audit before first reuse and independent native contract results. |

Expected affected paths are the module destinations in [NATIVE_ARCHITECTURE.md](NATIVE_ARCHITECTURE.md), related `test/` fixtures, and the two public consumer examples. This document supplies behavior and interfaces; passing its document review is not runtime qualification of any add-on.

## Open questions

None blocks N1. N2/N3 implementation tasks select bounded private representations and adapter packaging within these contracts. A new semantic capability, extra retained data by default, weaker total, hidden dependency, or changed public lifecycle requires an explicit contract update.
