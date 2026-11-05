# RX-9005 independent preflight review

The current static design matches the frozen update cohort. This is source/read-only review, not an accepted performance collection or a newly executed engine test. Actual large-case feasibility, raw negative probes and full-run acceptance remain separate gates.

The [baseline](baseline.json) directly checks 194 unchanged runtime/package/integration input hashes and all nine RX-9001 freeze files. Filesystem Git references identify the clean starting checkout as `4745cb9041d5774cf0e386de923bd03610563611`; the retained current measurement archive keeps its original `6100770` source attribution. The new run identity records these as separate facts, rather than relabeling the archive.

## Frozen coverage

Independent arithmetic yields 144 children (108 normal, 36 diagnostic), 5,544 selected normal windows and 696 diagnostic windows. Normal window counts per child are 32 at 100 records, 80 at 1,000 and 42 at 10,000. The tail accounts for 72 excluded warmup calls. Measured windows contain 92,376 normal and 15,168 diagnostic public calls if every declared sequence completes; actual attempted/completed counts must retain resource refusals separately. There are 240 zero-attempt Not-applicable case rows for size100/B256; these must have no invented timing.

The six single-record cases preserve the reserved final ID, exact A/B/novel templates and declared N−1/N populations. Same-vocabulary replacement alternates genuinely different source order, not a no-op input. The five batch cases use trailing B original IDs and B=1/32, plus256 only for N>=1,000. Replacement/removal are B ordered public calls, not one atomic batch. Their receipts and completed prefix remain visible on refusal.

## Measured versus verified work

Initialization, original build, resets and required reinsertion preparation are outside selected mutation windows and recorded separately. A whole B-call window explicitly includes receipt collection, per-call monotonic clock reads and immutable-root pointer retention. Both artifacts perform this harness work; no overhead subtraction or isolated engine CPU claim follows. Invocation-to-synchronous-return includes the engine's first synchronous pump and therefore is not pure admission time; return-to-settlement is not an independently measured queue delay. Calls are issued with no other outstanding task-owned engine operation.

Every actual successful prefix root is retained briefly and independently inspected after the selected window. An authoritative failed call preserves the last successful root, and an unexpected/Unknown outcome aborts collection. Per-call receipts prove distinct atomic revisions; aggregate sequences do not acquire atomic semantics.

The verifier's expected tokenization, source, TF/DF/length, BM25 and position/UTF-16 records come from authored strings rather than production tokenization/scoring. Full core/source/position state is checked against that model. Immutable caches bind actual identity to expected content; duplicate directory keys, key placement and nested mutability are rejected before cache reuse. Initial full snapshots and subsequent record/posting deltas preserve reconstructible actual prefix states.

Four targeted native queries are freshly drained against every observed root outside timing. Full all/common pages may reuse an explicitly identified previous actual capture only when the completely checked frequency/metadata/configuration state is equal. Such reuse establishes semantic answer identity; it is not a newly executed query, current-root resource-admission observation, timer/deadline/fairness result or public-FIFO measurement. Physical traversal may differ despite equal semantic data. Raw pages, fresh/reused provenance and source/core/state hashes are retained rather than replaced by counters.

## Static findings resolved before collection

- Pilot diagnostic-owner labeling was inconsistent between plan and child; exact plan membership now handles the diagnostic slot.
- Declared reinsertion add/remove preparation was not initially executed; it now runs before timing.
- Generic prefix capture could discard actual query pages/provenance; actual captures and references are now in retained state capsules, with checkpoint bindings.
- Frequency-only A/B states require input evidence; outside-window ordered trace hashes now bind exact inputs and authored pre/post source fingerprints.
- Directory key duplication could be masked by Map conversion; independent duplicate/key-placement and nested-immutability checks now close that gap.
- Boundary-vector methods/indexes/outcomes, warmup order, trace labels and old validator/transitive harness pins were strengthened. Checkout HEAD is checked before and after collection.

These were local measurement-harness issues found by static inspection; they are not runtime defects or failed performance observations. All original runtime/method files remain unchanged. Worst-case10k/source-position feasibility under600s/child and5,400s total must be checked before accepting the full matrix; reducing the matrix or relabeling a watchdog is not allowed.
