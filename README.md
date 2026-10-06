# Raveldex

**Native local search with explainable results and optional feature costs.**

Raveldex is a new TypeScript search library for mutable local collections: application records, documentation, notes, saved content, and modest catalogs. The engine will own its dictionary, postings, ranking, incremental updates, and execution. Additional search capabilities and environment integrations live behind explicit optional entry points.

## Current status

**RX-1001 input contracts and basic analyzer are implemented. A usable search engine is still pending.**

This repository contains validated schema/record/query capture, owned immutable data, `basic-v1` analysis with original UTF-16 token spans, typed errors and finite limit guards, alongside architecture contracts, 21 release-track task cards, 10 deferred tasks, and planning/tracking tools. Current checks verify those primitives and the repository tooling. Retrieval, ranking, atomic mutations, scheduling, browser support and package readiness require later evidence.

The package remains `private: true`, version `0.0.0`. There is no published package, usable search export, runtime dependency, or application demo at this stage. The existing MIT license is retained.

## Start here

| Need | Read |
| --- | --- |
| Current implementation reality | [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) |
| Milestones and progress | [ROADMAP.md](ROADMAP.md) |
| Detailed task cards | [IMPLEMENTATION_TASKS.md](IMPLEMENTATION_TASKS.md) |
| Next Codex session | [CODEX_HANDOFF.md](CODEX_HANDOFF.md) |
| Rules for changing the repository | [AGENTS.md](AGENTS.md) |
| Native architecture | [Native architecture](docs/architecture/NATIVE_ARCHITECTURE.md) |
| Core data and query behavior | [Core contract](docs/specs/CORE_CONTRACT.md) |
| Optional modules | [Add-ons and adapters](docs/architecture/ADDONS_AND_ADAPTERS.md) |
| Verification and comparison | [Verification plan](docs/planning/VERIFICATION_PLAN.md) |
| GitHub synchronization | [Tracking guide](docs/planning/GITHUB_TRACKING.md) |

Browse the [GitHub milestones](https://github.com/vmitsaras/raveldex/milestones) and [task issues](https://github.com/vmitsaras/raveldex/issues?q=is%3Aissue+label%3Atype%3Atask).

## Development

Use Node.js 22 or newer and npm. TypeScript 7.0.2 is the sole direct development dependency; core has no runtime dependencies. Its platform compiler packages are development tooling only. Tests use Node's built-in runner against emitted ESM.

```sh
npm ci
npm run check
npm run test:core
npm run handoff:status
npm run handoff:next
```

`handoff:next` reports dependency eligibility. It does not execute tasks or grant permission for publication. When implementation is requested, take the next eligible task and verify its acceptance criteria before moving on.

`npm run typecheck` checks strict, DOM-free sources and declaration fixtures. `npm run build` emits internal ESM and declarations to ignored `dist/`. There is no root search export or placeholder factory; RX-1006 owns the first packaged real-document consumer. Optional UI and host code will use separate configurations when implemented.

Normal local development requires no environment variables or secrets. Only the explicit GitHub tracking workflow uses the repository's temporary `GITHUB_TOKEN` with `issues: write` and `contents: read` permissions.

## Product boundary

| Layer | Responsibility |
| --- | --- |
| Native core | Validation, basic analysis, dictionary/postings, typed lexical queries, BM25 and numeric trace facts, exact totals, scalar equality, coherent incremental writes, bounded execution. |
| Optional search modules | Source phrases, positions/offsets, structured filters, facets, original-text evidence, snippets, Inspector, native DOM UI. |
| Optional adapters | Worker ownership/transport, snapshots, IndexedDB/recovery, later framework/build integrations. |
| Development references | Independent full-scan oracle and explicitly comparable external-library baselines. |

MiniSearch may be used in isolated comparison or compatibility work. It must never implement the native core. An unused module must add no imported runtime code, retained side index, startup work, or network request to a core-only consumer.

The ≤15 KiB gzip core-only size budget and initial maximum of 10,000 records are design constraints and qualification targets, not achieved results or universal capacity claims.

## Planned source layout

| Path | Purpose |
| --- | --- |
| `src/core/` | Input contracts, analyzer, errors and limits; indexing/execution arrive in later slices. |
| `src/addons/` | Explicitly installed search and presentation capabilities. |
| `src/adapters/` | Optional host/persistence integrations. |
| `examples/` | Core-only real-content pilot, followed by the complete documentation pilot. |
| `test/` | Tooling and input/analyzer/import behavior tests, hand-authored Unicode fixtures and TypeScript contract checks. |
| `scripts/` | Roadmap validation, generated docs, and GitHub synchronization. |
| `docs/` | Architecture, specs, decisions, planning, provenance, and acceptance evidence. |

No website deployment or npm publication is part of initialization. The N4 release review ends with a separate owner publication decision.
