# RX-4001 independent review

Reviewer: `/root/evaluation_review`. Date: 2026-10-08. **Verdict: Ready with follow-ups.** All seven RX-4001 acceptance criteria have evidence, with no unresolved blocking native or evaluation defect. This verdict completes the bounded evaluation slice; it does not qualify a release or waive RX-4002.

This review uses the current source, frozen fixtures and raw observations. It does not accept the producer's intended verdict or foreign ranking agreement as correctness. Reviewer-owned reproducible calculations are in [RX-4001-review-probe.mjs](RX-4001-review-probe.mjs), with current checked file identities and results in [RX-4001-review-probe.json](RX-4001-review-probe.json).

## Acceptance review

| Criterion | Review status | Evidence and limit |
| --- | --- | --- |
| RX-4001-AC01 | Pass | Independent full-source references, hand-derived BM25 values, mutation reconstruction and source/position/mixed phrase parity are used. Sixteen fixture constants separately reconstructed from rational factors agree within 1.8e-15. Reviewer public installed probes add 28 literal queries and ten rational numerical assertions with exact representation parity, independently of producer/oracle helpers. The producer's broader replay and approved baseline remain separately inspected evidence. |
| RX-4001-AC02 | Pass | Frozen 34 allowlisted documentation sections from five files and 76 distinct useful query representations, including 70 known-relevant and six intended-empty cases. IDs/sets, corpus content hash and exact fixture hashes independently verified. Labels are one evaluator's incomplete English technical self-documentation judgments. Frozen hashes establish captured identity, not authenticated authorship chronology. |
| RX-4001-AC03 | Pass | Reviewer recalculates every primary metric from frozen acceptable IDs and raw complete ranked IDs without importing the producer's metric helpers. Ranking and intended-empty denominators, omission counts and zero outcomes agree. Twelve visible vocabulary failures separately checked against original source with a small independent scan. Relevance-label completeness is not asserted. |
| RX-4001-AC04 | Pass | Reviewer recomputes the 71 equal-membership subset, 11 changed orders and five unsupported rows from the final replay, plus both models' subset metrics. Current foreign commit/version/two entry hashes and all 344 tracked identities match the captured before/after aggregate. Fields, filters, phrase/count/source semantics and unsupported host/output/model differences are explicit. A translator edge defect found by review is repaired. |
| RX-4001-AC05 | Pass | All 27 accepted Node trial rows, nine diagnostic rows and 105 summary groups, plus nine Chrome trial rows/45 summary groups checked. Reviewer regenerates workload hashes and algebraic memberships/counts, recomputes attempts/whole-ms medians/maxima/outcomes, and checks typed refusals/uncertainty and subsequent state observations. Timing and work instrumentation are separately reviewed. Fresh owner/query first call is explicitly distinct from process cold. |
| RX-4001-AC06 | Pass | Core/source/positions and actual worker/storage are separate. All installed selected-graph module hashes and actual stored browser bundle bytes/hash/gzip checked; all 138 printed cost/graph cells agree. Logical retention, serialized UTF-8 and bundle sizes are never heap/peak-memory substitutes. Producer/receiver coexistence and browser unexposed work counters are explicit. |
| RX-4001-AC07 | Pass | No overall winner or automatic runtime expansion. Incomplete labels, lexical/ranking losses, source-rebuild limits, unchanged core gzip target miss and RX-4002 qualification limits remain scoped findings. |

## Oracle independence and score evidence

The existing exact/query reference imports no production module. Mutation and phrase references import the independent query reference, not the native analyzer/scorer. Their full-record scan, original-token Unicode regex, per-token NFKC normalization, independent Boolean/metadata eligibility, complete statistics and BM25 formula are separate from native indexing/retrieval. They construct complete expected membership/order before paging.

Literal Unicode/source spans and phrase boundary cases check the source semantics separately. The score fixtures contain authored decimals/rational cases. The reviewer independently reconstructs sixteen single/multi-field values using `ln(8/5)`, `88/73`, `44/53`, `ln(2)` and `11/8`; maximum absolute difference is `1.7763568394002505e-15`. This is arithmetic validation of the fixture constants, not a claim that re-running an oracle alone establishes independence. Mutation cases reconstruct corpus statistics after accepted/no-op/rejected actions, and phrase cases compare source/positions/mixed complete results and unrounded scores.

New reviewer runtime records independently verify exact AND and filtered scores, post-delete statistics, replacement with lexical/tokenless records, atomic failed batch preservation and clear. Literal phrase cases cover adjacency versus gaps, field/value boundaries, decomposed accents/ligatures, a fractional source token, exact totals with zero/past-end pages and no invented phrase bonus. Source/positions/mixed outcomes are exactly equal. The 28 literal queries and ten numerical assertions pass through the captured installed package's public imports only.

The reference input boundary is admitted-fixture data; invalid admission needs its separate production tests. All references and native execution use the host's JavaScript normalization primitive, so this does not establish cross-host Unicode portability. Foreign scores do not participate in native correctness expectations.

## Frozen relevance and comparison

The corpus content hash is `8ba88f8c4610a83ee3dcf453ce2434c16e6d2f3af070590f2e220c7bec28244b`. Exact corpus/judgment file hashes match `freeze.json`; all must-find IDs are acceptable and known-irrelevant IDs are disjoint. Later source documentation edits can legitimately differ from this deliberately frozen snapshot.

Enabled source/positions/mixed metrics independently recalculate to Top-1 `51/70`, Top-3 `58/70`, MRR `0.7761904761904762` and macro judged Recall@10 `0.6997619047619047`, with six correct intended empties and ten unintended empties. Core omits twelve phrase-capability queries and has a different ranking denominator (`60`); its aggregate is not an estimate of the phrase benefit. The recorded cutoff 100 covers the entire 34-record corpus. Unknown labels remain unknown, and the reviewer has not supplied a second complete relevance panel.

The separate twelve-query source scan confirms all eight natural-question empties, the `NFKC lowercase` and `4096 facts` empties, and eligibility losses for `atomic batch`/`unchanged reanalyzed`. These lexical results are correctly separated from ranking losses and preserved under unchanged labels.

The live read-only LocalSearch checkout is clean at `5f334a8ca4f7d9d95b6b731ac539f4b1dda302cb`, using actual MiniSearch 7.2.0. Its complete 344-file aggregate recomputes to `40fd61e25aa02eb01388eb9191af892ede734ab365c3ab1ff6ba616180014009`. Native NFKC and foreign NFC policies differ; mandatory foreign original evidence/snippets and source retention differ from ordinary native results. The comparison does not treat these as identical work or score models.

On the 71 equal-membership rows, the ranking denominator is 67 plus four intended empties. Native/foreign Top-1 is `49/67` versus `48/67`, both Top-3 `55/67`, with eleven changed orders. These restricted source labels support the printed values, not an overall winner. Unsupported Boolean/tokenless contracts remain five explicit Not comparable rows.

## Cost method and provenance

Reviewer calculations regenerate the deterministic ASCII corpus independently, verify its JSON identity, exact total/page IDs and revisions, and use algebra for selective/strict-phrase totals. Work counters are actual emitted `work-v1` observations from a separately untimed installed-private iterator seam; source inspection confirms no production rewrite and no observer in accepted timings. They are not independently derived counts of every host primitive or physical memory.

The accepted Node composite includes 21 initial owners and six isolated replacement owners for core 100/1,000. Every accepted sample/diagnostic is compared directly with its raw input, and accepted graph objects are exactly those from the scoped repeat. The source input artifact hashes are checked. The initial actually staged common/node files are independently compared with current kernels: removing four selection declarations, two selected loops and selection-report metadata makes the current entry byte-identical to the initial entry. The initial wrapper was reconstructed after launch and is explicitly described as reconstruction, not a contemporaneous source capture. The accepted method spans two warm-module processes.

Node source restore at 10,000 rejects three times with `WORK_LIMIT_EXCEEDED` after 47,540/48,954/49,403 ms, with complete prior result/revision preservation. Its untimed observer reaches 50,000,000 emitted work units. No unexpected admission/protocol/build error is accepted as capacity evidence. Source-state native and positional native round trips pass. The unchanged gzip target miss is 1,469 bytes (`16,829` versus `15,360`), not silently converted to a target pass.

Actual Chrome worker/IndexedDB observations must preserve uncertain load semantics. `IndexedDBAdapterError OUTCOME_UNKNOWN` at restore with selected generation/operation ID is not a successful restore or an authoritative rollback result. A subsequent complete query can establish only the separately observed prior state/revision at that observation. Save, direct restore, uncertain load, subsequent engine observation and store erasure are distinct outcomes. Browser and Node timings cannot be subtracted to isolate transport; save/load include selected export/restore. Encoded/bundle/logical counts are not retained/peak heap or durability qualification.

The completed Chrome 154.0.8037.98 headless report has nine trial rows, with fresh producer/receiver pairs. All build/update/query/export/save/erase observations pass their selected checks. At 10,000, all three direct restores return `DEADLINE_EXCEEDED`; two loads return that authoritative error and one returns `OUTCOME_UNKNOWN` with the recorded selected generation/operation ID. All six subsequent complete queries observe the prior result/revision, without relabeling the unknown operation. All nine actual namespaces independently contain one metadata and one snapshot row after save and zero rows after erase. The reviewer recomputes all 45 browser summary groups and checks all 30 printed browser cells. Actual staged browser/common/worker source hashes and saved application bundles are re-read; the current outer wrapper identity is distinct from a contemporaneous launch capture claim.

Current/baseline/installed public export maps and development pins agree, with zero runtime dependencies and no changed native source/lockfile. The captured tarball is independently re-read and agrees with its byte count, SHA-256 and npm SHA-512 integrity. Saved core code/gzip matches the adopted fixed graph's byte/hash observations. This establishes captured installed-package coherence, not publication or broader host qualification.

The producer's [final package identity audit](RX-4001-package-audit.mjs) was inspected and rerun successfully. A separate reviewer inventory/byte/hash check independently confirms all 208 current/primary/fresh production JS/declaration/CSS/notice files, exact fresh package metadata/README/LICENSE, the fresh tarball identity and identical core code/gzip. The final tarball differs because its documentation/scripts metadata is newer; no long timing is claimed on that tarball. Original unrepaired/corrected initial Node artifacts also agree exactly for every observation, diagnostic, summary, graph, method, environment and configuration, independently establishing that the identity-metadata correction changed no measurement data.

## Review findings

1. **Repaired evaluation translation defect.** An unsupported tokenless lexical child in a native conjunction was dropped by object spread of `null`, leaving the equality filter. The parent added a complete-translation guard and focused regression. Reviewer text/phrase tokenless conjunction probes now return Not comparable. No native or foreign scorer changed.
2. **Repaired graph scope labels.** The worker-host selected graph includes core but no source-phrase add-on; the worker snapshot client graph includes explicit IndexedDB/source-phrase registration. Labels now match their actual selected imports, with all byte values unchanged.
3. **Repaired timing-method disclosure.** Potentially overlapped initial small-core rows are excluded and explicitly replaced, original artifacts retained, kernels compared, reconstruction distinguished from actual staged files, and the two-process composite described accurately. This repair changes provenance/selection, not operation implementations.
4. **Repaired checkpoint wording.** The later prior-state query has no separately recorded duration. The method now calls it a separate observation, preserving its actual evidence boundary.

Follow-up limitations belong to existing scoped findings/RX-4002: self-documentation/single-author label bias, general linguistic relevance, unchanged core target miss, whole-source rebuild capacity/deadline outcomes, broader browser/device/Unicode/AT qualification, physical retained/peak memory and durable storage behavior. None is evidence of a new native contract regression requiring this evaluation slice to expand.

## Reproduction and verification

Completed reviewer command against the captured installed consumer and durable raw inputs:

```sh
node docs/evidence/RX-4001-review-probe.mjs \
  --correctness docs/evidence/RX-4001-correctness.json \
  --relevance docs/evidence/RX-4001-relevance.json \
  --comparison docs/evidence/RX-4001-comparison.json \
  --companion /Users/vasilis/Documents/GitHub/LocalSearch \
  --costs docs/evidence/RX-4001-costs.json \
  --initial-costs docs/evidence/RX-4001-costs-first.json \
  --unrepaired-costs docs/evidence/RX-4001-costs-first-unrepaired.json \
  --repeat-costs docs/evidence/RX-4001-costs-small-core-repeat.json \
  --browser-costs docs/evidence/RX-4001-browser-costs.json \
  --package docs/evidence/RX-4001-package.json \
  --package-final docs/evidence/RX-4001-package-final.json \
  --final-check docs/evidence/RX-4001-final-check.log \
  --consumer /private/var/folders/m4/7qvldjl917j4nwbkw7bxmn_m0000gn/T/raveldex-core-consumer-r7kDfb
```

All seventeen calculation/identity/runtime/method groups pass. Candidate source/doc/raw SHA-256 identities, all 208 runtime file identities, inspected HEAD/branch and explicit accepted baseline `6e714a3` are captured in the reviewer JSON. Native/lockfile/public-map comparisons use that fixed baseline so a subsequent local task commit cannot hide a slice change. Earlier static checks also directly read the contemporaneously staged initial files; the durable command validates the same preserved source bytes and identities from the original raw artifact. The reviewer did not rerun build/pack/full-check or browser benchmarks during the exclusive timing window and does not claim to independently reproduce the producer's entire oracle replay or emitted-work arithmetic.

The parent's final `npm run check` exits 0. The reviewer inspected [the actual complete log](RX-4001-final-check.log) and independently checks all five accounting blocks: **538/538** (`472 + 15 + 24 + 26 + 1`), with zero failures, cancellations or skips. The synchronized main acceptance record/context/handoff/verification plan preserve the actual findings, incomplete qualification and next RX-4002 boundary. This review does not qualify physical memory/latency/durability, the cross-browser/device/Unicode/AT matrix, or a release; those limitations remain existing scoped follow-ups.
