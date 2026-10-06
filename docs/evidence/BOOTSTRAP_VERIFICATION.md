# Verification — Raveldex repository bootstrap

Date: 2026-10-06. Specification: [Repository bootstrap](../specs/REPOSITORY_BOOTSTRAP.md). Starting remote commit: `2947dd613c4fe2204554502c86b922a9bc04ab55`.

## Initial execution state

**Partially verified — remote initialization is pending in this initial record.** RX-0001 remains in progress; RX-0002 remains planned until its dependency and the complete contract review are satisfied. No N1 search task is complete.

## Scope and environment

The change creates project guidance, adopted native architecture/behavior specifications, a canonical roadmap with generated task views, dependency-free bootstrap tooling/tests, GitHub synchronization, templates, and future source ownership notes. It implements no search runtime.

Local checks use Linux, Node `v24.19.0`, and npm `11.9.0`. Hosted CI targets Node 22 and is not yet observed in this initial record. Existing license/ignore content is preserved; Git blob hashes are `0ab23d353818b7caa555c0a5fc1927ab127d4575` (LICENSE) and `1301e01e5873a3fe085e2d5756824ee9d9171133` (.gitignore), matching the initial repository.

## Checks completed so far

- `node --test test/tooling/*.test.mjs`: 49 passed, zero failed/skipped/cancelled.
- `node --check scripts/sync-github.mjs` and `node --check scripts/check-docs.mjs`: passed.
- `npm install --package-lock-only --ignore-scripts --no-audit --no-fund` and `npm ci --ignore-scripts --no-audit --no-fund`: dependency-free lockfile/install passed.
- `npm run check`: passed manifest validation (31 tasks, 6 milestones), all three generated views, local targets in 25 Markdown files, and all 49 tooling tests.
- `npm run tracking:preview`: passed; predicts six milestones, six overview issues, and 31 task issues, with no network requests.
- `npm pack --dry-run --json --ignore-scripts`: package-content inspection passed for the documentation/tooling scaffold; no built search runtime is present.
- `git diff --cached --check`: passed.
- Independent numerical recalculation agrees with the ranking fixture: `idf = 0.47000362924573563`, AND score for a `0.9567714096509212`, b `0.9400072584914713`. These validate example arithmetic, not an engine.
- Host-level checks of the documented basic analyzer examples confirm original UTF-16 ranges and stated normalization on this Node environment. They do not establish cross-host Unicode portability or an implemented analyzer.

## Acceptance matrix at initial commit

| Criterion | Status | Evidence / remaining observation |
| --- | --- | --- |
| AC-01 existing content and baseline | Pass | Exact blob hashes above and repository metadata inspection. |
| AC-02 native contracts and boundaries | Pass | All five native architecture/spec documents received independent review; concrete clarifications applied. |
| AC-03 task plan | Pass | 21 release tasks and 10 deferred enhancements with criteria/dependencies; full graph and file-aware validation passed. |
| AC-04 runnable truthful scaffold | Pass | Integrated npm ci/check/status/next/preview commands and scaffold pack inspection. |
| AC-05 behavior and generated views | Pass | 49 tests; canonical generated views and 25 Markdown local-link targets validated. |
| AC-06 main, milestones and issues | Blocked | Remote write and read-back pending. |
| AC-07 independent review / next task | Blocked | [Review record](BOOTSTRAP_REVIEW.md); final acceptance awaits remaining observations. |

## Limits

No compiler/build/exports/runtime exists to qualify; no native npm-consumer, real-document pilot, search correctness, relevance, browser, AT, retained/peak-memory, or device-presentation tests have run. The current green tests concern tooling only. No old companion result is counted as native proof.

This record will be updated with actual integrated/hosted results and issue/milestone links after the authorized initialization completes.
