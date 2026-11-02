<!-- Generated from docs/planning/roadmap.json by scripts/render-plan.mjs. Run npm run docs:generate; do not edit task data here. -->

# Raveldex roadmap

Raveldex will own indexing, retrieval, ranking, incremental updates, and execution. Advanced matching, presentation, workers, persistence, and integrations remain optional capabilities.

The owner selected the native direction on 2026-10-06 and requested initialization of this new repository. The bootstrap establishes the plan and tooling; it does not implement a usable search engine. The prior companion and its completed tasks are historical inputs, not this repository's active implementation or verification record.

## Current tracked state

**Release progress:** 36/40 done · 0 in progress · 1 dependency-ready.

**Planner state:** `ready`.

**Next or resumable release task:** [RX-7003](IMPLEMENTATION_TASKS.md#rx-7003) — Directory multi-filter queries and explicit URL state.

Run `npm run handoff:status` and `npm run handoff:next` for the complete explanation. Dependency readiness identifies technical eligibility; the owner's current request determines execution scope. Deferred N5 ideas never enter automatic next-task selection.

## Where to look

- [Canonical task state](docs/planning/roadmap.json): IDs, dependencies, status, acceptance, specifications, and actual evidence.
- [Implementation task cards](IMPLEMENTATION_TASKS.md): the release tasks and verification requirements.
- [Optional feature tracks](docs/planning/OPTIONAL_FEATURES.md): deliberately deferred add-ons and unscheduled research ideas.
- [Verification plan](docs/planning/VERIFICATION_PLAN.md): what must be observed before a capability is called verified.
- [GitHub milestones](https://github.com/vmitsaras/raveldex/milestones) and [issues](https://github.com/vmitsaras/raveldex/issues): the human tracking view, using the same IDs and acceptance conditions.

`docs/planning/roadmap.json` is authoritative. This file, the task cards, and GitHub issues are generated tracking views. Update the manifest first and synchronize the views; issue closure alone does not establish verified completion.

## Milestones

| Milestone | Tasks | Done | Required outcome |
| --- | --- | --- | --- |
| **N0 — Native design adoption** | `RX-0001`–`RX-0002` | 2/2 | Initialize the new repository and adopt bounded native contracts, task tracking, and verification rules. |
| **N1 — Usable native core alpha** | `RX-1001`–`RX-1006` | 6/6 | Search a real documentation corpus through a packaged consumer using only Raveldex-owned indexing, retrieval, scoring, and execution. |
| **N2 — Modular search product** | `RX-2001`–`RX-2006` | 6/6 | Add optional phrase strategies, structured queries, evidence, Inspector data, and a usable native search interface. |
| **N3 — Host and migration parity** | `RX-3001`–`RX-3004` | 4/4 | Support native workers, explicit snapshots and persistence, and a bounded migration route without changing search semantics. |
| **N4 — Native 0.1 qualification** | `RX-4001`–`RX-4003` | 3/3 | Produce an independently reviewed release candidate whose documented claims match observed correctness, usability, environment support, and resource behavior. |
| **N5 — Selected optional enhancements** | `RX-A010`–`RX-A100` | 10/10 | Select one evidence-backed add-on at a time after the native candidate; avoid treating the entire idea backlog as release scope. |
| **N6 — Search Workbench documentation site** | `RX-5001`–`RX-5005` | 5/5 | Implement the owner-selected Search Workbench design in the existing static documentation site, with real packed search and preserved publication boundaries. |
| **N7 — Inline and documentation search solutions** | `RX-6001`–`RX-6008` | 8/8 | Provide ready-to-use Pagefind-style inline search and a documentation modal with optional native UI, complete installed starters, CSS customization and evidence-backed page/section presentation. |
| **N8 — Dropdown, directory and rich search results** | `RX-7001`–`RX-7006` | 2/6 | Extend the verified consumer UI foundation with compact dropdown search, faceted directory search and rich card/grid results, each backed by complete installed examples. |

## Task index

| Task | Status | Dependencies | Tracking |
| --- | --- | --- | --- |
| [RX-0001](IMPLEMENTATION_TASKS.md#rx-0001) — Repository foundation and native design adoption | `done` | None | [Issue](https://github.com/vmitsaras/raveldex/issues/7) |
| [RX-0002](IMPLEMENTATION_TASKS.md#rx-0002) — Core contract reconciliation and evaluation plan | `done` | `RX-0001` | [Issue](https://github.com/vmitsaras/raveldex/issues/8) |
| [RX-1001](IMPLEMENTATION_TASKS.md#rx-1001) — Data, schema, basic analyzer, limits, and errors | `done` | `RX-0002` | [Issue](https://github.com/vmitsaras/raveldex/issues/9) |
| [RX-1002](IMPLEMENTATION_TASKS.md#rx-1002) — Dictionary, postings, exact retrieval, and independent oracle | `done` | `RX-1001` | [Issue](https://github.com/vmitsaras/raveldex/issues/10) |
| [RX-1003](IMPLEMENTATION_TASKS.md#rx-1003) — Query evaluation, native BM25, and numerical trace facts | `done` | `RX-1002` | [Issue](https://github.com/vmitsaras/raveldex/issues/11) |
| [RX-1004](IMPLEMENTATION_TASKS.md#rx-1004) — Incremental atomic mutations | `done` | `RX-1003` | [Issue](https://github.com/vmitsaras/raveldex/issues/12) |
| [RX-1005](IMPLEMENTATION_TASKS.md#rx-1005) — Revision execution, work limits, and cancellation | `done` | `RX-1004` | [Issue](https://github.com/vmitsaras/raveldex/issues/13) |
| [RX-1006](IMPLEMENTATION_TASKS.md#rx-1006) — Core-only packaged real-document pilot | `done` | `RX-1005` | [Issue](https://github.com/vmitsaras/raveldex/issues/14) |
| [RX-2001](IMPLEMENTATION_TASKS.md#rx-2001) — Source-verified phrase add-on | `done` | `RX-1006` | [Issue](https://github.com/vmitsaras/raveldex/issues/15) |
| [RX-2002](IMPLEMENTATION_TASKS.md#rx-2002) — Optional positions, original offsets, and phrase parity | `done` | `RX-2001` | [Issue](https://github.com/vmitsaras/raveldex/issues/16) |
| [RX-2003](IMPLEMENTATION_TASKS.md#rx-2003) — Structured filters and exact conjunctive facets | `done` | `RX-1006` | [Issue](https://github.com/vmitsaras/raveldex/issues/17) |
| [RX-2004](IMPLEMENTATION_TASKS.md#rx-2004) — Factual explain and Inspector data | `done` | `RX-1006` | [Issue](https://github.com/vmitsaras/raveldex/issues/18) |
| [RX-2005](IMPLEMENTATION_TASKS.md#rx-2005) — Original match ranges and bounded snippets | `done` | `RX-2001`, `RX-2002` | [Issue](https://github.com/vmitsaras/raveldex/issues/19) |
| [RX-2006](IMPLEMENTATION_TASKS.md#rx-2006) — Native DOM UI, Inspector, and documentation pilot | `done` | `RX-2003`, `RX-2004`, `RX-2005` | [Issue](https://github.com/vmitsaras/raveldex/issues/20) |
| [RX-3001](IMPLEMENTATION_TASKS.md#rx-3001) — One-owner module-worker adapter | `done` | `RX-2006` | [Issue](https://github.com/vmitsaras/raveldex/issues/21) |
| [RX-3002](IMPLEMENTATION_TASKS.md#rx-3002) — Versioned source and native snapshots | `done` | `RX-2006` | [Issue](https://github.com/vmitsaras/raveldex/issues/22) |
| [RX-3003](IMPLEMENTATION_TASKS.md#rx-3003) — IndexedDB persistence, recovery, and namespace erasure | `done` | `RX-3001`, `RX-3002` | [Issue](https://github.com/vmitsaras/raveldex/issues/23) |
| [RX-3004](IMPLEMENTATION_TASKS.md#rx-3004) — Companion migration and comparator separation | `done` | `RX-3003` | [Issue](https://github.com/vmitsaras/raveldex/issues/24) |
| [RX-4001](IMPLEMENTATION_TASKS.md#rx-4001) — Fair correctness, relevance, and cost comparison | `done` | `RX-3004` | [Issue](https://github.com/vmitsaras/raveldex/issues/25) |
| [RX-4002](IMPLEMENTATION_TASKS.md#rx-4002) — Browser, assistive-technology, memory, and device qualification | `done` | `RX-3004` | [Issue](https://github.com/vmitsaras/raveldex/issues/26) |
| [RX-4003](IMPLEMENTATION_TASKS.md#rx-4003) — Package, public documentation, and independent candidate review | `done` | `RX-4001`, `RX-4002` | [Issue](https://github.com/vmitsaras/raveldex/issues/27) |
| [RX-A010](docs/planning/OPTIONAL_FEATURES.md#rx-a010) — Bounded typo tolerance | `done` | `RX-4003` | [Issue](https://github.com/vmitsaras/raveldex/issues/28) |
| [RX-A020](docs/planning/OPTIONAL_FEATURES.md#rx-a020) — Dictionary-backed suggestions | `done` | `RX-4003` | [Issue](https://github.com/vmitsaras/raveldex/issues/29) |
| [RX-A030](docs/planning/OPTIONAL_FEATURES.md#rx-a030) — Directional one-step synonyms | `done` | `RX-4003` | [Issue](https://github.com/vmitsaras/raveldex/issues/30) |
| [RX-A040](docs/planning/OPTIONAL_FEATURES.md#rx-a040) — Evaluated language analyzer pack | `done` | `RX-4003` | [Issue](https://github.com/vmitsaras/raveldex/issues/31) |
| [RX-A050](docs/planning/OPTIONAL_FEATURES.md#rx-a050) — Code and identifier analysis | `done` | `RX-4003` | [Issue](https://github.com/vmitsaras/raveldex/issues/32) |
| [RX-A060](docs/planning/OPTIONAL_FEATURES.md#rx-a060) — Explicit literal and infix matching | `done` | `RX-4003` | [Issue](https://github.com/vmitsaras/raveldex/issues/33) |
| [RX-A070](docs/planning/OPTIONAL_FEATURES.md#rx-a070) — Ordered proximity matching | `done` | `RX-4003` | [Issue](https://github.com/vmitsaras/raveldex/issues/34) |
| [RX-A080](docs/planning/OPTIONAL_FEATURES.md#rx-a080) — Bounded text query syntax | `done` | `RX-4003` | [Issue](https://github.com/vmitsaras/raveldex/issues/35) |
| [RX-A090](docs/planning/OPTIONAL_FEATURES.md#rx-a090) — Explicit record patch convenience | `done` | `RX-4003` | [Issue](https://github.com/vmitsaras/raveldex/issues/36) |
| [RX-A100](docs/planning/OPTIONAL_FEATURES.md#rx-a100) — Static-build and Astro adapter | `done` | `RX-4003` | [Issue](https://github.com/vmitsaras/raveldex/issues/37) |
| [RX-5001](IMPLEMENTATION_TASKS.md#rx-5001) — Shared site shell and responsive reading styles | `done` | `RX-4003` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-5001%22) |
| [RX-5002](IMPLEMENTATION_TASKS.md#rx-5002) — Homepage with real Search Workbench | `done` | `RX-5001` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-5002%22) |
| [RX-5003](IMPLEMENTATION_TASKS.md#rx-5003) — Dedicated demo and shared behavior | `done` | `RX-5002` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-5003%22) |
| [RX-5004](IMPLEMENTATION_TASKS.md#rx-5004) — Workbench verification and project synchronization | `done` | `RX-5003` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-5004%22) |
| [RX-5005](IMPLEMENTATION_TASKS.md#rx-5005) — Final-word prefix search in the demo | `done` | `RX-5004` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-5005%22) |
| [RX-6001](IMPLEMENTATION_TASKS.md#rx-6001) — Consumer inline foundation and compatible preset contract | `done` | `RX-5005` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-6001%22) |
| [RX-6002](IMPLEMENTATION_TASKS.md#rx-6002) — Pagefind-style inline controls, paging and theming | `done` | `RX-6001` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-6002%22) |
| [RX-6003](IMPLEMENTATION_TASKS.md#rx-6003) — Installed inline search starters for browser and Astro | `done` | `RX-6002`, `RX-A100` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-6003%22) |
| [RX-6004](IMPLEMENTATION_TASKS.md#rx-6004) — Page and section display contract with static compatibility | `done` | `RX-6003` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-6004%22) |
| [RX-6005](IMPLEMENTATION_TASKS.md#rx-6005) — Evidence-backed anchored section previews | `done` | `RX-6004` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-6005%22) |
| [RX-6006](IMPLEMENTATION_TASKS.md#rx-6006) — Documentation search modal and lifecycle | `done` | `RX-6005` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-6006%22) |
| [RX-6007](IMPLEMENTATION_TASKS.md#rx-6007) — Installed documentation modal starters | `done` | `RX-6006`, `RX-A100` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-6007%22) |
| [RX-6008](IMPLEMENTATION_TASKS.md#rx-6008) — Inline and modal gallery, qualification and synchronization | `done` | `RX-6003`, `RX-6007` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-6008%22) |
| [RX-7001](IMPLEMENTATION_TASKS.md#rx-7001) — Accessible compact dropdown search | `done` | `RX-6008` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-7001%22) |
| [RX-7002](IMPLEMENTATION_TASKS.md#rx-7002) — Installed dropdown header starter and gallery | `done` | `RX-7001` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-7002%22) |
| [RX-7003](IMPLEMENTATION_TASKS.md#rx-7003) — Directory multi-filter queries and explicit URL state | `planned` | `RX-6008`, `RX-2003` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-7003%22) |
| [RX-7004](IMPLEMENTATION_TASKS.md#rx-7004) — Faceted directory controls and installed starter | `planned` | `RX-7003` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-7004%22) |
| [RX-7005](IMPLEMENTATION_TASKS.md#rx-7005) — Rich directory result cards and grid presentation | `planned` | `RX-7004` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-7005%22) |
| [RX-7006](IMPLEMENTATION_TASKS.md#rx-7006) — Complete solution gallery and family qualification | `planned` | `RX-7002`, `RX-7004`, `RX-7005` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-7006%22) |

## Milestone exit conditions

### N0 — Native design adoption

- The repository records the owner-selected native direction, current bootstrap scope, source provenance, and the separation from historical companion approvals.
- The native core, ranking, mutations, execution, add-on boundaries, and evaluation criteria are reconciled into implementation-ready contracts.
- Planning validation, dependency-aware next-task reporting, and GitHub milestone/task tracking are checked; no search runtime is claimed.

### N1 — Usable native core alpha

- Exact/prefix and Boolean retrieval, fielded native BM25, and deterministic ties agree with independent semantic and arithmetic expectations.
- Incremental atomic mutations preserve one coherent revision, avoid reanalyzing unchanged records, and honor documented cancellation and resource limits.
- A core-only consumer installs the package, searches an allowlisted real-document corpus, and supports updates without optional modules or a foreign search engine.
- Size, work, latency, and corpus limits are reported as measured outcomes; the 15 KiB gzip target and 10,000-record ceiling are not treated as measured capacity guarantees.

### N2 — Modular search product

- Source and positional phrase strategies agree on eligibility, original-term grouping, repeated words, and field/value boundaries without changing lexical scores.
- Structured filters and conjunctive facets operate on the complete qualifying set before result limits.
- Original-source evidence, snippets, actual numerical explanations, and a native DOM pilot use public contracts.
- Omitting a module removes its runtime imports, side indexes, startup work, and ambient/network effects.

### N3 — Host and migration parity

- Direct and one-owner worker execution share analyzer identity, corpus statistics, ranking, revisions, errors, and add-on capability contracts.
- Versioned source/native snapshots and IndexedDB recovery validate compatibility and preserve atomic state and explicit erasure behavior.
- Companion migration and MiniSearch comparison remain outside the native import graph; incompatible formats or semantics fail explicitly.

### N4 — Native 0.1 qualification

- Comparisons use equivalent semantics and complete requested configurations; relevance judgments and raw measurements are inspectable.
- Browser, assistive-technology, retained/peak-memory, and device-presentation evidence is collected for the proposed supported scope; unperformed observations remain visible.
- Package exports, installation, documentation, compatibility policy, and release notes are verified against the native candidate.
- An independent review states readiness and remaining blockers; publication and release tags remain a separate owner decision.

### N5 — Selected optional enhancements

- Every selected enhancement has a concrete user/query need, a bounded semantic contract, explicit optional costs, and a native compatibility assessment.
- Selected enhancements pass their own relevance, correctness, packaging, and lifecycle checks; unselected ideas remain deferred.
- No N5 feature is required to declare the N0–N4 native candidate complete.

### N6 — Search Workbench documentation site

- Home, guides and demo share a responsive accessible visual language matching the approved reference.
- Real packed search, examples, filters, Inspector and lifecycle remain verified at the project base.
- Local checks, browser evidence and documentation are synchronized without publishing.

### N7 — Inline and documentation search solutions

- Inline search can be adopted independently through installed plain browser and Astro starters, with truthful totals, bounded paging, complete states and documented CSS overrides.
- Documentation modal behavior, explicit triggers, keyboard/focus lifecycle, optional anchored section previews and on-demand starters are verified without changing native page ranking or legacy UI defaults.
- First-wave gallery, public contracts, examples and task evidence agree; core/optional import boundaries, existing Workbench and publication guards remain intact; manual/platform limitations are explicit.

### N8 — Dropdown, directory and rich search results

- A bounded accessible search-result dropdown supports native editing/link behavior, keyboard selection and an explicit full-results destination.
- Directory multi-selection, exact conjunctive counts, complete paging and explicitly selected URL state work consistently with native queries and browser navigation.
- Rich list/card/grid presentation preserves membership, native order, totals and safe metadata/image handling; the complete solution gallery, installed examples and scoped qualification records are synchronized without publication.

## Execution and authorization

The current bootstrap request authorizes initialization, documentation, scaffolding, and GitHub tracking. It does not silently authorize implementing all future milestones during the bootstrap. A later instruction to continue implementation is sufficient to start the next dependency-ready task inside these adopted contracts; no repeated decision about whether to build a native engine is needed.

The canonical array order is the stable priority among eligible tasks. N2 and N3 contain independent work that can be delegated after its dependencies finish. Shared contract/file changes still require coordination. Select another ready task only when the owner's requested scope covers it.

A task becomes `done` only when its behavior, acceptance evidence, review, and documentation agree. Use `blocked` for a concrete obstacle and `needs_decision` for an actual unresolved owner decision, both with a reason. Missing browser, screen-reader, or measurement access is neither proof of an implementation defect nor a passing observation.

## Scope guardrails

The first native core targets at most 10,000 admitted records with explicit input/work bounds. This is a defensive ceiling, not a capacity or latency guarantee. The core-only 15 KiB gzip budget is a measured design target including all mandatory code. A miss triggers a boundary review rather than removal of correctness checks.

Core-only search must be useful by `RX-1006`. N2 supplies the modular interface and N3 restores host/persistence capabilities. N4 determines the supportable native 0.1 candidate. Publication, release tags, and public releases remain a separate owner decision.

Vectors, RAG, semantic models, another default engine backend, Rust/WASM, uncontrolled plugin hooks, and the complete optional backlog are not native 0.1 requirements. The native implementation must demonstrate its own advantages instead of adopting unsupported claims from previous comparisons.

## Provenance

This roadmap transcribes the native-library direction and `RX-*` milestones from the owner-supplied conversation and adapts them for this fresh repository. It does not claim the earlier planning archive is present, external research was refreshed, or native implementation results already exist. See the [native direction decision](docs/decisions/0001-native-direction.md) and [project context](PROJECT_CONTEXT.md).
