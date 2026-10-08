# RX-4002 — Offline recorded-graph retention continuation

Date: 2026-10-08. Baseline: `32f2a13`. Status: **Blocked / additional observed memory scope**. This slice adds a separate graph-cut analyzer and real offline observations from the existing 16 heap dumps. No native resource workload, browser matrix, or heap collection is repeated. The full task remains incomplete.

## Scope and acceptance

The live planner initially reported 19/21 release tasks done, RX-4002 Blocked, RX-4003 waiting and zero ready tasks. RX-4002 was resumed for this bounded memory slice. All seven acceptance criteria, dependencies, completed-task states and deferred N5 scope remain unchanged.

| Criterion | Continuation outcome |
| --- | --- |
| AC01 — browser environments | **Blocked**, unchanged Firefox launch and native WebKit facet-clearing observations. No browser qualification rerun. |
| AC02 — exact-tool AT | **Blocked**. No new human speech/focus observation or AT pass. |
| AC03 — memory scopes | **Blocked / additional graph observations**. Complete recorded-graph node/group cuts now complement selected-data reachability and original process samples. They do not establish exact V8 GC retention, staging/serialization allocation peaks, decode/restore or browser-worker/transport memory. |
| AC04 — physical device | **Blocked**. No actual display/input/IME or physical presentation session. |
| AC05 — 1,000/10,000 workloads | Existing measured-configuration evidence preserved. Offline analysis uses the existing dumps at those sizes; it is not a repeated workload. |
| AC06 — concrete missing observations | Missing collector/allocation/browser/AT/device evidence remains explicit. No encoded length, process delta or graph model is substituted for it. |
| AC07 — no silent waiver | No acceptance amendment or narrower release claim. RX-4003 still depends on completing RX-4002. |

## Actual method and results

The [new artifact](RX-4002-memory-retainers.json) binds the frozen primary report, the 16 original dump hashes and four analyzer/test/wrapper/helper sources. Its final SHA-256 is `f2d9cf3f9aec3deaf75b34434865a4d1f9754f099ba6e22ec53f3063c77a293e`. Fifteen preserved report/probe/log inputs are checked before and after execution; 14 existed at the baseline and one is the new focused-test log. The [execution log](RX-4002-memory-retainers.log) retains both distinct sequential offline derivations: the second rebinds repaired output protection and invocation provenance, with identical numerical graph observations. Node 24.21.0 / V8 13.6.233.17-node.53 / macOS arm64 is the offline analyzer environment; original workload environments and cleanup remain in the original reports.

The analyzer starts at the recorded synthetic root, neutralizes exact observation scaffolding, and retains outside paths when calculating node-cut effects. It includes runtime/backing/context/prototype paths omitted by the earlier selected-data parser. Component marker labels must agree with the marked index root's actual `documents`, `fields` and `participants` targets. Unknown/malformed schemas, markers, string families, graph targets and inaccessible/unreachable seeds reject; a genuine zero-size effect is distinct from a missing observation.

`graphCutSelfSizeBytes` is the deduplicated recorded self-size that becomes unreachable after deleting specified nodes from **every alias** under the declared graph policy. It is not a one-owner-reference release, public disposal effect, exact V8 collectible size, Chrome DevTools retained-size value, or allocation peak. Three policies expose shortcut and labelled ephemeron sensitivity; conditional key/table GC is not implemented. Full details and the six built-state component tables are in [the method](../evaluation/RX-4002-memory-method.md#offline-recorded-graph-cuts).

The joint built-state effects at 10,000 records are 14,382,112 bytes core, 19,019,136 source phrases and 37,554,656 positions/offsets. Joint effects are traversed independently rather than inferred by adding component figures. The precommit markers still identify committed state, while other structurally identified roots preserve shared data; their cut effects supply no staging-role or peak claim. The three policy cut results agree on these dumps, while literal fixtures show policy differences. All actual markers are in-object; marker PropertyArray ownership is tested separately.

## Checks and failure classification

`npm ci` passed with the existing esbuild install-script warning. Initial `npm run check` hit localhost `listen EPERM`: 474/475 first-phase tests passed, later phases did not run. This is an **environment failure**, preserved in [the sandbox log](RX-4002-retainers-baseline-sandbox.log). The same unchanged baseline check with approved localhost/browser access passed **541/541**, with zero failed/cancelled/skipped; [baseline log](RX-4002-retainers-baseline.log).

Independent review identified contradictory consumed schema descriptors, unchecked marker component-role targets, an invalid exported-string family and output aliases that could overwrite immutable evidence. These are **analysis/harness defects**. The default execution preserved the inputs; destructive alias examples were not executed against real evidence. The repairs reject malformed inputs and protect canonical paths, symlinks and existing hardlinks using disposable scratch-file regressions. The numerical analyzer remains unchanged while a final same-dump offline derivation rebinds wrapper/helper/test provenance after the safety repair.

`npm run test:memory-method` passed **19/19**, with zero failed/cancelled/skipped: three existing selected-data parser tests and 16 new graph/guard tests. The new tests include 48 fixed-seed graphs against an independent fixed-point removal oracle, literal outside-path/alias/sharing/cycle/edge-policy cases and scratch-file output protection; [focused log](RX-4002-retainers-tests.log).

Executed analysis commands:

```sh
npm run test:memory-method
node bench/memory/analyse-retainers.mjs
```

No production source, public export/type, runtime/development dependency, lockfile, native analyzer/scorer, work/deadline/transport/capacity limit or package version changes. Package script changes only include both memory-method test files in the normal checks. No publication, release/tag, push, remote tracking write or N5 activation.

## Review and synchronization

Independent [review](RX-4002-retainers-review.md) returns **Ready with follow-ups** for this bounded continuation and **Unable to verify** for the full task. Its [probe](RX-4002-retainers-review-probe.json) passed ten audit groups and 1,740 cut comparisons with `--heaps`, using separate literal/generated graph expectations and five original dumps, including 10,000-record positions. The subsequent lightweight `--reuse-heaps` final audit has thirteen groups and explicitly reuses those five actual-heap observations against identical artifact/analyzer hashes, adding guard/invocation, package and full-check reconciliation without a fresh dump traversal. It independently checks all four current source bindings, 14 legacy artifacts against `32f2a13`, all 15 preserved inputs, policy/alias/zero/failure boundaries and the printed method cells. These are audit comparisons rather than added product-test counts. No unresolved accepted graph-arithmetic or native runtime defect remains. The default probe runs synthetic/provenance checks and omits the actual-dump groups. `--reuse-heaps` requires a matching prior actual-heap record; a fresh `--heaps` execution requires the original temporary files.

A [fresh installed package](RX-4002-retainers-package.json) and [static identity audit](RX-4002-retainers-package-audit.json) verify all 208 production files across seven distinct measured/fresh install directories. Current metadata/README match the fresh consumer, guarded startup reads remain empty and the fixed core remains 16,829 gzip bytes, 1,469 above the unchanged 15 KiB target. Public contracts, dependencies, production source and lockfile match the earlier measured runtime. This is a static/packaging check, without native resource measurements.

Final `npm run check` with approved localhost/browser access returned exit 0 and passed **557/557** (491 package/core/evaluation/memory-method, 15 UI, 24 worker, 26 IndexedDB and one migration-browser scenario), with zero failed/cancelled/skipped; [final check log](RX-4002-retainers-final-check.log). Planner, generated-doc/link, typecheck and build phases passed. After adding the existing review/package evidence paths and final documentation results, generated docs and local planner/reference checks passed again (65 local Markdown files). Runtime/harness files stayed frozen through the full check. The [planner status](RX-4002-retainers-handoff-status.log), [next selector](RX-4002-retainers-handoff-next.log) and [local tracking preview](RX-4002-retainers-tracking-preview.log) retain 19/21 release tasks done, RX-4002 Blocked, RX-4003 waiting and zero ready tasks; preview made no network request or remote write. Whitespace checks passed. No passing broad command supplies the missing qualification observations.

```sh
node docs/evidence/RX-4002-retainers-review-probe.mjs --heaps
node docs/evidence/RX-4002-retainers-review-probe.mjs --reuse-heaps
node scripts/evaluation-consumer.mjs docs/evidence/RX-4002-retainers-package.json
node test/qualification/package-audit.mjs docs/evidence/RX-4002-package.json docs/evidence/RX-4002-retainers-package.json docs/evidence/RX-4002-browsers-accepted.json docs/evidence/RX-4002-memory.json docs/evidence/RX-4002-retainers-package-audit.json
```

The next eligible work remains RX-4002's missing exact-tool/browser/device and scoped memory observations. RX-4003 cannot start from this graph analysis alone.
