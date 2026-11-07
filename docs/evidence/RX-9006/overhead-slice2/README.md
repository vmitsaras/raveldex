# RX-9006 — diagnostic verification phase hooks

6 November 2026. This bounded slice implements diagnostic profiling support and relevant checks. Focused/static and full project/private-candidate verification pass: 1,547 tests, 1,539 passed, eight intentional skips and zero failures. **No canary or benchmark collection is authorized or started.** RX-9006's original incomplete 146/204-context attempt remains historical evidence; this work does not fill its missing coverage.

The owner requested the next verification-overhead slice using the subagent-delegation-router skill. The selected scope is diagnostic-only phase observations from the [reviewed plan](../../../planning/RX-9006_VERIFICATION_OVERHEAD_PLAN.md). Named run policies, revised budgets, the conditional structural comparator and measurements remain deferred.

## Boundaries

The initial worktree was clean at d95fca13d2cf9ccd4119ef0b5c7fbea9053e8046. [The baseline](baseline.json.gz) records 6,227 existing files, original roadmap objects and the initial HEAD. Exact initial harness copies under baseline are byte-preservation artifacts; the independent test reference has its own complete imports and pins. All earlier failed attempts, captures, methods, reviews and first-slice evidence remain unchanged.

Production runtime, dependencies, the historical N9 verifier and RX-9001 freeze remain outside this slice. Collector limits remain 10,800,000ms total and 300,000ms per context. Ordinary native deadlines remain genuinely omitted; explicit60s, forced1ms, maxHits100 and public worker65s behavior remain unchanged. The proposed 450-minute/360-second policy remains unimplemented.

## Implementation

- [The N10-local profiler](../../../../bench/n10/host-recovery-profile.mjs) emits at most 10,000 scalar wall spans per context, including remote spans. Private span tokens enforce nesting, completion and lifetime; malformed descriptors, hidden/symbol fields, getters, nonfinite/backward clocks, overlapping unrelated intervals and overflow fail closed. Snapshots are immutable owned scalar copies. Source/root/page/record payloads are not retained in traces.
- [The exercise](../../../../bench/n10/host-recovery-case.mjs) creates the profiler only for diagnostic mode. Source exports, every fresh verification search, expected construction, actual decoding/comparison, diagnostic start/stop controls and existing acknowledged source/root persistence boundaries receive labels outside selected operation windows. The original CPU/start/settlement/sample interval and native build body remain unchanged. All branch-specific pages, options, abort scheduling, source/private/offset checks, receipts, later writes and disposal remain.
- [Verification support](../../../../bench/n10/host-recovery-verification.mjs) labels fresh strict source validation and authenticated source/population comparisons without changing the validation algorithm. Parser/checksum/canonicalization remains one inclusive phase because the frozen N9 helper exposes that combined operation. Expectation spans include cache lookup and lazy construction; they are not exclusively allocation or construction cost.
- [Host wiring](../../../../bench/n10/host-recovery.mjs) stages/pins/bundles the helper and binds exact verifier revision rx9006-recovery-verification-2026-11-06-slice2 and profile revision rx9006-recovery-phases-2026-11-06-slice2. Advertised malformed, misplaced, falsey or incomplete profiles/revisions and normal-lane observer leakage reject. Genuinely historical unadvertised fixtures remain compatible. Old preparations do not acquire the new identity.

Node-main, browser-main and browser-worker traces retain separate local clocks. Main root capture/bridge parents are inclusive; worker-local projection spans have matching capture labels but independent timestamps. Never add a parent to its children or subtract timestamps across realms. Bridge spans include RPC transport/serialization/dispatch and waiting; persistence spans include acknowledgement/bridge/serialization and writing. Neither is isolated engine CPU, disk latency, retained/peak heap or a complete exclusive decomposition. Uninstrumented residual checks/allocation remain. Normal mode reads no profile clock and emits no phaseProfile; diagnostic async hooks can alter scheduling/allocation/warming and require a freshly named future method before measurement.

A profiling completion failure preserves the original callback/persistence failure. Cleanup still runs, trace authority is released, and incomplete profiling cannot produce a passing collected row. Existing artifacts remain awaited and written at their original points rather than buffered until context completion. This does not make process interruption a native cancellation or produce missing evidence.

## Verification actually run

| Check | Result and scope |
| --- | --- |
| [Combined focused suite](checks/focused.json) | 174/174 Pass: browser-method14, original recovery22, first-slice verifier12, existing fake coverage68 and new profiling58. |
| [Independent differential fixtures](validation/summary.json) | 58/58 Pass against exact committed d95fca1 case/helper/N9-helper reference bytes. Native options/order/pages/captures/persistence/abort/disposal match across success/refusal/cancel/Unknown branches and both provider variants. Injected clocks establish diagnostic isolation, phase coverage, realms, lifecycle, overflow and error precedence. No native engines. |
| [Independent adversarial review](review/adversarial.json) | 10/10 Pass, including observer first-error precedence, immutable inclusive intervals, strict scalar remote validation, no normal clock and original selected-window/build source comparison. |
| [Static staging](checks/staging.json) | Pass: six isolated installed package copies, six generated child syntax checks, pure support-module imports and twelve browser bundles. Both revisions and the original 204-context/180-minute/300-second method match. Zero contexts or engine factories executed. |

Source/test pins remained stable during fixture validation, focused checks and staging. The previous first-slice 2,250-capture data replay is preserved; it was not rerun or represented as a new observation. The validation algorithm is unchanged and the relevant original source/private/offset corruption tests pass. Controlled fixtures establish harness behavior; they do not fill the missing native controls/diagnostic contexts or reobserve live root/AVL/staging witnesses on a real host.

Reproduction:

```sh
node --test --test-concurrency=1 test/comparison/n10-host-browser-method.test.mjs test/comparison/n10-host-recovery-method.test.mjs test/comparison/n10-host-recovery-verification.test.mjs test/comparison/n10-host-recovery-verification-coverage.test.mjs test/comparison/n10-host-recovery-profile.test.mjs
node docs/evidence/RX-9006/overhead-slice2/checks/staging.mjs staging-only-01
python3 -B docs/evidence/RX-9006/overhead-slice2/checks/verify.py attempt-01
```

Staging requires a fresh output name and the retained whole archives/consumers. It calls prepareRecovery only to compile/copy/pin assets; generated child/app/worker entries are never executed. The closing verification script invokes candidate:prepare, which runs npm run check and private installed-package checks. It does not call a collector.

## Review and attempts

The delegation router assigned disjoint source implementation, independent fixture tests, independent source review and parent-owned integration/evidence. Draft defects in first-error precedence, scalar trace retention, serial interval validation and metadata binding were fixed and regression-tested. Development RED logs and corrected test assertions remain under validation and review; none are native benchmark failures. An initial documentation-generation check rejected an in-progress task retaining a blocker; the temporary transition was corrected and the original blocker preserved for restoration. [Setup record](setup.json).

[Independent implementation review](review/final.json) passes with no unresolved findings. [Full project/private-candidate verification](checks/attempt-01/validation.json) passes on the first attempt: 1,547 tests, 1,539 passed, eight intentional foreign-comparator skips, zero failures/cancellations/todos. All 6,261 guarded inputs, HEAD and non-output status remained unchanged during the check. Actual environment: Node24.21.0, npm12.2.0, macOS27.0.1 arm64, Chromium, offline task cache. These are local worktree checks; the new slice is uncommitted.

[Package/runtime identity](checks/attempt-01/identity.json) passes: all 380 whole installed members match, all 345 compiled members equal original measured current, all 194 runtime inputs equal frozen/HEAD bytes, and all nine original method files remain unchanged. The verified archive SHA-256 is 4dd0f8333ff95d0c7e50f2a91a028e41122bdf127f5fadf92dd1104eb4589b0c, byte-identical to the original RX-9006 verified archive. Only historical publication-status prose differs from the older measured-current whole archive; that original identity remains distinct.

[Closing local checks](checks/final-checks.json) pass documentation/planner consistency, existing Pages output inventory/links, next-task selection, local tracking preview and tracked whitespace. Pages was not rebuilt or observed live, and tracking preview makes no network requests or remote writes. [Preservation audit](checks/preservation.json) passes: 6,217 of 6,227 original files unchanged; ten authorized existing files changed; two new source/test files; all 79 other task objects, twelve milestones, foreign N11 files and initial source copies preserved. All 3,610 checked code inputs remain unchanged after the full check; every original evidence file remains byte-identical.

The roadmap, handoff, context, specification and implementation plan describe this implemented/locally verified diagnostic slice separately from RX-9006's missing full recovery acceptance. Named bounded policies/supervision are the remaining implementation prerequisite; neither that implementation nor later canaries/collection is performed automatically. Full task acceptance, actual phase distributions, speed, heap/GC and fresh cohort feasibility remain unverified. No speedup, heap improvement, fresh host qualification, exact committed-head verification or remote CI claim follows these local checks.

[Independent closing audit](review/closing.json) passes the raw counts, log/input/source hashes, archive/member identity, documentation/status scope and byte preservation, including all 5,065 historical evidence files. No unresolved discrepancy remains.

No commit, push, tag, release, publication or remote tracking mutation is part of this slice.
