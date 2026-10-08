# RX-4002 offline graph-cut continuation — independent review

Date: 2026-10-08. Reviewer: delegated qualification-review agent, separate from the analyzer implementer. Baseline: `32f2a13`.

**Bounded continuation verdict: Ready with follow-ups. Full RX-4002 verdict: Unable to verify.** The repaired analyzer and evidence correctly measure named cut effects in declared recorded graphs. They do not establish exact V8 collection, owner-reference release, allocation peaks or the outstanding browser/AT/device requirements. No unresolved native runtime defect or accepted graph-arithmetic defect was identified.

## Actual independent verification

I inspected the actual analyzer, tests, output guard, sequential driver, new [raw artifact](RX-4002-memory-retainers.json), [memory method](../evaluation/RX-4002-memory-method.md) and [continuation evidence](RX-4002-retainers.md), against the seven original criteria and execution/memory requirements. I checked scientific claim boundaries separately from whether the graph computation is correct.

Executed the review-owned [probe](RX-4002-retainers-review-probe.mjs):

```sh
node docs/evidence/RX-4002-retainers-review-probe.mjs --heaps
```

Its [record](RX-4002-retainers-review-probe.json) binds the probe/analyzer/artifact identities and pinned baseline. The probe uses an independent high-level graph representation, different field/enum orders, Set/stack reachability, separate node removal and node/type summation. Expectations do not call the owner analyzer, parser, traversal, policy flags or aggregates. The owner analyzer is called only to obtain results for comparison on synthetic graphs; actual-dump expectations are computed from raw dump bytes and compared with the artifact.

The direct `--heaps` execution passed **10 groups and 1,740 cut comparisons**, including five fresh traversals of original dump bytes. The later `--reuse-heaps` reconciliation passed **13 groups**: it repeats synthetic/provenance checks and adds method-table, package and final-log checks, while retaining the five prior actual-heap groups only after matching the frozen artifact/analyzer hashes. It records the original traversal timestamp and executed-probe identity. This later audit does **not** reread the heaps or supply new resource observations; its 1,626 current synthetic comparisons plus 114 preserved actual-dump comparisons remain distinct from product-test counts.

The verification includes:

- Hand-sized cyclic/three-way shared graphs, aliased component seeds, a true zero-self-size effect, all seven outside-edge kinds, and an outside seed alias that survives a one-owner-edge release but is removed by full node deletion.
- Sixty-four different deterministic generated topologies across all three policies, separate from the implementer's 48 fixed-point graphs. Cut effects, shared effects, individual unions, extra joint effects, root/group effects and every type/byte aggregate agree.
- Twenty-three malformed/missing/unreachable/schema/marker/encoding/ephemeron cases reject explicitly; missing observations do not become numeric zero.
- Disposable scratch files prove canonical, `..`, file/directory symlink, hardlink, dangling-symlink and nonregular-output protection. No destructive case was executed against real evidence, sources or dumps.
- Five sequential original heaps: core built/1,000; source built/1,000; positions precommit/1,000; source held encoding/1,000; positions built/10,000. Direct dump hashes/lengths match the original raw report. Every reported baseline, individual/group/root cut, node count, type sum and shared/group aggregate agrees with the independent oracle under all three policies.
- All 16 new graph records match the original recorded dump hashes/schema/lengths. Four current executed sources bind the final artifact. Fourteen legacy evidence/probe JSON/log files are byte-equal to the pre-slice commit; all 15 preserved files match their before/after hashes, including the new focused-test log. Production source/lockfile, all seven criteria and other task states remain unchanged.
- The 24 numerical cells in the six new method rows and the precommit/policy/marker claims reconcile to raw observations. These comparisons preserve their named graph quantity rather than substituting process or encoded bytes.
- The fresh tarball, core bundle and gzip byte identities match their report. All 208 production files in each of seven distinct measured/fresh installed directories match current build bytes and recorded hashes (1,456 installed-file comparisons); their file inventories also agree. Five frozen browser-source identities bind their actual consumers. The fresh installed metadata/README/license match the repository; public metadata, dependencies, source and lockfile match the pinned baseline. The unchanged core target miss remains explicit: 16,829 gzip bytes against 15,360. This is static identity evidence; the startup observation is read from the fresh package report, not rerun by this probe.

The optional `--heaps` step requires the five original temporary dumps named in the raw report. Missing or changed files fail; the default probe runs documentary/synthetic/provenance checks and supplies no fresh actual-dump oracle. No new native workload, heap collection, browser run, screen-reader session or physical interaction was executed by the reviewer.

Executed the final lightweight reconciliation and local synchronization checks:

```sh
node docs/evidence/RX-4002-retainers-review-probe.mjs --reuse-heaps
npm run handoff:check
npm run docs:check
git diff --check
```

All passed. Generated documents match the manifest; 65 local Markdown files have valid local targets. The final full-check log records **557/557** across phases 491 + 15 + 24 + 26 + 1, with zero failed/cancelled/skipped/todo; the parent separately confirmed the approved process returned exit 0. I inspected and hashed that log rather than rerunning the native/browser suite. All 19 RX-4002 evidence paths exist, RX-4002 is Blocked, RX-4003 is planned/waiting, and the 19 completed release tasks, seven criteria and other task states are unchanged.

## Findings and repairs

| Finding | Classification | Resolution and evidence |
| --- | --- | --- |
| Consumed scalar schema descriptors could contradict the parser's interpretation, and marker component labels were not checked against actual marked-root targets. | **Analysis input-validation defects, repaired** | The analyzer validates consumed field descriptors, marker roles and graph targets; literal regressions and independent malformed inputs reject these contradictions. An extra unused V8 descriptor does not falsely invalidate the actual dumps. |
| An `exportedString` marker could target an arbitrary object while claiming encoding-string attribution. | **Analysis input-protocol defect, repaired** | Only string, concatenated-string and sliced-string families are accepted, with a separate rejection case. A genuine reachable zero remains valid. |
| A string-only input/output inequality allowed normalized aliases, other preserved evidence files, symlinks or hardlinks to be overwritten after preservation checks. | **Harness preservation defect, repaired** | The driver protects 42 input/source/dump paths before analysis and immediately before writing, using canonical and existing device/inode identities. It verifies preserved evidence after writing. Scratch-only independent cases confirm the guard; real originals stayed unchanged. |
| Wrapper/test/helper repairs changed executed provenance while the numerical graph algorithm stayed the same. | **Provenance reconciliation, complete** | Final offline derivation binds four current sources and actual arguments/input/output. It analyzes the same 16 dumps; graph content and numeric analyzer identities remain unchanged. No native resource measurement was rerun. |

Final raw artifact SHA-256: `f2d9cf3f9aec3deaf75b34434865a4d1f9754f099ba6e22ec53f3063c77a293e`. Numerical analyzer SHA-256: `9a2e4605e61a87d89e0e883b1fd6b4e41c2933b3ea6d881c5105ba47228bff40`. The original process report remains `3f95ed7609ec82b6eb68da667a4a599ab2d490e5b0a97de12a22869a06ef7fb9`.

## Scientific limits and acceptance

`graphCutSelfSizeBytes` sums the recorded `self_size` of vertices reachable from the synthetic root before a cut but unreachable after removing the named vertices from **every alias**. The observation marker and verified exclusively marker-owned backing store are neutralized. Other context, property, element, internal and hidden paths—including outside descendant retainers—remain. Shared/group sets are computed directly, not by adding overlapping component values. Actual markers require only one scaffold exclusion; PropertyArray neutralization is tested synthetically and is not mislabeled as an observed actual marker shape.

The primary graph excludes weak edges and non-root shortcuts; sensitivities include all shortcuts or omit labelled table-to-value ephemeron pair edges. These ordinary graph policies do not implement conditional key-and-table liveness, V8 collector behavior or DevTools user-object/dominator rules. Policy differences are not upper/lower collector-retention bounds. Equal effects on these dumps do not prove universal equivalence.

Full-node deletion differs from releasing an engine reference. A separate outside alias to the same seed survives an owner-edge release; full-node deletion intentionally removes that alias's target. These counterfactual bytes are neither a measured public-dispose effect nor exact collectible memory. Precommit markers still name committed state; structural root candidates have no inferred staging roles. Checkpoint cuts and held export-string effects provide no allocation chronology, staging/serialization peak, intermediate decode/restore buffers, browser renderer/worker/transport attribution or physical-process memory total.

RX-4002-AC03 remains **Blocked with additional bounded graph evidence**. AC01/AC02/AC04 retain Firefox/native-control, exact-tool AT and physical device/input blockers; AC05 retains its existing measured configurations; AC06/AC07 preserve explicit missing observations and unchanged requirements. RX-4003 still depends on completion of RX-4002. No contract, limits, dependencies, publication or N5 decision is changed by this review.

The [final check log](RX-4002-retainers-final-check.log), [fresh package report](RX-4002-retainers-package.json) and [static package audit](RX-4002-retainers-package-audit.json) support local regression and identity claims. Their passing outcomes do not fill the remaining qualification gaps.
