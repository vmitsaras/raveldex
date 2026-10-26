# RX-4002 transport independent review

Date: 2026-10-26. Scope: bounded transport-path intervals, memory visibility, native outcomes, source/provenance and claims. Reviewer has read-only repository access, scratch `/tmp` files and no further delegation or resource reruns. Parent owns integration and regression.

The [independent audit](RX-4002-memory-transport-independent-audit.json), using a [separate parser](RX-4002-memory-transport-independent-audit.mjs) without implementation-helper imports, verifies six trace archives and 345,998 events. Forty-eight correlated native intervals across 24 message transfers, 36 literal semantic rows, 12 successful global dump commands and 40 serialization-named wrapper/type allocator rows match. All actual used timestamps, endpoints and differences are nonnegative and safely represented. Every case has actual renderer-main/dedicated-worker coordinates plus distinct Runtime isolates. Three small restores pass; three large deadline refusals preserve exact prior revision/page. Nine source bindings, 208 production files, nine earlier reports and both bundle/trace/raw/compressed hashes match. Four focused tests pass independently.

Method findings addressed:

- Preserve the first observer closure failure; an unfinished empty trace is not negative capability evidence.
- Record actual Chrome 156 separately from historical Chrome 155, and current-source explanation separately from unavailable exact-build source.
- Bracket actual postMessage and the first event.data access before reading metadata; primitive marks carry no serialized detail.
- Require exact unique marks, native event containment, peer matching and no reported trace loss; do not double-count intervals as separate messages.
- Retain serialization-named hierarchical paths as wrapper/type aggregate evidence; do not call them absent or relabel them wire-buffer bytes/copies.
- Keep raw dump GUIDs and exported event IDs distinct; archive the original returned trace stream before parsing.

A general signed-extreme arithmetic guard extension is a nonblocking method follow-up. Current helper rejects unsafe individual used fields and containment failures; the independent audit additionally verifies all actual positive timestamp arithmetic. No arbitrary signed-trace precision guarantee is made and no frozen resource rerun is warranted for this follow-up.

Final independent disposition: **Ready with follow-ups**, no blocking implementation, artifact or claim findings. The reviewer verifies every timing-table cell and archive/event/message/allocator total, the changed first-data-read locus, warm/control traffic, current-source versus exact-build limitation and unchanged deadline refusals. The [calibration audit](RX-4002-memory-transport-calibration-audit.json) additionally checks archived probe/smoke hashes, including the reconstructed executed pre-freeze runner against its recorded digest.

Parent verification: `npm ci` Pass with the existing optional esbuild script-policy warning; baseline `npm run check` **608/608 Pass**; four focused method tests Pass; final `npm run check` **612/612 Pass** (535 package/core/tooling/method, 26 UI, 24 worker, 26 IndexedDB, one migration-browser), zero failed/cancelled/skipped. Full checks use localhost access for existing fixtures, outside the serial resource matrix. Both [baseline](RX-4002-memory-transport-baseline-check.log) and [final check](RX-4002-memory-transport-check.log) logs remain separate.

Documentation generation/link checks (90 Markdown files), planner/next checks, local `tracking:preview` and whitespace checks pass. RX-4002 returns to Blocked, RX-4003 waits, N5 remains deferred. All seven acceptance criteria, dependencies, milestone data and other 30 task objects are unchanged. Production source/package/lockfile diff is empty; all measured sources, bundles, production files, raw traces and earlier reports remain unchanged after regression.

No behavioral source changes follow the accepted matrix or final check. Only evidence/review/manifest synchronization follows. Native buffer/backing lifetimes and peak copies, mutation/codec peaks and remaining AT/context findings remain incomplete. This does not add an every-VM-byte gate, propose a narrower release claim or waive missing evidence.


Final check-log SHA-256: `8b542e0509fe6f8e355aec1cb1b9b003f1f850a6277352bae61fe8187fe58b73`.
