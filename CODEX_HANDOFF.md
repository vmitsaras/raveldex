# Codex handoff

## Current boundary

Raveldex follows the adopted native TypeScript direction. N0–N3 implementation and RX-4001/RX-4002 evaluation/qualification have evidence; RX-4003 verifies the private `0.1.0-rc.0` candidate with 625 passing checks and independent review Ready with follow-ups. All 21 active N0–N4 tasks are complete; ten N5 enhancements remain deferred. See [candidate acceptance](docs/evidence/RX-4003.md). Read `AGENTS.md`, `PROJECT_CONTEXT.md`, the canonical task card and its evidence before changing state. The planner determines live task availability.

```sh
npm ci
npm run check
npm run handoff:status
npm run handoff:next
```

The canonical state is `docs/planning/roadmap.json`. Run `npm run docs:generate` after manifest changes. A task is done only with actual acceptance evidence and required independent review. Never reset a completed task to manufacture work. The completed active N0–N4 backlog is a legitimate terminal state; all ten N5 enhancements remain deferred unless explicitly selected.

## Candidate preparation

```sh
npm run candidate:prepare -- --output /tmp/raveldex-candidate-review
```

Use a new directory with an existing parent. Preparation runs the full project check, then packs/installs and verifies the exact built candidate, declarations/import isolation and executable public documentation. It preserves the tarball, closed check log and identity report. `candidate:check` is the focused build/package check; it does not substitute for full preparation. See [preparation](docs/release/PREPARATION.md), [candidate scope](docs/release/CANDIDATE.md), [compatibility](docs/release/COMPATIBILITY.md) and [public API](docs/api/README.md).

The package remains private. Candidate preparation and its manual read-only workflow do not publish, tag, create a release, use release credentials, alter visibility or activate N5. A separate owner publication instruction must cover that action, including a newly reviewed artifact after removing the private guard or changing metadata.

## Preserve the verified boundaries

- Core owns indexing, retrieval, native BM25, atomic writes and execution. No MiniSearch or another search engine belongs beneath it. Compatibility/conversion and comparison remain isolated.
- Core alone retains no original source, positions, offsets, DOM, worker or storage side state. Optional public subpaths and CSS remain independent choices.
- Exact totals, deterministic ranking/order, immutable ownership, explicit capability failures, coherent revisions and typed resource failures remain contractual.
- Native snapshots require the application's exact declared Node qualification. Browser/worker recovery uses complete source. Unknown mutation outcomes do not prove rollback or authorize blind retry.
- RX-4001 relevance failures and the unchanged 15 KiB gzip target miss remain disclosed. Admission through 10,000 records is not a universal capacity or completion guarantee.
- RX-4002 records finite browser/AT/physical sessions, retained-state/process distinctions, managed occupied-operation windows and repeated native wire requested-capacity peaks. It does not claim every VM byte, complete receiver-copy lifetime, physical/global peaks or default-runtime latency. Invalid recordings, typed deadlines, prior failures and source preservation exceptions remain visible. Accepted human observations need no repeat merely because work continues.

The independent candidate verdict and actual commands/artifact identities belong in `docs/evidence/RX-4003.md` and its review/report records. Publication remains an owner decision after release-track completion.

## Tracking and future work

`npm run tracking:preview` is local and makes no network requests. The committed main-branch workflow mirrors accepted task status to GitHub. `tracking:sync` is a remote issue/milestone write requiring an authorized token/environment; local task completion does not itself synchronize GitHub.

For an explicitly selected later change, inspect existing reality, implement one bounded slice, verify actual behavior, record evidence and independent review where required, synchronize affected docs/manifest and commit the work. Distinguish a specification decision, product defect, instrumentation refusal and environment failure. Do not reopen the companion decision or silently broaden support/resource claims.
