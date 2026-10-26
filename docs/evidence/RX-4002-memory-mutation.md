# RX-4002 — Actual precommit mutation state and cleanup

Date: 2026-10-26. Outcome: **Observed with limits** for old/candidate coexistence and direct root/document cleanup. RX-4002-AC03 remains **Partial / Blocked** for allocation peaks, codec buffers and separately measured transport work/peak copies. No acceptance criterion, public contract, dependency, limit or release claim changes.

The [frozen raw report](RX-4002-memory-mutation.json), twelve adjacent compressed numeric cohorts, [independent audit](RX-4002-memory-mutation-independent-audit.json) and [review](RX-4002-memory-mutation-review.md) preserve the observations. The raw report is 270,112 bytes, SHA-256 `8b88650d0ff2f0da2c2751db366021616ba1fcd8c4373f9a5325c8fae50f1e5d`. Full synthetic heaps remain at its recorded task-owned temporary paths: 12 dumps, 215,904,864 bytes. Numeric cohorts contain 1,549,208 rows in 4,186,392 compressed bytes. The seven earlier memory reports, installed tarball and all 208 production files are hashed before/after and unchanged.

## Scope and method

Six fresh serial Node 24.21.0 processes exercise **core-only**, **source-phrase**, and **positions-offsets**, each at 1,000 and 10,000 admitted ASCII records. Each uses the existing installed tarball SHA-256 `6ff6e90128f60af39bb8f47800c61ed83d85d4ded7a8e3c96d2bd34467f9c437`, 256-record build batches, ordinary public replacement/search/disposal, unchanged defensive/work limits and a 60,000ms deadline. The child directly records Node/V8, PID, Darwin 27.0.0 and arm64. This is instrumented Node evidence; historical macOS/browser/device metadata is not silently refreshed.

An observation-only private `getExecutionOwner`/`admit` seam runs the actual installed mutation generator. A separate observer worker attaches using `Session.connectToMainThread`; same-thread breakpoint sessions are avoided as recommended by the [matching Node inspector documentation](https://nodejs.org/download/release/v24.21.0/docs/api/inspector.html#support-of-breakpoints). At the first native `precommit` boundary, it verifies the complete compiled `consume` script hash and current source line, then reads its actual lexical `old`, final `root`, intermediate `core`, `context`, `changes` and admitted `request`. Missing/optimized-out/wrong bindings refuse capture rather than inferring roles from object shape.

Checks establish distinct frozen old/candidate roots, revision +1, identical configuration, final core-data aliases, the intermediate core's deliberately old participants, final newly prepared participants, and the exact changed record. The main observer confirms `old === owner.root` before and after the synchronous dump. The old/new changed document differs; the untouched document shares identity. Independent parsing subsequently verifies **every** document: only `item:00000` differs and all size−1 remaining entries share exact identity in that dump. The same check passes for source/position participant records in all eight applicable dumps. These are single-snapshot relationships, unaffected by the quarantined cross-snapshot identity method.

Each dump has six application-data seeds: old and candidate documents, dictionary/postings/statistics, and participant maps. Admitted request and changes are separate groups. In particular, `context.previous` and `core.participants` are not treated as candidate-only data. The parser traverses named data properties, elements, properties/elements backing storage, frozen-array numeric internal edges and string parents. It excludes prototype, map, code, weak and hidden **edges**. Selected nodes can still contain VM representation overhead; this is not a pure-payload or collector model. Rows contain only same-dump node ID, type, self-size and eight-bit membership. Every union counts a shared node once. Root/context wrappers are listed separately from component sums.

After each dump the marker is removed. The first operation commits; the second attempts the inverse replacement and cancels at precommit through the caller's AbortController. Debugger sessions disconnect and workers exit; caller controller bindings are released. Three setImmediate → explicit GC → 25ms cycles precede direct WeakRef/control readings. Public disposal and another settling stage verify final root collection. The child never parses a heap or retains dereferenced targets across GC.

The [Node V8 documentation](https://nodejs.org/download/release/v24.21.0/docs/api/v8.html#v8writeheapsnapshotfilenameoptions) defines the dump as one isolate and warns about synchronous blocking/additional memory. Observer-worker heap is outside the main-isolate dump; process RSS includes that worker and instrumentation. Raw before/after/settling readings are retained without subtracting a guessed observer cost. The initial baseline precedes optional imports; it is not a matched optional-module subtraction. One intrusive run per configuration/size contains both outcomes, not three repeated peak measurements. The earlier [separate repeated sample pass](RX-4002.md) stays frozen and is not rerun or promoted to allocation-peak evidence.

## Observed outcomes

All six builds, six committed replacements, six expected `CANCELLED` refusals and six final disposals pass. Forty-eight query checks verify complete literal totals, correct revisions, bounded page counts, unique eligible IDs and finite scores. At 1,000/10,000 records, the original selective totals are 27/271, committed totals 28/272; source/position strict phrase totals change 334/3,334 → 333/3,333. Revisions change 4/40 → 5/41. The cancelled inverse preserves the committed counts and revision.

Commit-dump **selected graph self-size bytes**, not allocation or peak bytes:

| Configuration | Records | Old-only | Candidate-only | Shared | Deduplicated data union |
| --- | ---: | ---: | ---: | ---: | ---: |
| Core | 1,000 | 72,312 | 72,288 | 1,380,488 | 1,525,088 |
| Core | 10,000 | 88,344 | 88,320 | 11,906,648 | 12,083,312 |
| Source/phrase | 1,000 | 85,584 | 85,560 | 1,786,208 | 1,957,352 |
| Source/phrase | 10,000 | 102,960 | 102,936 | 15,788,144 | 15,994,040 |
| Positions/offsets | 1,000 | 87,232 | 87,480 | 3,566,160 | 3,740,872 |
| Positions/offsets | 10,000 | 104,608 | 104,856 | 33,600,096 | 33,809,560 |

Cancel-dump quantities, individual component groups, type breakdowns, request-only/change-only graph data and exact lexical IDs remain in the raw report/cohorts. No ID is matched between commit and cancel dumps. “Candidate-only” means absent from the selected old-state graph, not newly allocated or exclusively owned by the mutation.

Across 12 cleanup stages, 72 direct root/document witnesses collect and 36 deliberately live state/document witnesses remain. Every stage distinguishes held positive and released negative controls. Commit releases the old root/changed document while preserving the candidate; cancellation releases candidate root/changed document while preserving the old root. Core/context/changes/request witnesses collect in both cases. All six final committed roots collect after disposal. This is evidence for the listed objects, not collection of every descendant, general leak freedom or reclaimed-byte totals.

## Calibration, checks and review

The [development archive](RX-4002-memory-mutation-development.json.gz) retains exact staged sources and outcomes separately from the measured cases. An initial worker exited with an unsettled top-level await before enabling the debugger; installing its parent-port listener before awaiting fixed this observer lifecycle defect. A later cancelled request witness remained live while the caller controller was held; a subsequent run releases that handle and passes. This difference does not establish a retainer-path cause. A hand-sum test expectation was corrected before measurement. None is reported as a native engine failure or hidden from the evidence.

Commands actually executed:

```sh
npm ci
npm run check
node --test bench/memory/mutation-graph.test.mjs
node bench/memory/mutation-run.mjs /private/var/folders/m4/7qvldjl917j4nwbkw7bxmn_m0000gn/T/raveldex-core-consumer-3nZSlz docs/evidence/RX-4002-memory-mutation.json
```

`npm ci` passes with the existing optional postinstall-policy warning. The first baseline check records **522/523** in its first test group, then stops at localhost `listen EPERM`; subsequent browser groups are not run in that invocation. This is a sandbox/environment refusal, preserved in [the baseline log](RX-4002-memory-mutation-baseline-check.log). The four new literal graph tests pass: independent hand sums/sharing, frozen backing/string parents and excluded edges, wrong lexical aliases, malformed/ambiguous/bounds/overflow refusal. The [run log](RX-4002-memory-mutation-run.log) contains both child and parent summaries; twelve case lines represent six processes.

The independent reviewer uses a [separate parser and traversal](RX-4002-memory-mutation-independent-audit.mjs), without importing the implementation helper, to reconstruct all 12 raw heaps and every cohort row/group, verify full document/optional-side identity sharing, public outcomes, WeakRefs, controls, debugger shutdown, package/source and preservation bindings. No native workload, GC or browser matrix is rerun by that audit. The final full regression passes **604/604**, zero failed/cancelled/skipped, with localhost access restored for browser fixtures. Documentation/manifest checks pass; details and independent disposition are in [the review](RX-4002-memory-mutation-review.md).

## Remaining boundary

Old/candidate representation and the listed cleanup objects are now directly bound to actual runtime state. A final-precommit dump may miss earlier temporary allocations and dead staging data; neither its node union nor process sample maxima establish mutation allocation high-water. Codec encode/decode buffers and transport work/peak copies remain separate required observations. Exact AT/F01/Inspector/context findings remain open. No release criterion is waived, no new “every VM byte” gate is added, RX-4003 waits and N5 remains deferred.
