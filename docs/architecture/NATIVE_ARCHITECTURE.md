# Native architecture

Status: Approved design; RX-1001–1006 native core, ordinary scheduling and packed real-document consumer verified locally; see [RX-1005 execution](../evidence/RX-1005.md) and [RX-1006 package evidence](../evidence/RX-1006.md). RX-2001–2005 add explicit source/position/phrase/filter/facet/Inspector/original-range/snippet capabilities; RX-2006 adds the optional native DOM interface and real documentation browser pilot; host modules and release qualification remain planned. See [RX-1001 evidence](../evidence/RX-1001.md), [RX-1002 evidence](../evidence/RX-1002.md), [RX-1003 evidence](../evidence/RX-1003.md) and [RX-1004 evidence](../evidence/RX-1004.md).

Decision date: 2026-10-06. Scope: the native Raveldex line in this repository.

## Goal and current facts

Raveldex owns its indexing, lexical retrieval, ranking, updates, and execution loops. The initial product is a small TypeScript search engine for mutable local collections, with optional search capabilities and environment adapters.

The owner requested a fresh repository for the native search plan, implementation guidance, and trackable milestones/tasks. This adopts that direction and the bounded roadmap. Initialization alone established no runtime claim. The subsequent N1 evidence verifies the native core; no old companion implementation or verification is transferred here. The prior MiniSearch companion is a design and migration input only.

The first usable outcome is verified in RX-1006: a real-document consumer using the native core through the actual package. N2 adds optional search/presentation capabilities. N3 adds hosting and migration parity. N4 qualifies a candidate; publication remains a separate owner decision.

## Decisions

| ID | Adopted decision | Reason and consequence |
| --- | --- | --- |
| ADR-01 | Native TypeScript, pure ESM, zero runtime dependencies in core. | Own the important behavior while retaining ordinary JavaScript tooling. Rust, WASM, a second search backend, and a framework are not prerequisites. |
| ADR-02 | One authoritative engine owner and a FIFO operation scheduler. | Each operation observes one coherent revision. Direct mode and one complete-index worker use the same engine, statistics, and scorer. Parallel sharding is deferred. |
| ADR-03 | Field-aware dictionary/postings plus reverse per-document term data. | Search uses an inverted index; changes subtract old contributions and add new ones without reanalyzing unchanged documents. |
| ADR-04 | Incremental staging followed by one root publication. | A failed operation leaves the old root visible. Optional side indexes participate in the same transaction. |
| ADR-05 | `raveldex-bm25-v1`, defined in [RANKING.md](../specs/RANKING.md). | Score explanations reconstruct the arithmetic actually used. Foreign engines remain separately identified comparators. |
| ADR-06 | Success means complete membership and an exact total. | Candidate, expansion, time, or work limits cause a typed failure. They never silently weaken a query. Requested result pagination is allowed; truncated candidate evaluation is not. |
| ADR-07 | Source, positions, and original offsets are separate choices. | A frequency-only consumer retains none of these additional representations. Installing a representation cannot change ordinary token matching or scores. |
| ADR-08 | Narrow capability contracts, no unrestricted hook chain. | Optional modules declare their effect on matching, data, transactions, execution, and cost. Installation order cannot determine query meaning. |
| ADR-09 | `basic-v1` analysis is precisely specified and environment-qualified. | Runtime Unicode data is not advertised as universally identical. Cross-profile native-state restore requires compatibility evidence; source rebuild is the safe alternative. |
| ADR-10 | Keep the initial ceiling at 10,000 live documents. | Higher capacities require a reviewed resource design. Bounds can be configured downward, never bypassed by a benchmark or add-on. |

## Product boundary

The mandatory core includes schema/record/query validation, opaque IDs, the basic analyzer, field statistics, dictionary/postings, exact and bounded prefix groups, Boolean queries, scalar equality, deterministic ranking, exact totals, atomic incremental mutations, cancellation checkpoints, and typed failures.

The core does not import a DOM, create workers, open databases, retain original text by default, parse documents, send telemetry, access a network, or read application files. It does not perform fuzzy, vector, semantic, synonym, phrase, proximity, or language-specific search without a corresponding explicit capability.

Metadata needed for declared core equality predicates is part of the index state. Display records and arbitrary application properties are not automatically retained. The caller may keep an ID-to-display-record map; a transactional source participant is available when a selected add-on requires original text.

## Planned module map

Core and the core consumer now exist. Other rows remain implementation destinations for optional capabilities.

| Area | Destination | Responsibility |
| --- | --- | --- |
| Core | `src/core/` | Contracts, analysis, dictionary, postings, scorer, evaluator, mutations, scheduler, safe errors. |
| Source phrases | `src/addons/phrases/` | Strict phrase leaf evaluation and an optional transactional source store. Source-store utilities must remain separable from phrase evaluation imports. |
| Positions | `src/addons/positions/` | Selected-field token positions and separately selected original offsets. |
| Structured filtering | `src/addons/filters/` | Typed numeric ranges and set membership. |
| Facets | `src/addons/facets/` | Exact conjunctive keyword counts over complete query membership. |
| Evidence | `src/addons/evidence/` | Original-source occurrences, ranges, and bounded snippet data. |
| Inspector | `src/addons/inspector/` | Opt-in factual traces and export; no alternate scorer. |
| DOM UI | `src/addons/ui/` | Native search controls/results/status and optional Inspector presentation, with separate CSS. |
| Worker | `src/adapters/worker/` | Validated transport to one native owner. |
| Snapshots | `src/adapters/snapshots/` | Distinct source and native-state codecs; atomic import. |
| IndexedDB | `src/adapters/indexeddb/` | Explicit save/load/erase, conflicts, and recovery. |
| Core consumer | `examples/core-docs/` | Real-content search using only public core imports, by RX-1006. |
| Full consumer | `examples/docs-search/` | Selected optional modules exercised as a real application, by RX-2006. |

A coordinated package may expose first-party subpaths. Core import graphs must exclude add-on code. An optional package needing third-party runtime dependencies belongs in a separately installable integration package. Do not export unfinished factories or placeholder methods that appear to work.

## State model

A published root contains its revision, live ID directory, canonical metadata, per-document reverse term frequencies and field lengths, field statistics, dictionary/postings directories, and the roots of installed transaction participants. Consumers never receive mutable references to this state.

Use bounded bucketed copy-on-write directories for the first implementation:

- A fixed directory points to lazily allocated buckets. Only touched buckets are copied into a staging root.
- A document's reverse record identifies the old terms/frequencies needed to remove its contributions.
- Posting data for a common term is also bucketed by document identity, so changing one document need not copy one complete common-term posting list.
- Stage caches ensure a bucket touched multiple times by one batch is copied only once.
- Field counts and total token lengths change by deltas. Empty terms and empty posting buckets are removed.
- Do not invoke `new Map(largeMap)` or another uninterruptible whole-directory copy as a substitute for resumable staging. Bucket-copy work is counted and may yield.

The initial implementation may enumerate the bounded live dictionary for prefix lookup. It must charge visited terms, collect all qualifying expansions up to the declared cap, and fail on cap overflow. A trie, compressed postings, cached query results, and specialized range indexes are optional later optimizations justified by evidence. None is needed to prove exact native retrieval.

The number of buckets and hash layout are private format details selected during RX-1002/RX-1004. Collision cases must remain correct and bounded by admission/work limits; average bucket size is not a worst-case guarantee. A native snapshot codec must version these details if it serializes them.

RX-1002 implements initial frequency-only construction with 256 logical slots per directory. Slot pointers and prototype-safe key buckets are allocated lazily; a private FNV-1a hash over original UTF-16 key units chooses the slot. Completed directories/buckets and all root records are frozen. Reverse field data stores aggregate frequencies/lengths across values and intentionally retains no per-value positions or original source. RX-1004 `DirectoryStage` now copies occupied slot pointers resumably and copies each touched key bucket once per transaction. Per-field term caches coalesce posting/statistical updates across a batch; empty terms/buckets disappear and unchanged roots/buckets remain shared. `MutationOwner` prepares core plus trusted participant roots, checks cancellation immediately before a single root assignment, and returns that committed revision. Replacement measurements at 100/1,000/10,000 records show one actual analyzed record/three values with counted directory/bucket copies and updates; these are partial logical allocation counts, not heap or latency measurements. RX-1005 implements bounded FIFO/promise execution, admission deadlines, cancellation and disposal; RX-2001 now implements direct source/leaf-refinement registration, while RX-1006 qualifies the root package and a seven-method facade. Construction accepts separately bounded captured batches and exposes no root until its final cursor completes. Its per-batch/finalization work guards are internal phase guards; ordinary operations now thread one work budget through their mutation/query cursor phases. Native key enumeration/freezing remains indivisible, and a collision bucket can contain the admitted corpus; no constant-time or interruption-latency guarantee is implied.

## One revision per operation

An operation copies and validates its input at admission, then waits in a bounded FIFO queue. When it starts, it reads the current published root. The owner runs one operation at a time; scheduler yields allow the host and cancellation signals to progress without admitting a second operation to that root.

A mutation prepares the core delta and all installed transaction-participant deltas. After final validation and an abort/deadline check, publishing their assembled root is the commit point. The publication does not yield. Before that point, cancellation means no mutation committed. After it, the mutation is committed even if a later worker reply is lost.

This serial ownership is deliberate: the alpha does not promise simultaneous reads and writes, retained historical revisions, lock-free progress, or constant-time changes. Incremental means that unrelated records are not reanalyzed; it does not mean there is no copying, allocation, shared-posting work, or garbage collection.

The normative lifecycle, no-op behavior, failure outcomes, and scheduling limits are in [MUTATIONS_AND_EXECUTION.md](../specs/MUTATIONS_AND_EXECUTION.md).

## Query execution pipeline

1. Validate and own the query; reject unsupported capabilities before execution.
2. Analyze raw lexical inputs using the index's analyzer configuration/profile.
3. Canonicalize Boolean/groups without changing semantics; enumerate exact/prefix terms with explicit limits.
4. Retrieve candidate sets and evaluate the complete Boolean tree, including installed leaf refinements.
5. Evaluate all membership needed for the exact total and requested aggregation.
6. Score qualifying documents from the same revision and select the requested page using the specified tie-breaker.
7. Return owned data. Collect explanation facts only when explicitly requested.

A selective filter or result limit may improve execution only when the optimization preserves all requested membership, scoring, totals, and facets. Phrase verification cannot run only after top-k selection. A verifier for a phrase leaf cannot globally discard documents that qualified through another OR branch.

RX-1003 implements this core query pipeline as one internally consumed generator and one work-v1 budget. Canonical lexical keys contain sorted fields and deduplicated sorted normalized term/mode/weight tuples; Boolean structure preserves negative/scoring participation. Whole-query expansion counts union distinct field/term pairs across groups. Complete group posting membership is followed by evaluation of every live document, then field/group-ordered scoring. A worst-first heap retains at most offset + limit entries and uses charged resumable comparisons; no full candidate sort is required. Query-local memberships, canonical trees and page candidates are temporary operation data, not retained side indexes. Private selected-ID tracing records evaluator paths and actual scorer intermediates, including off-page/nonqualifying IDs, and caps the complete header/facts at 4,096. RX-1005 captures queries separately from execution-start root selection and wraps this cursor in ordinary scheduled promises with cooperative cancellation/deadlines. RX-2004 exposes this selected trace through optional direct evidence registration and bounded owned diagnostics; no public engine method is added.

## Analyzer/environment boundary

`basic-v1` uses ECMAScript Unicode property recognition, `String.prototype.normalize('NFKC')`, and default `toLowerCase()` on bounded original token spans. It does not pin a private Unicode database or use locale-specific casing. Its exact algorithm and edge cases are in [CORE_CONTRACT.md](../specs/CORE_CONTRACT.md).

The logical algorithm ID does not prove Unicode table equivalence across host versions. Indexing and querying run in the same owner with the same configuration. A worker handshake requires matching implementation/configuration and analyzer qualification profiles. Qualification fixtures record the actual engine/runtime/browser versions.

An unqualified default environment can run local core search, but cannot claim portable native-state restore. Such state is treated as profile-unqualified by the snapshot adapter. Rebuilding a source snapshot under the receiving analyzer is an explicit reindex, and may produce changed matches or scores. A profile-mismatched native snapshot must be rejected, not relabeled. A small probe set is useful diagnostics and does not prove complete Unicode equivalence.

This choice keeps a generated Unicode database and its licensing/build machinery out of RX-1001. If later cross-runtime requirements justify a pinned analyzer, it is a separately versioned analyzer decision with its code, data, licensing, and size costs measured.

## Cost and performance contract

The core-only target is **at most 15 KiB gzip** for a production ESM consumer bundle, including all mandatory code/dependencies. RX-1006 measures 39,702 minified bytes and 12,400 gzip bytes using the installed full public runtime entry, pinned esbuild 0.28.2 and recorded gzip settings. This local result meets the planning target; it is not a universal bundle or resource promise.

Record the exact bundler/minifier version, target, minification settings, gzip settings, consumer imports, and built commit. Measure core-only and each requested combination separately. Tarball size, source size, ESM bytes, gzip bytes, retained heap, staging peak, serialized bytes, and worker transport are different measurements.

If the target is missed, review module boundaries and evidence before changing the budget. Do not remove validation, Unicode behavior, or required semantics merely to obtain a green size result. Never report serialized bytes as retained memory or animation-frame timing as physical paint latency.

The admission limits are defensive maxima. They do not establish a comfortable memory footprint on every phone, a guaranteed completion time, or that every admitted worst-case query fits its operation work budget.

## Reuse and comparison

Prior companion contracts, test ideas, UI interactions, phrase algorithms, and storage/worker lessons may be reused after provenance and coupling review. Copying code requires its license/provenance to be recorded. The fresh native repository does not import old task completion, approvals, evidence, or benchmarks as native passes.

MiniSearch remains a development comparator or a separately identified compatibility adapter. Do not put it in native core dependencies, use its scorer as the native oracle, import an opaque MiniSearch index as native state, or silently fall back to it on native failure.

Comparison configurations must request equivalent semantics and retained data. Unsupported semantics are recorded as not comparable. Correctness uses an independent full-scan evaluator plus hand-derived scores, not agreement with another engine alone.

## Verification and completion boundaries

| Milestone | Structural outcome | Evidence still required during implementation |
| --- | --- | --- |
| N0 | Adopted contracts and ordered tasks. | Review that contracts are consistent and load-bearing choices are explicit. No runtime pass is possible yet. |
| N1 | Usable native core. | Independent membership oracle, Unicode/source-range fixtures, numeric ranking, mutation deltas/rollback, cancellation, and actual packed public consumer. |
| N2 | Modular search product. | Source/positions phrase parity, exact facet membership, actual score traces, source evidence, UI behavior, and unused-module import/data absence. |
| N3 | Host and migration parity. | Direct/worker semantics, transport failure outcomes, validated restore/recovery/erase, and separated foreign compatibility. |
| N4 | Qualified native candidate. | Fair relevance/cost comparisons, supported environment matrix, actual AT/device/resource observations where claimed, package review, and explicit remaining limitations. |

No unresolved core design choice blocks N2. The packed pilot and core bundle cost are recorded; broader host/resource qualification, optional implementation and product-release evidence remain future task work. Their absence must not be disguised as implementation success or used to restart the already adopted native-versus-companion decision.

## Related contracts

- [Core contracts and limits](../specs/CORE_CONTRACT.md)
- [Ranking and explanation arithmetic](../specs/RANKING.md)
- [Mutations, revisions, execution, and cancellation](../specs/MUTATIONS_AND_EXECUTION.md)
- [Add-ons and adapters](ADDONS_AND_ADAPTERS.md)

## Technical references

The normalization/environment constraint follows the distinction between an algorithm and the host's supported Unicode repertoire; see [Unicode normalization, stability, and conformance](https://www.unicode.org/reports/tr15/). The selected `basic-v1` behavior is Raveldex's own contract, not a claim to implement language-specific word segmentation or full Unicode caseless matching.

The RX-2001 snapshot extends mandatory coordination without importing optional runtime: its full core is 49,102 minified / 15,131 gzip bytes (30 inputs, below 15 KiB); complete selected source-plus-phrase graph is 57,713 / 17,371 bytes. Standalone source utility excludes verification. See [phrase evidence](../evidence/RX-2001.md) for exact graphs and shared-budget source-scan diagnostics; historical RX-1006 numbers remain its original snapshot.

RX-2002 keeps source, positions and original offsets independently selected. Value-aware position roots store normalized term occurrences with optional original coordinates; positional/mixed verifiers preserve strict phrase eligibility and native scores. No optional runtime enters core. Its RX-2002 snapshot complete core is 49,164 minified / 15,159 gzip bytes (30 inputs, below 15 KiB); [position evidence](../evidence/RX-2002.md) records exact selected graphs, original-span assertions, parity and logical work/retention.

RX-2003 adds no optional runtime to core: installed metadata handlers own bounded payload parsing/Unicode/output details, while one shared preparation/metering bridge coordinates source refiners, metadata predicates and complete pre-pagination aggregations. Filters/facets read existing immutable metadata and allocate no side index. Full fixed-method graphs and 100/1,000/10,000-record charged work are in [RX-2003 evidence](../evidence/RX-2003.md). Mandatory registration/role coordination now misses the unchanged 15 KiB planning target. Boundary review removed duplicated role traversal/metering and optional parser imports; remaining validation and semantics are preserved. This observed miss is permitted for reporting under RX-1006-AC05 and remains visible for N4 resource qualification.

RX-2004 adds a narrow core evidence selector/preparation/projection bridge to the existing collector and shared role budget. Optional Inspector parsing, source lookup, deep output ownership and diagnostic serialization remain outside core. No side root or full trace is allocated by ordinary searches. The fixed installed core graph is 53,999 minified/16,459 gzip bytes, a 1,099-byte miss against the unchanged 15 KiB planning target ( +434 gzip versus RX-2003). Mandatory bounded validation/coordination is preserved; this explained target observation remains for N4 under RX-1006-AC05. [Inspector evidence](../evidence/RX-2004.md) distinguishes package bytes, charged work and unmeasured heap/latency.

RX-2005 adds optional actual positive-path original occurrence ranges and bounded grapheme-safe source snippet data. It reuses original source/offset participants at one revision and installs no new root. A narrow immutable analyzed-query view and declared offset requirements extend the existing core bridge; traversal/reanalysis/segmentation/clipping/deep output remain optional. Standalone range imports exclude snippet/segmentation modules; source utilities still exclude phrase verifiers. The fixed core snapshot is 54,156 minified/16,491 gzip bytes (31 inputs), a 1,131-byte miss against the unchanged 15 KiB target (+32 gzip versus RX-2004). Correctness/validation remains intact; this cost observation is separate from future host/resource qualification.
