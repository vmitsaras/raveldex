# RX-8010 independent source, method and raw review

**Result: Pass for the recorded comparison scope and final local repository/private-candidate verification.** Reviewed 4 November 2026 by the delegated comparison reviewer. This review does not establish release, remote CI, all-platform behavior, equal-output latency or unconditional 10k capacity.

## Source and fairness

Reviewed the actual `bench/n9/alternatives*.mjs` collectors/adapters, comparison tests, frozen N9 workloads, pre-ranking relevance labels, the method and main evidence. Foreign modules are injected from an isolated installation; no foreign engine enters native runtime. All194 recorded runtime/integration/package input hashes still match the starting baseline. Eight archived packages verify by bytes/SHA256; the actual Pagefind platform download additionally verifies its lockfile SHA512 integrity.

The selected translations preserve declared fields and reject unsupported clauses. MiniSearch/Lunr use separate title/body fields and boosts in relevance; FlexSearch explicitly declines that weighted multi-field track. Orama's original-string exact filter is retained and its observed mismatches become Not comparable before matched timing. Fuse fuzzy and Pagefind static/WASM remain separate even on coincidental membership agreement. Array joining establishes only bag-of-words membership. No phrase/offset, ranking, retention, transaction, cancellation or output-cost equivalence is inferred.

The original collector labeled every exception Refused. Review required a supplemental acceptance gate rather than trusting that label. The new gate validates actual native error types/codes/cap details, rejects programming/assertion and foreign exceptions, requires complete Cartesian/query coverage, mandatory repeats/warmups and capture hashes, validates native pages/foreign memberships, and recomputes summaries. It runs outside normal timing and does not change pinned collector bytes. Its28 tests pass with no skipped, failed or cancelled tests; mutation cases cover missing results/samples, corrupted totals, wrong errors, coverage and lost failed attempts. The combined installed comparison/audit suite passes47 tests with zero skips.

## Actual Node captures and derived numbers

The [required audit](node-audit.json) passes against Node report SHA256 `8d9cfe67c8b6a98f3a863a4093705d51694cbcd811f9091dd18dbbb6ccefb8ff`.

- Exact coverage:162 completed children plus one separately retained failed build attempt;9,660 successful normal samples include162 builds and9,498 queries.
- Complete matching:423 repeated-owner equivalent foreign rows; all56 successful first-owner native queries have complete pagination membership. Nine Orama common-query mismatch rows remain explicit:82/97,822/971 and8234/9706 actual/expected across the three sizes.
- Refusals:18 native expansion probes retain `LIMIT_EXCEEDED`, `expansions.group`, limit256/actual257; three real-doc10k broad-prefix probes retain `WORK_LIMIT_EXCEEDED`. No unexpected exception qualified as a budget result.
- Failure preservation: one high-cardinality10k native build attempt retains genuine `DEADLINE_EXCEEDED`,77,617.464417ms wall and8,025.721ms user CPU. Its raw file, explicit same-cell retry link and failed-attempt summaries remain separate from completed-run summaries. Retry success does not erase the refusal or establish its host-delay cause.
- Independently recomputed all269 successful summary groups and72 empirical p95 groups directly from raw samples. The illustrative adversarial100 common-query table rounds the actual120-call cells correctly. Larger six-call cells have no p95 estimate. Different output/ranking work prevents an equal-work speedup claim.

## Relevance and Pagefind raw audit

The [separate Python audit](verification/independent-review.json) ([script](verification/independent-review.py)) reads raw captures and the unchanged source-authored labels, independently recalculating first acceptable ranks, top1/top3, reciprocal rank, recall, empty-result metrics and aggregate denominators. Included/omitted counts reproduce76/0,58/18,0/76,5/71,58/18 and57/19 for native, MiniSearch, FlexSearch, Orama, Lunr and Fuse. Native metrics on each lexical engine's exact included subset also reproduce. No output-derived relabeling or different-denominator quality winner appears in the reviewed narrative.

All nine Pagefind reports are Collected in actual headless Chrome156.0.8078.80. Independently verified all33,636 generated files against their recorded original bytes/SHA256 (18,316,725 bytes), all36 query configurations,360 ordinary samples,72 warmups and49,586 hydrated source-ID/URL captures. Quantiles and membership-coincidence flags reproduce:28 coincide and eight differ; all36 remain Not comparable. No page errors or external browser requests appear. Ten samples do not estimate p95; result-handle timing excludes later hydration.

The supplemental Python audit initially reused a local aggregate-loop variable and consequently failed an inclusion-count assertion. The audit-only variable was corrected and the complete extended audit then passed; no engine, fixture, label or raw capture changed. The retained [review-attempt record](verification/review-attempts.json) distinguishes that script defect from an engine failure.

## Final local verification and remaining scope

Inspected the actual guarded command records and complete suite summaries. [Private candidate preparation](verification/candidate.json) exits0 in172.762624208seconds with all763 recorded input hashes unchanged. The [full log](verification/verification.log) records1,075 primary,182 UI,24 worker,26 IndexedDB, one migration-browser and three Astro tests: **1,311 Pass**, zero failures, cancellations, skips or todos. Installed package import/declaration/content/graph checks pass with no runtime dependencies.

The measured archive and verified `core.tar.gz` independently hash identically to SHA256 `a72ced302ec98c337cf6b9fdb1f1526e55c25637c654d14a5d403d63eea2f6b9`. This comparison covers the tested package; later closing publication-status prose receives its separate package-member comparison.

[Site verification](verification/pages-browser.json) passes all14 cases; [focused lifecycle/parity verification](verification/focused-lifecycle.json) passes30 cases, including the107-position cancellation observation. These focused cases overlap the full suite. Both command guards record unchanged inputs. The [installed independent oracle](verification/independent-results.json) passes345 query comparisons,1,155 mutation comparisons across75 operations,438 phrase comparisons,288 phrase-parity comparisons and10 hand-score assertions. Its first `/tmp` alias invocation failed to parse empty JSON because the executable-entry guard did not run; the failed log and guarded canonical `/private/tmp` rerun are both retained. The successful rerun exits0 with unchanged inputs and no source repair.

No unresolved blocking finding remains in the inspected implementation, matching gate, raw captures, derived narrative or final verification. Heap/peak memory, physical input/paint, assistive technology, other browsers, representative traffic and equivalent foreign transactional/worker/persistence behavior remain unmeasured. No remote CI, publication or unconditional10k capacity follows. RX-8011 owns the later milestone-wide independent/support review.
