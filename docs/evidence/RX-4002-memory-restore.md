# RX-4002 — native receiving-restore memory observation

Six fresh source-mode Node receivers completed real public native restores: three at 1,000 records and three at 10,000. Each independently verified receiving revision 2, exact match-all/selective/strict-phrase totals, replacement of the prior record, and collection of its listed initial/prior/restored object witnesses after public disposal and the documented GC policy. These observations add receiving decode/validation/staging coverage; they do not satisfy the complete retained/peak/browser-worker requirement in AC03.

The original wrapper outcome is **Fail**, retained verbatim in [raw observations](RX-4002-memory-restore.json) and [stdout/stderr](RX-4002-memory-restore.log). Its preservation inventory mistakenly treated its own empty live capture log as prior immutable evidence, then rejected expected log growth after all eight children exited successfully. This is an evaluation defect, separate from the six child **Pass** outcomes. No resource workload was rerun and the raw aggregate was not relabeled.

The new [offline reconciliation](RX-4002-memory-restore-reconciliation.json), produced by [restore-reconcile.mjs](../../bench/memory/restore-reconcile.mjs), verifies all 16 true prior artifacts, 8 executed source bindings, 208 installed/workspace production files, both producer input hashes, all 8 child PID/report identities, and all six saved profile/maxima/semantic/witness results. The executed wrapper was archived before repair at [restore-executed-run.mjs](RX-4002-memory-restore-executed-run.mjs). Reconciliation accepts the preserved child observations while explicitly retaining the original wrapper failure.

## Identity and execution

- Actual observation window: `2026-10-09T10:16:47.004Z`–`2026-10-09T10:18:18.320Z`; receiving runtime Node `24.21.0`, V8 `13.6.233.17-node.53`, ICU `78.3`, Unicode `17.0`, macOS arm64. Host inventory is in [environment](RX-4002-environment.json).
- Fresh installed `@vmitsaras/raveldex@0.0.0` consumer: `/private/var/folders/m4/7qvldjl917j4nwbkw7bxmn_m0000gn/T/raveldex-core-consumer-jQwKMT`. All 208 production files match the workspace; this slice changes no production code, dependencies, APIs or limits.
- Existing exact-local native declaration: `raveldex-rx4002-memory-local-node-v1`, `exact-node-runtime`. Producer and receiver use the same adopted declaration, schema, source provider and source phrase addon. No native portability claim follows.
- Producers: PID `80388` at 1,000 records, PID `80608` at 10,000. Native UTF-8 inputs were 368,596 and 3,487,776 bytes; these are file lengths, not heap attribution. Origin revisions were 4 and 40 from batches of 256.
- Receivers: PIDs `80482`, `80498`, `80589` at 1,000; `81060`, `81337`, `81642` at 10,000. All were distinct fresh processes, exited 0, and were neither signaled nor timed out. The default admission/work/participant limits and 60,000ms operation deadline stayed unchanged. An owned-child 180s watchdog signals only that child, with SIGTERM followed by SIGKILL after one second if needed.

Actual command, run once under an exclusive resource slot after browser workloads finished:

```sh
node bench/memory/restore-run.mjs /private/var/folders/m4/7qvldjl917j4nwbkw7bxmn_m0000gn/T/raveldex-core-consumer-jQwKMT docs/evidence/RX-4002-memory-restore.json > docs/evidence/RX-4002-memory-restore.log 2>&1
```

Raw aggregate SHA-256: `77057e6c5d1264dceeaf2f87cc25e2b62ee9e1965b26dfb0e3ac6e08bda8abb7`. Executed wrapper SHA-256: `f29e5124b9abac32f62e29a24f60882e892c6922a074cce4c7af5c10c621b753`. Reconciliation SHA-256: `372f933a083ca0f9fc3bbcd0d3a92cc536943f300d7d6b08007e941f272d7ec1`. Every executed/staged source and child report has its own binding in the raw/reconciled artifacts.

## Measurement boundaries

Preparation happens in two separate processes and is excluded from receiving memory observations. Each receiver imports its actual installed package and observer, opens an in-process inspector Session, creates a known strongly held control, and then samples an empty receiver. It reads the bounded encoded input, verifies its digest, takes an input-held baseline, publicly adds one prior record, and takes a prior-state/input-held baseline.

Only `snapshots.restore(encoded, { deadlineMs: 60000 })` plus observer/runtime work inside that interval is allocation sampled. Requested parameters are 32,768-byte Poisson-average sampling interval, stack depth 128, and inclusion of objects collected by major/minor GC. The actual returned profile and parameters are saved. `HeapProfiler.stopSampling` completes and the Session disconnects before semantic search assertions. This is the in-process Node inspector API, with no listening inspector port. Statistical profiler values and allocating-frame URL groups do not measure exact allocation, simultaneous live peak, or exclusive component ownership. The requested collected-object options are not an independent capability conformance test. [Node inspector documentation](https://raw.githubusercontent.com/nodejs/node/v24.21.0/doc/api/inspector.md), [HeapProfiler protocol schema](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/json/js_protocol.json).

`process.memoryUsage()` is read immediately before/after the public call and at 5ms event-loop intervals. Its whole-process RSS and V8/isolate fields include inputs, prior/current state, temporary garbage, observer, sampling machinery and runtime. Blocking work may hide transient maxima. Different fields and their maxima overlap and need not occur simultaneously; ArrayBuffer accounting overlaps external memory. They must not be summed into a peak. No external high-water sampler or kernel RSS maximum was added in this slice. [Node memoryUsage documentation](https://raw.githubusercontent.com/nodejs/node/v24.21.0/doc/api/process.md).

At every settled stage, three cycles each cross `setImmediate`, request `global.gc()`, wait 25ms, and record numeric memory fields. Clearing the local encoded binding is not proof of string collection. Private installed `getExecutionOwner` is read solely to create WeakRefs to each actual root and its `documents`, `fields`, and `participants` objects; no owner, scheduler, generator or production behavior is replaced. Witness readings return booleans only. A turn separates those readings from a subsequent GC because successful dereferencing keeps a target alive for the current execution. [ECMAScript WeakRef semantics](https://tc39.es/ecma262/multipage/managing-memory.html#sec-weak-ref-objects).

After semantic checks, the receiver settles with input held, clears the input binding and settles again, publicly disposes, verifies the owner root is cleared, and settles again. A known strongly held dummy survives the observation stages; after releasing that dummy and settling, its WeakRef is also cleared. This control establishes an observed collection path, not universal collection completeness. Each witness may alias another witness, including shared empty containers; the counts below are witness entries, not unique allocated objects.

Children inherit only `PATH`, `TMPDIR`, `LANG`, and `LC_ALL`. Full heaps, process environments and unrelated process inputs are not collected. Generated native inputs and full temporary child reports stay in the unique consumer task directory. The committed statistical profiles contain the returned allocation metadata; no console root objects are emitted.

## Actual results

All six restores returned native format, `reindexed: false`, the expected origin revision, and receiving revision 2. Match-all/selective/strict-phrase/prior totals were `1000/27/334/0` or `10000/271/3334/0`. Complete results and finite selective scores were checked outside the profiler interval against literal arithmetic and record-ID membership, without calling the production scorer/tokenizer as an oracle.

| Records | Repetition / PID | Operation readings | Observed RSS maximum, bytes | Observed heapUsed maximum, bytes | Raw profile sample-size sum, bytes |
| --- | --- | ---: | ---: | ---: | ---: |
| 1,000 | 0 / 80482 | 248 | 85,688,320 | 18,430,128 | 246,580,400 |
| 1,000 | 1 / 80498 | 256 | 85,360,640 | 18,593,352 | 248,770,824 |
| 1,000 | 2 / 80589 | 264 | 85,311,488 | 18,409,520 | 246,168,360 |
| 10,000 | 0 / 81060 | 2,481 | 166,232,064 | 68,923,088 | 2,270,251,040 |
| 10,000 | 1 / 81337 | 2,498 | 166,658,048 | 69,032,736 | 2,269,823,736 |
| 10,000 | 2 / 81642 | 2,544 | 166,494,208 | 69,115,368 | 2,276,422,616 |

The last column is exactly the saved statistical `reportedSampleSizeSumBytes` field, including requested collected-object samples. It can exceed simultaneously live memory. It is not retained bytes, exact cumulative allocation or peak. Tree node self-size sums are separately retained in the raw data and are not required to equal sample sums. No performance improvement or device capacity is inferred from three instrumented repetitions.

| Settled heapUsed stage (third GC reading) | 1,000 records, range in bytes | 10,000 records, range in bytes |
| --- | ---: | ---: |
| Empty receiver and imported observer | 5,901,624–5,901,656 | 5,901,648–5,901,680 |
| Encoded input and prior receiver held | 6,505,808–6,505,840 | 9,626,656–9,626,688 |
| Restore/semantic checks complete, input held | 11,181,064–11,193,064 | 43,153,376–43,178,408 |
| Encoded binding cleared | 10,777,112–10,789,112 | 39,642,328–39,667,360 |
| Receiver publicly disposed | 7,539,264–7,552,480 | 11,564,752–11,589,368 |

These are full instrumented-process readings, not isolated retained-component deltas. The accumulating numeric sample recorder and returned raw profiler metadata remain held for reporting, so disposal is not expected to reproduce the imported baseline exactly. All 12 listed object witness entries in each process were cleared after public disposal and GC: 72 entries across six processes, with **no surviving entries** at that final stage. All six strongly held controls survived and were later observed collected after release. Strings, all descendants, unforced GC, conditional-retainer completeness, and general leak freedom remain unqualified.

## Evaluation repair and verification

The future wrapper inventory now accepts an **explicit fourth capture-log argument** only when it has the new report stem, starts as an empty regular file, matches both actual stdout/stderr file-handle inodes, and does not alias any protected artifact. Other logs remain immutable; symlink/hardlink aliases, nonempty files, mismatched stream handles and arbitrary log names are rejected. Without that explicit argument no file is silently exempted. This repair was tested with scratch files only and did not run the measured workload.

Example future invocation, **not run here**, requires fresh output/capture names and an isolated consumer:

```sh
node bench/memory/restore-run.mjs CONSUMER docs/evidence/RX-4002-memory-restore-fresh.json docs/evidence/RX-4002-memory-restore-fresh.log > docs/evidence/RX-4002-memory-restore-fresh.log 2>&1
```

Actual focused checks: `node --test bench/memory/restore-common.test.mjs`, **Pass 7/7** in [original focused log](RX-4002-memory-restore-tests.log); `node --test bench/memory/restore-inventory.test.mjs`, **Pass 2/2** in [repair focused log](RX-4002-memory-restore-inventory-tests.log). Syntax checks passed for runner/producer/receiver/reconciliation. The offline command below ran once successfully after correcting its own URL-frame audit; it starts no runtime workload:

```sh
node bench/memory/restore-reconcile.mjs > docs/evidence/RX-4002-memory-restore-reconciliation.log 2>&1
```

**Blocked:** exact collector-accurate retained bytes by component, simultaneous decode/staging/encoder/mutation peaks, source-reindex receiving memory, browser/worker/transport memory, and the complete AC03 requirement. Browser instrumentation is outside this slice; these unavailable observations are not mislabeled as environment failures. No assistive-technology, real IME, physical-input, release or publication claim follows.
