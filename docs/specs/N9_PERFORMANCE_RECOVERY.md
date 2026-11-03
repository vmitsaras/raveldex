# N9 — Query performance, recovery and matched comparison

**Planning scope selected 3 November 2026.** This registers 11 dependency-linked tasks; it does not authorize publication or automatically implement all tasks.

## Initial observed baseline

Reviewed source: main `f523d9dafeed842de6a423c1a85eac60a9daf9ed`. Existing historical RX-4001 measurements (8 October 2026; Node 24.21.0, Apple M5 Pro) report 10k core build 10,740 ms, common exact-total/top20 1,377 ms, selective exact-total/top20 408 ms, single-record replacement 6 ms, source phrase 2,294 ms, positions phrase 1,844 ms. These are **historical workload medians**, not fresh head benchmarks or p95 values. Worker source restore and source rebuilds have documented 10k work/deadline refusals.

Current exact-head CI stopped before tests because two historical RX-5004 log paths were absent. The correction note `docs/evidence/RX-5004-AVAILABILITY-20261103.md` discloses their nonavailability. RX-8001 must independently pass exact-head full verification before optimizations are compared.

## RX-8001 execution checkpoint — 3 November 2026

[Fresh baseline evidence](../evidence/RX-8001.md) records a reproduced stale generated-plan failure on `6b6f131`, then a clean-install Astro sections-type resolution failure. Both are repaired locally. An immutable base-plus-patch snapshot and the final worktree each pass all 1,147 repository tests and installed candidate checks; the frozen site passes all 14 browser cases, with separate independent oracle/lifecycle checks and artifact review. This freezes source/package/model/limit identities without changing native runtime or claiming faster queries. The original committed head remains a failure, and RX-8001 stays in progress until committed-head verification is established. Fresh remote Node 22/24 CI remains unrun.

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
