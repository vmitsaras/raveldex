# RX-8011 independent comparator evidence review

Status: **Pass within the scope below; no blocking comparator finding.** Review date: 4 November 2026. Initial repository state was clean at `1dfbff1`. This reviewer owns only this report and `comparator-audit.py` / `comparator-audit.json` in this directory; parallel task documentation changes are outside this review's authorship.

The review starts from the actual `bench/n9/alternatives*.mjs` adapters, child/parent collectors and relevant comparison tests, the frozen corpus/labels, installed/archived package bytes, and retained raw observations. It does not use the previous RX-8010 acceptance audit or its narrative as its calculation engine. The new [audit program](comparator-audit.py) independently reconstructs all nine benchmark corpora and source-label projections in Python, uses a separate Unicode-category token scanner and Boolean/phrase membership evaluator, recomputes quantiles and relevance arithmetic, and checks generated Pagefind archive members. Node loads the frozen JavaScript label data and supplies JSON-number serialization for an independent capture hash check; no native tokenizer, scorer, oracle or prior audit function is invoked.

## Acceptance scope

| Requirement | Result | Evidence and boundary |
| --- | --- | --- |
| RX-8011-AC01 comparator math, identities, fairness, selected raw runs and failed/unknown outcomes | Pass | New independent audit covers 162 accepted children, 9,660 accepted samples, the separate failed build, all nine corpus/label identities, all 1,296 query rows, 56 complete native query-page captures, all relevance rows and all nine Pagefind cells. |
| RX-8011-AC02 practical limits input | Pass as evidence input | The observed broad exact-total refusal, output-cost differences, sample limitations and opted-in deadline are identified below. This scoped review does not replace the task's native update/restore guidance review. |
| RX-8011-AC03 foreign comparator/core boundary | Pass by current source/package inspection | Root runtime and tooling manifests contain none of the foreign engine dependencies. `src/index.ts` and every `src/core/**/*.ts` import/re-export reviewed by the audit remain on relative core paths. Comparator modules are confined to explicit bench/test use; optional phrase/source use in relevance is explicit. Publication/version/new-capability decisions are outside this review. |

## Actual package and input identities

All eight saved archives match their recorded SHA-256 and byte length. For all seven selected package entries, the archived package name/version, metadata hash and actual member hash agree with `package-identities.json`, the before/after measurement inventory and the surviving isolated installation. This checks the Node-selected CJS/bundle entries actually used by the child; it does not substitute browser/ESM distribution hashes for those entries.

| Engine | Actual version | Selected member beneath package root |
| --- | --- | --- |
| Raveldex | 0.1.0-rc.0 | `dist/index.js` |
| MiniSearch | 7.2.0 | `dist/cjs/index.cjs` |
| FlexSearch | 0.8.212 | `dist/flexsearch.bundle.min.js` |
| Orama | 3.1.18 | `dist/commonjs/index.js` |
| Lunr | 2.3.9 | `lunr.js` |
| Fuse | 7.5.0 | `dist/fuse.cjs` |
| Pagefind | 1.6.0 | `lib/index.js` |

The separate Pagefind Darwin/ARM64 binary archive also matches its recorded hash. All 33,636 generated asset members across the nine Pagefind archives match their raw report length/hash. No registry authenticity or newly executed browser qualification follows from archive identity alone.

All six files in the Node report's measured-harness list still match their pinned bytes; five saved comparator-module copies also match, with `workloads.mjs` checked against the actual current file rather than a nonexistent saved copy. The preserved resume source matches `resumeSourceSha256`. Both frozen relevance input files match `freeze.json`; the corpus remains 34 sections and judgments remain all 76. Independent reconstruction reproduces corpus and label hashes at 100/1,000/10,000 records for all three families, including adversarial arrays, excerpt truncation, source-cycle labels and newline body projection. Actual row input hashes agree. Repeated excerpts are not independent source documents.

## Consequential fairness conclusions

1. **Equivalent membership is a narrow gate.** The independently recomputed foreign equivalent rows are MiniSearch 117, FlexSearch 81, Orama 81 and Lunr 144: 423 in total. The complete foreign outputs are unique and count-consistent and agree with the frozen independent membership on those rows. Foreign order/scoring is retained. No equality of BM25 numbers, tie order, retained source, lifecycle, cancellation or transaction semantics follows.
2. **Output costs differ.** Native timed calls request exact totals and top 20 scores/IDs/revision; foreign adapters materialize the full ranked result list and map/validate IDs. Orama and Fuse retain selected original fields and return their own result structures. Foreign array values join with newline within a field; distinct title/body fields stay separate. This aligns lexical membership for admitted rows, not length normalization, phrase/value boundaries, offsets, retained memory or equal output cost. The observed latency table below supports no equal-work ratio or overall winner.
3. **Unsupported semantics stay visible.** MiniSearch negative-only, selected FlexSearch prefix/negative and weighted multi-field relevance, arbitrary foreign metadata filters, strict source phrases, and native expansion-budget contracts remain explicitly excluded. Source/revision/atomic update equivalence is not manufactured in application code. The reviewed tests cover complete results beyond default cutoffs, OR deduplication, selected fields/boosts, normalization/metacharacters and teardown. Tests were inspected here; the parent task owns fresh focused/full test execution.
4. **Orama's case-sensitive original-string filter matters.** Its actual installed `dist/commonjs/methods/search-fulltext.js:50`–`:80` adds `new RegExp(\\b...\\b)` without a case-insensitive flag and requires a string-valued source property when `exact` is true. The inspected member hash is `2efe3d07c2b1e4f2c8ec2c92da584562e49e2ed29416687fe4d32af32a376b79`, equal to the measured inventory. The nine Node mismatches are retained as Not comparable; the real-docs common query includes 82 foreign versus 97 independent expected matches at size 100. Frozen relevance mismatches also remain visible: `analyzer-half` 0/2, `ambiguous-source` 14/15 and `ambiguous-count` 8/10. No source normalization/postfilter is applied to hide these results.
5. **Fuse and Pagefind remain separate tracks.** All 216 Node Fuse query rows are Not comparable even when a returned membership coincides; fuzzy substring/Bitap behavior and source-retaining scores differ. Pagefind uses genuine generated static/WASM assets and browser search. Its timed calls return handles; complete source hydration is untimed. The nine cells retain 360 calls, 72 warmups and 49,586 hydrated IDs. Every collected Pagefind row remains Not comparable, including membership coincidences and over-cap native cases. These are not native equivalent-capacity or ID/score latency observations.

## Independent timing and relevance arithmetic

The audit independently recomputes all 269 accepted summary groups, separately grouping engine/family/size/operation/phase/outcome. Nearest-rank p50 and p95 match every group. At size 100, each supported query has 120 calls across three owners; p95 is the sorted 114th call. Larger cells have six observations and no p95 estimate. Builds have three accepted observations per cell and no p95. Owner-shared repetitions are not independent traffic and uncontrolled desktop noise remains.

Selected actual raw check: adversarial size 100, common query after two warmups, milliseconds. Membership is equivalent for the five lexical engines; Fuse is shown only as a separate fuzzy observation.

| Engine | n | Wall p50 | Wall p95 | User CPU p50 |
| --- | ---: | ---: | ---: | ---: |
| Raveldex | 120 | 3.590333 | 4.057208 | 1.226 |
| MiniSearch | 120 | 0.033791 | 0.108834 | 0.052 |
| FlexSearch | 120 | 0.005292 | 0.012333 | 0.006 |
| Orama | 120 | 0.054583 | 0.138125 | 0.077 |
| Lunr | 120 | 0.079500 | 0.169833 | 0.080 |
| Fuse, separate | 120 | 0.135458 | 0.258667 | 0.226 |

All 76 frozen judgments remain present for each engine; included/omitted rows and all per-query and aggregate metrics reconcile independently. Denominators are:

| Engine | Included / 76 | Nonempty-label ranking denominator | Intended-empty denominator |
| --- | ---: | ---: | ---: |
| Raveldex | 76 | 70 | 6 |
| MiniSearch | 58 | 56 | 2 |
| FlexSearch | 0 | 0 | 0 |
| Orama | 5 | 4 | 1 |
| Lunr | 58 | 56 | 2 |
| Fuse, separate | 57 | 54 | 3 |

The included lexical-engine subsets are also evaluated against native rankings on exactly those same judgment IDs. MiniSearch/Lunr each record 39/56 top1 and reciprocal-rank sum 41.333333333333336 over denominator 56, equal to the native same-subset values. Orama's 4/4 top1 is also 4/4 native on that subset; macro judged recall@10 is 0.9583333333333334 versus native 0.9166666666666666 on just those four known-relevant queries. This is not a general relevance advantage: 71/76 judgments are omitted, labels are incomplete and matching eligibility selects the evaluated subset. FlexSearch's zero supported relevance rows produce null fractions, not zero-quality evidence. Fuse's 28/54 top1 and 2/3 correct intended-empty are separate fuzzy observations. All macro recalls use known acceptable-label counts per query; micro recall uses total known relevant labels, never returned-result count. Empty cases are excluded from ranking denominators and kept in their own fractions.

## Failures and unknown outcomes preserved

The accepted matrix is exactly six engines × three families × three sizes × three owners = 162 successful child captures. It does **not** mean every query passed. Native has 168 successful exact-total/top20 query rows, 27 core-only phrase exclusions and 21 refused probes. Eighteen refused probes are exact `LIMIT_EXCEEDED` facts at `expansions.group`, limit 256, actual 257. The other three are real-docs size 10,000 broad-prefix `WORK_LIMIT_EXCEEDED` at `work`, once per owner. Refused probes have no timed latency sample. A matched foreign result on that row does not establish a completed native pair.

`node/high-cardinality-10000-raveldex-2.json` remains the original failed build attempt: typed `DEADLINE_EXCEEDED`, observed wall 77,617.464417 ms, user CPU 8,025.721 ms, no fabricated query rows or partial successful data. The accepted replacement explicitly names `retryOf` and retains the same frozen identity; its build wall time is 23,503.69425 ms. The refused attempt appears only in `attemptSummaries`, never pooled into accepted successful medians or assigned zero cost. The resume source verifies unchanged measured module/harness bytes before using completed captures. Sequential measurement intent and preserved timestamps do not identify the external cause of the long failed wall time.

**Deadline correction:** these build batches and ordinary comparator native searches explicitly request `deadlineMs: 60000`. This is the allowed ceiling, not the no-option default. Current `src/core/contracts/options.ts:19` sets an omitted deadline to `min(30000, maxDeadlineMs)`. The build sample covers the whole build (potentially multiple batches) and cannot itself establish one operation's exact deadline overrun. Therefore the retained failure is an observed refusal under an explicit 60-second per-operation request, not a reproduced 30-second-default failure. The relevance build does not pass a deadline, whereas its native relevance searches explicitly request 60 seconds. No failed capture is rewritten for this terminology correction.

Unknown/unobserved stay distinct: unsupported translations are Not comparable, not zero-latency successes or engine failures; refused probes have known error outcomes but unmeasured latency; the failed build/retry are observed outcomes; other OS/engine capacities, cold-start traffic, retained/peak memory, browser CPU/heap, physical input/paint and human assistive-technology behavior remain unobserved here. No foreign lifecycle/atomicity capability is inferred from read-only retrieval captures.

## Commands, provenance and limits

Executed from `/Users/vasilis/Documents/GitHub/raveldex`:

```sh
git status --short
git rev-parse --short HEAD
python3 docs/evidence/RX-8011/comparator-audit.py
```

The [machine result](comparator-audit.json) records the independently recomputed outcome and counts. Source/test/pinned-source inspection used `cat`, `sed`, `rg`, Python archive/JSON reads and a data-only Node import. Python uses only its standard library; there is no dependency install. The original retained measurements identify Node v24.21.0, Darwin ARM64, Apple M5 Pro; new audit execution is read-only arithmetic/hash/source verification, not a repeated benchmark on that environment.

This reviewer ran no build, performance collector, new browser timing or AT session, changed no runtime/tests/limits/dependencies, and made no commit, remote mutation, publication, tag or version change. Fresh project tests, candidate/site verification, native optimization/restore review and final documentation synchronization remain the parent RX-8011 task's responsibility. The result qualifies the retained comparator evidence; it does not establish deployment or release readiness.
