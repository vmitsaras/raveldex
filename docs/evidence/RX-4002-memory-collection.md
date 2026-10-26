# RX-4002 — Observer-held component release

Date: 2026-10-26. Baseline: `7396656`. Status: **Direct root release observed; descendant identity/byte attribution Blocked**. This bounded continuation observes WeakRef root collection after public disposal. Independent review exposed an invalid snapshot-ID identity assumption; the descendant-byte interpretation is quarantined. It changes no production source, API, runtime dependency, resource limit, acceptance criterion or release claim.

## Contract and method decision

Independent read-only review reconciled the method with RX-4002-AC03/AC06/AC07 and [the verification plan](../planning/VERIFICATION_PLAN.md#retained-and-peak-memory). The accepted contract requires distinguishing retained representations, old/staged mutation state, codec/transport buffers and worker/process scope, with actual observations and honest isolation limits. It does **not** add a requirement to account mathematically for every VM/native byte. The newer “exact exclusive bytes” wording is a method-level target, not an extra release criterion.

This clarification does not complete AC03 or waive missing observations. [The worker contract](../architecture/ADDONS_AND_ADAPTERS.md#worker-adapter) explicitly requires transport work and peak copies measured separately from worker heap. Earlier message shapes/lengths and sampled isolate maxima do not supply those measurements. Old/staged mutation and codec-buffer attribution also remain incomplete. No narrower release support claim is proposed.

## Experiment

The [runner](../../bench/memory/collection-run.mjs) stages the unchanged RX-4001 ASCII fixture and a new [child](../../bench/memory/collection-child.mjs) in a real installed tarball consumer. Configuration is **source phrases only**: native core, selected original body source and strict source phrases; no positions, snapshot codec, DOM, worker or persistence is imported into the measured child.

Each size (1,000/10,000 admitted records) has five independent fresh Node main-isolate processes: final no-op, release source-participant holder, release reverse-document holder, release dictionary/postings/statistics holder, and joint release of all three. This is **one process per size/branch**, not three statistical repetitions of each branch. No branch reuses another branch’s index or subtracts another process’s heap reading.

Every child builds through installed public `createRaveldex`/`addMany`, under unchanged limits, 256-record batches and 60-second deadlines. Literal arithmetic checks complete common/selective/strict-phrase totals, expected revision, page length, unique eligible returned IDs and finite scores. The private `getExecutionOwner` lookup only identifies the three actual committed component roots and creates WeakRefs; it never changes an engine root or execution method.

The child places those three roots in an explicit observer holder, invokes public disposal, releases facade/owner/registration/input/result bindings, and returns from the build frame. Before the first snapshot it observes owner/facade/full-root collection through WeakRefs. The retained component structures are now **observer-held post-disposal data**, not an ordinary live engine or a public component-removal operation.

Three snapshots follow three `setImmediate` → explicit GC → 25ms settling cycles each: held baseline, unchanged-holder no-op, and final selected release. Each snapshot records numeric process readings and boolean WeakRef observations. Full dumps contain only this sanitized child’s synthetic corpus/harness/module heap and stay in its owned temporary folder. The child never parses a dump, creates inspector object handles or stores strong references obtained from WeakRefs across collection.

Literal controls calibrate root observations: a strongly held object survives; a released object becomes collectible; a shared object remains observable while both selected references are removed and only a separate global external alias remains. Kept roots remain strongly held and released roots are checked by WeakRef. These controls do not establish identity continuity for every descendant snapshot ID. Collection failures require retainer investigation and cannot produce invented component totals.

The [offline parser](../../bench/memory/collection-graph.mjs) runs in the separate parent after its child exits. It identifies a selected property/element/backing-store/frozen-array numeric/string-parent graph and saves a deduplicated numeric cohort with overlapping role masks. It excludes prototype/weak/hidden edges and most runtime internal edges, rather than proving all reachable nodes are pure application data. The initial method treated later snapshot ID presence as original-object survival. **That inference failed in the actual dumps.** A [V8 API statement about stable IDs for the same object](https://github.com/nodejs/node/blob/v24.21.0/deps/v8/include/v8-profiler.h) and passing literal controls did not establish a reverse same-ID/same-object guarantee for this experiment.

The frozen v1 cohort records each ID, baseline type/self-size/role mask, literal ID presence and later same-ID sizes. Its original `survivingSizeChanges` label is invalid for the nine incompatible identities below. Its numeric size arithmetic is preserved but is **not accepted collection, survival, retained-memory or freed-byte evidence**. Individual branches keep both other component roots held; joint release uses its own process. Only the direct WeakRef root observations are accepted as collection evidence here.

## Review and development checks

Five final focused tests cover literal sharing, frozen-array/string backing data, prototype/weak exclusion, raw presence/churn/reappearance/size arithmetic, malformed/overflow schemas, and the identity guard. A regression deliberately gives one ID a different type/name while keeping its size unchanged: byte attribution remains Blocked. Matching type/name also remains Blocked because the guard cannot rule out same-type/name reuse. No ranking/tokenizer implementation supplies expectations.

The first 1,000-record side smoke observed collection of the disposed owner/facade/full root and the released participant root, with zero no-op cohort disappearance. It predates the final external-alias control repair and is excluded from the ten main branches. Its source hashes remain bound to that development version.

Independent code review found that the shared control originally retained another selected reference alongside its outside alias. The ten-branch experiment deletes **both** selected shared references and verifies survival through the external alias. It also rechecks executed staged and installed files at completion. No production issue was inferred from these harness corrections.

## Actual root observations

The [frozen v1 report](RX-4002-memory-collection.json) is 154,902 bytes, SHA-256 `b63970adf19acbccfd66a4704ed34d9488a332713147f8ecb260f6a5e30b3169`. Its original aggregate `ObservedWithLimitations` is not the final descendant-attribution disposition. All ten owned child processes exited successfully and supplied 30 hashed snapshots. The report binds Node **24.21.0**, V8 **13.6.233.17-node.53**, all 208 installed/current production files, the unchanged tarball hash and five preserved earlier memory reports. The separate [post-run host context](RX-4002-memory-collection-environment.json) identifies Darwin/arm64 and clearly distinguishes this later inventory from per-child probes.

| Branch at each of 1,000/10,000 records | Direct final WeakRef observation |
| --- | --- |
| No-op | All three component roots remain held. |
| Source-participant release | Participant root collected; reverse and field roots remain held. |
| Reverse-document release | Reverse root collected; participant and field roots remain held. |
| Dictionary/postings/statistics release | Field root collected; reverse and participant roots remain held. |
| Joint release | All three component roots collected. |

Before every baseline, the disposed facade, owner and full root were collected: 30 direct witness observations. Across final stages, all 12 intentionally released component-root witnesses were collected and all 18 retained component-root witnesses remained live. Every negative literal control was collected; positive and externally aliased controls survived. Literal query totals were 1,000/27/334 at revision 4 and 10,000/271/3,334 at revision 40, with complete eligible unique finite pages. These are bounded real observations, not universal leak freedom or a byte total.

## Identity defect and fail-closed repair

Independent analysis checked all 30 original dumps (448,116,756 bytes), ten compressed cohorts and 986,070 cohort rows without calling the parent parser/summary. Its [arithmetic/provenance audit](RX-4002-memory-collection-independent-audit.json) and [identity audit](RX-4002-memory-collection-identity-audit.json) preserve the findings. All nine original “surviving size changes” instead have incompatible type/name descriptors: three in 1,000/fields, four in 10,000/reverse, one in 10,000/fields and one in 10,000/joint. No no-op descriptor conflict was seen; that does not prove other identities.

For example, ID **75041** was the 56-byte `Object` at `reverseDocuments.buckets[12]["item:08479"]` in the joint 10,000 baseline. The final node with ID 75041 is a 64-byte `code` / `system / FeedbackVector`. The original document cannot be called a survivor from that ID. The earlier progress-update description of changing strings was incorrect; these inspected changes concern document/posting objects or backing arrays and later runtime nodes.

This is a **measurement/interpretation defect**, not a native search failure. [The matching V8 source](https://github.com/nodejs/node/blob/v24.21.0/deps/v8/src/profiler/heap-profiler.cc) already enables move tracking after snapshot capture. Its [object map](https://github.com/nodejs/node/blob/v24.21.0/deps/v8/src/profiler/heap-snapshot-generator.cc) uses address-keyed entries and can return an existing entry while updating size. Address reuse is a candidate explanation; the exact allocation/mapping sequence was not traced. No V8 bug or untested `startTrackingHeapObjects` remedy is claimed.

The repaired helper records descriptor conflicts and blocks descendant-byte attribution **even for rows with no detected conflict**, because matching type/name cannot exclude reuse. Later same-ID sizes are labeled literally; they are not “surviving object” sizes. The future runner’s v2 outcome explicitly distinguishes direct root observations from Blocked attribution. No native workload was rerun merely to obtain cleaner numbers.

The [same-dump reconciliation](RX-4002-memory-collection-reconciliation.json), SHA-256 `a3a3727f0f80d24e6fc924f584fed3ea012291936271af296a49280df64b2a37`, rechecks all original dump hashes, direct controls and immutable source/cohort bindings. It finds exactly nine descriptor conflicts and returns **`ObservedRootRelease_DescendantAttributionBlocked`**. The [exact v1 executed sources](RX-4002-memory-collection-v1-sources.json.gz) were archived before repair: the frozen run is not rebound to the newer helper. Earlier Node, graph-cut, receiving and browser artifacts are unchanged. Original quantitative v1 cohort tables remain quarantined throughout, including the six rows without an observed descriptor conflict.

## Reproduction

The current runner requires a new output path and emits only roots-observed/attribution-Blocked scope. Reconciliation needs the original temporary dumps and refuses missing or changed inputs; it runs no build, browser, native workload or GC.

```sh
node --test bench/memory/collection-graph.test.mjs
node bench/memory/collection-reconcile.mjs docs/evidence/RX-4002-memory-collection.json /absolute/new-reconciliation.json
```

The [development smoke](RX-4002-memory-collection-smoke.json.gz), [run log](RX-4002-memory-collection-run.log) and [initial focused log](RX-4002-memory-collection-focused.log) stay separate from final identity-guard verification. The smoke’s raw JSON SHA-256 is `987a3c09a8e84416360c79933834b37ea02d4a5ff5c754cb532559746afa6f56`; it predates the external-only control and identity correction.

## Final verification and synchronization

The [final guard log](RX-4002-memory-collection-guard-tests.log) passes **5/5**. Parent-run `npm run check` with approved browser/loopback access passes **600/600**: 523 package/core/tooling/memory-method, 26 UI, 24 worker, 26 IndexedDB and one migration-browser scenario, zero failed/cancelled/skipped; [complete log](RX-4002-memory-collection-check.log). `npm ci` and build passed with the existing esbuild postinstall-policy warning; the policy and dependency graph were unchanged. A descriptive runner metadata phrase was corrected afterward; no production or harness behavior changed after the check.

Independent [review](RX-4002-memory-collection-review.md) is **Ready with follow-ups for roots-only scope**, while descendant attribution/full AC03 remain Blocked. The original and reconciled artifacts retain distinct hashes/source bindings. Manifest, generated task/roadmap, project context, handoff and support/method records are synchronized to that disposition. Final planner/generated-doc/link/next/preview and whitespace checks follow the documentation changes; tracking preview is local. All seven acceptance criteria, dependencies and other task states remain unchanged; no new implementation task is invented to bypass blocked release work.

## Remaining qualification

Direct root collection is observed. Descendant identity/byte attribution is Blocked pending a calibrated, source-backed identity/liveness method; ordinary snapshot-ID equality is insufficient. Pursuing those extra byte claims is conditional and does not add a release gate. The accepted mutation-staging, codec-buffer and separately measured transport work/peak-copy requirements remain incomplete. Positions, physical latency and AT gain no new claim from this experiment. RX-4002 remains Blocked; RX-4003 waits and N5 stays deferred. Accepted owner UI/input observations remain preserved without repetition.
