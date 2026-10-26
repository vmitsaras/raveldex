# RX-4002 — Independent browser memory review

Date: 2026-10-26. Reviewer: delegated read-only agent `browser_memory_review`, separate from the parent implementation/measurement owner. Recommendation: **Ready with follow-ups** for this bounded continuation. Full RX-4002/AC03: **Unable to verify / Blocked**.

## Review basis

The reviewer inspected the five new browser harness/helper/test files, existing worker/source-snapshot behavior, the complete final report, all six compressed profile artifacts, both smoke artifacts and the final method/outcome tables. It performed no browser/resource rerun, owner-app interaction, production mutation or file edit. The parent persists this record from the reviewer’s returned findings. Full project regression is parent-run, separately recorded in the continuation.

The final primary report is 33,723,899 bytes, SHA-256 `492a5a9bcc4da22cf9172e1309a524cc133c9a1fa333d810bcb35296c6e9abc0`. Its [lossless archive](RX-4002-memory-browser.json.gz) preserves those exact JSON bytes. The reviewer independently regenerated the corpus and arithmetic and traversed raw profile trees/samples without calling the parent summary helpers.

The reviewer also independently verified the final archive’s 1,431,561-byte size and SHA-256 `8afb897b608b6323a732b9dc89eb787029bc85847b27f3d161137eabcd7e341d`, decompressed size/hash and byte identity with the previously audited report. This archival-only change preserves the entire prior audit without a resource or test rerun.

## Findings repaired before measurement

- Polling could reject before its eventual await, risking an unhandled rejection. Immediate rejection handling now retains and propagates that failure through owned cleanup.
- Sequential context/browser cleanup could skip browser closure if the first close rejected. Both owned scopes are now independently attempted, and cleanup failures remain failures.
- Transport capture originally preceded disposal. It now includes disposal’s actual request/reply.
- Workload verification originally checked coherent revisions without checking expected values. Build, replacement, prior receiver and successful restore revisions/origin/reindexed fields now have explicit assertions.
- The first smoke exposed a Node-summary assumption about all statistical sample IDs being present in the returned tree. The browser helper preserves every sample, records unresolved references, and assigns no invented frame attribution. Historical Node code/evidence remains unchanged.

The reviewer separately reran the four helper tests: **4/4 Pass**, zero skipped. It found no further blocking harness issue after the repairs. Source files remained frozen throughout the six-run measurement.

## Independent final reconciliation

| Audit | Observed result |
| --- | --- |
| Provenance | Final report identity; seven source bindings and three staged copies; 208 installed/current production hashes; tarball/metadata; two bundles and 76 input bindings; four unchanged earlier reports verified. |
| Scope | Six fresh processes, 12 distinct isolate IDs; exact worker target/URL/session and paused-before-initialization binding. |
| Raw profiles | All 48 profiles decompressed; compressed/decompressed hashes and lengths verified. All tree/sample totals recalculated: 269,579 samples, four unresolved references totaling 138,096 reported sample-size bytes, explicitly retained. |
| Readings | All per-realm maxima recalculated across 80,338 operation readings; nine stages/54 steady readings per run, 324 total. Paired readings remain separate timestamps. |
| Behavior | At 1,000: built totals 1,000/27/334 at revision 4; replaced 1,000/28/333 at revision 5; prior revision 7; restored revision 8/origin 5/reindexed true. At 10,000: built 10,000/271/3,334 at revision 40; replaced 10,000/272/3,333 at revision 41; three actual restore `DEADLINE_EXCEEDED` outcomes preserve prior record/page/revision 43. |
| Transport | 456 primitive-only rows total; 42 per 1,000 run and 110 per 10,000 run, including disposal. Caller posts have one argument. Export/restore strings are respectively 104,328 and 1,010,890 code units. No copy/buffer attribution inferred. |
| Printed tables | All eight median rows/16 byte-value cells, operation outcome table, totals/revisions and transport lengths exactly match the final raw report. |
| Development attempts | Both compressed smoke artifacts reconstruct the quoted original JSON hashes. First is a preserved summary/harness Fail; second is a separate 1,000-record Pass. Neither is included in the six measured repetitions or rebound to later source hashes. |

No blocking implementation, arithmetic, provenance or claim defect remains within this slice. The observed 10,000-record restore refusals are preserved outcomes, not successful restores or environment failures. Statistical quantities do not establish exact component ownership, simultaneous peaks, native clone buffers, combined browser-process memory or other browser configurations. Disposal readings do not establish comprehensive leak freedom. Remaining exact attribution, AT/F01/Inspector/context and release dependencies stay explicit; no acceptance criterion is waived.
