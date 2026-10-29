# Add-ons and adapters

Status: Approved boundary/behavior contract. Primary tasks: RX-2001–RX-2006 and RX-3001–RX-3004. RX-2001 registration/source phrases and RX-2002 positions/original offsets/mixed phrases are verified locally; [source evidence](../evidence/RX-2001.md), [position evidence](../evidence/RX-2002.md). RX-2003 typed metadata leaves and exact conjunctive facets are implemented; [evidence](../evidence/RX-2003.md). RX-2004 factual evidence/Inspector data and diagnostic exports are verified locally; [evidence](../evidence/RX-2004.md). RX-2005 original ranges and bounded grapheme-safe snippets are verified locally; [evidence](../evidence/RX-2005.md). RX-2006 implements the optional native DOM UI and packaged documentation pilot. RX-3001 adds the optional one-owner module-worker adapter; RX-3002 implements optional source/native snapshots; RX-3003 implements explicit IndexedDB save/load/erase and optional source-only worker recovery; [storage evidence](../evidence/RX-3003.md).

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

Implemented manifest role names are `transaction-participant`, `leaf-refinement`, (RX-2003) `aggregation` and (RX-2004) `evidence`, (RX-A010) `term-expansion`, and (RX-A020) `dictionary-output`. Unsupported roles/execution fail `INCOMPATIBLE_CAPABILITY`; direct execution is supported and RX-3001 adds explicit worker registration identities for first-party capabilities. Complete bounded manifests/handles are captured before initialization; dependency order is deterministic and independent of input order. Missing requirements fail `MISSING_CAPABILITY`; duplicate IDs, conflicting providers, cycles, incompatible versions/data/handles fail `INCOMPATIBLE_CAPABILITY`. SemVer module identity is validated; compatibility resolution uses exact protocol versions, not package-version ranges. Arbitrary trusted implementations are not sandboxed.

The initial refinement handle is `exact-token-sequence`. Core validates/owns the whole `{ text, fields? }` payload, counts text plus selected-field strings within payload/global bounds, analyzes it once with the selected one-to-one analyzer (default `basic-v1`), and passes the ordered normalized terms including repeats. Complete lexical groups do not reanalyze normalized output. Phrase preparation validates every selected field/provider/revision/analyzer, even for empty/unmatched phrases. A missing field on an accepted record is an ordinary nonmatch; a missing authoritative candidate record is a typed consistency failure. RX-2003 now supports requested metadata aggregations; RX-2004 implements selected factual evidence; other unsupported roles fail explicitly.

Source state has one immutable revision/analyzer header and a sparse copy-on-write ID directory containing only selected original field/value arrays. It retains no metadata, tokens, positions, offsets or core roots. Preparation receives owned changed records, actual removal IDs and revisions; source/core publish together. No-ops skip preparation; clear removes source records; disposal releases the owned root. Unchanged immutable buckets may be shared with previous snapshots. Physical heap reclamation is not measured.

A logical entry is one record, one present selected field or one original value. Default entry cap is `maxDocuments × (1 + enabledFields × (1 + maxTextValuesPerField))`, narrowed by configured core limits and an optional smaller provider cap. Logical text is bounded by `maxCorpusTextCodeUnits`. Default source prepare/phrase work caps are 50,000,000/10,000,000 work-v1 units. A phrase registration cap aggregates all its preparation/scans across every leaf in one search; the source cap covers its transaction preparation. Shared core budgets/checkpoints/deadlines remain stricter. Query token/group limits also apply before deduplication. Exhaustion rejects the whole operation, with no partial total.

Streaming native reanalysis and a prefix table of at most 32 entries verify repeated-term overlap. Comparisons/scans are charged and resumable; every value resets matching. Verification can stop when one document's membership is established; every lexical candidate is considered before totals/page selection. The source utility excludes the verifier. The RX-2001 snapshot measured complete minified/gzip graphs: core 49,102/15,131 bytes, source utility 10,436/3,544 and core plus phrases 57,713/17,371, using pinned esbuild 0.28.2 and gzip level 9. Graphs overlap and are not additive costs. Core's 30 inputs exclude optional code. [Raw package/work evidence](../evidence/RX-2001.md) distinguishes logical counters from heap/latency claims.

Before adaptation, the actual companion was audited: `vmitsaras/LocalSearch`, clean commit `5f334a8ca4f7d9d95b6b731ac539f4b1dda302cb`, MIT © 2026 Vasileios Mitsaras, especially `src/evidence/source.ts:16–55`. Only the conceptual per-value adjacency approach is adapted; no source is copied/imported. Companion NFC differs from native NFKC despite the shared historical `basic-v1` label. Its global phrase mode, mandatory source, whole-state rebuild and snippet coupling are not reused; old tests are not native evidence.

### Implemented positions and mixed strategies — RX-2002

Public `/addons/positions` exports only `createPositionProvider({ fields, offsets?, id?, maxRetainedEntries?, maxWorkUnits? })`. `offsets` is an independently selected subset of position fields, default `[]`; it never requests source retention. `/addons/phrases/positions` exports `createPositionPhrases({ fields, id?, maxWorkUnits? })`. `/addons/phrases/mixed` exports `createPhrases({ fields: { title: 'source', body: 'positions' }, id?, maxWorkUnits? })`. Default IDs are `positions`, `position-phrases`, and `mixed-phrases`. Options and selected strategies are captured/frozen. Position utilities exclude verifier imports; positional phrases exclude source storage/reanalysis; legacy source phrases exclude positions. Core imports no optional module.

The provider supplies `positions:<field>` for every selected field and `offsets:<field>` only for fields explicitly requesting spans, all at protocol version 1. The position/mixed leaf supplies `phrases` and declares the exact per-field requirements. Only one registration may provide `phrases`. Complete registration validation requires an appropriate declared transactional source/position provider for every enabled consumer field. A configured field cannot silently switch strategies, fall back, or omit missing data. Headers are checked even when the phrase is empty or has no lexical candidates; every authoritative selected candidate/provider is checked even after another field matches. Missing record fields remain ordinary nonmatches.

The private position root retains its revision, basic-v1 analyzer/profile, narrowed limits, selected position/offset fields, immutable copy-on-write ID directory and logical counters. Each record holds only selected field arrays, one element per original value. Each value records token count and a null-prototype map from normalized terms to sorted occurrences `{ position, positionLength: 1 }`, with `{ start, end }` only in offset-selected fields. Value index is the array coordinate. There are no original strings, metadata, normalized-to-source inferred ranges or mandatory offset arrays. Position length 1 describes basic-v1's single emitted token at each ordinal; it establishes no multiword synonym graph, holes, slop or proximity behavior.

Preparation analyzes only changed selected original values with the existing native analyzer, builds frozen occurrences under the shared mutation budget, subtracts old record counters and copies only touched ID buckets. Added/replaced/removed records, late validation/participant failures, cancellation, clear and disposal use the existing one-revision transaction. No-ops skip participant work. Previous immutable roots remain valid. Installing later still requires a new index; there is no live migration API.

Logical entries count one record, present selected field, original value, distinct term, occurrence, and two coordinates per retained span. The default maximum is `maxDocuments × (1 + positionFields × (1 + maxTextValuesPerField)) + maxCorpusTokens × (offsetFields.length ? 4 : 2)`, narrowed by core limits and an optional smaller provider cap. Occurrences are separately bounded by `maxCorpusTokens`, term code units by `maxCorpusTokens × maxTermCodeUnits`, and record analysis by `maxTokensPerRecord`. Limits count logical structures, not heap bytes. Provider/query work defaults remain 50,000,000/10,000,000 work-v1 units, with the shared core budgets/deadlines stricter. Query work caps aggregate every leaf of one registration.

Positional verification intersects sorted occurrences at each ordered query offset within one value. Repeated terms reuse occurrence lists with distinct offsets; normalized query output is never reanalyzed. It checks all complete lexical candidates before pagination, and the successful canonical groups retain identical native BM25 and Boolean participation. Offsets are validated when retained but do not enable or modify phrase eligibility. The mixed strategy dispatches each field to its explicit source/position verifier under the same global and registration budget. [RX-2002 evidence](../evidence/RX-2002.md) records independent source parity, original spans, atomic lifecycle, full packed graphs and 100/1,000/10,000-record logical costs; host/heap/physical-latency qualification remains separate.

## Structured filters and facets

Primary task RX-2003.

Structured filters extend the existing Boolean tree with explicitly typed numeric range and set-membership leaves. A range declares `{ field, gt? | gte?, lt? | lte? }` on a numeric metadata field. Bounds are finite numbers; at least one is supplied, at most one lower and one upper operator are allowed, and inverted bounds reject validation. Equal exclusive endpoints validly match no value. Both bounds must be satisfied by the **same** array element; `[5,25]` does not satisfy a range from 10 through 20.

Set membership declares `{ field, values }`, with 1–128 values of the declared metadata type/nullability. Any record array element may match a requested scalar. No string/number coercion. Missing metadata fails a positive predicate; NOT follows the core's two-valued complement rule. Specialized numeric/set indexes are not required initially; exact bounded evaluation is sufficient.

The first facet capability targets declared string metadata fields, including multi-valued fields. Counts are **conjunctive**: every query/filter, including a facet's own current selection, remains applied. Different selected facet fields combine with AND; selected values within one field combine with OR through the normal query tree.

Count each qualifying document at most once per distinct value before hits are limited or offset. Empty string is an ordinary value. A missing bucket is opt-in and structurally tagged; it cannot collide with an actual string such as `__missing__`. Explicit nullable values and missing values remain distinct.

Initial facet request caps: eight fields, at most 10,000 distinct counted values per field, at most 100 returned buckets per field (default 20). Counts for returned buckets are exact. Sort count descending, then null before strings and strings by UTF-16 order; a separately tagged missing bucket follows regular values for a count tie. Expose `distinctValueTotal` and `omittedBucketCount` when requested output selects fewer buckets than were counted. Those values count buckets, not documents; multi-valued counts do not sum to total documents.

Exceeding the counting/work cap fails the requested operation. Choosing a bounded displayed subset is explicit output projection, analogous to result pagination; it never authorizes incomplete candidate traversal. v1 does not remove a selected facet's own filter to compute disjunctive navigation counts.

### Implemented metadata protocol and costs — RX-2003

`/addons/filters` exports `createFilters({ fields, id?, maxWorkUnits? })` and readonly `FilterOptions`, `NumericRangePayload`, `SetMembershipPayload` types. Default ID `filters` provides `numeric-range` and `set-membership` v1. Use the ordinary extension leaf with the corresponding `{ field, ...bounds }` or `{ field, values }` payload. Configured fields are declared metadata fields; ranges require number fields, sets honor the declared type/nullability. No analyzer/group expansion or score contribution comes from these leaves. Every leaf is prepared/validated even inside a failed Boolean branch or on an empty index. Missing positive data is false; NOT complements it.

`/addons/facets` exports `createFacets({ fields, id?, maxWorkUnits?, maxDistinctValuesPerField?, maxBucketsPerField? })` and readonly request/result types. Default ID/provider is `facets`, v1. Enabled fields must be declared string metadata fields at engine creation. Request `options.extensions.facets = { fields: [{ field, limit?, missing? }] }` with one through eight unique fields. `limit` is 0–100 (default 20, narrowed by the factory's output ceiling); `missing` defaults false. Factory counting/output ceilings default to 10,000/100 and can only narrow; zero output capacity is valid. The counting ceiling also respects `maxDocuments × (multi ? maxMetadataValuesPerField : 1)`.

The result is `extensions.facets = { fields: [{ field, buckets, distinctValueTotal, omittedBucketCount }] }` in request field order. Buckets are `{ kind: 'value', value: string | null, count }` or `{ kind: 'missing', count }`. A present empty array has no values and contributes no missing bucket. Null, missing, empty string and sentinel-like actual strings remain distinct. Both totals count the counted buckets, including requested missing, before output projection; the omitted count is total minus returned length. Conjunctive query membership includes the current own-field selection. No disjunctive own-filter removal, approximation or score rewrite occurs.

Metadata roles retain no side root, copied corpus metadata, specialized numeric/set index or original source. Prepared predicates read immutable core metadata; requested aggregation counters live only during one operation. Changed/removed/cleared metadata naturally follows the selected core revision. Preparation, qualification, counting, heap projection, output capture and Unicode work share the operation budget; each registration's work cap aggregates all its leaves and requests, including aliases and combined roles. Defaults are 10,000,000 work-v1 units, narrowed by the core search cap. Counting/work exhaustion fails the whole search, including `limit=0`; no partial exact count is returned.

The narrow trusted protocol adds `predicate` to the leaf-refinement role and `aggregation` with declared `fieldType: 'string'`. Both install bounded synchronous `capture` plus resumable `prepare` handles. Core validates complete manifests/handle shapes, fields/types, finite reported capture/output counts, revision context and shared budgets. Metadata `dataRequirements.fields` select metadata names; the current metadata roles cannot also claim transactional/source/position state. Handles receive immutable schema/limits/revision/payload and current metadata, with no owner/root/scorer access. They remain trusted code under the existing protocol, not sandboxed callbacks.

First-party capture synchronously owns/deep-freezes plain finite JSON under the shared admission counter and aggregate payload string caps, rejecting accessors, symbols, cycles, sparse arrays and foreign prototypes without invoking getters. All keys plus string values count as UTF-16 units. Payload structure has a fixed depth ceiling 16, separate from Boolean AST `maxQueryDepth`; shape/type and deferred Unicode validation complete before document traversal. The optional shared parser is excluded from core. First-party output similarly deep-freezes complete plain data, reports actual structural entries and charges copying/content checks. An entry is an object property or array slot, including the array length property; core enforces both the declared output ceiling and `maxAdmissionEntries`. Facets declare 8,192 output entries; eight fields with 100 value buckets use 3,250. Extra data appears only under its requested capability key; ordinary result shape/facade methods are unchanged.

[RX-2003 evidence](../evidence/RX-2003.md) records independent full scans, hand scores, packed/minified parity, mutation/stop behavior and full graph/work measurements through 10,000 records. The unchanged 15 KiB core planning target is missed after mandatory role coordination; its exact fixed-method measurement and boundary review are recorded as a limitation, not a passing size claim. Physical heap/peak memory, latency, browsers and workers remain unqualified.

## Evidence, snippets, and Inspector

Primary tasks RX-2004 and RX-2005.

Evidence returns original field/value/token occurrences and source text only when its required providers exist at the same revision. Prefix evidence marks the complete original matching token; it does not guess a shorter original span from normalized length. Offsets without original text can support ranges but not snippets. Reanalyzed and stored-offset evidence must agree on the declared original coordinates.

Initial display bounds: at most three snippets per hit, target at most 240 UTF-16 code units per snippet, and at most 32 highlighted ranges per snippet. Clipping must preserve grapheme boundaries. If a single grapheme would exceed the configured snippet cap, return an explicit unavailable snippet reason rather than splitting it or silently exceeding the bound. Limit choice affects display only; requested match evidence/totals remain honest.

The first grapheme-aware presentation implementation may require `Intl.Segmenter` with grapheme granularity in its qualified host profile. Missing segmentation support is reported as `UNSUPPORTED_ENVIRONMENT` for requested snippets; code-point clipping is not relabeled grapheme-safe. Original source is never normalized before slicing. Render data through safe text nodes/escaping; snippet HTML strings are not the data contract.

Inspector gathers the actual core evaluator/scorer facts defined in [RANKING.md](../specs/RANKING.md). The selected-facts cap is 4,096 entries per explain operation. Its complete selected score facts reconstruct the result; fuller variant traces require a bounded scoped request. A trace overflow fails explanation rather than rewriting search. Requests for an expected revision reject a mismatch; historical roots are not retained automatically.

Explain why a candidate qualified, failed a predicate/phrase, or ranked below a returned page using factual paths and numbers. A record absent from top-k is not necessarily a nonmatch. Inspector exports must identify revision/model/configuration and avoid original source by default; source inclusion is explicit because it changes exported data content.

## Implemented Inspector data

RX-2004 `/addons/inspector` exports `createInspector` and `exportDiagnostics` with readonly request/data/source/diagnostic/trace types. The default registration ID/provider is `inspector` v1, role `evidence`, no index effect or retained state. Factory options are `{id?,sourceFields?,maxFacts?,maxWorkUnits?,maxOutputEntries?}`. A configured source field declares its explicit `source:<field>` provider requirement; configuration never retains source by itself.

Search `extensions.inspector={ids,maxFacts?,expectedRevision?,sourceFields?}` selects at most 128 unique nonempty opaque IDs (further limited by core maxDocuments). Empty selection is valid. Source fields must be enabled at creation and explicitly selected per request; their schema/provider/revision/analyzer headers are validated before traversal even with no IDs/matches. Missing record fields are reported absent; absent IDs are separate unavailable-source outcomes. One evidence request per operation is supported; multiple evidence aliases/requests fail INVALID_OPTIONS rather than reset the shared selected-fact cap. Ordinary result keys and the seven-method engine facade remain unchanged; additional data exists only under its requested extension key.

`InspectorData` identifies `raveldex-inspector-v1`, revision/model, complete owned configuration (schema, limits, analyzer, module/version/protocol/roles/provides/requires), exact total/returned count and logical corpus counters. `trace` contains actual native evaluator/scorer facts; node paths preserve Boolean membership and successful positive groups, with capability IDs for phrases/metadata predicates and field names for equality. Selected winning terms/variants and native field/group arithmetic reconstruct document scores within max(1e-12, abs(score)*1e-12). `documents` preserves request order and reports exists, eligibility, score (null for absent), successful groups and returned/outside-page/excluded/absent placement with page-local index. Absolute rank, all alternatives and heap bytes explicitly report unavailable/not collected or measured. No full ranking ordinal or invented foreign/native decomposition is implied.

The trusted evidence handle owns payloads using `capture`, selects a core-validated trace using `select`, then supplies resumable `prepare`/`finish` cursors. Preparation receives immutable payload/schema/limits/analyzer/revision and only declared participant roots through a capability reader. Final projection receives the immutable analyzed query tree, actual completed trace/result/logical counters and manifests, never the mutable owner/core root/scorer. One registration budget is shared with its other implemented roles; one operation budget covers analysis, facts and evidence. Evidence cannot also claim transactional state or metadata field selection. RX-2005 permits explicit source/position/offset requirements; offsets require positions, and each declared field requires a corresponding participant provider. Mixed representations use explicit per-field requirements and aggregate representation flags. Bounded lexical-refinement combinations can share the declared reader/budget. An evidence handle takes precedence over aggregation for a registration's requested result envelope; it cannot be requested a second time through an alias.

The default complete trace cap is 4096 header-inclusive entries; maxFacts and maxWorkUnits (10,000,000 default) narrow only. Inspector output is deeply owned/frozen plain data with a default 16,384 structural-entry cap, stricter core admission ceiling, depth 16, and 262,144 aggregate original UTF-16 keys/string units. These independent caps mean 4096 facts do not guarantee a larger complete output fits. Source arrays/values respect core bounds. Every copied/validated output entry/string is charged and resumable. Overflow/stale source/cancel/deadline/disposal rejects the whole requested search; an ordinary subsequent search still works. Failed/cancelled operations return typed errors, not fabricated successful evidence. Successful resource work is explicitly scoped before evidence projection, including collection/preparation and excluding output/final delivery. These are work-v1 counts, not elapsed time or heap bytes.

`exportDiagnostics(data,{includeFacts?,includeSource?,maxCodeUnits?})` safely owns and validates finite plain data without invoking getters/toJSON. Defaults include only revision/model/configuration/result/resources/tolerance; no selected IDs, canonical query, facts, record metadata or source. Explicit includeFacts adds trace/query/documents with source removed; explicit includeSource adds only already-selected source under a separate sources section. The escaped JSON/envelope cap defaults to 262,144 UTF-16 units and can narrow. Complete selected sections are retained if they fit; otherwise facts-first whole-section projection emits `{complete:false,omitted:[...]}` both in the return value and parsed JSON. A metadata envelope that cannot fit fails LIMIT_EXCEEDED. This synchronous utility processes only the already bounded data; it has no engine/host tasks, persistence, DOM or network.

[RX-2004 evidence](../evidence/RX-2004.md) records native numerical reconstruction, source/privacy/JSON and complete output bounds, ordinary allocation guards, FIFO/stop/recovery, packaged declarations/minified parity and full graph/work costs. Worker/snapshot qualification remains later work.

## Original match ranges and bounded snippets

RX-2005 `/addons/evidence` exports `createMatchEvidence` and readonly `MatchEvidenceOptions`, `MatchEvidenceRequest`, `MatchRange`, `MatchDocument`, `MatchEvidenceData`. Configure `{fields:{title:'source',body:'offsets'},id?,maxFacts?,maxRanges?,maxWorkUnits?,maxOutputEntries?}`. Source strategy declares `source:<field>`; offset strategy declares `offsets:<field>` and validates the selected position root's original-span fields. Positions without offsets cannot provide ranges. No new participant or original-source copy is retained.

Request `extensions['match-evidence']={ids,fields?,maxFacts?,maxRanges?,expectedRevision?}`. Up to 128 unique opaque IDs, including zero, are selected at the execution-start revision. Fields default to all configured fields; an explicit empty array is an empty projection. Selecting fewer evidence fields never changes query eligibility, so a matched document may have no selected ranges. Factory/request limits narrow only: 4,096 header-inclusive facts, 4,096 complete ranges across the request, 10,000,000 module work units and 16,384 output structural entries, further narrowed by core bounds. Deep output ownership also caps depth at 16 and aggregate original UTF-16 keys/string units at 262,144. Complete overflow rejects the requested operation; range evidence is never silently truncated.

Result `MatchEvidenceData` identifies `kind:'raveldex-match-evidence-v1'`, revision, selected fields, `scope:'successful-positive-token-occurrences'`, `complete:true` and request-order documents. Each document has `{id,eligibility:'matched'|'excluded'|'absent',ranges}`. Every range is `{field,valueIndex,position,start,end,term}` with half-open UTF-16 coordinates in its identified original value and the native normalized token identity. Output is sorted by field UTF-16 order, value index and token position, deduplicated by occurrence. Exact/prefix alternatives include every actual matching token in a successful group; this is occurrence evidence, not a list of only BM25 winners. Prefixes mark the entire original token. Successful phrase branches include only tokens participating in complete adjacent sequences within one value, including repeated/overlapping phrases. Actual node paths exclude failed ancestor branches and every NOT subtree, including double NOT. Equality/predicates/all contribute no lexical ranges; excluded and absent IDs have none.

`/addons/snippets` exports `createSnippetEvidence`, `SnippetOptions`, `SnippetEvidenceData` and readonly snippet types. It composes range collection with presentation under `extensions.snippets` using the same request shape and additionally requires explicit `source:<field>` for every configured field, including offset fields. The range-only entry imports no snippet module or segmentation code. Both registrations may be installed, but only one evidence extension may be requested in an operation, including Inspector.

Snippet options add `{maxSnippets?,maxCodeUnits?,maxHighlights?}`, default/hard maximum 3 windows per document, 240 UTF-16 units per window and 32 merged highlights per window. Each snippet is `{field,valueIndex,start,end,text,highlights:[{start,end}],omittedBefore,omittedAfter}`. Text is exactly the original `slice(start,end)`; highlight offsets are relative to that slice. Presentation expands token highlights to whole grapheme clusters and merges overlaps; exact token coordinates remain in `ranges`. No ellipsis/markup or normalized text is fabricated inside `text`. Omitted context is expressed by the two booleans. Insert source through text nodes/escaping and explicit marks, never `innerHTML`.

Each document also reports `snippetOmissions:{unshownMatches,windowLimit,highlightLimit,matchTooLong,graphemeTooLong}`. Counts refer to original range occurrences not completely represented by delivered highlights. Oversized tokens/clusters remain exact ranges with explicit unavailable presentation counts; snippet caps are never exceeded. The base `complete:true` describes complete selected range evidence, while omissions describe bounded display. Source/offset headers are checked even on empty selections or queries. Snippet source descriptors reject accessors without execution; each selected raw slice is Unicode-checked and normalized solely to confirm its token identity before display. This does not qualify arbitrary forged external provider roots. Missing source/offset fields fail `MISSING_CAPABILITY`; stale roots fail `REVISION_MISMATCH`. Requested snippets lazily require usable `Intl.Segmenter` grapheme support or fail `UNSUPPORTED_ENVIRONMENT`; ordinary/range-only requests need no segmentation. Segmentation iteration, collection, clipping and deep output are resumable and share operation/registration budgets. Host segmentation/normalization/freezing primitives remain indivisible within finite source/token bounds; work units are not latency guarantees.

## DOM UI and real consumer

Primary task RX-2006, under `src/addons/ui/` and `examples/docs-search/`.

Use native HTML controls and explicit labels/status. Define keyboard behavior, result update announcements, error/no-results states, focus preservation, composition handling, cancellation versus stale-response suppression, and teardown. Facets and Inspector must participate in those actual interaction flows. CSS remains separately imported and scoped; no framework is required.

The example uses the actual package's public imports with an explicit current-document allowlist. It must not index archived plans or verification logs as current product documentation by accident. Source/positions configurations should be selectable for parity inspection without changing phrase meaning.

Automated accessibility checks support but do not replace recorded screen-reader interaction. N4 records the actual OS/browser/AT versions, flow, and observations behind any accessibility claim. No broad claim of complete accessibility is made by this plan or by adding ARIA attributes.

### Native UI public contract — RX-2006

`/addons/ui` exports `mountRaveldexUI(options)` and readonly `UIOptions`, `UIHandle`, `UIDocument` and `UIFacet` types. `/addons/ui/styles.css` is a separate explicit CSS export; the JavaScript neither imports nor injects it. Core compilation remains DOM-free; UI declarations/build use a separate DOM TypeScript project. Importing either JavaScript entry creates no DOM, timer, worker, network or storage activity. The UI borrows an already populated public `Raveldex` engine; destroying it never disposes that engine.

Options select a caller-owned `root`, `engine` and complete navigation `documents: [{id,title,url}]` allowlist. Optional `facets: [{field,label}]` selects up to eight string metadata fields. `snippetFields` explicitly requests original display evidence; omitted/empty fields omit snippet requests. `pageSize` is 1–100 (default 5), `debounceMs` 0–2,000 (default 150), `mode` is `text` (default) or `phrase`, and `label` customizes the search label. Options are captured before changing the root: at most 10,000 unique documents, ID/title/URL caps 256/1,024/2,048 UTF-16 units and 4,000,000 combined document units; at most 32 unique snippet fields. Navigation permits HTTP(S) with no credentials, including resolved relative URLs. Human-facing labels and titles must contain non-whitespace text; accepted strings remain unchanged. Invalid options throw typed errors. Display text is never interpreted as HTML.

The frozen handle has `search(): Promise<void>` to flush debounce and present current controls, and idempotent `destroy(): void`. UI search errors are rendered as safe error codes with a native retry action; the handle settles after handling presentation. A duplicate mount on the same root returns its existing handle; the first mount's captured options remain authoritative. Destroy aborts only UI requests, releases timers/listeners, suppresses late updates and restores the exact original child Node objects. The caller owns engine disposal and any external DOM changes made during the mount.

Trimmed blank input means `all`; text mode requires all exact analyzed terms, while phrase mode requests the existing strict `phrases` leaf. No textual query-language parser is introduced. Selected facet values become conjunctive scalar equality nodes; their counts include their own selection. Main search requests facets. Each page narrows its limit to known remaining hits and the captured navigation allowlist; main, snippets and Inspector share that admitted page limit. The caller chooses a page size compatible with any stricter borrowed-engine ceiling that is not exposed by the public interface. When selected, a second search requests snippets for page IDs with the main revision; mismatched revision/data rejects presentation. Inspector requests actual selected page facts in a separate operation at the presented revision because only one evidence extension is allowed per operation. Scores/totals are engine outputs, never recomputed in the UI.

Every input change invalidates pending presentation immediately, independently of debounce. Composition start stops pending work; composing input is not searched; composition end schedules the final value. Submit flushes a pending timer, and paging/facets start explicit searches. Abort signals request engine cancellation; generation checks independently suppress replies from hosts that ignore cancellation. Search controls retain focus; changing a result page does not focus the first result. Inspector uses a native opener and close action, restores opener focus on close/Escape, and invalidates pending facts when the query changes. Native result links provide navigation. Status text, busy state and errors have explicit updates without moving focus to the live region.

`examples/docs-search/` uses only public installed imports and the existing five-file/34-section current-document allowlist. `npm run pilot:ui` builds, packs, installs offline into a temporary consumer, bundles the actual application and separately copies exported CSS, re-evaluates frozen relevance judgments and serves only its local artifacts. Source and stored position/offset representations explicitly rebuild the same corpus, with originals retained for snippets. UI/owner transitions are serialized and stale selections are suppressed. No worker or persistence adapter is enabled. Automated browser, composition-event and accessibility evidence is separate from OS IME and exact-tool screen-reader qualification.

RX-2006 adds pinned development-only `playwright-core` for real browser scenarios and `axe-core` for automated WCAG-tagged observations. Neither ships in the runtime graph nor adds a consumer dependency. CI's Chromium installation is explicit; the local Chrome host and remote CI observations must remain distinguishable. The complete browser suite runs as a separate bounded phase after package checks; test-file timeouts and cleanup checkpoints keep verification orchestration observable.

## Worker adapter

Primary task RX-3001. The public client and host entries are implemented independently of core imports.

One module worker owns one complete native engine. No independent scoring shards. The adapter validates bounded request/response envelopes, request IDs, supported operations, configuration/capability versions, and same-index statistics. It never transports executable function strings or evaluates caller code.

Handshake requires identical engine/model/analyzer configuration and matching qualified environment profiles, or an explicitly verified same-host unqualified pairing for browser main thread plus its own worker. It must not claim general cross-host compatibility from a handful of probe strings. Analyzer/feature mismatch rejects startup with an actionable typed error.

Initial transport payload cap is 8 MiB per message, including encoded payload metadata; stricter platform/application limits win. Transport work and peak copies must be measured separately from worker heap. Batching/chunking, if implemented, stages all parts and commits once; it cannot change an atomic addMany into visible partial writes.

Every mutation request has an operation ID. The adapter retains a bounded 256-receipt reconciliation window and never reuses request IDs within the worker session. A known precommit cancellation is `CANCELLED`; a known commit reports its result. Lost responses or termination without a conclusive receipt produce `OUTCOME_UNKNOWN`. Do not retry automatically. Reconcile authoritative state or recover explicitly when the receipt window cannot establish an outcome.

Disposal cleans request maps/listeners and terminates an adapter-owned worker. Externally supplied workers are released according to explicit ownership, not terminated silently. Ordinary cancellation checkpoints remain inside the native engine; ignoring a late result alone does not prove cancellation.

### Public worker entries — RX-3001

`/adapters/worker` exports `createWorkerRaveldex`, `WorkerAdapterError`, error codes and readonly transport/receipt types. `/adapters/worker/host` exports `serveRaveldexWorker`. Importing either entry does not construct or initialize a worker; the application explicitly creates its own ESM entry and supplies its endpoint. The worker module installs its trusted local add-ons; no callback or executable source crosses transport.

`createWorkerRaveldex({ worker, configuration, ownership, sameHost: true, maxMessageBytes?, responseTimeoutMs? })` returns a promise for the ordinary facade plus `reconcile` and `destroy`. The complete captured schema, limits, analyzer, model/implementation identity and worker-capable manifests must match the host's registered capabilities. First-party `workerRegistration` identities contain the versioned module family and canonical complete normalized factory options, capped at 8,192 UTF-16 units. Output/window/fact limits therefore cannot collide merely because broader manifest caps match. `sameHost` must explicitly select the implemented unqualified browser page/own-worker pairing; no native-snapshot or cross-host qualification is inferred.

Mutation promises carry a readonly session operation ID before settlement. A living owner answers `reconcile(id)` with `pending`, `committed` plus its actual result, `rejected` plus its sanitized typed error, or `expired`. Missing/expired receipts do not prove rejection. Transport errors use the separate `WorkerAdapterError` codes, leaving the root core codes intact. A dispatched mutation whose result cannot be established reports `OUTCOME_UNKNOWN`; no operation is retried automatically. Explicit recovery creates a fresh owner from application-authoritative source; snapshots and persistence remain separate tasks.

Transport capture additionally bounds 131,072 visited nodes, depth 64 and 65,536 array elements. Message caps range from 1,024 bytes to 8 MiB; handshake selects the stricter client/host cap. At most 64 client requests are pending, independently of the native queue limit. A bounded 128-slot dispatch queue preserves admitted IDs under signal/endpoint reentry; IDs are allocated after native caller capture. Duplicate host installation or a second live/initializing client on one endpoint rejects `INCOMPATIBLE_WORKER` without disturbing its owner. Disposal releases those guards for explicit recovery. The reply watchdog defaults to 65,000 ms and may be selected from 1 to 120,000 ms; it is a transport timeout, distinct from a native operation deadline. Same-host monotonic admission time counts capture/transport delay before the native FIFO deadline. Native cancellation control is attached internally after caller capture so it cannot consume synthetic caller admission entries. A silent worker death can be detected by timeout, and disposal still releases resources if acknowledgement fails.

The documentation example bundles the page and module worker as separate ESM entries, imports only installed public subpaths, and lets users select direct or worker execution. Selecting a new setup disposes the previous owner and reindexes the same corpus atomically. The server exposes the explicit local worker artifact under the same origin/CSP.

## Snapshots and IndexedDB

Primary tasks RX-3002 and RX-3003.

Keep two named codecs:

- **Source snapshot:** canonical IDs/metadata and complete original values for every indexed field, plus origin metadata. Restoring rebuilds using the receiving analyzer. It requires a source provider with every indexed original field; partial retained source cannot be advertised as a complete portable snapshot.
- **Native-state snapshot:** dictionary/postings/reverse/statistical/side data plus schema, model, analyzer-environment compatibility, limits, and codec manifests. Restore requires a qualified matching profile; unqualified or mismatched native data is rejected. An opaque foreign-engine index is never native state.

Both validate shape, safe integer/count/range invariants, resource bounds, compatibility, and payload integrity before publication. A checksum detects accidental damage and is not proof that hostile input is trustworthy. Initial encoded snapshot cap: 64 MiB. This can be narrower than the largest admitted live collection; report oversize explicitly and do not claim every possible indexed corpus can be snapshotted under that cap.

Import is atomic. On an existing engine, a successful import creates its next local revision, rather than resetting/reusing the snapshot's origin revision. Failure leaves current state intact. Source rebuild explicitly reports the receiving profile and does not promise old scores/membership after an analyzer change. Missing providers, unknown codecs, or invalid side-state references fail; no silent field omission or partial restore.

### Implemented snapshot adapter boundary (RX-3002)

The explicit `/adapters/snapshots` entry supplies `createSnapshots(engine, { maxEncodedBytes? })`, `createSnapshotRaveldex(configuration, { nativeQualification })`, `currentNodeSnapshotEnvironment`, and typed snapshot reasons. The ordinary root facade remains its seven methods. An adapter attaches only to a native direct owner identity; copied, foreign, and worker facades cannot expose private roots through this entry. Export/restore operations enter that owner's ordinary admission/FIFO/stop lifecycle and select the execution-start revision.

Source and native JSON formats have independent names and versioned schema/analyzer/ranking/implementation/capability/limit/index-detail headers. First-party source and positions declare their side-codec identities; unknown participating codecs fail explicitly. Native decoding validates dictionaries, hash directories, reverse frequencies, postings, statistics and chosen side-state references, rather than accepting a checksum as validity. Source decoding reconstructs canonical records and rebuilds every installed participant under the receiving analyzer. All staging stays private until one next-local-revision publication; snapshot origin revisions remain metadata.

Default `basic-v1` remains `unqualified`. The optional qualified factory creates its actual immutable owner descriptor from revision 0. Its `nativeQualification` is a trusted application declaration with a profile ID, exact Node/V8/ICU/Unicode/platform/architecture record, and bounded durable evidence references. The adapter independently reads and matches the actual runtime. References do not execute tests or establish project qualification merely by existing. Native restore requires the same complete declaration and runtime, while source restore explicitly reindexes across receiving profile identities. This initial path supports exact declared Node environments only; it does not qualify browser/worker or cross-host native portability.

Encoding and decoding use bounded resumable owned loops, including UTF-8 envelope-size checks and a noncryptographic accidental-damage checksum. The 64 MiB ceiling counts JSON escaping and all headers, so it can reject a live corpus whose logical text fits core limits. The complete operation shares the mutation work ceiling, deadline and signal; synchronous bounded platform operations remain disclosed separately from cooperative loops. Encoded size and logical work/structure counts are distinct from observed process memory and true peak/retained component bytes. Without original source, native validation proves structural frequency/ordinal/range bounds and coherence, but cannot authenticate token provenance or original surrogate boundaries for a structurally possible altered span. Retained-source fields are checked against actual original reanalysis; the checksum is not authentication.

IndexedDB is an optional adapter around validated snapshots and explicit save/load/erase. Database/namespace ownership is explicit; no background network sync or silent persistence. Save/load conflict handling must not overwrite a newer committed generation silently. Recovery distinguishes missing data, incompatible data, corruption, quota, permissions, and unavailable storage.

Erase affects only the selected namespace and all of its owned records/artifacts. It includes source data and side representations. Disposal alone is not erasure. Define and test interrupted writes/recovery and namespace isolation using the actual adapter, without treating serialized size as retained memory.

### IndexedDB adapter contract (RX-3003)

The optional public entry is `/adapters/indexeddb`: `createIndexedDBPersistence(snapshotHandle, options)`, `IndexedDBAdapterError`, fixed error codes and readonly types. Its frozen handle supplies `save`, `load`, `erase` and `dispose`; a snapshot handle is an explicit trusted application dependency created by the direct or worker snapshot API, not a sandbox for arbitrary callbacks. Database/namespace names are bounded to 256 well-formed UTF-16 units without control characters. Defaults are 5,000 ms for open and 30,000 ms for a complete action including queue time; selectable ceilings are 30,000 and 60,000 ms. At most 64 actions are pending. Save/erase return `durable: true` only for observed transaction completion; load returns `missing` or `restored` with the chosen generation and actual restore result. Unknown restore errors preserve the selected token and, when available, the bridge operation ID.

Storage-v1 retains the exact canonical format/version prefix emitted by the chosen snapshot codec. Metadata format and snapshot prefix must agree; arbitrary reformatting of the storage artifact is refused, while portable snapshot decoding alone retains its general JSON contract. Complete UTF-8 size checks run outside active database transactions, yield every 16,384 code units (allowing one paired-surrogate boundary), and count a maximum 64 MiB envelope. Codec work keeps its own unchanged complete owner budget. Storage scanning has a separate fixed size/deadline bound. Browser structured cloning and transaction primitives are not isolated heap or physical latency measurements.

Persistence is selected explicitly around a snapshot handle, with an application-owned database name and namespace. Constructing or importing the adapter does not open storage, initialize an engine, save in the background, or request persistent-storage permissions. The ordinary core facade has no storage methods. The application can continue using its in-memory engine when storage is unavailable; there is no success-returning memory substitute for a failed durable action.

The initial dedicated database schema is version 1 with separate `snapshots` and `metadata` stores keyed by namespace. Each committed snapshot has a fresh opaque generation token. Save and erase require an explicit expected token, or `null` for an absent namespace. Comparison and both store writes/deletions occur in one read/write transaction. A stale token rejects rather than overwriting a newer generation. Fresh tokens distinguish erase/recreate from an old saved generation without retaining an erasure tombstone. Erase removes both namespace records; other namespaces remain intact. If corrupt/orphaned metadata has no valid generation token, an explicit erase with `null` is the recovery route; an existing valid token still requires an exact match. It establishes absence at its commit point, not a prohibition on later explicit saves by another client.

Serialization, in-memory engine changes and IndexedDB completion are separate outcomes. Save serializes one owner revision and publishes only its storage transaction; it does not claim that the engine and database committed together. Request success is insufficient: save/erase report committed success only from transaction completion. Write transactions request the `strict` durability hint. Completion is an observed IndexedDB commit, not a tested guarantee against physical power loss or browser eviction. These boundaries follow the [IndexedDB transaction lifecycle](https://w3c.github.io/IndexedDB/#transaction-lifecycle) and [commit algorithm](https://w3c.github.io/IndexedDB/#commit-a-transaction).

Load selects coherent snapshot/metadata records in one readonly transaction, closes that transaction, then uses the receiving snapshot adapter's complete validated atomic restore. Its generation identifies the selected stored snapshot. Another client may save while restore runs; the returned token is not a lease or assurance of the current head. A later save with an outdated token rejects. Missing data leaves the current engine unchanged. Corrupted or incompatible data is reported explicitly and retained for an application decision; it never triggers silent overwrite, automatic erase or partial source/participant recovery.

Opening a new database creates only the documented initial schema. Existing incompatible store/version layouts fail explicitly; no destructive migration or automatic upgrade of foreign data occurs. A blocked open has a bounded failure path, and a late opened connection is closed even after its caller settles. Version-change notifications close owned connections so other tabs can upgrade; pending operations settle honestly. Quota, permission, transaction failure, cancellation, deadlines and disposal remain distinct from observed committed success. Disposal releases this adapter's connections/listeners/tasks without disposing the borrowed engine or erasing stored data.

Browser recovery uses source snapshots through a direct snapshot handle or an explicitly installed optional source-snapshot worker bridge. The bridge uses the worker's same complete owner and bounded transport; it does not qualify browser native snapshots. A dispatched restore with a lost reply reports an unknown engine outcome and exposes its operation identity for explicit reconciliation. Transport loss cannot prove rollback, and no restore is retried automatically. Storage transactions remain on the selected IndexedDB adapter host; using a worker engine does not silently move database ownership.

## Compatibility and later modules

RX-3004 reconciles reusable APIs/data and any MiniSearch compatibility support. Keep foreign scoring identity, capacity, cancellation, and state limitations explicit. Source migration may rebuild a native index; opaque engine state cannot be relabeled.

### Implemented companion source conversion — RX-3004

The explicit `/integrations/localsearch` entry exports
`convertLocalSearchSnapshot(bytes: Uint8Array)`, `MigrationError`, fixed error
codes and readonly migration types. It accepts only the canonical format-1
source envelope from the audited companion-v1/MiniSearch 7.2.0 implementation.
Historical SHA-256/domain/canonical encoding, source counts and origin identities
are checked separately from native schema/record/analyzer/corpus validation.
Opaque indexes and incompatible/corrupt source fail before any engine mutation.

The result is an owned frozen configuration/record plan with separate origin,
source revision, display projection and explicit legacy/native identities.
There is no implicit source provider, engine creation, schema upgrade, worker,
storage action or automatic fallback. Applications rebuild a new owner through
ordinary native methods and publish it only after the complete rebuild; each
native batch remains atomic, while a sequence of batches is not one transaction.
Admission/work/optional-provider limits still apply. Parsing and conversion are
bounded offline synchronous host work plus explicit SHA-256 capability; they
have no signal/deadline or physical latency guarantee.

Only source admission/codec concepts and licensed code portions are adapted.
The companion's historical NFC analyzer and MiniSearch scorer remain explicit;
originals rebuild with native NFKC and `raveldex-bm25-v1`. The repository-level
`integrations/minisearch/` comparator requires an explicit pinned foreign
implementation, declares upstream numerical explanation and cancellation
limitations, and is excluded from native compilation and package contents.
There is no exported legacy search facade. See the
[migration mapping and provenance](../migration/LOCALSEARCH.md).

RX-A010 provides explicitly selected bounded typo alternatives. RX-A020 provides independent dictionary-backed token suggestions. RX-A030 provides explicit directional single-token synonyms. RX-A040 provides an explicitly selected English analyzer. Later optional tracks may add code identifiers, literal/infix search, proximity, text query syntax, patch convenience, or an Astro/static-build adapter. Each gets its own accepted contract and measured cost. Multiword synonyms require additional graph semantics; reserving a metadata slot does not implement them.

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

## Explicit bounded typo expansion — RX-A010

The owner selected this N5 feature explicitly after release-track completion. The [adopted typo contract](../specs/TYPO_TOLERANCE.md) implements the reserved term-expansion role with live dictionary scanning, original required groups and complete weighted alternatives. It retains no side index and does not enable typo behavior on ordinary exact/prefix/phrase queries. RX-A020 is separately selected below; RX-A030 is verified and RX-A040 is separately selected; six other N5 tasks remain deferred.

## Explicit dictionary output — RX-A020

The [adopted suggestions contract](../specs/SUGGESTIONS.md) adds a trusted exclusive `dictionary-output` role with bounded capture/prepare/finish handles. Search options request its separate result without altering compiled queries or evidence trace selection. Its immutable context yields only selected declared text dictionary terms and field-local document frequency at the operation revision. No root/postings/source or mutable owner is exposed. The generic bridge remains in core; core imports no optional suggestion ranking code. The registration has no transaction participant, codec or retained side index.

First-party token completion scans every selected field dictionary, accumulates at most 10,000 matching distinct normalized terms, then selects at most 20 by summed field-local document frequency and ordinal term ties. A temporary selection insertion slot is bounded by 21. Exact total/omitted counts distinguish bounded display from failure; cap/work/stop exhaustion rejects the entire operation. Output structural entries include array lengths. The worker identity includes the owned semantic options. No UI, implicit input rewrite, phrase expansion or filter-dependent completion is added.

## Explicit directional vocabulary — RX-A030

The [adopted synonym contract](../specs/SYNONYMS.md) uses the existing trusted `term-expansion` role without a new core bridge. Only an explicit synonym leaf requests a single direct mapping step. The original exact weight-1 term stays in every required group; live targets use weight 0.5 and never become new expansion sources. Normalized canonical table contents, vocabulary version, fields and budgets bind worker identity. Output uses the existing policy/groups envelope with vocabulary version embedded in policy; nonself alternatives identify mappings and Inspector identifies actual score contributors. The registration retains bounded immutable vocabulary/options/identity, with no corpus participant root/cache/source/positions or import-time work. Multiword graphs and phrase integration remain unavailable.

## Explicit one-to-one language analyzer — RX-A040

The [adopted English contract](../specs/ENGLISH_ANALYZER.md) adds the exclusive implemented `analyzer` role, with `single-token-transform`, stable analyzer ID and `indexEffect: analysis`. Core retains ownership of basic segmentation, coordinates and dense one-token positions; trusted optional code transforms a bounded normalized term. Configuration explicitly resolves `analyzer:<id>` and rejects missing/incompatible handles. Registering an unselected pack does not select it. Generic selection adds measured core plumbing; English suffix tables/code stay outside the core graph.

One operation-scoped runner meters transform work across every token/value/provider reanalysis and all records in a source restore. Captured contexts expose that runner without a mutable owner/root. Mutation, query, phrase, evidence and snapshot validation use it; native canonical terms are never restemmed. Stops precede module-budget errors even when trusted code aborts reentrantly. Worker source restore/reconciliation compares the actual selected receiver descriptor, while snapshot headers still bind exact analyzer/profile/manifests and qualification. Initial private core-only construction continues to reject all add-ons. The first pack is original-paper Porter1980 for the owner-selected English real-document corpus, with no stopword deletion, graphs, language auto-detection or additional runtime dependency.

## Explicit code identifier analyzer — RX-A050

The [adopted identifier policy](../specs/IDENTIFIER_ANALYSIS.md) adds the reserved `identifier-tokenizer` handle for `code-identifiers-v1`. Original spelling is available before per-span normalization; index analysis can emit an original plus distinct tagged co-position components, while query and strict-phrase analysis emit originals only. Equal native weights/counts are explicit. This limited protocol does not enable arbitrary token graphs or additional raw-analyzer IDs. Handles and yielded step/token/provenance data are captured from own data descriptors; accessors, symbols, invalid spans/canonical text, malformed UTF-16, duplicate/overlapping components and unsupported IDs reject before publication. Stops precede charging or validation after each callback advancement.

The operation analysis runner is reused across values, providers and restored records. Tagged v2 positions distinguish original ordinals/counts from all retained occurrences; v1 basic/English data remains unchanged. Source/position/mixed phrases exclude derived components, evidence uses occurrence identity instead of ordinal-only selection, snippets validate full original provenance, and native state validates derived frequencies and exact tagged records. Code-defined expanded counts can exceed original UTF-16 units but never the finite structural/count ceilings. The source/native codecs, selected analyzer/module identities and explicit Node qualification jointly bind compatibility. No new corpus cache, implicit source/offset retention or host initialization is introduced.
