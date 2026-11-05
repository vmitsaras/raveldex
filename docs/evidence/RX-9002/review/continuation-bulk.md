# Independent RX-9002 continuation and bulk-boundary review

**Pass within the reviewed local scopes. No remaining blocking finding.** This cross-review covers the other workstreams' final source and actual retained observations; it does not claim an independent rerun of their engine/browser tests. No authored continuation/bulk test, production file or prior evidence was modified by this reviewer.

## Continuation source and observations

The new continuation file uses the actual captured `directHost` dispatch and `ExecutionOwner`, rather than replacing `ExecutionHost.continuation`. Four deterministic cases join the seventh-immediate/eighth-timer transition, a busy engine, admission-relative queued deadline, abort/deadline first-terminal selection, immediate reuse of one queue slot, stale callbacks and disposal. Both ready timer/continuation delivery orders are explicitly controlled. The test checks first settled error, one successful publication, later recovery and cleared task/listener ownership.

The fifth case wraps actual Node timers/immediates at host creation, restores globals immediately and lets genuine native tasks run. It asserts task-versus-microtask dispatch and eventual periodic timer delivery, but **does not require a particular native timer/immediate order or a measured latency**. The recorded external-timer ordering is diagnostic only. Captured stale engine callbacks are replayed directly after cancellation and excluded from the native-delivery count. The observed owned-handle/signal-listener counts return to zero; deliberately retained observer history is not claimed as an engine heap leak.

Independent readback verified the five-new/44-focused zero-failure logs, all source/compiled/log hashes, Node v24.21.0 metadata and the recorded finite observation of 426 native continuation deliveries, including 53 zero-timer callbacks. All 345 compiled package members match the retained RX-9001 archive. This review transfers no Node observation to browser message channels, universal fairness or retained/peak heap.

## Actual bulk-path evidence

The retained browser report has four passing cases and four passing cleanup rows on Chromium **149.0.7827.55**. Its complete 380-member original package map equals the retained RX-9001 private package. Exactly one installed member changes: `dist/adapters/snapshots/bulk.js`.

I checked the three inserted observer statements and independently reversed them: removing those statements reproduces the original compiled member byte-for-byte. They observe participant eligibility after capture, actual per-record dispatch and finalization. They do not wrap or replace registration objects/factories. Raw positive traces select exactly `positions` and `source`, with five bulk additions and one finish per provider; the deliberate spread-registration negative selects neither and records ten actual generic additions. The complete source/offset/phrase/facet/Inspector semantics still match the literal fixture and donor.

The retained executed-fixture archive digest matches its result record. Readback verified all 380 observed package members, three actually served HTML/main/worker pins and all 167 bundled-input pin occurrences. The archive contains 398 files / 2,871,317 uncompressed bytes. These are diagnostic installed-package observations, not normal uninstrumented performance measurements.

## Delivery, reconciliation and storage boundaries

- **Before-host withholding:** the client attempts one restore, but the test transport withholds it from the real worker. The client remains `OUTCOME_UNKNOWN`; the absent host receipt is `expired`, **not proof of rollback**. Exact public old revision/query/evidence/source observations remain. The old owned transport is explicitly disposed with zero listeners/one termination; an explicit new owner loads the selected durable generation. The ambiguous original operation is not resent.
- **After-commit reply loss:** the raw trace proves actual bulk reconstruction, then exactly one restore result is dropped independently of the diagnostic side-channel messages. The client first reports `OUTCOME_UNKNOWN`; reconciliation returns a committed receipt at revision 2. Exactly one restore attempt occurred, full recovered source/results agree, and later mutation remains usable. Diagnostic messages are not miscounted as lost restore replies.
- **Durable CAS conflict:** the target first completes one bulk load. A different owner publishes the winning generation. The stale save returns `GENERATION_CONFLICT`, leaving every captured durable store row and the target's exact public source/query/evidence result unchanged. A fresh receiver selects the winner and has complete expected membership/source. The fresh title BM25 scores use five positive-length documents and average 9/5, rather than reusing the earlier four-document average.

The five completed target/donor fixture comparisons account for 435 full result comparisons. Separate Python arithmetic replay checked **88 actual raw red-query scores** across request variants and the fresh-generation title result using literal source TF/DF/length/population/boost inputs; no production tokenizer or scorer was called. Existing literal ligature/combining-mark UTF-16 ranges are asserted in the executed fixture. General payload keys named `revision` are outside these authored records; the reused fixture's revision normalization is not promoted into a universal arbitrary-metadata comparison rule.

## Classification and limits

The checked sources and final raw outcomes support the reported scoped passes. The expected delivery uncertainty, deliberate spread-registration fallback and captured timer order are controlled scenarios, not reproduced product defects. Original prototype/fixture attempts remain separate from the final guarded browser report.

Old worker root/sidecars are observed through exact public revision, result, source and offset data, not an internal root pointer or physical heap. Four successful dispose cleanup rows do not prove physical durability or garbage collection. Five-record Chromium data does not qualify 10k capacity, Firefox/Safari, real permissions/quota exhaustion, human input or latency.

[Machine review and checked source hashes](continuation-bulk.json) records the verification counts, pinned files and empty remaining-blocker list. No additional tests, benchmark collectors, builds, Git mutations, remote requests or browser workloads were performed by this reviewer.
