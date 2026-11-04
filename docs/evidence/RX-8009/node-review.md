# RX-8009 independent Node measurement review

Review date: 4 November 2026. Outcome: **Pass within the recorded Node scope; no blocking method, identity or raw-data defect found.** This review is separate from controlled-host semantic verification, browser measurements and final candidate verification.

The reviewer used read-only Node/Python data audits over the actual files. No build, test suite, package installation, new timed operation or production edit was performed during this review. The only written file is this record. Input report: `/tmp/raveldex-rx8009-20261104/node/report.json`, SHA-256 `974baeb91c07e3d5d6d303847ef1b00d193157ca2df84c533277976c991b7359`. Collection ran 16:24:49.872–17:10:04.742 UTC.

## Identity and collection coverage

All 96 child processes exit zero with unique PIDs, run names and result paths: 66 ordinary and 30 separate diagnostic owners. All cases finish `Collected`, with no report failure or guard failure. There are 7,056 operation observations: 6,181 Pass, 863 Refused and twelve Not run; zero Unknown, Cancelled or Rejected. Of 6,768 timed query observations, 6,528 are ordinary and 240 diagnostic. Diagnostic counters are present only on diagnostic observations and absent from ordinary timing samples. Every actual wall/user-CPU/system-CPU value is finite and nonnegative; Not-run records contain no measured timing, result, error or counter fields.

Verified the six actual tar hashes and their complete member maps against [artifact identities](artifacts.json). The untouched baseline is the accepted RX-8001 archive. Planning, scheduling, prefix and ranking use the corresponding archived verified packages; combined is the actual current RX-8008-equivalent package. All six have byte-identical `dist/core/limits/limits.js`, SHA `a0a9d000e1455dacd821140bbf2007408c33b1434174e8ccd1600c1f2bdf1d6c`.

Rehashed all 4,504 physical files across six ordinary and six diagnostic installed packages; sizes, hashes and complete path sets match the recorded inventories. Ordinary inventories match the actual tar members. Each diagnostic transformation chain agrees with its ordinary bytes and recorded original/instrumented hashes; unpatched files remain unchanged. Rehashed all 24 staged child/verifier files and all eight harness/fixture pins. All 169 current production source pins and 177 recorded runtime inputs remain unchanged.

Normal execution uses Node 24.21.0, V8 13.6.233.17-node.53, Darwin 27.0.0 arm64, Apple M5 Pro, eighteen logical CPUs and 24 GiB system RAM. Default limits, 256-record admitted build batches and each operation's 60s deadline remain explicit. A complete build spans multiple independently admitted calls; it does not have one shared 60s total-build deadline. No retained/peak heap, physical-input, paint, cross-platform, browser or worker timing claim follows from these Node data.

## Native result and input parity

Independently checked every timed query capture's content SHA, expected complete total, model, revision, unique eligible finite-score top-twenty hits, or exact recorded typed-error facts against the frozen workload and judgments. All 72 family/size/query cells have exactly one deep-equal captured result/error across their applicable stages, owners, modes and repetitions. Independently recounted all 13,056 paired relations: 11,434 Equal result and 1,622 Equal error, with zero query resource-outcome transitions.

These timed queries retain complete totals and exact selected result pages; they do not alone establish all-page membership, facets, Inspector facts or position/mixed semantics. Those belong to the separate controlled-host semantic lane. Its clock/host substitution must not be represented as ordinary Node timing evidence.

Rehashed all 84 actual successful source exports. Verified encoded byte counts, raw-body FNV-1a UTF-16 integrity and recorded headers. Independently compared every exported ID, metadata value, raw string and scalar-versus-array body normalization against the frozen workload construction. Exported bytes match across stages/modes/owners for each of the seven cells that can export. The two remaining cells genuinely refuse export, rather than supplying invented input.

All 69 successful restore observations include complete receiving source comparison and coherent receipts. All fifteen attempted restore refusals retain the prior-state flag after the child's exact old-source/all-query checks. The child's per-call result validation and full source comparison are outside the timing windows. Large restore success is not an independent complete receiving-core/position-root proof in this lane; the semantic/previous RX-8008 state evidence has separate scope.

## Actual refusals and capacity boundaries

- Real-document 10k and high-cardinality 10k source exports return `WORK_LIMIT_EXCEEDED` for both untouched and combined packages: twelve observations. Their twelve restores are **Not run**. This slice does not establish repaired source-export or restore capacity for those cells.
- Real-document 10k broad-prefix queries return equal `WORK_LIMIT_EXCEEDED` errors in ten observations. These are work refusals, distinct from the deliberately over-cap synthetic prefix controls.
- High-cardinality 10k source-phrase queries return equal `WORK_LIMIT_EXCEEDED` errors in ten observations.
- The synthetic `broad-prefix-refusal` controls retain 816 typed refusals across the sampled stages/sizes. They are not successful zero-duration queries.
- Adversarial 10k actual exports succeed at every stage. Baseline/planning/scheduling/prefix/ranking each refuse restore in all three ordinary/diagnostic owners, yielding fifteen work refusals. Combined restores successfully in all three owners. This is an explicit capacity improvement under unchanged caps, not equal-success parity or an equal-work speedup ratio.

Exact restore outcomes by selected family/size/stage are below. Counts include the separate diagnostic owner: adversarial-100 has three normal plus one diagnostic owner per stage; every other selected cell has two normal plus one diagnostic owner. “Not selected” means the recipe does not collect that intermediate stage for that family; it is distinct from an actual restore marked Not run after export refusal.

| Family / records | Baseline | Planning | Scheduling | Prefix | Ranking | Combined |
| --- | --- | --- | --- | --- | --- | --- |
| Real documents / 100 | 3 Pass | Not selected | Not selected | Not selected | Not selected | 3 Pass |
| Real documents / 1,000 | 3 Pass | Not selected | Not selected | Not selected | Not selected | 3 Pass |
| Real documents / 10,000 | 3 Not run; export refused | Not selected | Not selected | Not selected | Not selected | 3 Not run; export refused |
| High cardinality / 100 | 3 Pass | Not selected | Not selected | Not selected | Not selected | 3 Pass |
| High cardinality / 1,000 | 3 Pass | Not selected | Not selected | Not selected | Not selected | 3 Pass |
| High cardinality / 10,000 | 3 Not run; export refused | Not selected | Not selected | Not selected | Not selected | 3 Not run; export refused |
| Adversarial / 100 | 4 Pass | 4 Pass | 4 Pass | 4 Pass | 4 Pass | 4 Pass |
| Adversarial / 1,000 | 3 Pass | 3 Pass | 3 Pass | 3 Pass | 3 Pass | 3 Pass |
| Adversarial / 10,000 | 3 Refused | 3 Refused | 3 Refused | 3 Refused | 3 Refused | 3 Pass |

Thus 69 restore observations pass, fifteen refuse, and twelve do not run. Real-document/high-cardinality 1k restoration already succeeds on both untouched and combined packages; there is no observed 1k capacity transition in this collection. The total 863 refused operations additionally include 816 synthetic broad-prefix calls, ten real-document 10k broad-prefix work refusals, ten high-cardinality 10k source-phrase work refusals and twelve source-export work refusals.

The ordinary adversarial 10k restore p50 is 37,424.411ms Refused on untouched baseline, 9,336.986ms Refused after ranking, and 4,468.013ms Pass on combined. These are nearest-rank summaries of two ordinary owners per stage with different completed work. No p95 is estimated for these restores. Their wall/CPU numbers cannot be substituted for positions-enabled, worker or other-family capacity.

## Quantiles, denominators and retained regressions

Independently rebuilt all 522 outcome-specific summary groups from raw ordinary observations, including record counts, actual attempts, owner counts, shared outcome denominators, failure rates, outcome fractions, wall p50/p95 and separate CPU-user/system p50s. All values and retained sample lists match the report. The empirical nearest-rank definition matters: with two observations p50 selects the lower value, rather than averaging them.

Exactly 48 adversarial-100 query groups have 120 ordinary observations from three fresh owners after two discarded warmups per query/owner, allowing the method's empirical p95 threshold. Forty-two groups are Pass; six groups are explicitly Refused latency distributions. All other 474 summary groups report p95 as Not estimated. Diagnostic observations and warmups do not enter ordinary quantiles. Repetitions within each owner are correlated; these are not population/device tail estimates or statistical-significance results.

Examples of untouched→combined ordinary adversarial-100 wall p50/p95 milliseconds, each 120 calls:

| Query | Untouched p50 / p95 | Combined p50 / p95 |
| --- | ---: | ---: |
| Common | 20.049 / 21.414 | 3.578 / 3.948 |
| Rare | 4.909 / 5.171 | 0.04375 / 0.0585 |
| Negative-only | 10.016 / 11.291 | 2.196 / 2.612 |
| Narrow prefix | 18.577 / 19.873 | 1.588 / 1.745 |
| Source phrase | 45.288 / 48.732 | 9.244 / 10.857 |

The interventions are adjacent-stage conditional increments, not standalone-from-baseline or additive causal estimates. Their raw changes and regressions remain visible:

- Planning reduces adversarial 10k rare candidates 10,000→11 and work 773,073→12,479; source-phrase work increases 6,286,870→6,486,873. Source-phrase repeat p50 rises 4,123.522→4,456.029ms in the two-owner observations; the adversarial-100 common p50/p95 also rises 20.049/21.414→20.512/21.830ms.
- Scheduling retains identical work/steps/yields while reducing measured waits. At adversarial 10k common, work/yields remain 2,951,101/1,430 while first-call wall p50 falls 1,702.490→281.170ms. This does not establish physical input/paint fairness.
- Prefix reduces adversarial 10k narrow dictionary visits 30,007→75 and work 301,247→26,018, with first-call wall p50 54.563→3.351ms. Other observations are mixed: the rare repeat p50 rises 0.488→1.679ms, a large percentage over a small two-owner baseline. Build/export work and timing remain separately recorded.
- Ranking reduces adversarial 10k common IDF calculations 10,000→1 with unchanged work/yields and exact results. Common first-call wall p50 slightly rises 281.308→281.833ms despite CPU-user p50 falling 109.171→105.912ms. Adversarial-100 common p95 rises 3.951→4.075ms. Fewer calculations do not establish a universal latency improvement.
- Bulk changes restore capacity; ordinary query effects remain mixed. Adversarial 10k narrow first-call p50 rises 3.474→3.713ms between ranking and combined. The restore refusal→success is kept separate from query parity and cannot justify a uniform query-speed claim.

These examples are not a filtered replacement for the complete 522-group report. CPU/wall components are distinct independently summarized values, not a joint sample or exclusive engine CPU. No other task-owned timing/build/test was intended during ordinary collection; ordinary desktop/OS noise remains uncontrolled. Final documentation must preserve the refusals, limited p95 coverage, scoped increments and observed regressions. Final candidate/source identity and later browser/semantic evidence remain separate parent closures.
