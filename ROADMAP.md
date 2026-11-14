<!-- Generated from docs/planning/roadmap.json by scripts/render-plan.mjs. Run npm run docs:generate; do not edit task data here. -->

# Raveldex roadmap

Raveldex will own indexing, retrieval, ranking, incremental updates, and execution. Advanced matching, presentation, workers, persistence, and integrations remain optional capabilities.

The owner selected the native direction on 2026-10-06 and requested initialization of this new repository. The bootstrap establishes the plan and tooling; it does not implement a usable search engine. The prior companion and its completed tasks are historical inputs, not this repository's active implementation or verification record.

## Current tracked state

**Release progress:** 87/88 done · 0 in progress · 1 dependency-ready.

**Planner state:** `ready`.

**Next or resumable release task:** [RX-9908](IMPLEMENTATION_TASKS.md#rx-9908) — Qualify the integrated site and synchronize the handoff.

Run `npm run handoff:status` and `npm run handoff:next` for the complete explanation. Dependency readiness identifies technical eligibility; the owner's current request determines execution scope. Deferred N5 ideas never enter automatic next-task selection.

## Where to look

- [Canonical task state](docs/planning/roadmap.json): IDs, dependencies, status, acceptance, specifications, and actual evidence.
- [Implementation task cards](IMPLEMENTATION_TASKS.md): the release tasks and verification requirements.
- [Optional feature tracks](docs/planning/OPTIONAL_FEATURES.md): current optional-task states and separately unscheduled research ideas.
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
| **N8 — Dropdown, directory and rich search results** | `RX-7001`–`RX-7006` | 6/6 | Extend the verified consumer UI foundation with compact dropdown search, faceted directory search and rich card/grid results, each backed by complete installed examples. |
| **N9 — Query performance, recovery and matched benchmarks** | `RX-8001`–`RX-8011` | 11/11 | Establish reproducible exact-head evidence, optimize native candidate retrieval and execution, recover admitted source collections safely, and compare equivalent installed search workloads. |
| **N10 — Post-N9 hardening and performance review** | `RX-9001`–`RX-9007` | 7/7 | Conclude the post-N9 engineering review from completed matched measurements and bounded, claim-based recovery qualification; preserve adverse evidence without requiring exhaustive research before product work. |
| **N11 — Raveldex-native consumer identity and usability** | `RX-9101`–`RX-9112` | 12/12 | Create a recognizable Raveldex consumer search experience with clear result context, optional explanations and coherent host-friendly styling; familiar interactions and migration guides support adoption without copying Pagefind. |
| **N12 — Prepare Raveldex for stable 1.0.0** | `RX-9201`–`RX-9205` | 5/5 | Prepare verified 1.0.0 packages, clear documentation and current contributor guidance, with optional polish tracked separately. |
| **N13 — Make the demo welcoming and easy to try** | `RX-9301`–`RX-9304` | 4/4 | Help a new visitor understand, try and adopt Raveldex using natural language and readable results. |
| **N14 — Polish search interfaces and recovery states** | `RX-9401`–`RX-9404` | 4/4 | Refine the five consumer surfaces and visible recovery journeys while preserving native behavior and the existing identity. |
| **N15 — Local demo server reliability** | `RX-9501`–`RX-9502` | 2/2 | Make local demos straightforward to preview and handle occupied ports without changes to search behavior. |
| **N16 — Demonstrate documentation search in the header** | `RX-9601`–`RX-9601` | 1/1 | Use Raveldex itself for clear, modern modal search throughout the demo documentation site. |
| **N17 — Modernize all five consumer demos** | `RX-9701`–`RX-9701` | 1/1 | Make live inline, modal, dropdown, directory and cards examples clear, modern and easy to adopt. |
| **N18 — Continuous Load more** | `RX-9801`–`RX-9801` | 1/1 | Replace the inline/modal window switch with ordered user-triggered append through all exact matches. |
| **N19 — Documentation and demo experience** | `RX-9901`–`RX-9908` | 7/8 | Help developers choose, try and integrate the existing search interfaces through a contextual Astro documentation site, visual gallery and truthful preview/setup pages; plan site-only Tailwind styling without changing native packages or standalone starters. |

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
| [RX-7003](IMPLEMENTATION_TASKS.md#rx-7003) — Directory multi-filter queries and explicit URL state | `done` | `RX-6008`, `RX-2003` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-7003%22) |
| [RX-7004](IMPLEMENTATION_TASKS.md#rx-7004) — Faceted directory controls and installed starter | `done` | `RX-7003` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-7004%22) |
| [RX-7005](IMPLEMENTATION_TASKS.md#rx-7005) — Rich directory result cards and grid presentation | `done` | `RX-7004` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-7005%22) |
| [RX-7006](IMPLEMENTATION_TASKS.md#rx-7006) — Complete solution gallery and family qualification | `done` | `RX-7002`, `RX-7004`, `RX-7005` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-7006%22) |
| [RX-8001](IMPLEMENTATION_TASKS.md#rx-8001) — Reconcile missing historical evidence and establish a green exact-head baseline | `done` | `RX-7006` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-8001%22) |
| [RX-8002](IMPLEMENTATION_TASKS.md#rx-8002) — Freeze matched corpora and instrument query/recovery costs | `done` | `RX-8001` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-8002%22) |
| [RX-8003](IMPLEMENTATION_TASKS.md#rx-8003) — Introduce conservative postings-based query candidate bounds | `done` | `RX-8002` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-8003%22) |
| [RX-8004](IMPLEMENTATION_TASKS.md#rx-8004) — Optimize resumable continuation scheduling without starving hosts | `done` | `RX-8002` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-8004%22) |
| [RX-8005](IMPLEMENTATION_TASKS.md#rx-8005) — Replace exhaustive prefix dictionary scans with bounded seek | `done` | `RX-8002` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-8005%22) |
| [RX-8006](IMPLEMENTATION_TASKS.md#rx-8006) — Hoist revision-invariant BM25 calculations | `done` | `RX-8002` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-8006%22) |
| [RX-8007](IMPLEMENTATION_TASKS.md#rx-8007) — Diagnose admitted 10k source restore work/deadline failures | `done` | `RX-8002` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-8007%22) |
| [RX-8008](IMPLEMENTATION_TASKS.md#rx-8008) — Implement atomic bulk-source restore under existing limits | `done` | `RX-8007` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-8008%22) |
| [RX-8009](IMPLEMENTATION_TASKS.md#rx-8009) — Run paired baseline-versus-optimized native benchmark | `done` | `RX-8003`, `RX-8004`, `RX-8005`, `RX-8006`, `RX-8008` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-8009%22) |
| [RX-8010](IMPLEMENTATION_TASKS.md#rx-8010) — Benchmark equivalently configured search-library alternatives | `done` | `RX-8002` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-8010%22) |
| [RX-8011](IMPLEMENTATION_TASKS.md#rx-8011) — Independently review optimization evidence and practical limits | `done` | `RX-8009`, `RX-8010` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-8011%22) |
| [RX-9001](IMPLEMENTATION_TASKS.md#rx-9001) — Freeze post-N9 artifacts and a validated comparison method | `done` | `RX-8011` | [Issue](https://github.com/vmitsaras/raveldex/issues/94) |
| [RX-9002](IMPLEMENTATION_TASKS.md#rx-9002) — Audit combined lifecycle and recovery hardening coverage | `done` | `RX-9001` | [Issue](https://github.com/vmitsaras/raveldex/issues/95) |
| [RX-9003](IMPLEMENTATION_TASKS.md#rx-9003) — Repair confirmed defects and verify the measurement candidate | `done` | `RX-9002` | [Issue](https://github.com/vmitsaras/raveldex/issues/96) |
| [RX-9004](IMPLEMENTATION_TASKS.md#rx-9004) — Measure matched native build and query performance | `done` | `RX-9003` | [Issue](https://github.com/vmitsaras/raveldex/issues/97) |
| [RX-9005](IMPLEMENTATION_TASKS.md#rx-9005) — Measure incremental update costs and state preservation | `done` | `RX-9003` | [Issue](https://github.com/vmitsaras/raveldex/issues/98) |
| [RX-9006](IMPLEMENTATION_TASKS.md#rx-9006) — Qualify supported recovery paths with bounded evidence reuse | `done` | `RX-9003` | [Issue](https://github.com/vmitsaras/raveldex/issues/99) |
| [RX-9007](IMPLEMENTATION_TASKS.md#rx-9007) — Publish a scoped engineering verdict and remaining limitations | `done` | `RX-9004`, `RX-9005`, `RX-9006` | [Issue](https://github.com/vmitsaras/raveldex/issues/100) |
| [RX-9101](IMPLEMENTATION_TASKS.md#rx-9101) — Define Raveldex identity and consumer interaction contract | `done` | `RX-7006`, `RX-9003` | [Issue](https://github.com/vmitsaras/raveldex/issues/81) |
| [RX-9102](IMPLEMENTATION_TASKS.md#rx-9102) — Lead with Raveldex adoption and separate migration guidance | `done` | `RX-9101` | [Issue](https://github.com/vmitsaras/raveldex/issues/82) |
| [RX-9103](IMPLEMENTATION_TASKS.md#rx-9103) — Clarify idle filter availability and reset behavior | `done` | `RX-9101` | [Issue](https://github.com/vmitsaras/raveldex/issues/83) |
| [RX-9104](IMPLEMENTATION_TASKS.md#rx-9104) — Simplify pagination presentation while preserving focus | `done` | `RX-9101` | [Issue](https://github.com/vmitsaras/raveldex/issues/84) |
| [RX-9105](IMPLEMENTATION_TASKS.md#rx-9105) — Polish search states and recovery messages | `done` | `RX-9101` | [Issue](https://github.com/vmitsaras/raveldex/issues/85) |
| [RX-9106](IMPLEMENTATION_TASKS.md#rx-9106) — Make keyboard guidance discoverable and consistent | `done` | `RX-9101` | [Issue](https://github.com/vmitsaras/raveldex/issues/86) |
| [RX-9107](IMPLEMENTATION_TASKS.md#rx-9107) — Implement Raveldex visual tokens and coherent consumer styling | `done` | `RX-9101` | [Issue](https://github.com/vmitsaras/raveldex/issues/87) |
| [RX-9108](IMPLEMENTATION_TASKS.md#rx-9108) — Provide coherent localization and message customization | `done` | `RX-9105`, `RX-9106`, `RX-9110` | [Issue](https://github.com/vmitsaras/raveldex/issues/88) |
| [RX-9109](IMPLEMENTATION_TASKS.md#rx-9109) — Define native result hierarchy and rich-content compatibility | `done` | `RX-9101` | [Issue](https://github.com/vmitsaras/raveldex/issues/89) |
| [RX-9110](IMPLEMENTATION_TASKS.md#rx-9110) — Explain directory counts and multi-select filtering plainly | `done` | `RX-9101` | [Issue](https://github.com/vmitsaras/raveldex/issues/90) |
| [RX-9111](IMPLEMENTATION_TASKS.md#rx-9111) — Document safe CMS refresh, remount and state preservation | `done` | `RX-9101` | [Issue](https://github.com/vmitsaras/raveldex/issues/91) |
| [RX-9112](IMPLEMENTATION_TASKS.md#rx-9112) — Qualify the Raveldex experience with a finite interaction review | `done` | `RX-9101`, `RX-9102`, `RX-9103`, `RX-9104`, `RX-9105`, `RX-9106`, `RX-9107`, `RX-9108`, `RX-9109`, `RX-9110`, `RX-9111` | [Issue](https://github.com/vmitsaras/raveldex/issues/92) |
| [RX-9201](IMPLEMENTATION_TASKS.md#rx-9201) — Prepare stable package metadata and verification tooling | `done` | None | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-9201%22) |
| [RX-9202](IMPLEMENTATION_TASKS.md#rx-9202) — Prune development notes and publish normal consumer guides | `done` | `RX-9201` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-9202%22) |
| [RX-9203](IMPLEMENTATION_TASKS.md#rx-9203) — Simplify contributor and agent onboarding | `done` | `RX-9202` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-9203%22) |
| [RX-9204](IMPLEMENTATION_TASKS.md#rx-9204) — Verify final packages and refresh the documentation site | `done` | `RX-9201`, `RX-9202`, `RX-9203` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-9204%22) |
| [RX-9205](IMPLEMENTATION_TASKS.md#rx-9205) — Create native polish issue trees and synchronize the release handoff | `done` | `RX-9204` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-9205%22) |
| [RX-9301](IMPLEMENTATION_TASKS.md#rx-9301) — Help visitors choose and try a search interface | `done` | `RX-9205` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-9301%22) |
| [RX-9302](IMPLEMENTATION_TASKS.md#rx-9302) — Use everyday labels, counts and search guidance | `done` | `RX-9205` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-9302%22) |
| [RX-9303](IMPLEMENTATION_TASKS.md#rx-9303) — Make demo result excerpts readable and explanation optional | `done` | `RX-9205` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-9303%22) |
| [RX-9304](IMPLEMENTATION_TASKS.md#rx-9304) — Simplify advanced controls and starter adoption | `done` | `RX-9205` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-9304%22) |
| [RX-9401](IMPLEMENTATION_TASKS.md#rx-9401) — Polish inline and modal states and hierarchy | `done` | `RX-9205` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-9401%22) |
| [RX-9402](IMPLEMENTATION_TASKS.md#rx-9402) — Polish compact dropdown and full-results handoff | `done` | `RX-9205` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-9402%22) |
| [RX-9403](IMPLEMENTATION_TASKS.md#rx-9403) — Polish directory filters and rich result layouts | `done` | `RX-9205` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-9403%22) |
| [RX-9404](IMPLEMENTATION_TASKS.md#rx-9404) — Review optional-feature and adapter recovery journeys | `done` | `RX-9205` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-9404%22) |
| [RX-9501](IMPLEMENTATION_TASKS.md#rx-9501) — Choose a free port when the UI pilot port is occupied | `done` | `RX-9404` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-9501%22) |
| [RX-9502](IMPLEMENTATION_TASKS.md#rx-9502) — Explain how to preview all demo pages from the README | `done` | `RX-9501` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-9502%22) |
| [RX-9601](IMPLEMENTATION_TASKS.md#rx-9601) — Integrate and refine the shared header search modal | `done` | `RX-9502` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-9601%22) |
| [RX-9701](IMPLEMENTATION_TASKS.md#rx-9701) — Modernize galleries and standalone consumer demos | `done` | `RX-9601` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-9701%22) |
| [RX-9801](IMPLEMENTATION_TASKS.md#rx-9801) — Keep Load more appending through all matches | `done` | `RX-9701` | [Issue](https://github.com/vmitsaras/raveldex/issues?q=in%3Atitle%20%22RX-9801%22) |
| [RX-9901](IMPLEMENTATION_TASKS.md#rx-9901) — Establish site-only styling and contextual navigation | `done` | `RX-9801` | [Issue](https://github.com/vmitsaras/raveldex/issues/119) |
| [RX-9902](IMPLEMENTATION_TASKS.md#rx-9902) — Lead the examples overview with five visual choices | `done` | `RX-9901` | [Issue](https://github.com/vmitsaras/raveldex/issues/120) |
| [RX-9903](IMPLEMENTATION_TASKS.md#rx-9903) — Complete the Inline preview and installation pilot | `done` | `RX-9901` | [Issue](https://github.com/vmitsaras/raveldex/issues/121) |
| [RX-9904](IMPLEMENTATION_TASKS.md#rx-9904) — Review and approve the rendered pilot before rollout | `done` | `RX-9902`, `RX-9903` | [Issue](https://github.com/vmitsaras/raveldex/issues/122) |
| [RX-9905](IMPLEMENTATION_TASKS.md#rx-9905) — Apply the reviewed template to modal and dropdown | `done` | `RX-9904` | [Issue](https://github.com/vmitsaras/raveldex/issues/123) |
| [RX-9906](IMPLEMENTATION_TASKS.md#rx-9906) — Apply the reviewed template to directory and rich results | `done` | `RX-9904` | [Issue](https://github.com/vmitsaras/raveldex/issues/124) |
| [RX-9907](IMPLEMENTATION_TASKS.md#rx-9907) — Give guides and API reference distinct reading layouts | `done` | `RX-9904` | [Issue](https://github.com/vmitsaras/raveldex/issues/125) |
| [RX-9908](IMPLEMENTATION_TASKS.md#rx-9908) — Qualify the integrated site and synchronize the handoff | `planned` | `RX-9905`, `RX-9906`, `RX-9907` | [Issue](https://github.com/vmitsaras/raveldex/issues/126) |

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

### N9 — Query performance, recovery and matched benchmarks

- Exact-head CI and candidate artifacts pass with truthful historic-evidence provenance and original source/models preserved.
- Candidate enumeration, scheduling, prefix lookup and scoring-invariant changes have paired measurements and independent semantic/lifecycle regression evidence.
- Source recovery has an accepted bounded atomic path for the target workload; unresolved capacity decisions remain explicitly blocked, not hidden behind limit increases.
- A version-pinned, semantics-matched competitive report separates true work/latency, exact counts, recovery outcomes, product overhead and unsupported modes.
- Independent review records supported performance and recovery claims without publishing, changing the native scoring policy or activating new optional features.

### N10 — Post-N9 hardening and performance review

- Preserved sources, artifacts and frozen historical methods remain identifiable; new scoped qualification has a dated method and is never pooled into an incomplete older collection.
- Exact results, atomic state, native limits, receipts, cancellation and essential failure recovery remain strictly verified for every claimed supported configuration.
- Completed query/update cohorts and recovery outcomes have independent review and explicit limits; the full 204-context/450-minute recovery experiment is optional, not a mandatory milestone exit.
- A finite scoped conclusion states gains, regressions, safe refusals and unknowns without universal capacity, latency, memory, accessibility or publication claims.

### N11 — Raveldex-native consumer identity and usability

- One implemented Raveldex visual and interaction direction defines hierarchy, density, typography, spacing, emphasis and state treatments across inline, modal, dropdown, directory and cards; competitor resemblance is not an acceptance criterion.
- First-time Raveldex integration is the primary journey; optional Pagefind migration material states differences honestly without dictating APIs, layout or feature parity.
- Search, filters, paging, reset/retry, localization and CMS lifecycle remain understandable and preserve exact native results, focus, composition, safe rendering and cleanup.
- Risk-based installed behavior/visual checks and a focused human accessibility walkthrough qualify the changed candidate; unobserved expanded combinations remain explicit limitations instead of triggering an exhaustive benchmark/platform prerequisite.
- N11 proceeds independently of comparative N10 research using stable public contracts and isolated artifacts; no new engine capability, dependency, deployment or publication is implied.

### N12 — Prepare Raveldex for stable 1.0.0

- Every task has scoped observable acceptance and recorded verification; existing accepted work is preserved.
- Public behavior, documentation and tracking agree; optional polish is not presented as implemented.
- No publication, deployment, visibility change, commit or push is part of this work.

### N13 — Make the demo welcoming and easy to try

- Every task has scoped observable acceptance and recorded verification; existing accepted work is preserved.
- Public behavior, documentation and tracking agree; unfinished follow-up work is not presented as completed.
- No publication, deployment, visibility change, commit or push is part of this work.

### N14 — Polish search interfaces and recovery states

- Every task has scoped observable acceptance and recorded verification; existing accepted work is preserved.
- Public behavior, documentation and tracking agree; completion claims match the recorded scope and retain manual qualification limits.
- No publication, deployment, visibility change, commit or push is part of this work.

### N15 — Local demo server reliability

- The selected local-server bug is reproduced, fixed and verified with actual socket collisions.

### N16 — Demonstrate documentation search in the header

- The shared header opens the real installed modal with native documentation results and verified loading, keyboard, focus and responsive behavior.

### N17 — Modernize all five consumer demos

- All five galleries and eight standalone projects share coherent presentation, verified native behavior and accurate complete downloads.

### N18 — Continuous Load more

- Load more appends all matches without replacement windows, preserving query consistency, focus and finite admission/batch bounds.
- Shared, modal, installed starter and real header regressions agree with current documentation and final candidate/site verification.

### N19 — Documentation and demo experience

- The owner explicitly approves a working shared-shell, examples-overview and Inline pilot before rollout; the recorded approval identifies the candidate.
- All five interface pages and representative guide/API templates use the approved presentation, preserve routes/anchors and reflect the exact five-presentation/eight-starter inventory.
- Actual site, archive/source, navigation, keyboard/reflow, package and publication-boundary checks have scoped current evidence; essential defects are repaired and manual limits are explicit.
- Canonical statuses, generated documents and targeted GitHub native sub-issues agree. Registration is planning only; implementation, dependency installation, commit/push and publication are not authorized by this milestone setup.

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
