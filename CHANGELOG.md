# Changelog

## Unreleased — explicitly selected RX-A010, RX-A020, RX-A030, RX-A040, RX-A050 and RX-A060

- RX-A060 adds explicitly requested `/addons/literal`: raw case-sensitive source substrings including punctuation/infixes, exact totals and zero-score predicates, bounded overlapping UTF-16 evidence, source requirements and worker/snapshot identity. No normalization, n-gram side index or automatic source retention is added.

- RX-A050 adds explicitly selected `/addons/identifiers`: preserved whole names and searchable camel/acronym/digit/underscore components, original-only strict phrases, tagged source/offset provenance, native BM25 statistics and bounded worker/snapshot compatibility. Default basic/English behavior stays separate; no runtime dependency or automatic UI change is introduced.

- RX-A040 adds explicitly selected `/integrations/languages/english` with original Porter 1980 morphology, one-to-one original spans/positions and shared index/query/phrase/evidence/worker/snapshot analysis. Default basic behavior remains unchanged; English overstemming, finite host qualification and the existing core gzip target miss remain disclosed.

- RX-A030 adds `/addons/synonyms`: owned versioned single-token directional mappings, one-step live alternatives at weight 0.5, original required groups, transparent mapping/score facts, complete bounds and explicit worker identity. No ordinary-query/phrase/UI change, corpus side index or runtime dependency is added.

- RX-A020 adds `/addons/suggestions`: independent one-token completion from live selected dictionaries, deterministic field-frequency ranking, complete candidate totals, bounded output/work and mutation/cancellation behavior. No automatic input rewrite, side index, UI integration or runtime dependency is added.

- Add optional `/addons/typo` with a bounded Unicode distance-one/adjacent-swap policy, exact-first dictionary selection and weighted native alternatives. Original required groups and strict ordinary queries remain intact.
- Add complete output/budget/group bounds, live mutation coherence, actual expansion metadata, Inspector/original-evidence integration and matching worker identities. No side index or runtime dependency is added.
- Historical candidate hashes/remote CI below refer to their recorded artifacts; this later optional slice needs its own verification and does not authorize publication or other N5 work.

## 0.1.0-rc.0 — local candidate, unpublished

The native 0.1 candidate is prepared as a private ESM tarball. It is not an npm publication, GitHub release or release tag. The [candidate recommendation](docs/release/CANDIDATE.md), [compatibility policy](docs/release/COMPATIBILITY.md) and [preparation workflow](docs/release/PREPARATION.md) separate verified scope from the owner's publication decision.

- Provide a source-free core with `basic-v1` analysis, exact/prefix/Boolean/equality queries, exact totals, deterministic field-local `raveldex-bm25-v1`, atomic incremental mutations, bounded cooperative execution and explicit disposal.
- Provide optional selected source, positions/original offsets, strict source/position/mixed phrases, typed numeric/set predicates, exact conjunctive facets, factual native Inspector, complete original ranges and bounded grapheme-safe snippets.
- Provide native DOM UI with independent CSS; explicit one-owner module workers; source and exactly qualified Node native snapshots; namespaced IndexedDB save/load/erase with generation conflicts; source-only worker recovery; and validated LocalSearch source conversion into a new native owner. Core retains zero runtime dependencies and no foreign engine.
- Replace historical root status prose with an [export-complete API reference](docs/api/README.md), runnable installed-package examples and [support/limitation guidance](docs/support/RX-4003.md). Candidate consumers verify public types/imports, package contents, optional graph boundaries and independent CSS.
- Retain RX-4001 independent correctness/relevance/cost observations and the completed finite RX-4002 browser, exact-tool AT, physical and memory-method qualification. Current mandatory qualification is complete for its recorded scope. Historical failed/Blocked attempts remain preserved in the repository evidence.

Known limitations remain part of the candidate: exact-AND natural-language/vocabulary gaps; a 16,829-byte gzip core against the unchanged 15 KiB planning target; large whole-source rebuild work/deadline refusals; truthful unknown worker/storage outcomes; generic UI presentation of transport errors; and earlier VoiceOver announcement interruptions without a proven cause or production fix. The accepted Medium/Words normal-typing observation is bounded, not a required product setting. Ordinary/browser-worker analyzer profiles remain unqualified and native browser/worker snapshots remain unavailable. See [support](docs/support/RX-4003.md) for exact environments and evidence boundaries.

At that original preparation boundary, no N5 enhancement was activated and no runtime architecture/API/dependency was changed by candidate preparation, and no universal performance, memory, durability, Unicode or accessibility guarantee is introduced.

## Implementation history before the candidate

- RX-1001–1006 established readonly data/schema/query/error contracts, native analysis/frequency indexing, exact membership and BM25, incremental atomic writes, FIFO/cancellation/deadline lifecycle and the first installed real-document core pilot.
- RX-2001–2006 added explicit transactional source and strict phrases; selected positions/offsets and mixed phrase strategies; typed filters/exact facets; selected native score facts/diagnostic JSON; original ranges/grapheme-safe snippets; and native DOM UI with a real documentation browser pilot.
- RX-3001–3004 added module-worker ownership/receipts, versioned source/native snapshots with exact application-declared Node qualification, explicit IndexedDB generations/recovery/erasure, and an isolated companion source converter/comparison with declared analyzer/ranking differences and provenance.
- RX-4001 evaluated independent retrieval/numerical correctness, 76 frozen documentation queries, a pinned foreign comparator and separated bundle/work/latency/storage observations. Results preserve all lexical/ranking gaps and refused workloads.
- RX-4002 progressed from preserved environment/harness/measurement failures to accepted finite installed browser, Safari/VoiceOver, physical composition/input and calibrated memory observations. The final October 28 continuation records 36 selected codec windows and repeated actual native wire-capacity observations with independent review Ready with follow-ups. Stronger physical/global and complete receiver-copy claims remain unqualified.

Detailed historical commands, outcomes, review records and immutable evidence remain in the repository's [evidence index through the roadmap](https://github.com/vmitsaras/raveldex/blob/main/IMPLEMENTATION_TASKS.md).
