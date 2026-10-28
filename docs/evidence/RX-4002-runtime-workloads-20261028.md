# RX-4002 — Calibrated runtime workloads and native browser copy controls

Date: 2026-10-28. **Measurements executed; AC03 remains Blocked.** This continuation runs the existing admitted 1,000/10,000-record configurations through the calibrated runtime, then implements and exercises selected native browser allocation/copy observers. Production sources, exports, runtime dependencies, work/deadline/capacity limits and accepted AT/physical outcomes are unchanged.

## Evidence and reproducibility

The [identity/results record](RX-4002-runtime-workloads-identity-20261028.json) binds the [streaming archive](RX-4002-runtime-workloads-20261028.tar.gz), source aliases, reports, independent audits, native code fingerprints, failures and project checks. The archive contains 236 named text/raw members with 435,245,025 content bytes; compressed size is 23,814,149 bytes. It excludes runtime/browser/tool binaries and install caches. Original temporary root: `/tmp/raveldex-ac03-workloads-20261028.A7m1DC`.

```sh
python3 bench/memory/runtime-archive.py docs/evidence/RX-4002-runtime-workloads-20261028.tar.gz
python3 bench/memory/runtime-archive.py docs/evidence/RX-4002-runtime-workloads-20261028.tar.gz --extract-dir /absolute/NEW-directory
python3 bench/memory/runtime-audit.py --self-test
python3 bench/memory/runtime-audit.py /absolute/NEW-directory/mutations/core-only-1000-0-producer/replace-one.jsonl
```

The archive verifier checks streamed lengths/digests and safe member names; this is separate from numerical replay. The fast independent replay uses AVL interval indexes and streaming input. All 22 original hand tests remain AST-identical; nine additional index/split/deletion/stream tests pass, including fixed-seed independent comparisons against the frozen slow reference. All 22 previous calibration traces agree exactly. The archive's `review/` directory retains the reference, tests, equivalence and actual-run audits. No old audit/source artifact is overwritten.

The calibrated executable remains SHA-256 `28d5845f1e59182b5c8d81403836500728972b9816a7195f49e3442fcb9b5e67`, with the source/build identity in [the prior calibration](RX-4002-runtime-instrumentation-20261028.md). The unchanged installed tarball is `6ff6e90128f60af39bb8f47800c61ed83d85d4ded7a8e3c96d2bd34467f9c437`; all 208 production files match installation, tarball and repository. Executed v1 discovery sources and v2 mutation sources are preserved separately under `executed-sources/`, as are the two browser-controller versions. Historical report source paths may now refer to the later repository file; the preserved hash-matched version, not current-path equality, resolves that history.

## Method and completed runs

All runs use the existing `recordsFor`, schema and replacement fixture: admitted batches of 256, unchanged defaults and 60,000 ms operation deadlines. Configurations are core-only, selected source/phrase and selected positions/offsets. Each producer/receiver is a fresh serial process; heavy resource workloads do not overlap. Native snapshots use a new explicit exact-running-environment application descriptor for this calibrated ASCII experiment, rather than borrowing the Homebrew attestation. This is not a universal Unicode/profile portability claim. Core-only imports no snapshot adapter or optional provider.

The first discovery executes six producers and six fresh receivers, covering both sizes in all relevant configurations. It produces 24 windows: 12 valid empty/replacement windows and 12 invalid codec windows. All 24 windows are independently reconstructed from 3,232,060 stored events. All exports and native restores pass their public checks; 1,000-record source restore passes. The 10,000-record source restore returns `DEADLINE_EXCEEDED`, and its exact prior revision/page remains unchanged. That bounded refusal is an operation outcome, not an environment failure or a successful restore.

Codec windows encounter 7–571 GC prologues and 2,224,727–147,852,037 attempted records. The bounded 262,144-record tape drops records in every codec window. Their derived peak/gross/stop fields remain **null**. Increasing tape capacity alone cannot repair GC coverage. No partial prefix, endpoint delta, encoding length or statistical profile is substituted for a codec peak, and these invalid experiments are not repeated three times unchanged.

A separate declared mutation-only cohort then executes **18 fresh producers**, three repetitions per mode/size, producing **36 valid windows / 258,977 events**. Every window has zero GC, dropped records, overlap errors and unknown extent events. Empty batches preserve revision 4/40; replacements commit revision 5/41. Independent literal checks verify totals, revisions, unique eligible finite-score pages and the all-query's first 20 IDs. These are not full-ID ranking-oracle comparisons. Disposal and normal child exits pass. Fresh receivers separately distinguish imported origin revision from new local revision 2.

## Accepted mutation observations

The quantity is new monitored main-thread non-filler managed extents and their event-order high-water in the declared instrumented allocation configuration. It includes admission, runtime/promise/harness work and unreachable objects until GC; it excludes preexisting state and is not exclusive staging, collector-retained data, default-runtime or physical/process memory. Existing same-snapshot old/candidate/sharing evidence retains its separate meaning. The empty baseline is reported separately, never subtracted.

| Mode | Records | Replacement high-water min / median / max, bytes | Empty-batch median, bytes |
| --- | ---: | ---: | ---: |
| Core-only | 1,000 | 579,520 / 579,568 / 579,568 | 13,080 |
| Core-only | 10,000 | 713,536 / 714,688 / 716,200 | 11,816 |
| Source/phrase | 1,000 | 720,408 / 733,688 / 733,752 | 15,280 |
| Source/phrase | 10,000 | 879,216 / 881,696 / 883,496 | 11,848 |
| Positions/offsets | 1,000 | 757,344 / 758,440 / 758,440 | 15,312 |
| Positions/offsets | 10,000 | 911,392 / 911,728 / 913,360 | 11,848 |

Full individual gross/high-water/stop observations and aggregates are in archived `review/mutations-audit-summary.json` and `mutations-aggregate.md`. Native tape storage is 14,680,064 bytes per window, outside the managed quantity. Native recording, parsing after Stop and debugger work perturb time; no latency improvement or population performance guarantee follows. The reviewer independently verifies all 36 replays, source/runtime/corpus/package identities and public state/cleanup checks.

## Browser instrumentation implementation and failures

The native control uses cached **HeadlessChrome 153.0.8010.12**, not the owner's installed Chrome/Safari/Firefox. Binary SHA-256 is `a0bfe7b4da4787b66058477d696cd1d09065d25f06a548947722b9af77ee8282`, Mach-O UUID `4C4C44C1-5555-3144-A1ED-87C8CC00F9E6`. Static literal references, native disassembly and exact code-byte fingerprints identify the shared serializer PartitionAlloc reallocation path, executed grow-copy call and selected free paths. The delegate can be compiler-inlined, so observing only its nominal entry would miss allocations.

The existing REA Frida connector fails before attachment because its native binding is absent. A pinned official Frida 17.23.2 binary wheel is installed only into this task's temporary directory, with URL/hash/install report retained; no repository/global dependency or arbitrary source-build/install script is added. Direct attach to the first validated owned renderer times out before any observer loads. This is an instrumentation environment failure. A fresh owned renderer then passes installed LLDB 2103.0.34.103 attach/image/register/detach checks.

The actual LLDB observer checks PID, UUID and code bytes before installing finite native breakpoints. It records selected typed reallocation input/return, the exact native copy call/return, and selected free entry/return. It observes the destination at copy entry, while old/new coexist, rather than waiting until API return. Separate allocation birth IDs handle pointer reuse; realloc lineages are not mistaken for births. Per-thread LR/SP matching, bounded records/breakpoints, invalid/drop flags, install rollback and cleanup are implemented. Independent pre-execution review identifies concrete guard gaps; all four blocking findings are repaired before controls. No target argument/result, allocator policy or payload is changed/read by the observer. Debugger stops perturb scheduling.

The [version-specific serializer](https://raw.githubusercontent.com/chromium/chromium/153.0.8010.12/third_party/blink/renderer/bindings/core/v8/serialization/v8_script_value_serializer.cc) provides the source context for the buffer route. The [dedicated-worker proxy](https://raw.githubusercontent.com/chromium/chromium/153.0.8010.12/third_party/blink/renderer/core/workers/dedicated_worker_messaging_proxy.cc) hands messages across threads, so an extra Mojo/IPC copy is not assumed merely because a worker is involved. Neither source inspection nor the limited hook set proves every copy or final owner-deletion route.

## Actual browser controls and limits

A localhost fixture sends known plain envelopes to one module worker and checks the full echoed string plus an independently computed code-unit checksum. A browser trace mark and browser process inventory bind the actual renderer PID. The observer executes in that task-owned renderer; successful cases contain distinct main/worker native thread IDs.

| Control | Outcome | Executed selected grow-copy pairs | Copied bytes in those calls, both directions |
| --- | --- | ---: | ---: |
| 12-character small string | Full round trip Pass | 2 | 144 |
| 262,144 Latin-1 code units | Full round trip Pass | 4 | 576 |
| 262,144 two-byte code units | Full round trip Pass | 4 | 576 |
| Function value cannot be cloned | Actual `DataCloneError` | 0 | 0 |

Small selected pairs have distinct old/new addresses with requested extents 72→216 bytes and execute a 72-byte copy. Larger strings additionally grow 216→327,672 (Latin-1) or 216→655,352 (two-byte), executing a 216-byte copy before the old buffer's observed internal free. Thus the strongest pair-local overlap witnesses are **288 / 327,888 / 655,568 requested bytes**, respectively. These are executed native growth-copy observations, not the complete payload-copy byte count, total live-map high-water, OS physical pages or all transport copies. The large string's full payload copy is outside this selected call-site coverage.

The refusal allocates and frees one observed 72-byte buffer through the selected root-free route. Successful-message final buffers remain right-censored: two final buffers per successful run are still in the observer registry at cutoff. Absence of a free event does not prove continued liveness, and stale registry entries could overstate a sum. **No global registry high-water or successful-message final-free qualification is accepted.** In-place, idle negative, broader payload-copy routes and binding to actual Raveldex protocol request IDs remain unperformed.

Independent raw replay verifies all **103 rows**, exact source hash, return/field/order/generation checks, zero invalid/drop/pending counts and observed remaining registries. Raw rows do not include every SP/LR value used internally, so exact frame matching is source-reviewed rather than independently replayable from those fields. The backend removes breakpoints and detaches normally, with exit 0 and no watchdog timeout. All selected owned browser/renderer PIDs are later confirmed absent. A controller stdin-liveness defect is fixed separately; a fresh no-hook close smoke exits 0. Owner apps, signatures, security settings and AT flows are untouched.

## Verification and remaining work

The identity record links actual project checks and independent reviews. The archive verifier passes all 236 members. Standalone replay's 22 hand tests and the nine additional index tests pass. Previous evidence, failed discovery prefixes, failed native-access attempts and executed source versions remain preserved.

`npm ci` succeeds with the existing esbuild install-script warning. The approved final `npm run check` passes **616/616**, with zero failed/cancelled/skipped tests; [check log](RX-4002-runtime-workloads-check-20261028.log). The archive verifier also rejects a traversal fixture before creating the extraction directory. The independent [final review](RX-4002-runtime-workloads-review-20261028.json) finds no blocking issue for this bounded continuation, verifying archive/source aliases, all numerical table rows and unchanged criteria. Its final-regression field preserves the review-time pending state; the parent subsequently records the completed passing check in the identity record. No runtime or product workload is rerun by the reviewer.

Next extend/recalibrate managed instrumentation for codec windows that contain GC and exceed the tape, while preserving limits and invalidity guards. For browser transport, calibrate successful-message final deletion, payload-copy routes and idle/in-place controls; emit auditable native frame identifiers and bind native buffers to actual Raveldex request/peer/process identities before a product matrix. No missing observation is waived or replaced by this control fixture. RX-4002 remains Blocked on those precise AC03 scopes; RX-4003 waits and N5 stays deferred. Publication and remote writes remain unauthorized.
