# RX-4002 mutation-state independent review

Date: 2026-10-26. Review scope: actual precommit old/candidate attribution, direct cleanup witnesses, method/provenance and bounded claims. The reviewer has read-only repository access and writes scratch audit files under `/tmp`; the parent integrates evidence and documentation. No nested delegation or workload/browser rerun.

The [independent audit](RX-4002-memory-mutation-independent-audit.json) reconstructs all 12 raw dumps and 1,549,208 numeric cohort rows with a separate parser/DFS. All role masks, type/count/byte groups, context/core aliases and dump/cohort/source/package/preservation hashes agree. It enumerates old/candidate document directories: only item:00000 changes, with every other entry shared. All eight applicable source/position participant-record comparisons show the same relationship. Public commit/cancellation, literal result/revision checks, direct WeakRefs and controls, observer-worker exit and all 208 installed production bindings pass. Four focused method tests pass independently.

Findings addressed before the measured matrix:

- Use worker `connectToMainThread`, following the exact Node documentation's warning about same-thread sessions.
- Require exact compiled source identity and native lexical aliases; do not guess staged roots from shape.
- Keep six old/candidate component seeds separate from `context.previous`, intermediate core's old participants, request and changes.
- Confirm the committed root before and immediately after the dump; release markers/debugger/caller handles before collector readings.
- Preserve failed observer/calibration outcomes separately, and label one intrusive repetition and graph quantities precisely.

The reviewer's first scratch parser omitted bucket element edges; correcting that independent audit parser yields exact agreement with the production helper on all rows. This is a review-tool correction, not an engine defect.

Final independent disposition: **Ready with follow-ups** for this bounded coexistence/cleanup slice, with no blocking findings. Full RX-4002 remains Blocked for the documented mutation-peak, codec, transport and AT requirements; this acceptance neither adds a mathematical every-byte gate nor waives any existing criterion.

Parent verification: `npm ci` Pass; four focused method tests Pass; full `npm run check` **604/604 Pass** (527 package/core/tooling/method, 26 UI, 24 worker, 26 IndexedDB, one migration-browser), zero failed/cancelled/skipped. The first sandboxed baseline fails one localhost listen with EPERM and stops before later groups; the final permitted-localhost run passes all groups. The separate [baseline](RX-4002-memory-mutation-baseline-check.log) and [final log](RX-4002-memory-mutation-check.log) preserve both outcomes. `npm run docs:generate`, `docs:check` (86 Markdown files), `handoff:check` and local `tracking:preview` pass; `handoff:next` keeps RX-4002 Blocked, RX-4003 waiting and all ten N5 tasks deferred. `git diff --check` passes.

No behavioral source changes follow the measured matrix or full regression. Only evidence/review/manifest synchronization follows those checks. All seven acceptance criteria, dependencies, milestone objects and the other 30 task objects are unchanged; `src`, package metadata and lockfile diff is empty.


Final check-log SHA-256: `afd1038945a07ed5aebd732c53cc7c4e15220a87ed47daf814c1a0cbbab2d7b1`.
