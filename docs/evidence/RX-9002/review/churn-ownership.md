# Independent churn and ownership review

**Pass within the reviewed source/test/evidence scope. No actionable finding.** The reviewer authored neither of these test files. No engine execution, build, collector, production/Git/remote change or modification to the authored tests/results occurred during this cross-review.

## Churn composition

`test/core/n10-churn-hardening.test.mjs:89–130` joins actual first-party bulk restoration, weighted/filtered/selective retrieval, live 256/257 prefix churn, trace-only nonmatches and an older search cursor. The older cursor is paused at `selection` after a matching document was scored (`src/core/query/search.ts:87–105`), so query-local ranking state has actually been populated before a different root is used. Completing that cursor against the original authored records is a meaningful stale-context check, rather than pausing before ranking starts.

The source oracle at `test/oracle/query.mjs:1–42,128–170` has no production analyzer/compiler/evaluator/scorer import. It independently scans original strings, derives frequencies/population/length, evaluates Boolean participation, computes BM25 and sorts results. The new comparison helper checks complete totals, actual public-page IDs/order and each score against that reference (`n10-churn-hardening.test.mjs:35–41`). Three offsets cover all admitted successful prefix/weighted pages in this bounded corpus. The literal initial `.75 × IDF` assertion supplies an additional hand-derived equal-length case.

The AVL checker (`:43–59`) independently traverses the actual ordered tree: frozen nodes, no repeated node/cycle, strict BST bounds, recursively computed heights and balance. Its complete ordered key set matches source-derived term membership, actual directory keys and source-derived DF/population/length. It does not merely call the production ordered-tree validator.

The latest queued case (`:133–168`) correctly distinguishes a late `ID_EXISTS` validation failure from a separately cancelled private core-sealing mutation. `src/core/mutations/owner.ts:125` enters `core` after document contributions are staged. The case verifies that the restored root/revision remain authoritative, both analysed-only and staged phantom terms remain absent, queued reads recover and the old-root result is unchanged. It does not hide an expected broken behavior behind a success assertion.

The final case (`:171` onward) genuinely crosses the 1,024/1,025 query expansion boundary through removal/reinsertion. The 256/257 group and 1,024/1,025 query failures assert exact error code/message/path/limit/actual facts; refusals are expected controls, not successes or performance findings.

## Deterministic ownership composition

`test/core/n10-resource-ownership.test.mjs:42–89` reuses one source+positions receiver for eight success/late-refusal/query-abandonment/bulk-abandonment/recovery cycles, followed by disposal during suspended participant sealing. Phase counters establish that query ranking selection and first-party bulk participant finalization are reached before cancellation. They are not inferred from a fixed arbitrary step count.

Assertions verify zero injected-host deadline/continuation tasks and signal listeners after terminal outcomes, exact authoritative root/sidecar identity on failures, valid core/revision state and source roundtrips after recovery, and one host disposal with `owner.root === undefined`. The external cleanup assertions remain effective even if the host's own disposal assertion were caught by engine cleanup. Source inspection of `engine.ts:257–291`, query-local state and bulk cursors supports the ownership map.

This proves observable deterministic ownership and reuse. It does not prove collection of decoded strings/builders, individual map reclamation, or retained/peak heap. The test intentionally retains comparison roots, and its documentation explicitly discloses that. Position-sidecar contents are not independently reconstructed element by element by this resource-lifetime case; stronger position semantic claims must use their separate evidence.

## Evidence checks and boundaries

The current churn test hash matches its recorded final result, and the final log contains the separate core-sealing cancellation case. Its focused command reports **33/33** passed; the ownership command reports **1/1**, each with zero failures/skips/cancellations/todos. The resource test hash and churn log SHA-256 match their records. [Machine review](churn-ownership.json) retains the exact reviewed source hashes and parsed command totals.

The earlier churn fixture failure is disclosed as a wrongly chosen distinct 257th alternative and is not relabeled as a runtime defect. No broad opaque-callback, qualified native-restore, worker/storage, physical-host, all-state or all-platform claim follows from these two probes. Existing coverage and the newly joined cases remain distinguishable; source-preservation and no-GC/performance limits are stated accurately.
