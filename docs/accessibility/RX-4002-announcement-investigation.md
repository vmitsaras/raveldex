# RX-4002-F01 — Safari/VoiceOver result-announcement interruption

Date: 2026-10-09. Status: **Open — owner reports uninterrupted speech at Medium verbosity; retest identity pending**. Parent task: RX-4002; acceptance link: RX-4002-AC02. This finding is tracked separately so unrelated qualification observations can proceed. Closing RX-4002 still requires a validated disposition of the finding and the other qualification gates; no release criterion is waived.

Independent Codex task: `01a1219d-ee9e-7fa3-a372-6a6378e13c28`, created in the Raveldex project with a read-only initial scope. The parent observed the task active; this is dispatch evidence, not a diagnosis or completed fix.

## Observed problem

The owner reports result-count speech suppressed or interrupted during normal typing. Slow typing plus a space sometimes speaks the count; manually making the status assertive was reported to improve it. Safari 27.0.1 (22625.1.29.11.28), macOS 27.0.1 (26A434) and English speech were confirmed. The original report says input focus remained usable; retest focus and exact VoiceOver/settings remain incomplete.

The test-only comparison provides original, settled-polite and settled-assertive output with whole-shell busy, busy removed or results-only busy. In reply to the explicit B/off test, the owner reports: “it always is interrupted by the word announcement if a known word is recognized”. Parent busy removal did not resolve this reported case. In reply to the next procedure—leave `red`, wait until word speech finishes, then press Return without editing—the owner now reports: “is beeign interrupted”. This is an owner-reported continued interruption associated with the explicit-submission question; exact step execution, spoken phrase, timing, focus and URL/audio capture were not independently verified.

No root cause is established. Typing feedback, browser/AT announcement scheduling, live-region update shape and competing status updates remain hypotheses. The owner requests documentation and a separate independent investigation so the remaining work can continue.

## Inputs

- [Original announcement record](../evidence/RX-4002-announcements.md), including recording identity and unsupported independent audio inspection.
- [Busy comparison record](../evidence/RX-4002-announcements-busy.md), [validation](../evidence/RX-4002-announcements-busy-validation.json) and [independent review](../evidence/RX-4002-announcements-busy-review.md).
- `src/addons/ui/ui.ts`, `test/qualification/browser-announcements.mjs`, `test/qualification/browser-ui-driver.mjs`, `test/ui/fixture-entry.mjs`, `test/ui/announcements-browser.test.mjs`.
- Baseline `61403b2` on `codex/rx-4002-qualification`. Production unchanged; prior full check 584/584 Pass supplies DOM/lifecycle regression evidence, not audible speech qualification.

The task-owned comparison server was last prepared at `http://127.0.0.1:63024`, with B/off `/ui-announcements?mode=settled-polite&busy=off`. Check availability before relying on it; ports change on restart. Production tarball SHA-256: `6ff6e90128f60af39bb8f47800c61ed83d85d4ded7a8e3c96d2bd34467f9c437`. Comparison bundle SHA-256: `835a74aee677f49e6274f526e3ba8eec6f2e1063b6660beac85ff2a47cbd322e`. Do not stop existing servers or alter the owner's apps/settings.

## Bounded independent investigation

Start read-only: inspect source, event order, status/busy ancestry and existing tests; consult current primary browser/AT/ARIA sources as needed. Distinguish direct facts, owner reports and hypotheses. Identify the smallest independent reproduction and the observation that would discriminate each candidate. A test-only control must preserve same-revision results, cancellation, composition, focus and teardown.

The separate Codex task shares this checkout. Its initial scope is analysis and a reviewable recommendation only: no source/test/doc/manifest edits, commits, native-app interaction, user-setting changes, server changes, publication, remote writes or repeated resource measurements. Any later implementation needs coordinated file ownership in a follow-up. Do not automatically adopt blanket assertive priority, retry speech with repeated timers, move focus to force speech, or require users to disable preferred typing feedback.

## Completion evidence

1. Record a minimal reproduction with exact browser/OS/VoiceOver versions, relevant settings, URL/package identity, steps, heard output and focus; unavailable details remain explicit.
2. Explain the cause only where observations support it, otherwise rank hypotheses and specify a bounded next experiment.
3. Recommend a compatible fix or documented platform disposition, with tradeoffs and lifecycle regression requirements.
4. A later accepted fix requires meaningful automated regressions, independent review and actual human speech retest. Passing DOM tests alone cannot close this finding.

The independent task may finish its initial analysis while this finding stays Open. Remaining RX-4002 Inspector, error/retry, filters, worker recovery, physical input/IME and scoped-memory observations can progress independently. RX-4003 remains dependent on complete RX-4002.

## Initial independent analysis completed

The separate task completed its read-only source/evidence review and primary-source research. It found no authored timer or later cleanup clearing the completed external count. The comparison still contains initialization/action live-region confounders; those are not shown changing during normal query typing. Its capture-phase event snapshots and batched mutation snapshots cannot establish accessibility-event or speech delivery order. Repeated Return republishes identical text, which does not prove a fresh spoken utterance. The 35 ms fixture debounce differs from the library's 150 ms default and can permit intermediate searches during ordinary typing. These findings do not identify the interruption's cause.

The recommended next experiment is a separately labeled minimal speech probe with a native search input and one persistent polite atomic status, one controlled publication, and no engine, busy state or competing readiness status. Fresh-page no-typing and typing-overlap runs would distinguish broader live-region interaction from typing overlap; a real held search response released after spoken feedback would then test fixture-specific events. This probe is proposed and has not been implemented or heard. No production fix is supported yet. The independent task's full analysis and conditional remediation are available in its chat; the finding stays Open.

The parent verified task completion through Codex status and read the full result. No app/settings/server interaction, test rerun or repository edit was made by that investigation. Its analysis completion does not complete RX-4002-F01 or qualify RX-4002.

## Parent documentation verification

`npm run check` closed with exit 0, **584/584 Pass** (511 package/core/tooling, 22 UI, 24 worker, 26 IndexedDB and one migration-browser test), zero failed/cancelled/skipped. The direct local log is `/tmp/raveldex-announcement-handoff-check.log`, SHA-256 `3bdb3427590be3f85fcbed6ef5e67a903707047a21ce01446aa801885b97c167`. Documentation/planner checks pass. Follow-up human-report text was synchronized afterward and receives final documentation checks; the source/tests/package/specification/architecture files remain unchanged. The seven RX-4002 criteria/dependencies and 30 other task objects are unchanged. These checks validate the repository handoff, not speech or physical interaction. No production contract or release gate changed.

## Owner-reported Medium verbosity retest — 2026-10-09

The owner reports: “i hade the verbosity  to high, chnage it to medium, and now all the announcement beign correctly announcent no interruptaions.” This records an owner-observed successful retest after changing VoiceOver's default speech verbosity from High to Medium. The supplied screenshot confirms **Default Speech Verbosity: Medium** on VoiceOver Utility's Speech tab; High is the owner's description of the prior setting, not a captured prior screenshot.

The original `codex-clipboard-591e858e-62e1-47c8-8a70-1216ae9ecf3f.png` is preserved byte-for-byte as [Medium verbosity evidence](../evidence/RX-4002-human-voiceover-medium.png): 1120 × 516 pixels, 49,376 bytes, SHA-256 `c0ee2b513c423ad67b6fdffbccf8ef575d63490db4e16a68566edad0a4c14112`. It proves the visible setting, not audible continuity, the tested URL or package identity. Uninterrupted speech is the owner's report; no independent audio observation was made.

This supports a settings-dependent interaction but does not establish a complete root cause. The exact retest page/mode/busy scope, package binding, actions, spoken wording and focus outcome remain unconfirmed. In particular, “all” is not mapped to every comparison mode or qualification flow. Earlier Safari/macOS/English confirmations remain attributed to the preceding session; exact VoiceOver version, typing echo and other settings still require confirmation.

Preserve the earlier High-verbosity failure alongside this successful Medium report. Do not require Medium as a product prerequisite, adopt assertive priority, or claim the original production status now passes without identifying the retested page. No production change is justified by this report alone. The immediate next step is to bind the successful report to original versus settled-polite/settled-assertive output and the actual actions/settings; the previously proposed minimal probe is conditional on unresolved or reproducible interruption, not an automatic prerequisite after this success. F01 stays Open pending that disposition; the remaining RX-4002 gates and RX-4003 dependency are unchanged.
