# RX-4001 frozen source judgments and relevance observations

This evaluation keeps relevance separate from semantic correctness. One Codex source-reading evaluator authored 76 distinct judgments on October 8, 2026 before inspecting any RX-4001 production rankings. The labels describe answer sources for technical tasks; they are incomplete judgments, not a representative user study or an independent human panel.

The [frozen corpus](../../test/fixtures/relevance/corpus.json) contains 34 unedited current documentation sections from five explicitly allowlisted specification/architecture files. The existing section extractor preserves original Markdown, code fences, whitespace, IDs, source paths, anchors and source/record hashes. It excludes evidence logs, archived proposals and benchmark reports. No keyword repetition was added. Corpus SHA-256 is `8ba88f8c4610a83ee3dcf453ce2434c16e6d2f3af070590f2e220c7bec28244b`. The [freeze record](../../test/fixtures/relevance/freeze.json) checks exact corpus and judgment-file bytes; later documentation edits cannot silently change the collection.

The [judgments](../../test/fixtures/relevance/judgments.mjs) record typed query, task intent, must-find/acceptable/known-irrelevant source IDs, query semantics, source rationale, label completeness, category and intended-empty reason where applicable. The shared context records author, date, corpus hash and configuration/judgment versions. There are 70 known-relevant tasks and six intended-empty cases, including eight natural questions, explicit title prefix/exact navigation, scalar metadata/Boolean requests, ambiguous terms and 12 judgments requiring a strict phrase capability. Must-find IDs are included in the acceptable set. Unlabelled sources remain unknown rather than being inferred irrelevant from a ranking.

## Reproduction and correctness

Use an isolated consumer installed from the current local package tarball:

```sh
node --test test/comparison/relevance.test.mjs
node bench/relevance.mjs --consumer /absolute/path/to/installed-consumer --output /tmp/raveldex-rx4001-relevance.json
```

The runner starts an ESM child in that consumer and imports the root and optional modules only through exported package names. The parent independently scans original corpus values using `test/oracle/query.mjs` and `test/oracle/phrases.mjs`; neither imports the production analyzer, dictionary, evaluator or scorer. It compares complete membership, exact total, deterministic ordering and every returned numerical score with `max(1e-12, abs(expected) * 1e-12)` tolerance. Original-value phrase adjacency and successful Boolean score participation are evaluated independently.

The first packed observation used Node 24.21.0/V8 13.6.233.17-node.53/ICU 78.3/Unicode 17.0 on macOS arm64. It passed 292 complete independent comparisons: 64 core queries and 76 each with source, positions plus original offsets, and mixed title positions/body source. The source/positions and source/mixed pairings each passed 76 complete comparisons, including identical unrounded scores. There were no operational errors or correctness differences. Ten focused tests pass for metric denominators, macro/micro recall, missing-answer zeros, explicit phrase mapping, label validation, byte freeze and all six independent intended empties. These observations do not replace the full project correctness suite.

Each configuration declares schema, native analyzer/model, retained source, positions/offsets, exact-total and phrase semantics, selected scalar metadata predicates and omitted UI/worker/storage/evidence. Positions/offsets retain no originals; mixed retains body originals and title positions/offsets. The core configuration omits phrases and marks the 12 phrase judgments not comparable. These configurations share retrieval meaning where supported; they are not four different rankers and import/bundle cost is measured separately.

## Metrics from preserved full rankings

MRR cutoff 100 includes the complete 34-record collection. Top-1/Top-3 count queries with an acceptable source in the first one/three hits. Intended empties are excluded from ranking denominators. Recall@10 is macro-averaged over each query's known acceptable source set, including zero for a known-answer query returning nothing. It is recall over incomplete judged relevant labels, not exhaustive collection recall. The raw report also preserves the micro numerator/denominator as a separate diagnostic.

| Configuration | Ranking denominator | Top-1 | Top-3 | MRR@100 | Judged Recall@10 macro | Correct intended empties | Unintended empties |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Core, supported subset | 60 | 43/60 | 48/60 | 0.7556 | 0.6736 | 4/4 | 10/60 |
| Source phrases | 70 | 51/70 | 58/70 | 0.7762 | 0.6998 | 6/6 | 10/70 |
| Positions plus original offsets | 70 | 51/70 | 58/70 | 0.7762 | 0.6998 | 6/6 | 10/70 |
| Mixed title positions/body source | 70 | 51/70 | 58/70 | 0.7762 | 0.6998 | 6/6 | 10/70 |

The differing core denominator prevents using these aggregate values as a direct superiority comparison. No scoring, document wording or labels were changed after seeing the output. The full ranked IDs/scores, independently calculated rankings, metric components and source hashes remain in the raw report. Calculation code is [relevance-lib.mjs](../../bench/relevance-lib.mjs); the runner is [relevance.mjs](../../bench/relevance.mjs).

## Failed and zero-case review

The enabled configurations produce the same 41 classified rows: 12 complete lexical mismatches, 15 partial lexical-coverage losses, five ordering misses, three mixed lexical/ordering losses and six correct intended empties. A classification is recorded for every Top-1/Top-3 miss, incomplete judged Recall@10, missing must-find result and zero result. A partial Recall@10 loss does not automatically mean poor ranking: many semantically acceptable sources do not satisfy every literal query term. Complete independent eligibility distinguishes that case from eligible answers below a ranking cutoff.

All eight natural questions return zero because `basic-v1` keeps every analyzed word and plain strings require all of them. The intended task sources exist, but tokens such as `how`, `i`, `my`, `unfinished`, `another`, or a conjugation absent from the selected answer sections prevent eligibility. These remain unintended-empty relevance observations. No semantic/paraphrase capability, stop-word handling, stemming or implicit prefix is claimed.

Two other known-answer queries return zero: `NFKC lowercase` requires the exact `lowercase` term, while the answer source uses `toLowerCase` and `lowercasing`; `4096 facts` requires `4096`, while the bound is written `4,096` and analyzes as `4` plus `096`. Two more lexical mismatches return unrelated results: `atomic batch` misses the mutation table's `atomically`, and `unchanged reanalyzed` misses staging's `reanalyze`. The original answer labels are retained.

| Classification | Judgment IDs | Source-based interpretation |
| --- | --- | --- |
| Lexical mismatch, empty | `analyzer-normalization`, `ranking-trace`, `natural-cancel-queued`, `natural-source-ownership`, `natural-filter-null`, `natural-prefix`, `natural-phrase-repeat`, `natural-replace-rollback`, `natural-database-delete`, `natural-portability` | Required literal tokens are absent from all labeled answer sources; ten unintended empties. |
| Lexical mismatch, nonempty | `execution-batch`, `execution-incremental` | Literal query qualifies another section but no frozen acceptable answer source. |
| Partial lexical coverage | `record-empty-array`, `record-opaque-id`, `analyzer-identifier`, `query-repeated`, `query-prefix-cap`, `query-scalar-score`, `result-pagination`, `limits-corpus`, `ranking-population`, `ranking-failed-branch`, `ranking-tie`, `execution-queue`, `execution-identical-replace`, `phrase-atomic-total`, `phrase-retained-source` | A top-1 acceptable source succeeds, while some other labeled relevant sections lack exact words, singular/plural form or requested adjacency. Their loss lowers judged recall without an ordering defect. |
| Ordering | `ownership-originals`, `query-cross-field`, `execution-publication`, `phrase-negative-branch`, `ambiguous-revision` | Eligible answers are lower than the first hit or the top-10 recall cutoff; native arithmetic still agrees with the independent model. |
| Mixed coverage and ordering | `query-empty`, `ambiguous-count`, `phrase-shared-budget` | Some labeled sources are ineligible, and eligible answer sources also have a rank/cutoff miss. |
| Intended empty | `empty-absent-topic`, `empty-tokenless`, `empty-implicit-prefix`, `empty-wrong-path-case`, `empty-impossible-phrase`, `empty-phrase-tokenless` | Correct absent-topic, tokenless, no-implicit-prefix, metadata case-sensitive, impossible title adjacency and empty phrase behavior; all six independently confirmed. |

The table is a source review of observed outputs, not permission to tune contracts or revise labels. Natural-question vocabulary, normalized numeric identifiers and singular/conjugated wording are bounded relevance follow-ups. There is no observed tokenizer contract failure, missing indexed allowlisted source, UI/navigation defect or unsupported optional capability in these successful comparable queries. Core phrase omissions are explicitly not comparable. UI/navigation/assistive technology, broader content/language/user distributions, physical costs and cross-host qualification remain separate work.
