# RX-9002 — Combined dictionary/candidate/ranking churn audit

**Scoped outcome: Pass; no new implementation contract violation observed.** The tests add three bounded composition regressions. They do not change production code, historical tests, limit values or the RX-9001 freeze.

## Existing coverage versus selected gaps

| Surface | Existing direct evidence | Selected missing composition and result |
| --- | --- | --- |
| Ordered prefix lookup and exact expansion errors | `test/core/prefix-seek.test.mjs:93–136` covers 256/257, 1024/1025, overlapping-pair error precedence. `:162–243` covers ordinary mutation/cancellation and small source/native restore churn. | Bulk-restored roots followed by live-term removal/reinsertion at both default boundaries were not combined with weighted ranking and selected trace-only records. CHURN-C1/C3 now pass. |
| Revision-local ranking context | `test/core/ranking-context.test.mjs:46–107` covers hand arithmetic and mutation/old-root facts; `:109–133` covers interleaved/reentrant roots; `:151–182` covers simple source/native restore and later edits. | Keep a **partially scored** cursor from a bulk-restored 256-term root suspended while the current root changes vocabulary, corpus averages and query contexts. Resume it against independent original-source expectations. CHURN-C1 passes. |
| Candidate bounds and trace-only nonmatches | `test/core/candidates.test.mjs:112–222` covers opaque predicate universe behavior, empty bounds, per-record consistency failures and selected trace behavior separately. `prefix-seek`/`ranking-context` cover filter/weighted queries. | After actual bulk restore and near-cap churn, check complete weighted/filtered pages plus selective candidate queries whose selected trace IDs include matches, existing nonmatches and missing IDs. Independent eligibility, scores and statistics agree in CHURN-C1/C2. |
| Failed writes and FIFO revision selection | `prefix-seek.test.mjs:176–207` and `ranking-context.test.mjs:88–107` cover rejected/aborted writes and stable old roots separately. | Queue bulk restore → weighted search → late validation failure → genuine mutation core-sealing cancellation → selective search. Both later searches use the one restored revision; the staged term never publishes. CHURN-C2 passes. |
| Bulk reconstruction and ownership | `test/adapters/snapshots/bulk-source.test.mjs:74–127` compares reconstruction, later writes and representation; `:142–312` covers late errors, eligibility, cumulative sealing work, cleanup and stop phases. | Observe first-party source participant finalization in these exact combined fixtures, then verify independent AVL/live-dictionary state and task/listener cleanup after their joined sequence. All selected cases pass. |

Existing tests are not claimed as new work. Opaque callbacks and qualified native restore were **not** additionally joined with this exact near-cap bulk/churn sequence; their earlier independent suites retain their scope. Real worker/storage and real-host deadline probes belong to the sibling RX-9002 workstreams, not these deterministic core tests.

## New regressions

The new [test file](../../../../test/core/n10-churn-hardening.test.mjs) uses the compiled actual library and a deterministic `FakeHost`. Its source provider is the literal first-party registration, not a wrapper. The observed `snapshot.source.participant-finalization` metric proves that the actual first-party bulk finalization branch runs. No diagnostic patch to the library is needed.

1. **CHURN-C1:** restore 256 original records with one distinct `preNNN` term each. Prime an old-root search through scoring into selection, then retain that cursor while deleting/replacing terms and adding/removing keys across 256/257. Compare all public pages of weighted, filtered and selective queries against a full original-source oracle. Check selected trace field statistics and document existence/membership/score facts, including off-page, nonmatching and absent IDs. Resume the old scored cursor and verify its original result. The initial equal-length, single-occurrence case also checks explicit BM25 `0.75 × ln(1 + 255.5/1.5)`.
2. **CHURN-C2:** queue restore, a weighted/filter search, a two-record add that fails `ID_EXISTS` during late validation/analysis, a separate add cancelled only after entering private core sealing, and a selective search. The failure stages are deliberately distinguished: the duplicate does **not** prove core staging. The cancellation does. Before cancelling, the published root is still restored revision 2; afterwards its exact object identity remains unchanged. Both searches use revision 2, and neither the analysed-only nor core-staged new term is visible. The structural signal has zero listeners and the host has zero pending tasks afterwards.
3. **CHURN-C3:** restore a record containing four disjoint 256-term prefix groups. Add a separate exact term to reach query expansion 1025, remove/reinsert one source term to cross the boundary in both directions, and finally remove the extra record. Exact typed error metadata remains `expansions.query / 1024 / 1025`; the accepted side agrees with the independent scorer.

The AVL checks independently traverse each frozen node, enforce strict key bounds, exact heights and balance, and compare complete key/DF/population/length values with an original-source scan. They do not prescribe a particular rotation shape. No production tokenizer or scorer supplies expected membership, scores or statistics. Direct trace formula replay additionally checks term frequency and document length from the source oracle.

## Commands and actual results

```sh
node --test test/core/n10-churn-hardening.test.mjs \
  test/core/prefix-seek.test.mjs \
  test/core/ranking-context.test.mjs \
  test/adapters/snapshots/bulk-source.test.mjs
```

[Final complete output](combined-focused-final.txt): **33 passed / zero failures, skips, cancellations or todos** — three new tests and thirty existing focused regressions. [Machine result](results.json) records the exact source/test hashes, Node environment, command and log digest.

All **345 `dist` members** present in the retained RX-9001 closing package match current compiled files byte-for-byte. The package/archive digest and matched paths are recorded. These are repository compiled-library tests, not a claim that this workstream executed an independent installed consumer, a real browser or a native snapshot portability matrix.

The first focused development attempt passed one test and failed two because its weighted fixture accidentally combined 256 prefix terms with a distinct `common` exact alternative. The correct native 257-pair refusal exposed the fixture error. The fixture now uses the overlapping `pre000` exact alternative at a different weight; no engine fix was made. [Original failure output](focused-attempt1.txt) remains separate from the final pass.

## Interpretation and limits

The selected composition preserves exact totals, scores/order, old/current root isolation, prefix error metadata and deterministic observable resource ownership. A paused cursor intentionally keeps its selected root and query-local state alive until drained. The completed tests drain every cursor and dispose each owner with no pending host tasks; this does not measure garbage collection or retained/peak heap.

No new runtime defect was reproduced in this bounded surface, so this workstream proposes no RX-9003 repair. No universal race, callback-combination, platform, latency, memory or fairness guarantee follows. All timing in the test runner is verification duration, not engine benchmark evidence.
