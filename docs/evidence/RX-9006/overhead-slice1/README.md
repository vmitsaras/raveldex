# RX-9006 — first verification-overhead slice

6 November 2026. **The three verifier efficiencies are implemented and focused/differential checks pass.** Closing project/private-candidate checks pass: 1,489 tests, 1,481 passed, eight intentional comparator skips and zero failures/cancellations/todos. RX-9006's complete benchmark acceptance remains blocked: the original recovery attempt has 146/204 completed contexts. No canary or benchmark collection was started by this slice.

The owner authorized the first slice of the [reviewed plan](../../../planning/RX-9006_VERIFICATION_OVERHEAD_PLAN.md) and relevant checks, explicitly excluding canaries and another benchmark run. Profiling hooks, new budget policies, the conditional structural comparator and future collection remain deferred. The proposed 450-minute/360-second policy is not implemented or activated here.

## Implementation

- [Recovery state/exercise](../../../../bench/n10/host-recovery-case.mjs) omits position/offset expectation allocations in source-only checks while retaining independent tokenization, TF/DF/posting/source/metadata/count assertions and exact participant membership. Positions mode still checks every occurrence and original UTF-16 offset.
- [N10-local verification support](../../../../bench/n10/host-recovery-verification.mjs) creates privately authenticated, immutable, exact-encoded-string-bound source handles. Every fresh capture is fully parsed, checksum-checked and normalized once, even if its bytes match a previous capture. Comparing already validated donor/receiver facts avoids reparsing both. Fresh native exports and exact prior encoded-byte preservation checks remain.
- The same helper owns strict immutable literal copies before native calls and before replacement calls. Sorted expected IDs/source canonical payloads are derived lazily at existing first-verification points and reused for donor, prior, post-write donor and post-write prior populations. No observed root/page/source result substitutes for a fresh observation. No full token/posting/position expectation cache was added.
- Authority and retained context facts are released on every terminal path, including early build/export refusal, Unknown and donor-disposal failure. Existing first-error versus cleanup-error precedence is retained. These are logical lifetime checks, not physical heap/GC observations.
- [Host staging and row validation](../../../../bench/n10/host-recovery.mjs) copies, bundles and pins the new helper and binds the dated verification revision through preparations, configurations, exercises, rows and reports. Advertised falsey, forged or one-sided revision fields fail closed; genuinely absent historical fixture metadata remains supported. Old sealed preparations fail the new revision check rather than silently acquiring a new verifier.

Revision: `rx9006-recovery-verification-2026-11-06-slice1`. This is verifier identity, not collection readiness or performance acceptance. Actual ownership copies and deep-frozen parsed facts change allocation, retention and warming. No speedup, elapsed-time reduction, heap improvement or reduced rerun budget is established.

All native operation/query/snapshot/disposal ordering, branch-dependent membership pages, offsets/limits, options, abort scheduling, source/receipt/later-write checks and online live-root/AVL/staging witnesses remain. The commonly observed successful 10k branch has 207 membership pages; other outcome branches retain their own complete obligations.

Production runtime, dependencies, frozen N9 helper, RX-9001 method files and native options remain unchanged. The actual collector policy remains 10,800,000ms total/300,000ms context; ordinary deadline omission, explicit60s, forced1ms, maxHits100 and public-worker65s response behavior are unchanged.

## Preserved original state

Starting HEAD is `576c0412aa7876ec443abd2ee884c2d286ba6b0c`, with all prior uncommitted user work present. [The baseline](baseline.json.gz) binds 6,143 existing files and the original roadmap/status before this slice. Every one of the previous 5,810 closing non-task-evidence inputs matched that earlier snapshot before editing.

[Original recovery source pins](v1-source-pins.json) preserve all 16 executed harness inputs; original method tests/browser source were also copied under `v1/`. Original source bytes, incomplete-run data, old reviews and unsuccessful attempts are retained. Markdown source copies use `.md.source` so their historical relative links are not falsely rebased into a new documentation tree. This source snapshot is not a standalone consumer: preserved archives and unchanged repository dependencies remain required.

The archived v1 case and unchanged N9 helper are the reference for differential checks. No old prepared directory was patched. The old [RX-9006 evidence](../../RX-9006.md), [readout](../../../evaluation/RX-9006.md), original-only owner decision and historical closing-report bindings remain unchanged.

## Verification actually run

| Check | Result / scope |
| --- | --- |
| [Combined focused suite](checks/focused.json) | **116/116 Pass**: 14 browser-method, 22 original recovery-method, 12 new verifier and 68 independent fake-owner coverage cases. |
| [Independent fixture coverage](validation/summary.json) | **68/68 Pass**: exact v1/new native-call/options/page/capture/persistence/disposal transcripts, success/refusal/cancel/Unknown branches, receipts, later writes and corruption rejection. No native engine instances. |
| [Independent literal-source replay](validation/independent-capture-replay.json) | **Pass**, all 1,280 source snapshots and 970 private captures from the 146 completed original contexts; complete applicable literal-source/core/UTF-16 assertions and six independent membership negatives. |
| [Preserved-v1 versus revised verifier](validation/capture-differential.json) | **Pass**, all 2,250 captures, 118 normalized source-pair comparisons, 1,210,916 source-record assertions, 998,692 private-record assertions and 5,323,456 original offset assertions. Case/helper pins remained unchanged. |
| [Independent adversarial helper review](review/adversarial.json) | **11/11 Pass**: forged/foreign authority, fresh same-byte captures, accessor/hole traps, prototype-named keys, sharing/negative zero, population reuse and closed authority. |
| [Static staging/import/bundle check](checks/staging.json) | **Pass**, six isolated package copies, six generated Node-child syntax checks, pure support imports and twelve browser bundles containing the helper. **Zero contexts executed**; no engine initialization or collector call. |

The original online exercise checks membership revision/total/completeness/IDs/zero scores; its independent replay separately enforces the model field. This layer distinction is preserved. The independent replay gate rejects wrong-model fixtures; the online-v1 assertion scope remains unchanged.

Fixtures cover late-page omissions, duplicates/order, source changes, TF/DF/posting/count corruption, provider membership, original offsets, prior/later-write states, forged receipts, persistence failures and Unknown reconciliation. Controlled fake owners establish harness behavior, not fresh native-host performance. Saved-data replay covers only original completed paths; it does not fill missing controls/diagnostics or reobserve live frozen-object/staging witnesses. Those live source paths remain unchanged.

Commands:

```sh
node --test --test-concurrency=1 test/comparison/n10-host-browser-method.test.mjs test/comparison/n10-host-recovery-method.test.mjs test/comparison/n10-host-recovery-verification.test.mjs test/comparison/n10-host-recovery-verification-coverage.test.mjs
python3 -B docs/evidence/RX-9006/overhead-slice1/validation/prepare-capture-replay.py
node --max-old-space-size=6144 docs/evidence/RX-9006/overhead-slice1/validation/replay-captures.mjs
node docs/evidence/RX-9006/overhead-slice1/review/adversarial.mjs
node docs/evidence/RX-9006/overhead-slice1/checks/staging.mjs staging-only-03
```

Exact fixture inputs, source pins, stdout and limits are in the linked reports/scripts. The 6GiB Node heap option applies only to the offline replay process, not a product-memory measurement. These are test/data-replay/build-only commands; no collection command was invoked. The staging script calls `prepareRecovery` only to copy/compile/pin assets, then checks syntax/imports; generated child/app/worker entry points were not executed.

## Attempts and review

The first static staging check failed before copying or compiling because its temporary parent directory was absent. [The original failure and script](checks/staging-attempts.json) are preserved; parent setup was corrected. Attempt2 passed, then a confirmed standalone revision-validation guard was tightened. Attempt3 passed against final source. This was check setup and a validation refinement, not a native recovery failure. All data-replay runs passed; the independent fixture suite expanded through preserved passing 46/53/68-test runs.

The subagent-delegation-router workflow assigned disjoint implementation, independent validation and review ownership. Parent-owned evidence/documentation and closing checks are separate. No source changes occurred during capture replay; the later host-only metadata guard did not change the replayed case/helper bytes. The final staging and focused suite include that guard.

[Independent implementation review](review/final.json) and its [readable report](review/final.md) pass within the stated scopes. The standalone revision-advertisement finding was corrected and tested; no blocking implementation finding remains. [Closing full-project/private-candidate verification](checks/attempt-01/validation.json) passes with all 6,195 guarded inputs, HEAD and non-output status unchanged during the check. The verified archive is byte-identical to the original RX-9006 private candidate (`4dd0f8333ff95d0c7e50f2a91a028e41122bdf127f5fadf92dd1104eb4589b0c`). Actual environment is Node24.21.0/npm12.2.0/macOS27.0.1 arm64 with Chromium behavior checks, using the offline task cache. These are local uncommitted-worktree checks, not new exact-head or remote CI qualification. [Final package/runtime identity](checks/attempt-01/identity.json) confirms all 380 installed members, 345 compiled implementation members, 194 runtime inputs and nine original frozen-method files; the original measured-current archive differs only in publication-status prose. [Closing local checks](checks/final-checks.json) pass docs/planner/existing Pages inventory/local tracking preview and tracked diff whitespace checks. Pages was not rebuilt or observed live, and tracking preview made no network requests. [Preservation audit](checks/preservation.json) passes: 6,134 original files unchanged, nine authorized existing paths changed, three new source/test paths, all 79 other tasks/twelve milestones and four foreign N11 files preserved, and all sixteen v1 source copies exact. No checked code input changed after the full check. Full recovery acceptance, fresh benchmark-cohort scheduling/deadline behavior, canary feasibility, speed and heap effects remain unverified.

## Remaining task boundary

The first slice does not affect the slowest ordinary worker export-refusal path's native build/export/query work. It does not prove that a 300s watchdog has adequate margin. Keep both proposed run-policy alternatives as proposals. A later bounded slice can implement the reviewed profiling/policy prerequisites; explicit authorization remains necessary before canaries or collection. RX-9007 and dependent N11 implementation continue to wait for complete RX-9006 acceptance.

No commit, push, tag, release, registry publication, remote tracking mutation or live deployment is performed by this slice.
