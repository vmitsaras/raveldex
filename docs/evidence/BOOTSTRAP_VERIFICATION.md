# Verification — Raveldex repository bootstrap

Date: 2026-10-06. Result: **Verified for repository initialization and native design reconciliation.**

Specification: [Repository bootstrap](../specs/REPOSITORY_BOOTSTRAP.md). Review: [Independent review](BOOTSTRAP_REVIEW.md).

## Outcome and implementation

The foundation is committed, hosted checks passed, and six GitHub milestones plus 37 linked issues were created and read back. RX-0001 and RX-0002 are accepted; RX-1001 is the next dependency-ready task. No native search capability is implemented or qualified by this record.

The initial repository contained LICENSE and .gitignore at `2947dd613c4fe2204554502c86b922a9bc04ab55`. The reviewed foundation was committed as [cb10d278e82f306d4783e2759437d1b28597e197](https://github.com/vmitsaras/raveldex/commit/cb10d278e82f306d4783e2759437d1b28597e197): 43 new files, 45 total tracked files at that commit. This follow-up records completed N0 state and verified GitHub links.

The baseline Git blob hashes remain identical: LICENSE `0ab23d353818b7caa555c0a5fc1927ab127d4575`; .gitignore `1301e01e5873a3fe085e2d5756824ee9d9171133`. Both were checked in the resulting remote tree.

## Environments and commands

| Environment | Observed versions / scope |
| --- | --- |
| Local Linux | Node `v24.19.0`, npm `11.9.0`; bootstrap commands and tests. |
| GitHub Linux runner | Node `v22.23.3`, npm `10.9.9`; install, full check, tracking preview. |
| GitHub synchronization | Main-branch workflow with contents-read and issues-write permissions; actual tracking read-back. |

| Check | Result | What it establishes |
| --- | --- | --- |
| `npm ci --ignore-scripts --no-audit --no-fund` | Pass, local and hosted | Dependency-free scaffold lockfile/install is usable. |
| `npm run check` | Pass, local and hosted | Manifest, generated docs, Markdown targets, and tooling tests agree. |
| `npm run handoff:check` | Pass | 31 tasks, 6 milestones; valid graph, states, schema and file references. |
| `npm run docs:check` | Pass | Three generated views match; local links in 25 Markdown files resolve. External URLs/fragment anchors are not certified by this check. |
| `node --test test/tooling/*.test.mjs` | 49 pass; 0 fail/skip/cancel | Planner and tracking behavior, invalid states, collisions, preservation, pagination, closure, idempotency, and false-read-back prevention. |
| `npm run tracking:preview` | Pass | Six milestones, six overviews, 31 task issues predicted without network calls. |
| `npm pack --dry-run --json --ignore-scripts` | Pass | Scaffold package contents inspected; no built search API is present. |
| Script syntax and `git diff --cached --check` | Pass | No checked script syntax or patch whitespace failure. |
| Remote tree and issue inventory | Pass | Existing files preserved; all intended files and 37 stable issue identities exist with correct criteria, milestones, prerequisite links and overview checklists. |

The tracking behavior tests use an injected REST simulation; the real hosted workflow separately verifies live GitHub behavior. An unchanged simulated rerun performs zero mutations. Real synchronization discovers stable owned IDs instead of blindly recreating issues.

## Remote evidence

- [Initial implementation commit](https://github.com/vmitsaras/raveldex/commit/cb10d278e82f306d4783e2759437d1b28597e197).
- [Hosted repository checks — success](https://github.com/vmitsaras/raveldex/actions/runs/37489609090).
- [Initial tracking creation/read-back — success](https://github.com/vmitsaras/raveldex/actions/runs/37489609149).
- [N0 overview](https://github.com/vmitsaras/raveldex/issues/1), [RX-0001](https://github.com/vmitsaras/raveldex/issues/7), [RX-0002](https://github.com/vmitsaras/raveldex/issues/8).
- [Next native task: RX-1001](https://github.com/vmitsaras/raveldex/issues/9).
- [Milestones](https://github.com/vmitsaras/raveldex/milestones) and [verified ID/number map](../planning/github-links.json).

The successful synchronization log records a complete nonsecret `TRACKING_JSON` mapping. The root also independently checked a fresh REST inventory: 37 owned issues, six distinct assigned milestones, no duplicated IDs, and no missing acceptance/specification/dependency/checklist links. N0 closure is derived from the accepted states committed in this follow-up; subsequent workflow results remain visible in Actions.

## Bootstrap acceptance matrix

| Criterion | Status | Evidence |
| --- | --- | --- |
| AC-01 existing content and baseline | Pass | Initial commit and identical remote LICENSE/.gitignore hashes. |
| AC-02 native contracts and boundaries | Pass | Independent review of all five native documents; concrete findings resolved. |
| AC-03 complete task plan | Pass | 21 release tasks, 10 deferred enhancements; graph/file-aware checks and peer review. |
| AC-04 runnable truthful scaffold | Pass | Local/hosted commands, private ESM metadata, explicit no-runtime state. |
| AC-05 behavior and generated views | Pass | 49 behavior tests, three canonical generated views, local link validation. |
| AC-06 main, milestones and issues | Pass | Implementation commit, successful sync, independent 37-issue read-back. |
| AC-07 independent review / next task | Pass | Review record, scoped evidence, N0 acceptance and RX-1001 eligibility. |

## N0 task-specific acceptance

These are foundation/design results, not runtime verification of the specified search behavior.

| Task criterion | Status | Evidence |
| --- | --- | --- |
| RX-0001-AC01 guidance/current state | Pass | README, AGENTS, context, handoff, ADR, and independent review agree. |
| RX-0001-AC02 package scaffold | Pass | Private ESM metadata, strict future core TypeScript settings, zero dependencies, no fake search export. |
| RX-0001-AC03 task/evidence state | Pass | Canonical counts/graph and actual-evidence-only rules. |
| RX-0001-AC04 planner terminal states | Pass | Ready/resume/block/decision/deferred/completed behavior and negative fixtures. |
| RX-0001-AC05 live GitHub tracking | Pass | Six milestones and 37 issues with correct criteria, dependencies and specification links. |
| RX-0001-AC06 historical separation | Pass | ADR/context/provenance preserve companion history without importing results. |
| RX-0002-AC01 observable contracts | Pass | Reviewed API/schema/analysis/query/equality/results/revisions/errors. |
| RX-0002-AC02 numerical ranking | Pass | Ranking review and independently recalculated fixture. |
| RX-0002-AC03 mutation/execution | Pass | Incremental preparation, FIFO, commit, cancellation, disposal, bounded work and failure semantics reviewed. |
| RX-0002-AC04 defensive bounds | Pass | Named finite caps and 15 KiB gzip planning target with distinct measurement rules. |
| RX-0002-AC05 optional contracts | Pass | Registration, effects, providers, transactions, source/positional parity reviewed. |
| RX-0002-AC06 verification separation | Pass | Independent oracle, relevance, fair costs, package, browser/AT/resource evidence plan. |
| RX-0002-AC07 no hidden blocker | Pass | Independent review has no remaining blockers; native direction is already adopted. |

The ranking example was independently recalculated: `idf = 0.47000362924573563`, AND score for a `0.9567714096509212`, b `0.9400072584914713`. Host checks confirmed the documented analyzer example tokens and original UTF-16 ranges on the local Node version. These validate example arithmetic/host behavior, not an implemented analyzer or general Unicode portability.

## Findings repaired

Tracking could initially accept an ignored milestone state change or mutate ambiguous issue/milestone ownership before failing. Reproductions now pass with preflight rejection and canonical final-state read-back. Related fixes enforce stable IDs and avoid misleading optional-ready labels. Contract review clarified synchronous ownership capture versus queued scanning, reduced-capacity implicit hit limits, conditional original-offset parity, duplicate keys discarded before the API, and provenance before first source reuse.

## Remaining limits

The search runtime, compiler/build/output exports, real-document search, packaged native consumers, ranking/correctness, relevance, browser/UI/AT, retained/peak memory, and physical presentation remain unimplemented or unmeasured here. No such criterion is converted to Pass. No package, tag, public release, website, visibility change, or companion migration was performed.

**Bootstrap verified; N0 complete. Next: RX-1001.**
