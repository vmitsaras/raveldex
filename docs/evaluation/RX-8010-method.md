# RX-8010 isolated alternative method

This task compares installed, pinned foreign engines outside Raveldex. It changes no native runtime, limits, ranking model, package dependency, or public API. Matching equivalence is narrower than numerical ranking, output work, lifecycle or source fidelity equivalence. There is no overall winner or equal-work speedup ratio.

## Reproduce

Use Node22 or later and an isolated temporary npm consumer. The task evidence retains its package manifest, exact lockfile, actual package archives and installed member hashes. Install the six pinned alternatives and a current private Raveldex archive there with lifecycle scripts disabled. Repository dependencies and the lockfile stay unchanged. No runner installs, fetches or builds packages.

```sh
RAVELDEX_RX8010_CONSUMER=/absolute/consumer node --test test/comparison/n9-alternatives-*.test.mjs
node bench/n9/alternatives.mjs /absolute/consumer /absolute/new-node-output
node bench/n9/alternatives-audit.mjs /absolute/new-node-output /absolute/audit.json
node bench/n9/alternatives-relevance.mjs /absolute/consumer /absolute/relevance.json
```

The Pagefind module exports `runPagefindTrack({ consumer, output, workload, samples, warmups, channel: 'chrome' })`. Pass `verifyFrozen(workloadFor(family, size))` from `bench/n9/workloads.mjs`. A loopback HTTP host and actual local Chrome are required. This is a separate static-site/WASM configuration, not Node direct retrieval. Its exact invocation is retained with the evidence.

Reduced pilots can select `RAVELDEX_N9_FAMILIES`, `RAVELDEX_N9_SIZES`, `RAVELDEX_RX8010_OWNERS=1` or `RAVELDEX_RX8010_ENGINES`; they do not qualify the full matrix.

## Inputs and matching gate

The nine frozen RX-8002 families and sizes remain unchanged. Every child records source, corpus, query, labels and independent complete lexical judgment identities. Source body arrays are projected with a newline between original values within the same field for the selected foreign indexes. This preserves bag-of-words eligibility, not term-frequency lengths, phrase/value boundaries, original offsets or retained-source fidelity. No distinct text fields are flattened together. Metadata is not indexed in the selected foreign lexical configuration.

Each selected query is translated conservatively into a foreign public operation. Returned IDs must be unique, known and complete, with the exact count. Full membership is compared with independently authored frozen lexical judgments, not with foreign rankings or the native scorer. A differing membership remains Not comparable with the actual foreign output retained; it is never repaired by application postfiltering. Different native ranking formulas, tie order and field-length policies are documented and are not required to equal Raveldex BM25. A foreign membership match is agreement with the independent judgment; where the native control refuses, it does not establish a completed paired native result or equal-budget comparison.

Over-cap prefix queries have no matched foreign resource contract and remain Not comparable; no application precheck is advertised as a foreign engine refusal. Unsupported negation, filters, weighting and phrase semantics remain explicit. No application phrase scan, transactional mutation wrapper or interruptible foreign search is manufactured. Native core-only controls retain actual default-cap failures and do not enable optional source/phrase retention.

MiniSearch uses custom tokenization, no fuzzy matching and no stop words; Lunr resets indexing/search pipelines and uses typed query terms; FlexSearch uses a strict body index and public OR resolver, with no selected prefix or weighted multi-field track. Orama uses a custom tokenizer with stemming/stop words disabled and tolerance0. Its pinned exact filter additionally checks original case-sensitive strings; independently observed divergent rows stay Not comparable. Adapter configuration and actual package source hashes are retained.

## Outputs and timing

Native normal timing requests exact totals and top 20 scores/IDs/revision. Foreign normal timing retrieves all ranked matches, maps IDs and checks complete counts. Orama also materializes retained source documents; MiniSearch/Lunr/FlexSearch have their own unavoidable result structures. These are different output and retention costs, even where membership matches. No equal-output latency ratio or equal memory claim is computed. All child harnesses retain their input fixtures, and foreign adapters retain projected documents for validation/lifecycle, independently of each engine’s own retention. Native complete membership is separately paged at 100 hits on the first owner; budget failures remain recorded.

All ordinary Node calls use sequential fresh processes, three owners per engine/family/size, rotated engine order and reversed cells in the second round. Module loading, adapter construction and indexing are inside build timing. Each query has an untimed semantic probe and two explicit warmups. Each100-record query then has40 timed calls per owner (120 total); larger queries have2 calls per owner (six total). A query's first probe is not a machine/filesystem cold start. Workload generation, assertions, result hashing and persistence are outside the query timing window; adapter translation/extraction/validation and promise overhead remain inside it. Monotonic wall, process user CPU and process system CPU are distinct.

Failed collection attempts are preserved. A resume may reuse completed immutable child captures and retry only missing cells under identical package/harness hashes; its commands/source hash and original failed captures are retained. Completed-run summaries and failed-attempt summaries are separate, and a successful retry does not erase an observed deadline/capacity failure.

Nearest-rank p50 is descriptive. p95 is estimated only from at least100 actual same-engine/family/size/operation/phase/outcome observations; six-call cells have no p95 estimate. Repeated calls share owners and are not independent traffic samples. Ordinary desktop/OS noise is uncontrolled. Failed operations are never zero-duration successes. Refused semantic probes retain typed errors but have no latency estimate. An independent required audit rejects unexpected exceptions even if the raw collector labels them Refused; it checks exact native expansion error details and all recorded complete membership/capture identities. No concurrent build/test/other collector is intentionally run during normal collection.

No foreign private work instrumentation exists here. Untimed complete output captures and independent membership checks are semantic diagnostics, not guessed internal counters. RX-8009 retains separate intrusive native diagnostics; no diagnostic subtraction or transfer of its source-retaining timings is performed. Retained/peak heap, browser CPU/heap, physical input/paint and human assistive technology are unmeasured.

## Relevance and separate tracks

The frozen 34-section source corpus and all 76 pre-ranking relevance judgments remain unchanged. Relevance uses distinct title/body fields and declared title 2/body 1 boosts where supported. Every query is retained, including unsupported queries and observed mismatches. Metrics use only each engine's explicitly included subset, with denominators and omitted queries saved. Different subset scores cannot support a head-to-head ranking-quality winner. Each lexical engine also records native metrics on its exact same supported subset; these paired subset observations do not generalize to omitted operators or representative traffic. Labels are incomplete, one-evaluator technical-document judgments, not a representative user study. FlexSearch's selected strict single-field index deliberately declines this weighted separate-field track.

Fuse uses its native fuzzy string/substring score with threshold0.3 and ignoreLocation true. Its observations and relevance metrics remain a fuzzy track even when memberships happen to coincide. No claim equates Bitap matching with token edit distance, exact lexical retrieval or native fuzzy capabilities.

Pagefind indexes one generated static page per original record through its real Node native API, then searches actual generated WASM assets in Chrome. Its language analysis, stemming/prefix behavior, generated result handles and later source hydration differ. Actual build/query/hydration captures and source IDs are retained. All rows stay a separate static-site track regardless of coincidental membership agreement. Package/index bytes are not heap memory; result-handle timing excludes complete data hydration and is not comparable to native ID/score pages.

## Verification boundary

Focused tests execute actual isolated installed engines through an explicit environment variable. Without it, ordinary offline test runs declare those installed-only checks skipped. Acceptance verification supplies the variable, so missing comparator infrastructure cannot silently count as passing. Tests cover normalization, literal metacharacters, absent/empty queries, OR deduplication, complete totals beyond default cutoffs, array and selected-field boundaries, unsupported operators and teardown. Full repository/private-candidate checks must be run on stable recorded checkout inputs; runtime/package identity is compared with the measured native archive. Remote CI, tracking writes and publication remain separate.

## API references

The actual installed pinned source is authoritative for these adapters. Public API references consulted during implementation are [MiniSearch](https://lucaong.github.io/minisearch/classes/MiniSearch.MiniSearch.html), [FlexSearch Resolver](https://github.com/nextapps-de/flexsearch/blob/master/doc/resolver.md), [Lunr typed query](https://lunrjs.com/docs/lunr.Query.html), [Orama search](https://docs.orama.com/docs/orama-js/search), [Fuse matching](https://www.fusejs.io/fuzzy-search.html), [Pagefind Node API](https://pagefind.app/docs/node-api/) and [Pagefind browser API](https://pagefind.app/docs/api/). These references explain API choices; their published benchmark numbers are not local evidence. Installed-source/hash inspection establishes the pinned behavior where current documentation differs.
