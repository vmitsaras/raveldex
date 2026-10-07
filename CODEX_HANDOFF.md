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

N0 and **RX-1001–1006** are verified locally through the packed public core and 34-section real-document pilot. See [RX-1006 evidence](docs/evidence/RX-1006.md). The next planner-priority slice is **RX-2004 — Factual explain and Inspector data**; RX-2005 is also dependency-ready. RX-2003 verifies typed metadata filters/exact conjunctive facets; see [evidence](docs/evidence/RX-2003.md). RX-2001 verifies optional source retention and strict phrases; see [evidence](docs/evidence/RX-2001.md). RX-2002 verifies selected positions/original spans and mixed parity; see [evidence](docs/evidence/RX-2002.md). Read the selected card and shared capability/evidence/ranking contracts before implementing one slice. Core remains independently useful; do not publish or activate N5.

`executeSearch` is an internal cursor with complete exact/prefix/Boolean/equality membership, exact totals, bounded heap pagination and opt-in actual numeric facts. Its direct cursor is wrapped by the internal engine's bounded FIFO/promise/deadline/lifecycle implementation. `MutationOwner` captures inputs separately from execution-start root/conflict selection, stages delta-only updates and trusted participant roots, and observes aborts before its one assignment commit. RX-1005 verifies FIFO scheduling, promise rejections, search cancellation, admission-time deadlines, disposal/resource cleanup and real host task yielding. `core/execution/engine.ts` implements `createRaveldex` returning an empty revision-0 engine with the normative ordinary methods. `ExecutionOwner` takes trusted private test roots/participants/host/metrics; the ordinary factory exposes no scheduler/root injection. The root ESM package exposes the actual factory via a frozen bound-method facade, errors and readonly contract types; private roots/callbacks are unreachable through that facade and internal subpaths are excluded. Construction still exposes only an initial revision-0 root, with separately guarded batch/finalization phases. Frequency-only mode retains no original text/occurrences. RX-1006 completes the first usable core alpha milestone. `npm run pilot:core` builds/packs/installs into an isolated offline consumer, records source-oracle/numerical/relevance evidence and measures the full root runtime bundle (currently 16,025 gzip bytes, missing the unchanged 15 KiB target by 665; historical RX-1006 was 12,400). RX-2001 adds public source/phrase factories on explicit optional subpaths. Core itself imports no source/verifier and retains none without registration; RX-2002 provides optional positions/original offsets and mixed phrases. RX-2003 now installs metadata predicates and exact aggregation with owned payload/output data; evidence/UI roles remain later tasks.

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

RX-2004 should expose its specified bounded factual explain/Inspector data from actual native evaluator/scorer facts, including membership/exclusions, positive lexical contributions and revision/resource identity. Read its card and ranking/evidence contracts; ordinary searches must remain free of full trace allocation. Reuse the existing private selected-ID trace seam and narrow trusted capability bridge; typed metadata predicates/facets now share current immutable metadata and budgets. Preserve the explained 15 KiB core target miss as a qualification limitation; do not silently increase the target or delete correctness. RX-2002 original spans remain private pending RX-2005. No UI, worker, snapshot, snippet or deferred N5 feature belongs in this slice.
