# RX-3002 independent review

Outcome: **Ready with follow-ups**. Date: 2026-10-08. Reviewer owns this record and the independent probe only; runtime, primary tests, packaging and manifest synchronization have separate owners. No confirmed blocking defect remains in this slice.

## Scope and method

Reviewed the task's six acceptance criteria and approved adapter/core/ranking/execution contracts, actual frequency/reverse/directory/statistical structures, participant coordination, capability capture, public owner identity, optional codecs, qualification declarations and FIFO publication lifecycle. The default core remains `basic-v1`/`unqualified`; no MiniSearch, persistence, publication or N5 work is part of this slice.

`node docs/evidence/RX-3002-review-probe.mjs` independently bundles the current actual source with the installed esbuild into a temporary ESM module. It uses literal memberships/Unicode terms/original UTF-16 coordinates and independently computed corruption checksums, without importing production tokenizer, scorer or codec helpers for expected values. Actual platform signals and a separate manually controlled host exercise cancellation/cleanup. Source hashes must agree before/after the execution. The controlled host is not a browser-worker observation.

Current independent result: **14 Pass, 0 Fail**. Raw observations, exact Node/V8/ICU/Unicode/platform/architecture versions, source hashes and bundled input graph are in [RX-3002-review-probe.json](RX-3002-review-probe.json); the reproducible program is [RX-3002-review-probe.mjs](RX-3002-review-probe.mjs).

Reproducible command against the accepted durable package record:

```sh
node docs/evidence/RX-3002-review-probe.mjs \
  --package docs/evidence/RX-3002-package.json \
  --cost docs/evidence/RX-3002-costs.json
```

The recorded run used `--package /tmp/raveldex-rx3002-package-synchronized.json` after source/corpus/packaged README freeze; its exact artifact path remains in the raw probe record. All 14 behavioral probes passed. The final package audit also passed 79 declared distribution-input hashes and two synthetic-entry hashes, independently reproduced the exact minified and gzip identities for both graphs, and verified the current 34-section corpus hash. The cost audit passed 178 source/distribution implementation identities and the runner identity. Source hashes agree before and after the probe. Exact environment: Node 24.21.0, V8 13.6.233.17-node.53, ICU 78.3, Unicode 17.0, darwin arm64; the raw file also records OS release and complete runtime versions.

The final accepted [`npm run check` log](RX-3002-check.log) records **445 Pass, 0 Fail**: 406 core/tooling/package/add-on/snapshot tests, 15 UI scenarios and 24 real module-worker scenarios, with zero cancelled/skipped/todo. Focused final snapshot checks passed 32 tests. The accepted [durable package artifact](RX-3002-package.json) was compared directly against the independently audited synchronized capture: its package, core/snapshot graphs, startup, declarations and correctness objects are exactly identical. It passes public ES2022 declarations with no ambient DOM/Node types, nine complete small-corpus comparisons and 40 real-document comparisons in each packed/minified run, plus exact bundled parity and hidden-subpath/startup guards. These observations are distinct from independent controlled-host probes. The accepted manifest and generated planner now select RX-3003; code/corpus/packaged README stayed frozen through final verification.

## Concrete findings and their resolution

- The outer codec meter initially checked stops after a restore cursor had published and returned its result. This could reject a committed restore. The final done branch performs no late check; an independent structural signal getter becomes aborted exactly after publication, and the observed restore still resolves with committed revision 2 and new membership. This was a source finding repaired before the reviewer captured an executable failing build.
- Private per-record source staging initially reset participant work budgets. One complete restore now accumulates each participant's work across all staged records. The independent collision fixture creates 100 individually admissible donor writes under a 4,000-unit provider cap; export succeeds, complete restore rejects `WORK_LIMIT_EXCEEDED`, and the old root/revision/membership remain exact. No runtime cap was raised.
- The JSON number scanner initially allowed a whole-envelope-sized numeric token to reach a single regex/number conversion. The lexer now caps numeric tokens at 128 characters before those primitives. Independent valid-integrity malformed input, duplicate properties and unpaired surrogate escapes reject atomically.
- Native validation now refuses token counts exceeding logical original UTF-16 units, and complete selected source providers must sum to each document's exact original-unit count. Both corruption cases preserve the old root in independent probes.
- Source-origin qualification must be structurally valid even when its environment is deliberately different from the receiving profile. Missing environment fields, null environment and wrongly typed evidence entries reject; source reconstruction still explicitly uses the receiving analyzer.
- Qualified first-party source/position phrase and original evidence paths use the actual supported analyzer implementation plus matching participant revision/profile headers. Default-profile literal equality does not reject an explicitly qualified owner. Primary failed executions and repair classifications remain in the main task record.
- Raw native metadata must equal its captured canonical representation. An independently checksummed numeric `-0` is rejected as `INVALID_NATIVE_STATE`; duplicate metadata membership and undeclared fields likewise reject.

No source-review finding above is represented as an observed failing run when repair happened before execution. The independent raw record retains one actual failing review fixture: a provider cap of 40 correctly refused full-state export before reaching the intended cumulative-restore observation. The corrected 100-collision fixture targets that behavior without weakening bounds. It also preserves two historical artifact-audit failures: documentation changed the current corpus after focused/regression captures. Final synchronized package/current-corpus alignment now passes; those older snapshots are not substituted for final evidence.

## Acceptance assessment

| Criterion | Result and evidence |
| --- | --- |
| AC01: explicit compatibility identities/reasons | **Pass.** Header/codec implementation and primary corruption tests inspected; independent default-native gate, exact-runtime mismatch and malformed source-origin qualification pass. Final distribution/graph/current-corpus identities agree. |
| AC02: source reindex/native structural validation | **Pass.** Independent canonical terms containing punctuation/spaces remain one native term; complete source counts, reverse/statistics checks, metadata canonicality, position ordinals/spans and corrupted side references verified. |
| AC03: atomic complete publication | **Pass.** Exact old-root retention on malformed/limit/cancel/precommit failure; truthful postcommit result; ordinary FIFO/private publication seam. The genuine MAX-revision private owner fixture exercises `REVISION_EXHAUSTED` without claiming public-call history or origin resetting. |
| AC04: semantics/ownership/optional data | **Pass.** Literal native memberships and original UTF-16 spans, strict per-value phrases, later replacement and source-free export refusal. Primary score/facet/evidence round trips and actual public packed/minified consumers preserve declared semantics. |
| AC05: failure without corruption | **Pass.** Independent malformed JSON/header/metadata/side state, impossible counts, byte limit, cumulative work cap and eight source/native cancellation suspensions; complete measured source10000 work refusals preserve the previous root. |
| AC06: optional costs/imports | **Pass.** Optional import/startup/distribution graphs validated. Nine actual mode/size cost cases include 28 successful operations and two explicit resource-bound rejections; memory-method limitations remain visible. |

## Final artifact and cost observations

The synchronized package contains 182 files, 127,854 compressed tarball bytes and 550,123 unpacked bytes; SHA-256 `eecb1673b0f85b25d0fd4f9b2952ccab609a478b66db724fe0c8057b552838a7`. The current 34-section document corpus SHA-256 is `a3c318e00667faccdf8f143a6c0a4b64ad2ae6be873d0de99b3872c6c982ab0a`.

| Observed graph | Minified / gzip bytes | SHA-256 of minified output |
| --- | --- | --- |
| Core only, 31 inputs | 55,341 / 16,826 | `d16151fd9a80296ab95866f890cfb7a6bdf068e20beecc6c713ec44bcde37cd7` |
| Selected complete snapshot consumer, 50 inputs | 104,816 / 29,196 | `984b390185b6a60a55fda8ed212724e4b88ed5b0fad47da04bb0a9b40000187d` |

The graphs overlap and are not additive. Core still excludes codec/add-on modules and guarded startup host access, but exceeds the unchanged 15 KiB gzip target by **1,466 bytes**, an increase of 195 bytes from RX-3001. This remains a visible N4 qualification follow-up.

The cost sampler covers core, source, and source-plus-offsets at 100/1,000/10,000 records. All nine native exports/restores succeed. At 10,000 records, native UTF-8 bytes are 2,198,870 / 3,198,316 / 7,789,055 for those three modes, with native restoration work 10,929,896 / 16,147,218 / 33,529,256. All six source exports succeed; four source restorations succeed. The two 10,000-record source restorations reject `WORK_LIMIT_EXCEEDED` after 49,999,998 emitted units and preserve exact previous roots. A failing attempted charge may not be emitted. These are real bounded outcomes, not successful source round trips or claims of universal collection capacity.

## Qualification and remaining scope

The qualified factory creates an actual immutable descriptor at revision 0. It accepts a **trusted application declaration**, independently compares the running Node/V8/ICU/Unicode/platform/architecture record, and requires matching complete declarations for native import. Evidence references do not execute tests or establish project qualification merely by existing. This review verifies that declaration/compatibility boundary and specific local semantic cases; it does not establish all-Unicode or cross-host portability. Ordinary unqualified owners cannot be promoted by attaching codecs. Browser/worker native qualification is outside this initial path.

Source-free native state can prove structural bounds, exact ordinal coverage, frequency/posting/statistical consistency and stored coordinates. Correspondence to original characters is established only for explicitly retained source. Structurally plausible offsets within omitted text cannot be authenticated or reconstructed. The checksum detects accidental damage and is not authentication.

The 64 MiB encoded envelope cap includes headers, UTF-8 and JSON escaping. The unchanged core/participant work caps may reject an otherwise admitted live collection; a rejected measured case is a resource-bound observation, not a successful round trip. Process-memory observations include harness records, multiple engines, staged/current roots and encoded strings. Samples at yielded steps are not continuous peaks or isolated retained component bytes. Physical heap/latency, cross-browser/host qualification and remote CI remain separate follow-ups. IndexedDB save/load/erase belongs to RX-3003.
