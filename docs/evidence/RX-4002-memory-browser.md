# RX-4002 — Browser main/worker memory observations

Date: 2026-10-26. Baseline: `3044b63`. Status: **Observed with limitations; RX-4002-AC03 remains Blocked**. This continuation measures one installed headless Chrome source-phrase worker configuration. It does not amend acceptance criteria, public behavior, limits or the release contract.

## Method and scope

The [runner](../../bench/memory/browser-run.mjs) stages a measurement application in an existing isolated tarball consumer and bundles only that application, the unchanged RX-4001 ASCII fixture and installed production modules. It performs no package build, installation, publication or remote tracking write. Every installed production file is compared with the current build. Each measured repetition owns a fresh headless Chrome process, page and dedicated module worker. The owner’s Safari page, settings and accepted manual input observations are untouched.

The worker is paused before its initialization, attached by its exact URL/target/session and then resumed. Main/worker `Runtime.getIsolateId` values must differ. Operations use installed public exports: 256-record build batches, one replacement, source export and source restore into a cleared owner containing one prior record. Admission/work limits and the 60-second operation deadline are unchanged. Native browser snapshots, IndexedDB, DOM UI, positions and cross-browser support are outside this configuration.

Each isolate has three explicit collection/25ms settling readings at nine stages: empty owner, caller input held, built/input released, replacement complete, caller encoding held, encoding plus prior receiver held, after restore with encoding held, encoding released, and disposed owner/handles released with the externally owned worker still alive. The harness then closes its browser. Bindings released by the application do not prove collection of every object/string or native buffer. Bounded host mutation receipts, modules, transport-shape records, the application and inspector remain in the measured scope.

During build, replacement, export and restore, the runner collects separate per-isolate statistical allocation profiles with a 32,768-byte average sampling interval, stack depth 128 and both collected-object flags requested. It polls raw heap fields serially, with a ten-millisecond delay after the previous main/worker pair completes. Each request and response has a harness-clock timestamp; paired readings are not simultaneous and slower replies leave larger observation gaps. No forced collection occurs within these operation windows. Profiling stops before the independent semantic checks and steady-stage collection.

The [official protocol schema](https://github.com/ChromeDevTools/devtools-protocol/blob/master/json/js_protocol.json) defines `Runtime.getHeapUsage` as the whole corresponding isolate, including separate JavaScript, embedder and backing-storage fields. These fields are preserved without adding them. Operation maxima are observed field maxima, not simultaneous process totals, true transient peaks, exclusive allocations, retained component sizes or RSS. Allocation sample quantities are statistical profiler outputs; zero samples do not mean zero allocations. Bundle frames contain both observer and production code. No exclusive frame/component attribution is made.

Profiles preserve the complete parsed objects returned by `HeapProfiler.stopSampling` in losslessly compressed JSON, with compressed/decompressed hashes. They are not byte-preserved protocol wire messages. No full heap dump, owner-browser content or unrelated application data is collected. The primary report records profile summaries, stages, literal verification results, source/bundle/package identities and the profile artifact paths.

Transport observation retains primitive shapes only: caller `postMessage` argument counts, operation/kind and snapshot string lengths, plus actual received response shapes. It copies no envelope or encoded payload into logs. The existing bridge posts one message argument and source snapshot strings; it exposes no transfer-list ownership movement. String length and message counts establish neither physical clone-buffer allocation nor number/lifetime/peak of internal copies. No artificial ArrayBuffer transfer replaces the production path.

Literal fixture arithmetic verifies complete totals, finite eligible pages and coherent expected revisions after build/replacement/restore. Expected build revision is `ceil(size/256)`, replacement adds one, clear/prior add another two, and a successful restore adds one local revision with the exported origin revision and `reindexed: true`. A rejected restore must preserve the exact prior page/revision. These checks run outside allocation profiling. They are workload verification, not a new comprehensive ranking oracle.

## Development observations and failures

The [first smoke report](RX-4002-memory-browser-first-smoke.json.gz) is preserved separately. Its build observation reached the real worker, but an existing Node-specific summary helper rejected one actual Chrome sample: `nodeId: 235`, ordinal 778, size 34,480, absent from the returned call tree. This is an evaluation/harness assumption failure, not an engine failure or a missing allocation silently discarded. The new browser helper preserves all samples and explicitly lists unresolved node references and their statistical sizes, without inventing allocating frames. The historical Node helper and evidence stay unchanged.

The [second smoke report](RX-4002-memory-browser-second-smoke.json.gz) passes all four operations at 1,000 records. Its own recorded source hashes describe that development version; it is not rebound to later compression/provenance changes. It is excluded from the six measured repetitions. The first and second original JSON documents have SHA-256 `54d4a8867a401d81b08edb3f19bfd098078a7b8e92ed4b9c3cba3a6d78164103` and `1ef37c9362db9688856a7db343d06f5d663676daadd9ebe1e63476c403534c8e` respectively. Decompression reconstructs those documents exactly.

Independent pre-measurement review identified polling rejection handling, cleanup after a context-close failure, transport capture before disposal, and missing expected-revision assertions. These harness findings were repaired before the measured run. Four focused tests cover nested-session response routing/errors/timeout/detach, invalid heap data, separate realm maxima and explicit unresolved sample arithmetic. No production code was changed.

## Measured outcomes

The [primary report archive](RX-4002-memory-browser.json.gz) losslessly reconstructs the complete 33,723,899-byte JSON report with SHA-256 `492a5a9bcc4da22cf9172e1309a524cc133c9a1fa333d810bcb35296c6e9abc0`. The gzip archive is 1,431,561 bytes, SHA-256 `8afb897b608b6323a732b9dc89eb787029bc85847b27f3d161137eabcd7e341d`. Only its representation is compressed; all raw readings and fields remain. It completed six serial fresh-browser repetitions with no observation/cleanup failure. Its explicit aggregate is `ObservedWithLimitations`, not an all-operations Pass. All 208 installed production files match the current build; tarball SHA-256 is `6ff6e90128f60af39bb8f47800c61ed83d85d4ded7a8e3c96d2bd34467f9c437`, unchanged from the accepted input fixture. The runner checks all measured source identities and four earlier memory-report hashes again after execution: preservation Pass. The original Node, graph-cut and receiving reports are unchanged.

Actual runtime: Chrome **155.0.8059.85**, JavaScript/V8 **15.5.35.25**, CDP 1.3; Node harness **24.21.0**, Darwin kernel **27.0.0**, arm64; Playwright Core **1.61.1**, esbuild **0.28.2**. The raw user-agent strings are preserved separately from host OS/architecture fields. No physical-device, power-mode or owner-Safari claim is inferred from these automated environments.

| Admitted records | Build | Replace | Source export | Source restore |
| --- | --- | --- | --- | --- |
| 1,000 | 3/3 Pass | 3/3 Pass | 3/3 Pass | 3/3 Pass; origin revision 5, next local revision 8, reindexed |
| 10,000 | 3/3 Pass | 3/3 Pass | 3/3 Pass | 3/3 `DEADLINE_EXCEEDED`; exact prior record/page/revision 43 preserved |

The restore refusals are **public operation outcomes under this instrumented workload**, not environment failures, successful round trips or evidence that the corpus was not admitted. Sampling/polling add overhead; the unchanged 60-second deadline is retained rather than increased to turn a refusal into success. At 10,000, successful builds produce revision 40 and replacement revision 41. Literal built totals for common/selective/strict phrase are 10,000/271/3,334, then 10,000/272/3,333 after replacement. At 1,000 the corresponding totals are 1,000/27/334, then 1,000/28/333. Successful receiving restores reproduce the replaced totals.

The following are medians across three fresh processes of the **last explicit-GC cycle's `usedSize` reading**, in bytes. Main and worker values are separate, include their harness/runtime scope, and must not be subtracted or added to claim isolated engine/component memory. Each 10,000-record restore refusal leaves the prior receiver, so its final disposal stage is not disposal of a successfully restored 10,000-record index.

| Records | Stage | Main isolate usedSize | Worker isolate usedSize |
| --- | --- | ---: | ---: |
| 1,000 | Empty owner | 1,342,688 | 499,020 |
| 1,000 | Built; caller input released | 1,515,352 | 2,461,460 |
| 1,000 | Source encoding held by caller | 1,652,096 | 2,833,452 |
| 1,000 | Owner/handles disposed; worker alive | 1,537,012 | 1,676,100 |
| 10,000 | Empty owner | 1,342,688 | 499,020 |
| 10,000 | Built; caller input released | 1,556,948 | 11,508,108 |
| 10,000 | Source encoding held by caller | 2,577,564 | 11,813,444 |
| 10,000 | Owner/handles disposed; worker alive | 1,547,560 | 1,658,960 |

Every run records nine stages/54 collection-stage readings and eight statistical profiles. Raw operation readings, per-field observed maxima, request/response gaps, profile totals and unresolved samples stay in the report and its six adjacent compressed profile artifacts. Across 269,579 statistical samples, four node references are unresolved, with 138,096 reported sample-size bytes; these remain explicit without frame attribution. At 1,000, transport records 21 requests plus 21 responses; at 10,000, 55 requests plus 55 responses. Each includes disposal. Every observed caller `postMessage` uses one argument. Source strings are 104,328 and 1,010,890 UTF-16 code units respectively at both export reception and restore dispatch. These lengths are not heap bytes or clone-buffer measurements.

## Reproduction and checks

Use an existing real installed consumer whose production files match the current build. Output must be a **new** path: exclusive file creation rejects overwriting existing reports/profile artifacts. The smoke option performs only one 1,000-record development observation and is excluded from qualification repetitions.

```sh
npm ci
npm run build
node --test bench/memory/browser-cdp.test.mjs
node bench/memory/browser-run.mjs /absolute/installed/consumer /absolute/new-report.json
```

The actual consumer and arguments are in the primary report. The [console log](RX-4002-memory-browser-run.log) retains all six actual outcomes. `npm ci` passed with the existing esbuild postinstall-policy warning; compilation and the existing binary worked without changing that policy. The focused [helper log](RX-4002-memory-browser-focused.log) passes **4/4**, zero failed/cancelled/skipped. Browser resource runs were serial and finished before full project regression began.

The runner produces ordinary JSON plus compressed profile artifacts. This completed primary JSON is archived after execution to avoid a million-line generated-data diff. Decompress it with `gzip -dc docs/evidence/RX-4002-memory-browser.json.gz` or a standard gzip reader; the recorded invocation’s output path describes the original experiment, not a requirement to overwrite evidence during inspection.

Independent [review](RX-4002-memory-browser-review.md) returns **Ready with follow-ups** for the bounded continuation, with no unresolved blocking harness/provenance/arithmetic finding. It independently checks all 48 profiles and source/package bindings, literal behavior, observed maxima and every printed numeric cell. The full criterion/task remains Unable to verify / Blocked.

Final `npm run check` with approved local browser/loopback access passes **595/595**: 518 package/core/tooling/memory-method, 26 UI, 24 worker, 26 IndexedDB and one migration-browser scenario, with zero failed/cancelled/skipped. Planner/docs, typechecks and build pass; the complete [check log](RX-4002-memory-browser-check.log) is preserved. No production/harness source changes followed the measurement or full check. Final manifest evidence additions and documentation are followed by regenerated-doc, local link/planner/next/tracking-preview and whitespace checks; preview makes no remote write. All existing acceptance criteria, dependencies and other task states are unchanged. The manifest returns RX-4002 to Blocked; this does not turn the observed restore refusals or missing qualification into Pass.

## Remaining qualification

RX-4002-AC03 remains incomplete. These observations can add actual browser/isolate and source-reindex receiving evidence; they cannot establish exact exclusive source/index/side retention, mutation/encoder/decoder allocation peaks, hidden transport buffers, combined renderer/worker/process memory or other browser configurations. F01, remaining exact AT/Inspector/context findings and other memory requirements remain distinct. No accepted owner typing or screen-reader flow needs repeating for this memory slice. RX-4003 still waits and N5 remains deferred.
