# RX-8008 raw measurement and method review

Review date: 2026-11-04. Outcome: **Pass within the pinned measurement scope; no blocking raw-data or method defect found.** This review is separate from the production implementation review in `review.md` and from the candidate verification closure.

The reviewer read the archived source, harness, installed-package inventories, source exports and actual per-owner observations. Read-only `python3` audit commands used `json`, `hashlib`, `tarfile`, `pathlib`, `collections` and `statistics` to recompute identities, compare records, reconcile counters and reproduce summaries. No build, test, install, baseline regeneration or timed operation was run for this review.

## Coverage and identity

- All four `report.json` files finish `Collected`, without a failure or guard failure: 24 Node cases and 32 Chrome cases, covering 56 cases and 280 operation observations. Each case contains the expected build, export, restore, forced-deadline and timer-abort operations. All Node child exits are zero; all browser case outcomes are `Collected`, with no page errors or external requests. `Collected` denotes complete observation coverage.
- The before archive SHA-256 is `fea176e74d1f8c28602628b886dc744b1aa53d3ccbfc2e8942cf180c61adb0ab`; the measured after archive SHA-256 is `a7547dcf0105273df2642ee9ec416848215b5f037778909a21beb98fc8788714`. Both complete tar member maps match `artifacts.json`: 376 before members and 380 after members. Exactly ten `dist` members change, including the four added bulk module members. `dist/core/limits/limits.js` is byte-identical.
- All 169 runtime source hashes in `artifacts.json` match both current repository files and `measurement/source/` copies. The package-lock hash matches the retained source lock. The common `sourceHead` value `fe92ee251f2845b1cd7f6876e580bfd47d615772` is the base commit; it does not independently identify the edited after runtime. The archived source pins, tar hash and member map identify that measured runtime.
- Rehashed 3,024 files across the retained ordinary and disposable diagnostic Node/browser installations. Their actual bytes match their recorded inventories. Ordinary inventories exactly match the appropriate tar member map. Each of the four diagnostic transformation chains agrees from ordinary bytes through generic instrumentation to restore instrumentation and its final diagnostic inventory; unlisted files remain unchanged.
- Current and archived harness hashes match the reports, including `bulk-verify.mjs`, the shared case, child, drivers and observer. Staged Node case/child/verifier bytes match the archived harness. All 48 archived browser assets match their recorded byte counts and SHA-256 values. Ordinary browser assets contain none of the restore observer, generic counter or diagnostic owner-hook symbol markers. Reported package and harness guards pass.

Node observations use Node 24.21.0, V8 13.6.233.17-node.53, Darwin arm64 on Apple M5 Pro. Browser observations use headless Chrome 156.0.8078.80, Playwright 1.61.1 and esbuild 0.28.2. Normal and intrusive diagnostic observations remain separate. Actual worker measurements include the complete public RPC promise; diagnostic control traffic is outside the timed operation.

## Complete input and receiving-state parity

Rehashed all 56 archived source snapshots and checked their recorded bytes/code units and SHA-256 values. Independently reconstructed every expected literal adversarial record by ordinal, including the original single-value versus three-value body arrays, exact spaces, rare/left/phrase controls and group metadata. Every exported record matches. The same complete source bytes occur across versions, modes and Node/Chrome direct/worker hosts for each size/variant:

| Records | Variant | Bytes | Source SHA-256 |
| --- | --- | ---: | --- |
| 1,000 | source | 172,937 | `6c686a6c1ec7b6556bc7e651be2238ba0043c053bceb760e041f007cbf223110` |
| 1,000 | positions/offsets | 174,340 | `bdfb2c68c44ea597a8cae0b09940490b667ba1a78de15cd9e3edf0cf195b7268` |
| 10,000 | source | 1,696,998 | `56b7664d9f522969e7ba7d624971ad8c63a6872364ae1ea9568331dbddefe9b1` |
| 10,000 | positions/offsets | 1,698,401 | `48a805e777d35c632be87b7480c94c2d928a1b94e9fb71c3243ca58e2e7cad1e` |

All 42 successful restore observations contain passing complete public source and membership checks. The source check verifies both checksums and compares the complete header, records, metadata and raw arrays, normalizing the protocol origin revision and its checksum. Membership checks cover all ten or 100 pages, exact totals and revision, every unique id, zero all-query scores and ordinal tie order. Restore receipts publish once from prior revision 4 to 5 and carry the actual donor origin revision (4 or 40). The prior marker is removed.

All 18 successful diagnostic restores additionally report equal full donor/receiver private-state and encounter-order hashes. The canonical private projection includes every core document/reverse entry, dictionary/posting entry, statistic and selected source/positions protocol datum, including occurrence arrays and offsets. It validates directory membership/placement/sizes and AVL membership/order/heights/balance; valid tree shape and known header revisions are normalized. The four donor hashes agree across all six matching diagnostic cells (before/after × Node/Chrome direct/Chrome worker):

| Records | Variant | Complete donor-state SHA-256 |
| --- | --- | --- |
| 1,000 | source | `6091bcb15345f6ce5a23e9c427d4f148d5dace310525232d4ae62661c639285c` |
| 1,000 | positions/offsets | `c9ca9067c2908aee74f8b56c0f4ab64d289d5e87d3cacf5c6365050969150890` |
| 10,000 | source | `2dc4082a8388f2d899ee33742a10acb1dd54b97a57e9d73211964706a182316c` |
| 10,000 | positions/offsets | `3abacfdb0c0491ecee9c3f315028d1f2586018353d4d2c2c8e0c9efc2b4ba481` |

Numerical donor query observations are identical across all 14 owners per size/variant; successful receiving observations retain their donor's full selected numerical pages and phrase results. These are equivalence checks; they do not constitute a new independent BM25 scorer or a claim to have observed every optional public addon API.

## Work, bounds and failure evidence

All 120 diagnostic operation rows have empty `observerErrors`. Their complete `phaseWork` step/work sums equal generic emitted step/work totals. For restore operations, all 16 Chrome diagnostic phase/work/copy/analysis/participant/budget observations exactly match the corresponding eight Node diagnostic cells.

| Records | Variant | Before restore | Before work emitted | After restore | After work emitted |
| --- | --- | --- | ---: | --- | ---: |
| 1,000 | source | Pass | 6,971,107 | Pass | 2,225,616 |
| 1,000 | positions/offsets | Pass | 7,981,390 | Pass | 2,769,869 |
| 10,000 | source | Refused after 3,755 records | 49,999,993 | Pass, 10,000 records | 23,043,299 |
| 10,000 | positions/offsets | Refused after 3,505 records | 49,999,983 | Pass, 10,000 records | 28,435,912 |

Before 10k refusals originate from `snapshot.total`, at the unchanged 50,000,000 allowance: attempted cumulative work is 50,000,006 for source and 50,000,001 for positions. After observations preserve one whole-restore budget, one cumulative budget per participant, one core record budget per record, participant invocation budgets per record plus finalization, and a metered finalization budget. Sealing work remains inside the whole-operation meter; all phases, including finalization, contribute to the after totals.

The copy counters reflect the actual directory paths. For successful 1k source restores, pointer copies fall from 1,502,152 to zero and copied bucket entries from 61,471 to zero; positions/offsets fall from 1,700,180 and 63,415 respectively to zero. All after sizes/variants have zero old-directory pointer/entry copies. Directory creation, bucket creation and final sealing remain nonzero: after 10k source has 30,010 seals; positions has 30,011. This supports removal of repeated prior-directory copying, not a claim that allocation or sealing disappeared. After 10k core analysis runs 16,666 times; selected positions also runs 16,666 times. Position analysis was not eliminated or represented as shared core analysis.

All 14 before 10k `restoreSource` attempts, including diagnostic mode, are retained as known `WORK_LIMIT_EXCEEDED` refusals. All 28 after `restoreSource` attempts pass, including every 10k Node/Chrome direct/worker cell. Each of the 56 forced 1ms deadline probes returns known `DEADLINE_EXCEEDED`, and each of the 56 timer-abort probes returns known `CANCELLED`. Every known failed restore records exact prior source-byte and numerical-query preservation. No uncertainty was reclassified as a known result; no `Unknown` outcome occurred in this matrix, so this matrix does not itself test uncertain transport recovery.

Private authoritative identity remains unchanged during observed staging and on observed failed cursors; successful normal restores select the new root. **All eight Chrome diagnostic-worker forced 1ms deadline probes expire before restore cursor entry and have `finalAuthoritativeSame: null`.** Private root identity was unobserved in those cases; known typed failure and public exact-state preservation still pass. The observer stores bounded scalar summaries of unsealed stages and only the old-authority comparison closure until finish/stop. It does not retain historical staging roots. Final complete-state capture returns only hashes and summaries over the diagnostic control channel.

## Interpretation and limits

Independently reproduced all eight ordinary Node median wall/user-CPU/system-CPU cells, all 16 ordinary browser restore rows, all 24 diagnostic summary rows and all 56 input/donor rows in `paired-summary.json`. Node sampled-memory counts and per-category maxima reproduce from actual raw samples. Browser CPU and heap are not measured.

These observations establish repaired 10k capacity for these exact admitted inputs, defaults and hosts. Before 10k work stops partway through construction while after work completes; their elapsed times are not an equal-work speedup. Node has two ordinary fresh owners per cell and Chrome has one ordinary case per cell, collected sequentially before/after. They support descriptive timings, not p95, population or universal performance estimates. The capped 128-entry `phaseEvents` list is only a prefix of bulk phase transitions; `phaseWork` supplies complete aggregate totals. Unforced Node memory samples include harness/input/donor/receiver coexistence and omitted intervals; maxima are neither retained nor continuous peak nor engine-exclusive heap.

This review identifies the measured after runtime and verifies its correspondence to the archived 169 source pins. It does not by itself certify a later verification tarball or a later Git commit. The parent candidate closure must separately compare its final runtime/package with this measured artifact. No remote CI, publication, physical input/paint, manual assistive-technology or cross-platform qualification claim follows from this review.
