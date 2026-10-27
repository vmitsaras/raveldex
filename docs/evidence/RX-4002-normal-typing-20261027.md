# RX-4002 original-UI normal-typing observation — 2026-10-27

**Pass by owner observation for this bounded run.** On the original installed `/ui`, VoiceOver speaks the full result count without interruption, the visible count matches, and focus remains in the search input. The owner confirms current **Medium** speech verbosity and **Words** typing feedback.

## Procedure and actual report

The guided procedure identifies Safari at `http://127.0.0.1:63447/ui`, Category All, clearing the input and waiting five seconds, then physically typing `red` at normal speed without Return, a trailing space or Search activation, followed by a five-second pause without navigation. The owner replies directly:

> VoiceOver says “7 results. Showing 1–3.” without interruption, visible count matches, focus stays on the input. Still Medium verbosity and Words typing feedback.

The report is bound to that original-UI procedure. The guide requests 400% zoom; the reply does not separately reconfirm zoom, keyboard/trackpad, power mode or every procedural timing. No new microphone recording, independent heard-speech observation, DOM-focus trace or exact typing duration is claimed. Focus and uninterrupted speech are owner-reported outcomes.

## Environment and package binding

The preceding parent availability check receives HTTP 200 for the exact original `/ui` URL. The [same server's archived package report](RX-4002-inspector-focus-package-20261027.json.gz), already preserved with the [Inspector observation](RX-4002-inspector-focus-20261027.md), binds the original UI bundle to package SHA-256 `6ff6e90128f60af39bb8f47800c61ed83d85d4ded7a8e3c96d2bd34467f9c437`, original UI bundle `3747622bd78ceae0edeb651ca15e22da480aa8477693e5c12721a276730cd81d` and server session `1e2abf8c-ee47-4580-935a-15a5257b0810`. This is the original policy, rather than an experimental assertive/settled/busy-off comparison. The package/session binding is to the guided server, not a newly captured per-keystroke trace.

The latest established software inventory is Safari **27.0.1 (22625.1.29.11.28)**, macOS **27.0.1 (26A434)** and VoiceOver Utility **10 (993)**, with earlier English speech confirmation. These versions/language retain their recorded inventory scope; the new reply explicitly reconfirms only Medium and Words. The [manual observation history](../accessibility/RX-4002-manual-observations.md) preserves other version, settings and physical-session evidence separately.

## F01 disposition and limits

The [announcement finding](../accessibility/RX-4002-announcement-investigation.md) now has an identified successful original-UI retest. Its retest-identity gap is resolved and this normal-typing check is Pass. The earlier High/settings-unknown interruptions and busy-off failures remain a **known AT compatibility limitation with unconfirmed cause**. A successful Medium/Words run does not prove a fix, every VoiceOver setting, every input pace or every browser/version. Medium is not a product prerequisite.

No runtime policy changes: no assertive escalation, busy removal, focus movement, added timers or forced user setting. The previously proposed isolated speech probe remains conditional on renewed or unresolved interruption; this successful run does not require a repeat or automatically launch that experiment. Earlier accepted Inspector, result-reading, recovery, filter, worker and real German dead-key observations retain their scopes.

RX-4002 remains **Blocked** on the separately recorded native allocation/transport peak observations and outstanding physical-session context. RX-4003 waits; N5 stays deferred. This evidence update does not alter acceptance criteria, support promises, public contracts, dependencies or publication authorization.

## Verification and review

`npm run docs:generate`, `npm run docs:check` (95 local Markdown files), `npm run handoff:check` and `git diff --check` pass. The manifest diff changes only RX-4002's evidence list and blocker text; all criteria, task statuses, dependencies and other tasks are preserved.

The initial sandboxed `npm run check` exits 1: **534/535** first-phase tests pass and the packaged documentation-UI test cannot listen on `127.0.0.1` (`EPERM`). This is an environment failure, not a VoiceOver or package-behavior failure. Its local log is `/tmp/raveldex-normal-typing-20261027-check.log`, SHA-256 `81c8074b87a9402cfc9ffceebfd873b77db2e2eb4b9bd7897d0ce0fa12377608`. The same required check with approved localhost/browser access exits 0: **616/616 Pass** (535 package/core/tooling/memory-method, 30 UI, 24 worker, 26 IndexedDB and one migration-browser test), zero failed/cancelled/skipped. Log: `/tmp/raveldex-normal-typing-20261027-check-approved.log`, SHA-256 `f9b8a3734e7bdadf29e4ca67649156151d550e810c1837f0a2cb81bf88baa743`. These temporary local logs are not archived in this record. Subsequent prose-only synchronization receives final documentation checks; source/tests/dependencies/public contracts remain unchanged. Automated regressions do not independently establish the owner's speech result.

Independent read-only review verifies the archived package, original UI bundle, session/origin, eight source-fixture hashes and runner/server hashes, and finds no report overclaim. It identifies stale current query/Inspector/physical summary rows; the parent synchronizes them to the accepted evidence, and a second read-only diff review confirms the finding resolved with no new material issue. No UI operation or resource matrix is performed by the reviewer. Parent review preserves historical failures and owner versus DOM attribution. No further normal-typing or Inspector repetition, publication or remote write occurs.
