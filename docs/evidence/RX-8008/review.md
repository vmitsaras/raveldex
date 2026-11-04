# RX-8008 independent source review

Date: 4 November 2026. Reviewer: delegated `bulk_review` agent, independent of implementation. Scope: source/diff and test-source inspection against `docs/evaluation/RX-8007-bulk-contract.md`, starting from baseline `fe92ee251f2845b1cd7f6876e580bfd47d615772`. The reviewer ran no tests, builds or benchmarks. Official measurements, raw-data review and full verification remain pending the parent workflow; this record does not establish 10k capacity or runtime acceptance.

## Outcome

No unresolved blocking source finding in the reviewed implementation.

- **Eligibility:** the private WeakMap records the exact immutable factory registration and propagates its factory to the normally captured registration. Matching codec strings, spread copies and wrapped callbacks do not prove eligibility. No public registration property, codec or capability role is added. Arbitrary accepted registrations retain the generic per-record route.
- **Protocol and analysis:** generic callbacks retain bound handles, fresh frozen one-record `add` contexts, empty removed IDs, successive private revisions, previous participant state and the shared receiving-analyzer runner. The first-party sessions reuse the existing source/position `retainRecord` helpers; no token-fusion or arbitrary-callback purity assumption is introduced.
- **Bounds:** each record retains individual capture/admission and mutation-work limits. Duplicate IDs are checked before analysis. Prospective dictionary counts and other core counts are checked before that record's participants. Source/position retained bounds apply during each append. Participant append and final sealing work both join invocation and cumulative participant meters, the finalization mutation meter and the unchanged outer whole-restore meter. Final core sealing validates counts and live-dictionary agreement.
- **State and cleanup:** core and eligible sidecar directories remain unpublished until sealing. Add-only first-encounter order is retained; derived AVL shape need not be identical, but membership/order/invariants must agree. Active child iterators close on unwind. Sessions retain no global construction state. The existing restore cursor still prepares rebased root and receipt before the last precommit check and publishes exactly once, with no postpublication callback/check/yield.

## Finding corrected during review

The first generic implementation skipped `cursor.return(undefined)` after a successful `next()` returned `done`. The existing public-participant bridge always attempts that return, and custom iterators can observe it. The implementation now attempts return unconditionally and preserves the first outcome when cleanup throws. The added custom-iterator regression checks success, typed failure, cleanup invocation order and cleanup exceptions; a native generator's own `finally` alone would not establish this behavior.

Review also identified that `CoreDelta.counts.dictionaryEntries` changes only during sealing. A separate live count now protects prospective limits before participant callbacks; the late-third-term regression checks refusal before that callback, exact old-root preservation and later recovery.

## Test sources inspected

`test/adapters/snapshots/bulk-source.test.mjs` covers complete sequential-vs-bulk core/sidecar and native/source wire comparison, subsequent writes, basic/English/identifier analysis, v1/v2 occurrences and original UTF-16 offsets, missing/empty fields, repeated terms/value boundaries, hand-derived BM25 arithmetic, malformed/duplicate/header failures, prospective dictionary caps, exact-versus-spread/wrapped eligibility, final-sealing cumulative budget refusal, generic callback contexts and cleanup, analyzer/retention ceilings, phase cancellation through participant finalization, deadline, queued/reentrant work, disposal and no signal read after publication.

The existing whole-restore participant-budget regression in `test/adapters/snapshots/lifecycle.test.mjs` now deliberately uses a spread clone to retain its generic per-record COW workload. It still checks cumulative late refusal, old-state identity and recovery beyond the public mutation batch limit. These are inspected assertions; test execution results belong to the parent's verification records.

## Reviewed source identities

SHA-256 from a read-only `shasum -a 256` at this review checkpoint:

```text
44cd2b60afda1b4292a278254ca317da8fe16f5b1830fd90541b5195617a5700  src/adapters/snapshots/bulk.ts
2084e2bfd681e0a010e79cbd2d5ab27cf219b05a7bc646992799f162ee0b8c75  src/adapters/snapshots/snapshots.ts
2a8b95aafdd09e00d15c0f335bdbf87ab5822a04e98edfd9e4db43fe6c963409  src/core/mutations/delta.ts
a2f8149f17255e3c7395e78b841800b7721b977c9cb35ddd9aa11c3832278ced  src/core/capabilities/bulk-participant.ts
c53788708b9002fda0b36cbbd16350510a4c4f815beeefdb9e9b92e8d4b20976  src/core/capabilities/registration.ts
848ade34cf02325b7357e463b27bcdba3db90deec771bac8b428721e82646fce  src/addons/phrases/store.ts
bdd9786a236c683acfa478d72461e9898354262de11b595d79972baf5410e401  src/addons/positions/store.ts
9f38f4b54f4a2f91ec9b39510108e17abcfe472af16c181c6be09b516bbf4462  test/adapters/snapshots/bulk-source.test.mjs
0be142e50a8c9833d49635dc9dbb5957c5dd5bdea4ab0814da909516bfff6f18  test/adapters/snapshots/lifecycle.test.mjs
```

No worker/storage runtime, throughput, wall/CPU, memory, installed-package, site/browser, full-suite or raw-artifact acceptance claim follows from this source review. Those checks require their own evidence, including preservation of the refused generic-core pilot.

## Parent verification closure

The later [raw review](raw-review.md), [full candidate guard](verification/candidate-final.json) and [package comparison](verification/package-comparison.json) close the initially pending measurements/checks. Parent full rerun passes1,237tests after correcting two stale diagnostic phase/version assertions; no production source changes follow the reviewed hashes. Site14/lifecycle30/installed oracle checks pass separately. The measured and verified tarballs are byte-identical. This paragraph records parent evidence; the source reviewer did not execute those checks.
