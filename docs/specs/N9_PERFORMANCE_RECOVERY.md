# N9 — Query performance, recovery and matched comparison

**Planning scope selected 3 November 2026.** This registers 11 dependency-linked tasks; it does not authorize publication or automatically implement all tasks.

## Initial observed baseline

Reviewed source: main `f523d9dafeed842de6a423c1a85eac60a9daf9ed`. Existing historical RX-4001 measurements (8 October 2026; Node 24.21.0, Apple M5 Pro) report 10k core build 10,740 ms, common exact-total/top20 1,377 ms, selective exact-total/top20 408 ms, single-record replacement 6 ms, source phrase 2,294 ms, positions phrase 1,844 ms. These are **historical workload medians**, not fresh head benchmarks or p95 values. Worker source restore and source rebuilds have documented 10k work/deadline refusals.

Current exact-head CI stopped before tests because two historical RX-5004 log paths were absent. The correction note `docs/evidence/RX-5004-AVAILABILITY-20261103.md` discloses their nonavailability. RX-8001 must independently pass exact-head full verification before optimizations are compared.

## RX-8001 execution checkpoint — 3 November 2026

[Fresh baseline evidence](../evidence/RX-8001.md) records a reproduced stale generated-plan failure on `6b6f131`, then a clean-install Astro sections-type resolution failure. Both are repaired locally. An immutable base-plus-patch snapshot and the final worktree each pass all 1,147 repository tests and installed candidate checks; the frozen site passes all 14 browser cases, with separate independent oracle/lifecycle checks and artifact review. This freezes source/package/model/limit identities without changing native runtime or claiming faster queries. Original `6b6f131` remains a recorded failure. Subsequent clean committed `919c9ed133b1dd004e3059cb15ddac18f474ef08` now passes the actual full/installed/site/focused checks with unchanged HEAD/status and explicit source hashes. RX-8001 is accepted locally; RX-8002 is next. Completion documentation is committed separately. Fresh remote Node 22/24 CI remains unrun.

## RX-8002 execution checkpoint — 3 November 2026

[RX-8002 evidence](../evidence/RX-8002.md) and [method](../evaluation/RX-8002-method.md) freeze nine labeled workloads and independent membership judgments. Twenty-seven installed Node processes keep ordinary wall/CPU measurements separate from diagnostic copies; nine cells pass exact page/error parity and the normal installed package remains byte-identical. Full membership at 100 records and larger exact totals/top-twenty checks have distinct scope. The existing 10k query, export and restore work refusals remain recorded: adversarial source restore reaches its cap during staging and preserves prior state. This task supplies instrumentation and inputs without changing native runtime, limits or model. RX-8003 is next dependency-ready; later tasks own optimization, restore diagnosis/repair and paired comparisons.

## RX-8003 execution checkpoint — 3 November 2026

[RX-8003 evidence](../evidence/RX-8003.md) records conservative group/AND/OR posting bounds, native-order touched-bucket traversal and requested Inspector nonmatch evaluation. Whole-query fallback for opaque predicates and compound refinements preserves per-record typed errors; NOT/browse/unknown OR branches remain conservative. Eighteen paired installed Node processes preserve exact native pages/errors at frozen adversarial 100/1,000/10,000 sizes. Rare 10k queries evaluate 11 documents rather than 10,000 and show measured work/latency improvement; source-phrase planning adds work and core gzip increases 554 bytes. Broader paired optimization claims remain RX-8009. RX-8004 is next dependency-ready.

## RX-8004 execution checkpoint — 3 November 2026

[RX-8004 evidence](../evidence/RX-8004.md) records captured continuation dispatch separate from deadline timers: Node immediates, lazy owned message ports in supported browser/worker realms, and captured timer fallback with every eighth continuation on a timer turn. Paired result/work/step/yield parity, actual normal p50/p95 and separate pump spans pass. Forced fallback retains measured timer costs. Twelve longer browser/direct-worker diagnostic probes show timer, heartbeat and inbound-event progress while pending; no physical input/paint or universal fairness claim follows. Gzip adds 599 bytes. Nine new deterministic host regressions and existing focused checks pass. Full 1,183-test repository/installed-candidate checks, fourteen site browser cases and the installed independent oracle pass with stable recorded inputs; measured/verified runtime bytes match and generated bundles are synchronized. RX-8005 is next; no quantum, caps, API, scoring or dependency change.

## RX-8005 execution checkpoint — 4 November 2026

[RX-8005 evidence](../evidence/RX-8005.md) records immutable per-field ordered term seek, delta-only key insertion/removal and unchanged native snapshot wire data with charged derived-order reconstruction. Near-cap queries retain native hash traversal for exact expansion error precedence. Selected-field/overlap/UTF16/256–257/query1024–1025/mutation/cancellation/restore tests pass. Installed Node 10k narrow-prefix median61.206→3.191ms and examined visits 30,007→75 improve with exact complete results; builds, snapshots and broad refusal paths add cost. Core gzip adds 580bytes; retained key nodes are bounded by live dictionary entries, with no heap-byte claim. Full 1,198-test repository/installed-candidate verification, fourteen site cases and the installed independent oracle pass with stable recorded inputs and byte-identical measured/verified runtime. Generated bundles are synchronized. RX-8006 is next; caps/model/APIs/dependencies stay fixed.

## RX-8006 execution checkpoint — 4 November 2026

[RX-8006 evidence](../evidence/RX-8006.md) records lazy query-local field averages and per-field term-entry IDF reuse. Exact model expressions, per-document checks, corpus statistics, winning facts and work units remain unchanged; no root/global cache exists. At 10k installed Node common average/IDF calculations fall 10,000→1, wall/user CPU287.998/77.934→277.733/60.950ms. Full numerical/Inspector/work/candidate/scheduler/prefix parity passes, but other query timing impacts are mixed and retained. Core gzip adds 156 bytes. Independent hand/source arithmetic and mutation/restore/filter/reentry tests pass; full 1,207-test repository/installed-candidate verification, fourteen site cases and the installed independent oracle pass with stable inputs and byte-identical measured/verified runtime. Generated site bundles are synchronized. RX-8007 is next; no restore-capacity or broader platform speed claim.

## RX-8007 execution checkpoint — 4 November 2026

[RX-8007 evidence](../evidence/RX-8007.md) reproduces admitted 10k source restore refusal on pinned Node and actual Chrome direct/workers for source and positions/offsets. Exports succeed; all 1k controls pass, all 10k attempts retain WORK_LIMIT_EXCEEDED. The 50M total meter rejects during repeated per-record core finalization after 3,755/3,505private records, with old 1k roots/source/query state preserved. Phase/copy/produced-token and logical coexistence observations match across diagnostic hosts; Node samples are not retained/peak heap and browserheap is unmeasured. Forced1ms deadlines are not natural60s deadline reproduction. [The source-reviewed bulk contract](../evaluation/RX-8007-bulk-contract.md) constrains RX-8008: exact representations/offsets, unchanged cumulative limits, compatible arbitrary callbacks/private fast-path eligibility, one publication and complete verification. No runtime fix or capacity success is claimed. Full 1,216-test repository/installed-candidate verification, fourteen site cases and the installed independent oracle pass with stable recorded inputs, unchanged runtime bytes and identical site projection. RX-8008 is next; actual10k capacity remains unfixed.

## RX-8008 execution checkpoint — 4 November 2026

[RX-8008](../evidence/RX-8008.md) builds one private core and source/position directories, seals them once, and publishes one revision under unchanged limits. Wrapped/custom registrations keep their per-record callback protocol and cumulative budgets. All fourteen formerly refused 10k attempts now pass on installed Node and Chrome direct/real-worker configurations, with complete source, membership, core, sidecar and offset parity. Source/positions work is 23,043,299/28,435,912 units under the 50M cap, with zero old-directory pointer/entry copies. Timings are descriptive; process-memory samples are not retained/peak heap and browser heap is unmeasured. Core gzip adds 142 bytes. Full 1,237-test/private-candidate checks, fourteen site cases, thirty lifecycle cases and the installed independent oracle pass. Measured and verified archives are byte-identical; generated bundles are synchronized. Closing packaged status prose changes separately. Independent source/raw reviews pass. Changes remain uncommitted; remote tracking, CI and publication are unchanged. RX-8009 is next.

## RX-8009 execution checkpoint — 4 November 2026

[RX-8009](../evidence/RX-8009.md) completes the paired native benchmark with unchanged RX-8008 runtime and limits. Six real installed stages provide conditional increments and an untouched-to-combined comparison: 96 Node children, 30 controlled-host semantic cases and 96 Chrome direct/real-worker contexts. Complete pages, core/traversal, numerical traces, facets, source/positions/mixed data and later writes agree within admitted-result scope; exact budget refusals remain explicit. Selected Node/Chrome tails use 120 calls per cell, while larger small-sample cells have no p95 estimate. Selective-query and scheduling gains coexist with planning/prefix/ranking/bulk query regressions. Adversarial 10k restore improves capacity, while larger real/high-cardinality exports and two query cells still refuse. The uniform core graph adds 2,051 gzip bytes. Full 1,264-test/private-candidate checks, fourteen site cases, thirty lifecycle cases, the installed oracle and independent raw reviews pass. Measured and verified packages are byte-identical; only closing status prose follows. Source and generated site remain unchanged. Work stays uncommitted; remote tracking, CI and publication are unchanged. RX-8010 is next.

## RX-8010 execution checkpoint — 4 November 2026

[RX-8010](../evidence/RX-8010.md) completes isolated pinned MiniSearch/FlexSearch/Orama/Lunr lexical comparisons, separate Fuse fuzzy and genuine Pagefind static-site tracks without native/dependency changes. Independent review verifies 162 complete Node runs plus one retained deadline-refused build attempt, 423 equivalent foreign rows, 56 complete native query cells, all 76 frozen relevance labels and nine Chrome/Pagefind cells with 33,636 generated assets. Orama exact case-sensitive source filtering produces explicit mismatches; foreign full-output and native top 20 costs stay distinct. All 1,311 repository tests/private-candidate checks, fourteen site cases, thirty lifecycle cases and the installed independent oracle pass with stable recorded inputs. Measured and verified native archives are byte-identical; closing packaged status prose is separate. The baseline through RX-8009 is committed at `6d00200`; RX-8010 remains uncommitted. Remote tracking, CI and publication are unchanged. RX-8011 is next.

## Priorities and prerequisites

- **RX-8001** — genuine current-head baseline and truthful evidence availability; preserve previous accepted work.
- **RX-8002** — reproducible matched workloads and instrumentation for actual candidates, visited documents, field dictionary terms, work steps, yields and restore phases.
- **RX-8003** — safe posting-driven candidate upper sets for positive queries; universe fallback for negative-only/browse/unindexed operators and separate requested nonmatch Inspector evaluation.
- **RX-8004** — genuine yielding continuation separate from deadline timers; preserve stop/commit precedence and fair host scheduling.
- **RX-8005** — bounded prefix term enumeration without exhaustive high-cardinality dictionary scans; preserve expansion limit errors.
- **RX-8006** — per-query/revision invariant BM25 statistics and native explanation parity.
- **RX-8007 / RX-8008** — diagnose actual 10k source restore budget refusals before implementing an atomic bounded bulk restore. Do not bypass caps. A still-refused accepted workload is a blocker, not success.
- **RX-8009** — paired current/untouched baseline comparisons of each independent change and combined candidate.
- **RX-8010** — installed pinned equivalence checks for MiniSearch, FlexSearch, Orama and Lunr where meaningful; Fuse fuzzy and Pagefind static-site tracks separately. Unsupported semantics remain Not comparable.
- **RX-8011** — independent method, metric, source and lifecycle review plus practical support guidance.

## Semantic and product guardrails

- Do not replace native Raveldex with a foreign engine, change BM25 identity, add a new backend or increase mandatory runtime dependencies.
- Preserve complete counts, field-aware scoring, deterministic ties, numeric facts, source/position/mixed phrase eligibility, original UTF-16 ranges, transactional updates/sidecars, cancellation and worker unknown-outcome semantics.
- Any optimization must show a measurable benefit **and** pass the frozen membership, score/trace, results, typed-error and revision comparisons. No score, capacity or publication claim transfers from RX-4001.
- Benchmark 100/1,000/10,000 admitted records with frozen real-document labels, high-cardinality vocabulary and adversarial rare/common/OR/NOT/filter/prefix/restore cases; record fresh process/corpus/package hashes.
- Keep wall/CPU distinct, normal timing separate from work instrumentation, and Node versus browser/worker/installed UI as different configurations. Report p50/p95 only with appropriate samples and retained failures. Never subtract Node/browser timings to invent worker overhead.
- Core package-size and retained heap/peak memory require separate measures; encoded source data are not heap evidence. Do not treat automated browser checks as human AT/physical-device evidence.

## Tracking and authorization

Task IDs `RX-8001`–`RX-8011` are owned by `docs/planning/roadmap.json`, with real evidence files required before completion. The N9 overview is a checklist and must remain outside GitHub milestone membership; only actual task issues affect native progress. The owner requested milestone/issue creation now, not automatic release/tag/deployment or another feature family.
