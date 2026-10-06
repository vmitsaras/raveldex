# Codex handoff

## Intended next instruction

Paste the following into a Codex session connected to this repository when starting implementation:

```text
Continue Raveldex with the next dependency-ready release-track task.

Read AGENTS.md and PROJECT_CONTEXT.md, run npm ci, npm run check,
and npm run handoff:next. Inspect the selected task card and its specs.
Native TypeScript is the adopted direction; do not reopen the companion
decision, import MiniSearch beneath the core, or reset completed tasks.

Implement one bounded slice with its real behavioral verification.
If a task is already in progress, resume it. Fix concrete failures within
that slice; distinguish a spec decision from an environment failure.
Record acceptance evidence and independent review where required,
synchronize the manifest and generated docs, and report the next task.
Do not publish a package/release or activate deferred N5 work.
```

## Current implementation boundary

N0, **RX-1001 — Data, schema, basic analyzer, limits, and errors** and **RX-1002 — Dictionary, postings, exact retrieval, and independent oracle** are verified locally. See [RX-1001 evidence](docs/evidence/RX-1001.md) and [RX-1002 evidence](docs/evidence/RX-1002.md). The next slice is **RX-1003 — Query evaluation, native BM25, and numerical trace facts**; the planner and task card control readiness/scope. Reuse the captured inputs, shared analyzer and frozen frequency root. The independent source oracle must remain separate from production evaluation/scoring; BM25 needs hand-derived numerical fixtures.

RX-1002 exposes internal normalized-term membership only. RX-1003 adds the full query/ranking contract. RX-1004 implements incremental mutations; RX-1005 integrates FIFO scheduling, promise rejections, cancellation/deadlines and yielding. Construction must exhaust all validation before making a root available; frequency-only mode retains no original text/occurrences. RX-1006 is the core-only public-package real-document consumer and first usable core alpha milestone.

## Daily workflow

```sh
npm ci
npm run check
npm run handoff:status
npm run handoff:next
```

Update the manifest, implement and verify the slice, then:

```sh
npm run docs:generate
npm run check
```

Commit task evidence with the work. The main-branch tracking workflow updates GitHub from the accepted roadmap. `npm run tracking:preview` is local and makes no network requests; `tracking:sync` is an explicit remote write and needs the repository token supplied by the workflow or an authorized maintainer environment.

## End-of-task report

State what exists, what was actually verified, remaining limitations, changed public contracts, the evidence path, and next eligible work. Separate `Blocked` evidence from failures. A valid terminal message can be “release-track backlog complete; publication remains an owner decision.” Do not generate another implementation task merely to avoid reporting completion.
