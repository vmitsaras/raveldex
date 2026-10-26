# RX-4002 — Opt-in physical-input observation fixture

Date: 2026-10-26. Status: **Instrumentation verified; human OS composition observation pending.** RX-4002 stays Blocked. This continuation prepares the missing observation without changing native search, the ordinary UI, announcement policy, public contracts, dependencies or acceptance criteria.

## What exists

`/ui-input`, served by `npm run qualify:serve`, uses the same installed nine-record fixture and unchanged native UI. Start recording opts in; Stop and show trace freezes a labeled, read-only JSON field. Nothing is recorded before Start or after Stop, and no input trace is posted to the server or persisted automatically. Recording stays in that document until the owner explicitly shares it. The source label is operator-reported and is not OS detection. Existing `/ui` and `/ui-announcements` remain separately named pages.

The probe captures compositionstart/update/end, beforeinput/input, relevant Enter/Dead/Process/229 key events, search-field focus and form submission. It records actual event flags/data, input type, current text/selection, DOM active element, status/busy state and the test wrapper's search-call boundary. The wrapper callback fires before calling the borrowed engine: it proves an invocation from the UI, not successful core admission or completion. Capture rows precede UI target handlers; `event-bubble-after-ui` rows name the actual later propagation point. Events whose propagation stops may have no bubble row. Presentation rows are batched DOM mutation observations, not a complete synchronous history.

A trace retains at most 300 rows; dropped rows are counted. Text values retain at most 256 UTF-16 code units with their original length, so truncation remains detectable. A truncated or dropped interval cannot establish a complete composition sequence. Only the fixture search input/form is recorded; text in the source label or unrelated controls is excluded from the event stream. Package hash and a server session/manifest identity bind the page to its separately saved package report. Browser User-Agent, language and devicePixelRatio are supporting browser data, not exact OS version, browser zoom or physical-device proof. No speech, VoiceOver cursor, hardware identifier, keyboard layout detection or OS preference changes occur.

## Verification

- `npm ci`: Pass on Node 24.21.0 / npm 12.2.0 / darwin arm64. npm reports the esbuild postinstall was blocked by its existing install-script policy; the installed binary and subsequent build worked without changing that policy.
- `npm run build`: Pass.
- `node --test --test-timeout=120000 test/ui/input-browser.test.mjs`: **4/4 Pass**, zero failed/cancelled/skipped, in Chrome 155.0.8059.85 headless. [Focused raw output](RX-4002-input-focused.log).
- `npm run check`: **591/591 Pass** (514 package/core/tooling, 26 UI, 24 worker, 26 IndexedDB, one migration-browser), zero failed/cancelled/skipped; planner, docs, typechecks and build pass. [Full raw output](RX-4002-input-check.log).

The four scenarios verify opt-in/stop behavior, package identity, unchanged status/busy policy, retained focus and exclusion from ordinary `/ui`; synthetic precommit/submit suppression followed by the actual final `café` search and Long content result; bounded/excluded capture and reset; and visible setup failure with disabled recording. Browser-automated input itself produces `isTrusted: true`, while dispatched CompositionEvents produce false. Both are deliberately recorded as automated evidence, never physical input or a real OS IME Pass.

The first focused attempt could not bind localhost (`listen EPERM`) in the sandbox and ran no browser scenario. Approved access to the same focused command supplied the passing observations. This was an environment failure, not a search defect.

## Review

An independent read-only subagent reviewed the source, evidence boundaries and resulting diff. It found that a capture-listener microtask could run before a native event reached UI target handlers; the probe now uses the document bubble listener and a trusted automated Return-submit regression. The review also requested visible setup failure and accurate search-call wording; both are implemented and tested. Final review: **no remaining blocking findings**. The reviewer did not run the browser tests or observe physical input or speech.

## Served package identity

The [scoped server/package identity report](RX-4002-input-package.json) binds the current `/ui-input` URL `http://127.0.0.1:53366/ui-input` while its task-owned server runs. Verify availability before reuse. Package SHA-256 is `6ff6e90128f60af39bb8f47800c61ed83d85d4ded7a8e3c96d2bd34467f9c437`, matching the prior manual fixture: production bytes are unchanged. Input bundle SHA-256 is `cc91596a3ea4c85fbdc62ec2f2a86c95d0f2b2f01f4c95559fe99f3a50f44ad4`. The report captures input-bundle/module/CSS identities, server and runner hashes, local manifest/session binding and current macOS 27.0.1 (26A434) / Node 24.21.0 environment. [Live serve validation](RX-4002-input-serve-validation.json) confirms HTTP 200, matching bundle/CSS hashes and the exact session/package identity. It preserves selected fields and the full temporary serve report hash, without claiming a new installed Safari matrix or human observation.

## Next physical observation

1. Open the current printed `/ui-input` URL in Safari. Keep the current VoiceOver settings and record any changes to the earlier browser/OS/input/zoom context.
2. Choose the existing German input source and enter `German` in Input source used. Wait for initialization to settle, then activate Start recording and focus Search documentation.
3. Physically type `caf`, press the acute-accent/dead key normally used for `é`, and wait two seconds before completing it with `e`. Wait five seconds after the completed character. Do not paste text or synthesize events. If that key sequence is not usable, report that rather than installing an input method or changing preferences.
4. Activate Stop and show trace. Leave the page open for inspection; report the final text, visible result and focus usability. Record heard speech separately if supplied.

The expected completed lexical query is `café`, with one result, Long content. A pending `caf` query may run before composition begins; the interval of interest starts at the actual compositionstart and ends at compositionend. Existing dead-key accent entry may or may not provide the required composition sequence; the trace and human report must decide that. No observed sequence is inferred from the language/source name. If no real composition occurs, the broader named-IME gate remains Blocked. No installation is part of this slice.

F01, exact Inspector initial focus, remaining physical context and exclusive/peak/browser-worker memory remain separate open evidence. Accepted result-reading, recovery, filters, worker and teardown observations are preserved without repeating them. RX-4003 still waits; N5 remains deferred.

`docs:generate`, `docs:check`, `handoff:check`, `handoff:status`, `handoff:next`, local `tracking:preview` and `git diff --check` pass after synchronization. The planner preserves Blocked RX-4002, dependent RX-4003 and deferred N5. No human input outcome is assumed by this instrumentation record.
