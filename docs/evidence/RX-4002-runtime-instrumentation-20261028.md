# RX-4002 — Runtime allocation instrumentation calibration

Local continuation date: 2026-10-28; raw UTC timestamps are preserved. **Calibration observed; AC03 remains Blocked.** This slice builds and calibrates a task-owned runtime recorder, reaches real installed public engine operations, and calibrates a separate default V8 serializer-buffer channel. It does not change Raveldex production code, exports, dependencies, limits or announcement policy. Accepted AT/physical observations remain accepted; no human repeat is pending.

## Artifacts and reproduction boundary

- [Public V8 controls archive](RX-4002-runtime-public-controls-20261028.json.gz): native addon/child sources, commands, raw streams, reports and a 55-file/external-reference inventory. Compiled addons and installed headers/libraries are referenced by hash rather than embedded.
- [Managed runtime archive](RX-4002-managed-runtime-20261028.json.gz): source patches/reapplication helpers, build configuration/logs, failed and successful controls, raw JSONL, public pilots and independent audits. Upstream source and compiled runtimes are external hashed references, not committed binaries.
- [Identity and results](RX-4002-runtime-instrumentation-identity-20261028.json) bind these archives, official source, both runtimes and final outcomes. [Archive verifier](RX-4002-runtime-archive-audit-20261028.mjs) checks durable bytes without requiring the original temporary environment.
- [Independent managed replay](RX-4002-managed-runtime-audit-20261028.py) reconstructs event extents with a separate algorithm. Its 22 literal controls cover valid/invalid extents, interior trimming, coallocation, historical address reuse, GC/drop/abort and malformed records. Archive integrity alone is not numerical verification.

The temporary build root is `/tmp/raveldex-instrumented-node-20261027.MqKSa6`; the public-addon root is `/tmp/raveldex-runtime-calibration-20261027.ytrfS4`. Commands/harnesses contain those actual paths. Reproduction requires adapting task-owned output paths, a matching compiler/runtime or rebuilding the declared source, and new exclusively created files. It does not install or replace the owner's Node/browser. The patch helper validates original hashes before applying and validates patched hashes afterward.

For offline inspection, run the archive verifier, optionally extract into a new directory, then run the separate auditor. These commands launch no instrumented runtime or product workload:

```sh
node docs/evidence/RX-4002-runtime-archive-audit-20261028.mjs
node docs/evidence/RX-4002-runtime-archive-audit-20261028.mjs --extract-managed /absolute/NEW-directory
python3 docs/evidence/RX-4002-managed-runtime-audit-20261028.py --self-test
python3 docs/evidence/RX-4002-managed-runtime-audit-20261028.py /absolute/NEW-directory/managed-engine-pilot-v4/public-source-export.jsonl
```

The actual post-archive extraction/replay uses the recorded Python 3.12.14 executable, all 22 listed traces and a 120-second child bound. It exits 0 in 102.87 seconds, all 22 auditor self-tests pass, and every replay row matches the archived independent result except its new local path. Both compressed/raw archive hashes and all 209 text-member hashes verify. External runtime/source references are not implied to be embedded or reverified by that offline helper.

Official [Node v24.21.0 source checksums](https://nodejs.org/download/release/v24.21.0/SHASUMS256.txt) identify the source tar.xz SHA-256 as `a6f54defb6fd7c84f41dba13d61e78e9b4e0961712cf61f29715c05f5ced94fc`. The task build uses Apple clang 21.0.0, Darwin arm64 and bundled Python 3.12.14. Configuration is `--without-npm --without-corepack --without-inspector --without-ssl --with-intl=small-icu --download=none`; it is a calibration configuration, not the installed Homebrew configuration. Configuration also applies Node's bundled ICU patch, recorded by the configure log.

## Channels selected and rejected

The installed Node control uses Node 24.21.0 / V8 13.6.233.17-node.53 and its exact Homebrew headers/library. Generic Homebrew headers point at another Node major and were not used. The public sampling profiler is useful for a limitation control, not an allocation/death ledger: a candidate 98,808-byte sample persists after array shortening, while a separately inspected current array/elements representation is 32/80 bytes. No sample-ID-to-snapshot identity is asserted. Profile construction itself changes used heap by 0–136 bytes in observed calls. A transient candidate disappears after GC without a death ordinal.

The managed recorder instead uses version-matched internal allocation notifications with added exact old/new size-change events. Fixed native records capture birth blocks, left-trim moves, size changes, numeric operation markers and directly inspected object/elements addresses/sizes. Callbacks create no JS values/profiles, growing maps or output. Replay and JSONL output happen after unregistration. Every GC callback or heap-GC counter change, dropped record, abort, overlapping historical birth or invalid extent rejects the measurement; rejected measurement fields are null. Native event size/capacity and GC counters remain visible.

The replay quantity is **new monitored main-thread managed block extents, excluding recorded filler/reclaimable tails, and their event-order high-water within a no-GC window**. It includes unreachable objects until collection and allocations from the public host/admission/promises/harness. It excludes preexisting state and does not measure collector-live retention, physical/committed memory, native backing stores, background/compiler/shared/cppgc allocations or browser transport. Coallocated blocks may contain multiple objects; there is no one-birth/one-object assumption. Direct object inspection uses the actual native argument, without cross-snapshot ID matching. Window validity is necessary; independent source/coverage calibration is separate.

## Concrete calibration failures and repairs

1. The first public addon load fails with missing Delegate RTTI. The retained second compilation adds `-fno-rtti` against the same exact headers; the actual serializer child then exits 0. This is tooling compatibility, not a product failure.
2. The initial private-runtime compilation stops at `Utils::OpenDirectHandle(value)`: the exact source expects `const v8::Value*`. Changing only that call to `Utils::OpenDirectHandle(*value)` repairs compilation. Dependency build takes 73.75 s, failed runtime build 396.82 s and successful incremental build 650.48 s. Original logs/patches are retained.
3. The first permission control cannot load its main script under a too-narrow read grant; it does not exercise the write guard. The corrected child permits reads, still denies writes, reaches the binding and receives `ERR_ACCESS_DENIED` without creating a file. First explicit `process.exit()` leaves a header-only abandoned trace; the auditor rejects it. A separate natural-environment-teardown control reaches the cleanup hook, sets `aborted:true` and nulls measurements. Neither failure is retroactively relabeled Pass.
4. The initial public pilot incorrectly constructs a qualified snapshot engine with no qualification; the factory rejects it. The next pilot incorrectly expects identical replacement to be a no-op. The existing contract deliberately commits identical replacements. The corrected pilot uses ordinary `createRaveldex`, a true empty `addMany` no-op and source snapshots. Product behavior/contract is unchanged.
5. Real async windows expose a recorder-coverage defect: each operation has two 48-byte births inside preceding 200-byte births despite zero GC/drop. A tiny `await` control reproduces it without Raveldex. All those peak fields stay null. Source review identifies Turboshaft grouped reservation/top-rewind behavior; merely setting runtime `--no-inline-new` does not recompile already embedded builtin code. Overlap-free replay alone would also miss an unused reserved tail.

The separate four-file v2 patch retains the original three recorder files and gates both builtin/bytecode folding checks on `turbo_allocation_folding`. This preserves upstream default-true behavior, but lets the task build explicitly disable folding while generating embedded builtins. The actual generated `mksnapshot` command is overridden with `--no-turbo-allocation-folding --no-inline-new`, using make's recorded command-change mechanism. No generated makefile, global V8 default or installed runtime is edited. Independent review checks the gate, compiler allocation paths and override before rebuilding. The 22.24 s build recompiles the gate, relinks mksnapshot, regenerates snapshot/embedded output and relinks Node; its expanded command is archived.

Final patch SHA-256: `f0ff62eeb06c42c871ec1017923a52ede89e07a59513a314d9d064bbdac808c6`. Initial compiled runtime SHA-256: `a0b61f7f537b5bee547ff301918517f3f617343359610c68da9e7b9f0efb5a70`; final runtime: `28d5845f1e59182b5c8d81403836500728972b9816a7195f49e3442fcb9b5e67`. Both binaries remain separately preserved locally. Source-author manifests' `compiled:false` fields describe their pre-build state; parent build reports and identity bind actual compilation. The final control report still lists the legacy three-file recorder patch; its full runtime provenance additionally requires the v2 patch, four-file manifest and builtin-generation build record.

The same tiny async control now has 7/14/14 events, valid windows and 248/632/632 monitored bytes, replacing the old 5/10/10-event invalid streams. Raw sequences replace each overlarge 200-byte reservation with 40/56/56-byte births. Types are not guessed from those sizes. This is measured calibration of the changed allocation mode, not a performance improvement claim.

## Final managed controls and public pilot

All six final control children exit 0. Direct native inspection binds all 14 selected object/elements observations to captured extents: small elements shrink 98,776→80 bytes; large elements 1,200,016→80; left trim advances the actual elements pointer by 8 and reduces size by 8. Latin-1/two-byte managed string objects are 3,088/4,112 bytes for 3,072/2,048 code units. Exact small/large shrink subtraction and coallocated interior extents replay independently. GC, capacity overflow and natural teardown produce invalid/null measurements. Flag, write-permission and existing-file guards refuse safely; the sentinel is unchanged.

The actual public pilot uses four synthetic records, the installed tarball SHA-256 `6ff6e90128f60af39bb8f47800c61ed83d85d4ded7a8e3c96d2bd34467f9c437`, and public root/phrase-provider/source-snapshot imports. All 208 production files match tarball, installation and repository. Literal full membership/revision checks pass before and after each mutation/restore; both owners dispose. The source receive is explicitly reindexed with `unqualified` analyzer profile, not a native-snapshot attestation.

| Public operation | Events | Gross monitored births, bytes | Monitored non-filler high-water, bytes | Monitored non-filler at stop, bytes |
| --- | ---: | ---: | ---: | ---: |
| Empty batch, revision remains 1 | 288 | 20,944 | 20,608 | 20,608 |
| Incremental replacement, revision 2 | 2,433 | 154,440 | 139,408 | 139,408 |
| Source export | 48,551 | 2,007,288 | 1,951,088 | 1,951,048 |
| Source receive/reindex, local revision 2 | 38,067 | 1,788,760 | 1,732,320 | 1,732,280 |

All four windows have zero GC, dropped records, ledger errors and unmonitored extent events. These are allocation records from real public work in the declared variant, including surrounding host/harness work. Do not subtract the empty batch as an exclusive engine/staging baseline or promote this tiny source-provider pilot to the 1,000/10,000 core/phrase/position qualification matrix. The 2,736-character encoding is a separate length diagnostic.

The bounded on/off timing control runs the same 1,024-array loop in alternating order, with four samples each. Final medians are 93,541.5 ns off and 97,292 ns on; active replay/output finalization median is 429,833 ns. Setup is excluded; timers allocate BigInts, allocation grouping varies and the sample is noisy. This supplies finite overhead observations, not universal overhead or default/product latency. Fixed native event storage is 458,752 bytes for the 8,192-event timing control, 3,670,016 for 65,536-event controls and 7,340,032 for the 131,072-event public pilot. It is outside the managed quantity; post-stop native map/output overhead is separate.

## Default serializer calibration and browser transport boundary

Four public `ValueSerializer::Delegate` controls pass, forwarding successful reallocation/free calls to V8's default delegate. A bounded 128-record native tape loses no events. Full decoded code-unit/byte and metadata checks pass.

| Plain envelope payload | Released logical bytes | API-reported capacity high-water, bytes | Realloc/free callbacks |
| --- | ---: | ---: | --- |
| 262,144 Latin-1 code units | 262,203 | 262,254 | 2 / 1 |
| 131,072 two-byte code units | 262,205 | 262,256 | 2 / 1 |
| 262,144-byte ArrayBuffer | 262,202 | 262,253 | 2 / 1 |
| Deliberate second-realloc failure | No release | 65 | 2 including failure / 1 |

Release transfers ownership: serializer destruction does not free the successful buffer; the buffer remains usable by the actual deserializer, then the caller frees it. On failure the original buffer remains valid and serializer destruction frees it. The ArrayBuffer control binds three simultaneously held, disjoint source/encoded/decoded data ranges and checks every byte. This is selected backing identity, not a physical copy counter. Darwin usable malloc size is recorded separately from logical length and reported capacity. No primitive-string backing pointer or internal realloc overlap is inferred.

Chromium revision `d0c02bfad08ec92a6ffcf989e53cd995e6381a4c` uses Blink's [serializer implementation](https://raw.githubusercontent.com/chromium/chromium/d0c02bfad08ec92a6ffcf989e53cd995e6381a4c/third_party/blink/renderer/bindings/core/v8/serialization/v8_script_value_serializer.cc): its delegate calls PartitionAlloc buffer helpers, and normal release moves the buffer into `SerializedScriptValue` ownership. Therefore the calibrated Node default-delegate tape is not browser transport evidence. Browser instrumentation must bind message/peer/process identity to buffer allocation/growth, release/ownership transfer, receiver/IPC backing and final deletion. Hooking only the serializer free callback misses normal released-buffer lifetime. API reallocation boundaries do not expose internal allocate-copy-free overlap; any claimed physical overlap needs the corresponding allocator/copy events. This is the concrete remaining integration route, not another live-profile rerun.

## Disposition, verification and next work

Independent agents separately implement the source patch and replay/review raw records. The parent owns builds, controls, public pilots and repository integration. The archived independent reports distinguish earlier invalid runs from the final guarded windows and verify production/source/runtime identities. The final [identity record](RX-4002-runtime-instrumentation-identity-20261028.json) records current project checks and audit counts.

The independent [final repository/artifact review](RX-4002-runtime-final-review-20261028.json) finds no actionable issue for this bounded slice. It verifies archive/trace/source/runtime/package bindings, the numerical tables, preserved failures, scope/contract consistency, extracted replay and the 616-test check log. This is readiness of the calibration slice; it does not mark AC03 or RX-4002 complete.

`npm ci` succeeds with the existing esbuild install-script allowlist warning preserved. The approved full `npm run check` passes **616/616**, with zero failed/cancelled/skipped tests: 535 package/core/evaluation/memory, 30 UI, 24 worker, 26 IndexedDB and one migration-browser scenario. [Full check log](RX-4002-runtime-check-20261028.log). Generated-doc, link/planner and local tracking-preview checks are separate from runtime calibration; preview makes no remote write.

Next AC03 work is to apply the declared, calibrated managed method to the existing relevant 1,000/10,000 mutation/codec configurations, preserving operation/baseline/worker/process distinctions. If GC, overflow or unsupported events occur, those windows remain invalid until the method is extended and recalibrated. Separately integrate native browser serializer/backing/copy lifetime instrumentation with actual Raveldex message identities. The existing every-VM-byte, universal-settings and physical-paint non-claims remain non-claims; no new criterion or waiver is introduced.

RX-4002 remains Blocked solely on incomplete AC03 scope. RX-4003 waits; no new implementation task is manufactured. N5 remains deferred. No publication, release/tag, push, tracking sync, browser re-signing, security change or global runtime installation occurs.
