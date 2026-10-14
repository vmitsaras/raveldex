<!-- Generated from docs/planning/roadmap.json by scripts/render-plan.mjs. Run npm run docs:generate; do not edit task data here. -->

# Raveldex roadmap

Raveldex will own indexing, retrieval, ranking, incremental updates, and execution. Advanced matching, presentation, workers, persistence, and integrations remain optional capabilities.

The owner selected the native direction on 2026-10-06 and requested initialization of this new repository. The bootstrap establishes the plan and tooling; it does not implement a usable search engine. The prior companion and its completed tasks are historical inputs, not this repository's active implementation or verification record.

## Current tracked state

**Release progress:** 19/21 done · 0 in progress · 0 dependency-ready.

**Planner state:** `blocked`.

**Next release task:** none. Read the planner state and any blockers below; a completed active backlog is a legitimate terminal state.

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
| **N4 — Native 0.1 qualification** | `RX-4001`–`RX-4003` | 1/3 | Produce an independently reviewed release candidate whose documented claims match observed correctness, usability, environment support, and resource behavior. |
| **N5 — Selected optional enhancements** | `RX-A010`–`RX-A100` | 0/10 | Select one evidence-backed add-on at a time after the native candidate; avoid treating the entire idea backlog as release scope. |

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
| [RX-4002](IMPLEMENTATION_TASKS.md#rx-4002) — Browser, assistive-technology, memory, and device qualification | `blocked` | `RX-3004` | [Issue](https://github.com/vmitsaras/raveldex/issues/26) |
| [RX-4003](IMPLEMENTATION_TASKS.md#rx-4003) — Package, public documentation, and independent candidate review | `planned` | `RX-4001`, `RX-4002` | [Issue](https://github.com/vmitsaras/raveldex/issues/27) |
| [RX-A010](docs/planning/OPTIONAL_FEATURES.md#rx-a010) — Bounded typo tolerance | `deferred` | `RX-4003` | [Issue](https://github.com/vmitsaras/raveldex/issues/28) |
| [RX-A020](docs/planning/OPTIONAL_FEATURES.md#rx-a020) — Dictionary-backed suggestions | `deferred` | `RX-4003` | [Issue](https://github.com/vmitsaras/raveldex/issues/29) |
| [RX-A030](docs/planning/OPTIONAL_FEATURES.md#rx-a030) — Directional one-step synonyms | `deferred` | `RX-4003` | [Issue](https://github.com/vmitsaras/raveldex/issues/30) |
| [RX-A040](docs/planning/OPTIONAL_FEATURES.md#rx-a040) — Evaluated language analyzer pack | `deferred` | `RX-4003` | [Issue](https://github.com/vmitsaras/raveldex/issues/31) |
| [RX-A050](docs/planning/OPTIONAL_FEATURES.md#rx-a050) — Code and identifier analysis | `deferred` | `RX-4003` | [Issue](https://github.com/vmitsaras/raveldex/issues/32) |
| [RX-A060](docs/planning/OPTIONAL_FEATURES.md#rx-a060) — Explicit literal and infix matching | `deferred` | `RX-4003` | [Issue](https://github.com/vmitsaras/raveldex/issues/33) |
| [RX-A070](docs/planning/OPTIONAL_FEATURES.md#rx-a070) — Ordered proximity matching | `deferred` | `RX-4003` | [Issue](https://github.com/vmitsaras/raveldex/issues/34) |
| [RX-A080](docs/planning/OPTIONAL_FEATURES.md#rx-a080) — Bounded text query syntax | `deferred` | `RX-4003` | [Issue](https://github.com/vmitsaras/raveldex/issues/35) |
| [RX-A090](docs/planning/OPTIONAL_FEATURES.md#rx-a090) — Explicit record patch convenience | `deferred` | `RX-4003` | [Issue](https://github.com/vmitsaras/raveldex/issues/36) |
| [RX-A100](docs/planning/OPTIONAL_FEATURES.md#rx-a100) — Static-build and Astro adapter | `deferred` | `RX-4003` | [Issue](https://github.com/vmitsaras/raveldex/issues/37) |

## Recorded blockers and decisions

- [RX-4002](IMPLEMENTATION_TASKS.md#rx-4002): Open finding RX-4002-F01 now includes owner-reported uninterrupted announcements after changing VoiceOver speech verbosity from High to Medium, with screenshot confirmation of Medium. Retest URL/mode/busy scope, package identity, actions and focus remain unconfirmed; preserve the earlier failure and bind the successful report before disposition. No production fix, required user setting or complete cause is established. Other qualification observations can continue, but exact AT settings and full AT flows remain unqualified. Physical display/input and real OS IME remain unqualified. Scoped memory still needs exclusive source/index/side retention, mutation/serialization peaks and browser/main/worker/transport observations. The finite installed browser/resource matrix passes; no criteria or production policy are waived.

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
