# RX-9001 — Frozen post-N9 comparison method

The [N10 contract](../specs/N10_HARDENING_PERFORMANCE_REVIEW.md) defines the engineering question. This task freezes the comparison, validates a new bounded orchestrator and runs a reduced pilot. It does not collect the full N10 matrix or conclude that the current implementation is faster.

## Identity and comparable implementations

The [actual artifact manifest](../evidence/RX-9001/identity/artifacts.json) records original archives, complete members, real offline installed consumers, source/lockfile/default-limit/model identities and the observed environment. The [reproducible freezer](../evidence/RX-9001/identity/freeze.py) rejects changed historical archives or current runtime inputs. `6100770` is the starting committed source; RX-9001's harness and status work is separately uncommitted. It is not a new clean-head verification claim.

Collected roles are `preN9` (the real RX-8001 archive), `acceptedN9` (the real RX-8008 archive) and `current` (a fresh build/package of the current unchanged implementation). The reviewed RX-8011 archive is retained as additional identity provenance. Source and production runtime/declaration/CSS equality distinguish documentation-only packaging changes from an implementation change. The accepted/current pair is a same-runtime method control. No mixed-module baseline is manufactured.

The [machine method](RX-9001-method.json) fixes downstream cohorts and comparison rules. The [Node profile contract](../../bench/n10/contract.mjs) drives the implemented query pilot/full orchestrator. Harness and method hashes are captured before a run and checked afterwards. Changes after the freeze require a new recorded method/run identity; never edit a running measurement's inputs.

## Implemented Node orchestration

Use an existing final identity manifest containing three actual installed consumers:

```sh
node bench/n10/run.mjs --artifacts docs/evidence/RX-9001/identity/artifacts.json --profile pilot --output /tmp/raveldex-n10-pilot-fresh
```

The output directory must not exist. Installation/building is a separate preparation step. `full` is a future RX-9004 collection profile, not an RX-9001 completion requirement. The unchanged historical N9 six-stage/96-child validator remains intact.

| Profile | Frozen workloads | Fresh children | Ordinary query calls | Diagnostic query calls | Collection/child stop bounds |
| --- | --- | ---: | ---: | ---: | --- |
| Pilot | adversarial 100; three roles; two deadline cohorts; two ordinary + one diagnostic owner | 18 | 192 | 48 | 600s total / 90s child |
| Full | nine family/size cells; three roles; two deadline cohorts; three ordinary + one diagnostic owner | 216 | 13,536 | 432 | 10,800s total / 600s child |

Both profiles use the actual source + source-phrase configuration on `body`, frozen schema/model, unchanged limits, admitted build batches of 256 and native exact totals/top 20. All eight existing query definitions remain. Build/export/restore are separate windows, with one prior receiver record and full source checks outside timing. Other provider/host costs are not silently attributed to this configuration.

The `default30s` cohort passes no `deadlineMs` property to timed calls. The `explicit60s` cohort passes 60,000ms. Queue and operation time retain native semantics. Untimed verifier operations may explicitly use 60,000ms and are labeled separately; they do not establish default-deadline completion.

The pilot has two ordinary calls/query and no warmups. Full adversarial 100 and 1,000 cells have three ordinary owners × 40 calls after two untimed warmups, giving 120 same-cell observations. Other full cells have two calls per ordinary owner, retaining first/repeated-query labels and no tail claim. Each diagnostic owner has one call/query in a separate instrumented copy. Process/cell/artifact order rotates and reverses; collection is serial with no task-owned builds, tests or other collectors concurrently.

Missing/duplicate cells, stale/forged artifact/source hashes, changed frozen workloads, wrong deadline/configuration, hidden instrumentation, unexpected errors, score drift and invalid outcome fields fail closed. A watchdog is an orchestration failure/incomplete collection, not a fabricated native deadline error. Partial rows and failed attempts remain inspectable. A complete timed run is not independently accepted performance evidence until its semantic and review gates pass.

## Separate pilot semantic gate

The [semantic pilot](../evidence/RX-9001/pilot-semantic.mjs) reuses the unchanged N9 `paired-semantics.mjs --child` entry once for each actual artifact. A private zero-clock host verifies full eight-query pagination, independent IDs/order, literal source/facets, selected Inspector formula replay and four source/positions/offset/mixed fixture configurations with subsequent writes. This is untimed correctness evidence, not real-host deadline, scheduling or physical-response evidence.

Every timed pilot capture in both real-host deadline cohorts must agree with its corresponding complete semantic result prefix or exact typed refusal. Cross-role comparisons preserve complete ordered scores, numeric facts, core/source state and exact errors, normalizing only explicitly allowed Inspector work. No production tokenizer/scorer is used as the independent lexical or formula oracle. Sparse pilot samples never become p95 or a performance verdict.

## Frozen future incremental-update cohort — RX-9005

The machine method fixes 144 children: three roles × three adversarial sizes × core-only/source-with-positions × two deadlines × three ordinary plus one diagnostic owner. All authored mutation cases execute within each selected child; they are not separate processes for every API call. Setup/reset and exact expected pre/post records stay outside the measured windows, with revisions and their costs retained separately.

Single-record cases are add-new-vocabulary, genuinely changed same-vocabulary replacement, new-vocabulary replacement, removal, reinsertion and unique-vocabulary removal. The last case removes the reserved novel record and verifies that its unique terms disappear from the live dictionary, source/positions and independent retrieval. The final fixture ID is reserved. An add/reinsert starts at N−1 and ends at N; replace starts/ends at N; remove ends at N−1. Same-vocabulary replacement alternates the two different authored A/B source strings in the machine method and requires `changed: true`; identical-record no-ops cannot supply the result. Expected source/order/positions and independent retrieval arithmetic are checked outside timing.

Batch sizes are 1/32, plus 256 only at 1,000/10,000 records. Size 100/batch 256 is explicitly Not applicable with zero attempts and no invented time. Inputs use the last B fixture IDs and the exact A/B/novel templates in the machine contract. Add/reinsert uses one public `addMany`; replacement/removal uses B ordered public single-record calls and reports whole-sequence throughput, never one atomic batch latency. Pre-add population is N−B; no side silently grows or changes operation granularity.

All ordinary update cases have two repetitions, except same-vocabulary single replacement at 1,000 records: three owners × 40 calls after two warmups. Diagnostics use one repetition. The stop bounds are 5,400s total and 600s/child. These are future collection bounds, not measured latency or product SLAs.

## Frozen future browser/recovery cohorts — RX-9006

- Browser queries: three roles × adversarial 100/1,000 × actual browser-direct/module-worker × two deadlines × three ordinary plus one diagnostic owner = **96 contexts**. Common/rare/narrow-prefix/source-phrase queries use source + source phrases. Size 100 has two ordinary calls; 1,000 has 40 after two warmups. There are 6,048 ordinary and 96 diagnostic calls. Bounds: 5,400s total / 300s context. Installed Chromium 149.0.7827.55 and executable/environment identities are pinned separately from Chrome or other engines.
- Primary recovery: adversarial 1,000 with all three roles (**108 contexts**) and adversarial 10,000 with pre-N9/current (**72 contexts**), each source/source-with-positions, Node/browser-direct/real-worker, both deadlines, two ordinary attempts plus one diagnostic owner. Source-with-positions retains body offsets. The accepted/current small cohort remains a same-runtime control.
- Refusal controls: real-document/high-cardinality 10,000, pre-N9/current, Node source + source phrases, both deadlines, two ordinary plus one diagnostic owner = **24 contexts**. Total recovery coverage is **204 contexts**, with 10,800s total / 300s context bounds. Samples are sparse and have no tail estimate.

Recovery receivers start with the literal prior record in the machine method. Successful recovery verifies complete source/positions/offsets, one publication and later writes; authoritative precommit failure preserves exact old state. Failed source export makes dependent restore Not run with zero attempts. Lost delivery remains Unknown until receipt/recovery establishes an authoritative state; no blind retry or presumed rollback. Earlier timeout/retry observations remain separate unless new evidence proves a cause.

Both provider manifests and required exports must exist in the historical/current artifacts. Missing capability is Not comparable, never a replacement engine or zero duration. Any intrusive resource-lifetime diagnosis uses separate controlled runs. Serialized bytes, graph bytes and process samples do not establish retained/peak engine heap.

## Interpretation frozen before collection

Correctness, full coverage and artifact/input identities are hard gates. Report wall time and process CPU separately, per operation/phase/workload/configuration/deadline/host, retaining every outcome denominator. CPU includes process/harness/promise work. Outcome transitions are capacity findings, not equal-work speed ratios. Unknown, cancelled, rejected and Not-run outcomes never become successful zeros.

With at least three independent fresh normal owners and comparable successful outcomes, strictly separated owner-median ranges support an **observed faster/slower result in those repeats**. Overlap, missing owners or timer floors remain Inconclusive/within observed variation. This range rule is not a confidence interval or a population guarantee. p95 is descriptive nearest-rank only with at least 100 actual observations in the same labeled cell; correlated calls do not become independent machines. Sparse build/recovery outcomes have no p95.

Identical-runtime variation is a method/environment control, not another optimization. Keep adverse cells and absolute/relative changes, build/update/query/recovery tradeoffs, work/visits/yields and identical-recipe graph costs. Do not sum conditional N9 stage effects or choose a weighted overall winner without a selected workload distribution. Unavailable platforms, physical input/paint, human AT, representative traffic and browser/retained/peak heap remain unclaimed.

Future environmental or method changes require a dated revision before collection and separately labeled results. A budget-exhausted run remains incomplete; no silent reduction of a frozen matrix can pass. RX-9001's pilot does not execute these downstream collections or establish that Raveldex improved.
