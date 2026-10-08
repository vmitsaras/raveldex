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

N0 and **RX-1001–1006** are verified locally through the packed public core and 34-section real-document pilot. See [RX-1006 evidence](docs/evidence/RX-1006.md). RX-2006 now verifies the optional native DOM UI and real packaged documentation browser pilot with independent review Ready with follow-ups; see [its evidence](docs/evidence/RX-2006.md). RX-3001 adds the explicit one-owner module-worker adapter and direct/worker documentation pilot; see [its evidence](docs/evidence/RX-3001.md). RX-3002 verifies optional source/native snapshots locally; see [its evidence](docs/evidence/RX-3002.md). The next planner-priority slice is **RX-3003 — IndexedDB persistence, recovery, and namespace erasure**. RX-2005 verifies optional original ranges and bounded grapheme-safe snippets with independent review Ready with follow-ups; see [evidence](docs/evidence/RX-2005.md). RX-2004 verifies optional factual Inspector data and explicit bounded diagnostic exports; see [evidence](docs/evidence/RX-2004.md). RX-2003 verifies typed metadata filters/exact conjunctive facets; see [evidence](docs/evidence/RX-2003.md). RX-2001 verifies optional source retention and strict phrases; see [evidence](docs/evidence/RX-2001.md). RX-2002 verifies selected positions/original spans and mixed parity; see [evidence](docs/evidence/RX-2002.md). Read the selected card and shared capability/evidence/ranking contracts before implementing one slice. Core remains independently useful; do not publish or activate N5.

`executeSearch` is an internal cursor with complete exact/prefix/Boolean/equality membership, exact totals, bounded heap pagination and opt-in actual numeric facts. Its direct cursor is wrapped by the internal engine's bounded FIFO/promise/deadline/lifecycle implementation. `MutationOwner` captures inputs separately from execution-start root/conflict selection, stages delta-only updates and trusted participant roots, and observes aborts before its one assignment commit. RX-1005 verifies FIFO scheduling, promise rejections, search cancellation, admission-time deadlines, disposal/resource cleanup and real host task yielding. `core/execution/engine.ts` implements `createRaveldex` returning an empty revision-0 engine with the normative ordinary methods. `ExecutionOwner` takes trusted private test roots/participants/host/metrics; the ordinary factory exposes no scheduler/root injection. The root ESM package exposes the actual factory via a frozen bound-method facade, errors and readonly contract types; private roots/callbacks are unreachable through that facade and internal subpaths are excluded. Construction still exposes only an initial revision-0 root, with separately guarded batch/finalization phases. Frequency-only mode retains no original text/occurrences. RX-1006 completes the first usable core alpha milestone. `npm run pilot:core` builds/packs/installs into an isolated offline consumer, records source-oracle/numerical/relevance evidence and measures the full root runtime bundle (currently 16,631 gzip bytes, missing the unchanged 15 KiB target by 1,271; historical RX-1006 was 12,400). RX-2001 adds public source/phrase factories on explicit optional subpaths. Core itself imports no source/verifier and retains none without registration; RX-2002 provides optional positions/original offsets and mixed phrases. RX-2003 now installs metadata predicates and exact aggregation with owned payload/output data; RX-2004 installs selected factual evidence; RX-2006 now adds optional native UI and Inspector presentation with separate DOM compilation and CSS.

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

RX-2005 now implements original field/value UTF-16 token ranges and bounded grapheme-safe source snippet data through explicit optional factories. Range-only imports exclude segmentation; offsets without originals provide ranges while snippets explicitly require same-revision source. One evidence extension may be requested per operation, including Inspector. Actual successful Boolean/phrase paths constrain occurrences; bounded display omissions never rewrite complete ranges, totals or scores. The explained unchanged 15 KiB target miss remains visible.

Next is **RX-3003 — IndexedDB persistence, recovery, and namespace erasure**. Read its actual card and explicit storage/generation/erase/recovery contract. RX-3002 supplies separate validated source/native snapshots and atomic next-local-revision import. Ordinary owners remain unqualified; native import requires the exact trusted Node qualification declaration created with its owner. Local source/native behavior, corrupt input, work limits, stops and packaged document round trips are recorded; no cross-host/browser Unicode portability is inferred. The 10,000-record source rebuild measurement can hit the unchanged work cap and must preserve old state; do not raise limits to hide it. RX-3001 worker execution/receipts remain available, but worker snapshot proxies are outside RX-3002. Persistence must keep database/namespace ownership, explicit save/load/erase, conflict/unknown outcomes and complete erasure distinct from in-memory disposal. AT, OS IME, cross-browser and physical memory/latency qualification remain open. N5 stays deferred; no publication.
