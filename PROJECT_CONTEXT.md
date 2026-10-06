# Project context

Snapshot: 2026-10-06. Repository: `vmitsaras/raveldex`.

## Observed starting point

The private repository's `main` started at `2947dd613c4fe2204554502c86b922a9bc04ab55` with an MIT `LICENSE` and a Node-oriented `.gitignore`. There were no issues or search sources at the inspection. Initialization preserves both existing files.

## Current implementation reality

N0 foundation/design reconciliation, RX-1001 input/analyzer primitives and RX-1002 frequency indexing/exact lookup are verified locally. The next dependency-ready task is RX-1003 (GitHub issue #11). Six milestones and 37 linked issues exist. Run the planner for live state after this snapshot. Evidence is in [RX-1001.md](docs/evidence/RX-1001.md) and [RX-1002.md](docs/evidence/RX-1002.md). GitHub tracking follows the accepted main-branch manifest; a local task commit does not itself synchronize remote state.

The repository contains native architecture/behavior specifications, 21 release-track tasks (N0–N4), 10 deferred enhancement tasks (N5), planning/tracking tools, and native internal sources. `src/core/` validates and owns schema/configuration, records/batches/removal IDs, typed queries and options; it provides one resumable `basic-v1` analyzer, typed sanitized errors, and finite limit/count guards. Frequency-only construction adds field-aware dictionary/postings, per-document reverse frequencies/lengths, field populations/token lengths and canonical equality metadata. Exact normalized-term lookup unions complete selected-field membership. Full query evaluation/ranking, incremental mutations, the FIFO scheduler, UI, workers and storage remain planned.

The package is ESM, `private: true`, version `0.0.0`, with zero runtime dependencies. TypeScript 7.0.2 is pinned as the only direct development dependency; its platform binary packages stay outside the core import graph. Node's built-in test runner needs no added test framework. Strict DOM-free typecheck/build and 149 tests pass locally on Node 24.21.0/macOS 27.0.1 arm64; CI is configured for Node 22 and was not run remotely in this slice. No root package search entry exists yet.

Admission helpers synchronously copy bounded structure and primitive values. Generator consumption performs UTF-16/content checks and token analysis with work-v1 charges. They throw internally; the future engine must convert operational validation errors to promise rejections. Input snapshots are frozen; live cancellation signals remain explicit host handles. `IndexConstruction` captures separately bounded batches, keeps staging private and returns one frozen revision-0 root only after finalization; any failed/abandoned batch or finalization makes construction terminal. It is an internal construction seam, not a public mutation API. Core retains no original text or occurrence/value/offset side index. Logical corpus input-size counters remain available. Sparse 256-slot bucket directories support the future touched-bucket staging design; incremental copy-on-write updates have not been implemented or measured. Deadlines, host yielding and cancellation still need RX-1004–1005 integration.

## Decisions and authority

The owner chose a separate fresh native search repository following the LocalSearch companion work and Raveldex planning discussion. See [native direction ADR](docs/decisions/0001-native-direction.md). The companion is a migration/reference input, not source code or evidence already imported here. Prior benchmark/test/AT claims are not inherited by the native engine.

The prior generated eight-document bundle was not present in this checkout. The new repository documents reconcile the owner-provided conversation and project standards; they are not represented as byte-for-byte copies of that bundle. Preserved IDs use implementation-focused task boundaries suitable for this repository.

## State ownership

- `docs/planning/roadmap.json`: authoritative task and dependency data.
- `ROADMAP.md`, `IMPLEMENTATION_TASKS.md`: generated human views.
- `docs/specs/`: intended observable native behavior, with status explicitly distinguished from implementation.
- `docs/architecture/`: component boundaries and design trade-offs.
- `docs/evidence/`: actual verification/review records, never future filenames masquerading as evidence.
- GitHub issues/milestones: linked tracking views, synchronized by an explicit repository workflow.

Run `npm run handoff:status` for current counts rather than relying on a historical narrative. Run `npm run handoff:next` for the next eligible work. N1 must end with real-document search through the public native package; N2/N3 make the optional product capabilities usable; N4 qualifies a release candidate.

## Known limits

Exact retrieval has 444 complete membership comparisons against independently specified expectations/source scans, including fixed-seed generated corpora and 10,000 admitted records. Invariants and construction work/retained-structure counts are observed at 100/1,000/10,000 records in [the raw diagnostics](docs/evidence/RX-1002-counts.json); these are not heap bytes, peak memory or latency measurements. Native full-query/ranking correctness, performance, browser, screen-reader, packaging and relevance qualification remain pending. Analyzer fixtures cover one unqualified local host and do not establish cross-host native snapshot portability. Name/domain/trademark availability was only preliminary prior planning research; repository creation does not establish clearance. Source-based migration needs a later audit of actual companion files and licensing.
