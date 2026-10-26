# RX-4002 native codec independent review

Date: 2026-10-26. Scope: actual paused native codec representations, same-snapshot alias/sharing attribution, listed object cleanup, provenance and bounded claims. Reviewer has read-only repository access and scratch `/tmp` output only; no nested delegation or workload/browser rerun. The parent integrates artifacts and runs final regression.

The [independent audit](RX-4002-memory-codec-independent-audit.json) reconstructs all eight heaps, 198,452,421 bytes and 1,203,203 numeric cohort rows with a separate parser/DFS. All stage masks, type/count/byte groups, primitive string/backing edges, prepared/decoded/candidate and participant-record aliases match. Four child reports/PIDs/exits, exact producer-file-receiver hashes, 28 semantic rows, object WeakRefs/controls and observer shutdown pass. Eight source bindings, 208 production files and eight prior evidence hashes match. Four focused tests also pass independently.

Method guards addressed before measurement:

- Dump through observer-worker CDP while the target is paused; remove markers before resume.
- Verify exact installed source identity, stage order/function/line and no stale/extra captures.
- Check all mandatory core aliases, including counts/configuration; require receiver input/file hashes to match producer output.
- Preserve state/codec shared nodes with explicit stage roles and 16-bit masks, including bit 256.
- Separate primitive string representation and lengths from copy/allocation claims; witness only actual objects.
- Keep single intrusive repetitions, debugger materialization/dump overhead, process versus main-isolate scope and broader peak/transport/AT limits explicit.

Final independent disposition: **Ready with follow-ups**, with no blocking implementation or documentation findings for this bounded native codec slice. The reviewer checks every published table row, snapshot/row/byte total, string and alias interpretation, and the 32-collected/24-live then 56-collected witness arithmetic. Documentation keeps the changed precommit classification separate from deallocation, omitted corpus-count/root seeds explicit, and physical-copy/peak/AT gaps open.

Parent verification: `npm ci` Pass; baseline `npm run check` **604/604 Pass**; four new focused method tests Pass; final `npm run check` **608/608 Pass** (531 package/core/tooling/method, 26 UI, 24 worker, 26 IndexedDB, one migration-browser), zero failed/cancelled/skipped. Both full invocations use localhost access for existing browser fixtures. The [baseline](RX-4002-memory-codec-baseline-check.log) and [final log](RX-4002-memory-codec-check.log) retain the separate runs.

`npm run docs:generate`, `docs:check` (88 Markdown files), `handoff:check`, local `tracking:preview` and `git diff --check` pass. `handoff:next` retains RX-4002 Blocked, RX-4003 waiting and ten N5 tasks deferred. All seven acceptance criteria, dependency/milestone data and other 30 task objects are unchanged. The source/package/lockfile diff is empty; all measured sources and earlier raw reports remain unchanged after regression.

No behavioral changes follow the matrix or final regression; only evidence/review/manifest synchronization follows. Full RX-4002-AC03 remains Blocked: these graph points do not locate synchronous allocation high-water or qualify product transport copies. No acceptance waiver or exact-every-VM-byte requirement is introduced.


Final check-log SHA-256: `18f4bd54b847d9c318f026c4cce5132eb98d89e175121c4e46b5836534bdc1f2`.
