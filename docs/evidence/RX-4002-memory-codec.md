# RX-4002 — Actual native codec representations and reuse

Date: 2026-10-26. Outcome: **Observed with limits** for selected native codec representations, same-snapshot sharing and direct object cleanup. Full RX-4002-AC03 remains **Blocked** for allocation peaks and separately measured product transport work/peak copies, alongside the remaining AT/context findings. Public contracts, limits, dependencies and release claims are unchanged.

The [frozen report](RX-4002-memory-codec.json) is 214,612 bytes, SHA-256 `840411bb4fe6ef78ef2961472fc1c0841e1fb6c389a96bbad4b325a01f10f3eb`. Eight adjacent compressed numeric cohorts contain 1,203,203 rows in 3,229,531 compressed bytes. Eight full synthetic-corpus heaps remain at the report's task-owned temporary paths: 198,452,421 bytes. The [independent audit](RX-4002-memory-codec-independent-audit.json), [audit source](RX-4002-memory-codec-independent-audit.mjs) and [review](RX-4002-memory-codec-review.md) record a separate reconstruction. Eight earlier memory reports, all 208 installed/current production files and all eight executed/analysis source bindings remain unchanged.

## Configuration, public behavior and boundaries

At each admitted size, 1,000 and 10,000 records, one fresh producer uses public `exportNative`; a separate fresh receiver uses public `restore`. The measured configuration is **source-phrase only**, format **native**, under the existing exact-local Node qualification. Runtime: Node 24.21.0, with full V8/ICU/Unicode versions in each child, directly recorded Darwin 27.0.0/arm64. The installed tarball hash is `6ff6e90128f60af39bb8f47800c61ed83d85d4ded7a8e3c96d2bd34467f9c437`. Build batches remain 256; operation deadlines remain 60,000ms; all defensive/work/encoded limits are unchanged. Each owned child has a 180-second watchdog and receives only PATH/TMPDIR/LANG/LC_ALL.

Both exports and both receiving restores pass. Producer revisions are 4/40; the receiver starts with one `prior` document at revision 1, then replaces it at revision 2 without reindexing. Twenty-eight actual search checks verify complete literal totals, revisions, page counts, unique eligible IDs and finite scores. Restored totals are 1,000/10,000 all, 27/271 selective and 334/3,334 strict phrase; prior membership becomes zero. Producer file bytes and SHA-256 match receiver input and the unchanged file after receiving. Encoding file lengths are 368,596/3,487,776 UTF-8 bytes, retained solely as encoding diagnostics, not heap quantities.

There is **one intrusive producer and receiver per size**. Earlier repeated samples remain frozen and are not relabeled as complete allocation tracking. This slice does not measure the source format, positions codec, browser-native snapshots, a product engine worker, network/storage/structured-clone transport, physical input, speech or portability. The observer's snapshot-stream transport is instrumentation, not the product worker's transport qualification.

## Capturing actual codec stages

A separate observer worker uses `Session.connectToMainThread`, exact installed source SHA, function, breakpoint line and ordered stage checks. Missing/wrong/extra captures fail; roles are not guessed from heap shapes. It pauses the actual installed main-isolate generator at:

1. `encodeJson` immediately before `chunks.join('')`: actual chunk array, encoding input value and committed data.
2. `encoded` before final UTF-8 scanning: actual body/envelope strings, native payload and committed data.
3. `restoreCursor` before integrity checking: actual decoded envelope/body slice/input string and prior receiver data. This is not yet complete native-state validation.
4. `restoreCursor` at precommit: actual decoded data, prepared/candidate roots, candidate components, strings and still-committed prior state.

`HeapProfiler.takeHeapSnapshot` runs **while paused**. Chunk events stream synchronously into an exclusively created observer-owned file, with a 512MiB parser/output bound. The observer never parses the target heap or concatenates its complete dump in memory. No reportProgress option is used. Markers are removed before resume; the ordinary operation then continues. The main observation hook verifies the old root remains committed before and after each dump. No production source, owner state, scheduler or generator is patched. The only private engine seam is read-only owner identity.

This follows the matching [Node inspector worker-session and heap-profiler API](https://nodejs.org/download/release/v24.21.0/docs/api/inspector.html). A snapshot describes its target isolate; observer-worker memory is outside that dump but inside process RSS. Breakpoints and lexical evaluation may deopt/materialize state; GC/dumping and protocol streaming allocate in runtime/observer scopes. Raw before/after/settling readings include those effects. No guessed subtraction removes them.

The same-snapshot graph follows data properties, elements, properties/elements backing stores, frozen-array numeric internal edges and string first/second/parent edges; it excludes prototype/map/other internal/weak/hidden edges. Node types still include representation overhead, not just payload. Explicit stage roles use up to nine mask bits; bit 256 is preserved and tested. String roots record type/self-size/backing targets without placing their payload contents in the numeric evidence. Every union counts a shared node once. No ID is compared across dumps.

## Observed representations and cleanup

Selected graph self-size bytes **reachable from codec roles and absent from that stage's selected state roles**:

| Stage | 1,000 records | 10,000 records |
| --- | ---: | ---: |
| Prejoin value/chunks | 1,817,088 | 18,810,136 |
| Body/envelope payload and strings | 369,152 | 3,488,328 |
| Decoded envelope/input/body slice, prior state only | 2,938,560 | 26,064,568 |
| Precommit codec roles, prior and candidate state selected | 386,480 | 3,505,688 |

These are graph-membership quantities, not allocated/retained/freed bytes or peak/copy counts. Headers, arrays, strings and VM representation contribute. The three state component seeds omit the root wrapper and standalone corpus-count object; reaching that existing count object through the encoding value classifies it outside those selected state graphs, without making it a new codec allocation. The last two rows use different state roles: candidate data moves into the shared codec/state group at precommit. The apparent reduction therefore cannot be read as deallocation or a memory improvement. Producer and receiver stages are in separate processes and no cross-process size subtraction is performed.

Both producer bodies are flat string nodes while their envelopes are concatenated strings. Both decoded `bodyText` values are sliced strings with actual parent edges into input backing. The 1,000 input is flat; the 10,000 input is a rope referencing the flat backing also used by its body slice. This is the representation in these paused dumps, not a physical-copy count or universal V8 policy.

Within each precommit dump, `prepared` directly reuses decoded payload documents/fields/counts/participants. `next` shares documents/fields/counts and rebinds participant headers/revisions while sharing their record directories. The helper and independent parser verify these identities, so decoded native data is not described as a second independent whole-index copy. Raw role/union/shared/type tables preserve the complete accounting.

After observer shutdown, three setImmediate → explicit GC → 25ms cycles precede direct object WeakRefs. Thirty-two listed object readings collect and 24 intentionally live state readings remain after the operations. All 56 listed object readings collect after public disposal, alongside held/released literal controls. Chunk arrays, encoding wrappers, decoded envelope/wrappers and prepared roots are observable object targets. Primitive strings cannot be WeakRef targets; their collection, all descendants, normal unforced GC and general leak freedom remain unproved.

## Verification and remaining work

Executed commands:

```sh
npm ci
npm run check
node --test bench/memory/codec-graph.test.mjs
node bench/memory/codec-run.mjs /private/var/folders/m4/7qvldjl917j4nwbkw7bxmn_m0000gn/T/raveldex-core-consumer-3nZSlz docs/evidence/RX-4002-memory-codec.json
```

`npm ci` passes with the existing optional esbuild postinstall-policy warning. The [baseline check](RX-4002-memory-codec-baseline-check.log) passes **604/604** with localhost access. Four new focused tests pass, including hand-derived state/codec sharing, sliced-string backing, nine-role masks and malformed/alias/bounds/overflow refusal. A literal test's initial arithmetic expectation was corrected from 490 to 390 before the measured matrix; the [calibration archive](RX-4002-memory-codec-calibration.json.gz) preserves this and the successful excluded producer/receiver calibration with exact staged sources. No native failure is hidden. The [run log](RX-4002-memory-codec-run.log) prints child and parent summaries: eight case lines represent four processes.

Independent review reconstructs all eight heaps and every cohort row/group using a separate parser/DFS, without importing the implementation helper or rerunning workloads. It verifies aliases, string backing, all public/raw outcomes, caller-file integrity, direct object controls, observer shutdown and source/package/evidence bindings. Final regression passes **608/608**, zero failed/cancelled/skipped; documentation/planner checks pass and independent disposition is **Ready with follow-ups**. Details are in [the review](RX-4002-memory-codec-review.md).

This supplies actual native codec representation and reuse evidence. Selected pauses miss the synchronous join's allocation high-water, intermediate parser pieces/joins and other short-lived state. Mutation/codec peaks, separately measured product transport work/peak copies and remaining AT/F01/Inspector/context observations still block RX-4002. RX-4003 waits; N5 stays deferred. No narrower release claim or extra every-VM-byte criterion is introduced.
