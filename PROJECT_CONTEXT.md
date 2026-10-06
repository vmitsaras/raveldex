# Project context

Snapshot: 2026-10-06. Repository: `vmitsaras/raveldex`.

## Observed starting point

The private repository's `main` started at `2947dd613c4fe2204554502c86b922a9bc04ab55` with an MIT `LICENSE` and a Node-oriented `.gitignore`. There were no issues or search sources at the inspection. Initialization preserves both existing files.

## Current implementation reality

The repository contains native architecture/behavior specifications, 21 release-track tasks (N0–N4), 10 deferred enhancement tasks (N5), dependency/status tooling, generated roadmap/task documentation, CI for that tooling, and explicit GitHub tracking synchronization. Search runtime, analyzers, ranking, native index, UI, workers, and storage are not implemented here yet.

The bootstrap package is ESM, `private: true`, version `0.0.0`, with zero runtime or development dependencies. Node >=22 runs its tooling; this is not yet a browser support declaration. `tsconfig.json` reserves strict core settings and is not currently claimed as a passing typecheck/build.

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

No native performance, correctness, browser, screen-reader, packaging, or relevance qualification has occurred yet. Name/domain/trademark availability was only preliminary prior planning research; repository creation does not establish clearance. Source-based migration needs a later audit of actual companion files and licensing. Native snapshot portability requires qualified analyzer/environment compatibility as specified.
