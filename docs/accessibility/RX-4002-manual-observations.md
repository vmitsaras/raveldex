# RX-4002 exact-tool and physical observations

Status: **Blocked — bounded human filter, empty-results/recovery, worker and teardown/remount flows pass; query/focus, Inspector and error/retry observations are also recorded. Exact environment and remaining flows are still required.** Automated browser checks are linked separately from this record. Installing or identifying VoiceOver does not prove that it announced the native interface correctly.

The evaluator must record the date, tested package hash, exact browser/OS/screen-reader versions, speech language, VoiceOver verbosity, Quick Nav state, keyboard navigation settings, and the actual announced text and focus outcome for each step. Record failures as failures; do not copy the visible DOM text into an announcement field unless the tool actually spoke it. A caption panel may help preserve output, but it does not establish what a listener heard. Apple's [caption-panel guidance](https://support.apple.com/en-am/guide/voiceover/unac078/mac) describes that tool.

## Local observation procedure

Use the installed-package fixture served by `npm run qualify:serve` after installing dependencies. Record its printed URL and package identity. Open the printed `/ui` URL for the nine-record native UI, or `/worker` for the three-record module-worker recovery fixture. Both mount automatically and have labeled native fault controls; no developer console is required. The injected errors are test application behavior, not package APIs. Use the documentation pilot separately for real content if desired.

| Flow | Required action and observation | Outcome |
| --- | --- | --- |
| Query and results | Navigate to the labeled search field with VoiceOver, enter `red`, submit, and record the field/button names, searching/result announcement, result heading/list/link traversal, and whether focus stays usable. | Pass for bounded result heading/list/link/snippet reading and return-to-edit. Normal-typing status reliability remains open under RX-4002-F01; current settings and their limits are recorded below. |
| Empty results | Search for `unmatchedword`; record the announced empty state and the ability to edit and resubmit. | Pass — owner reports “No results”, then seven-result recovery after searching `red`, with focus retained on the control used; screenshots below |
| Error and retry | Activate **Inject next search error**, submit a query, record the error/retry announcement and focus, activate Retry, and record recovery. Injection is not a physical resource failure. | Pass for the later guided Search-button injected failure and Retry recovery with seven `red` results and retained focus; activation method and remaining exact environment details are unspecified. The earlier nine-result report is preserved separately below. |
| Filters and facets | Search `red`, select a Category option, record its name/count, changed results/status, retained control focus, and clearing the filter. | Pass — owner verifies correct uninterrupted announcements and retained select focus for All → Guide → All; screenshots below |
| Inspector | Open Inspector after a successful search; record dialog/title/loading/factual-content traversal, focus containment, Escape/Close behavior, and focus restoration to the opener. | Bounded named opening, readable content and both Close/Escape restoration paths pass by owner report. Plain Tab sequence is recorded; exact initial focused DOM node remains unconfirmed because the initial-target reports differ. |
| Worker failure and recovery | Open `/worker`, activate **Terminate worker**, submit, record the honest error, activate **Recover from authoritative source**, then search again. A fresh owner is distinct from retrying an uncertain mutation. | Pass — owner verifies all three guided steps and retained focus on the control used; exact utterances not transcribed |
| Teardown and initialization | On `/ui`, activate **Destroy UI**, then **Remount UI**; record restored authored content, focus destination, control names, and duplicate announcements if any. | Pass — owner verifies all guided steps, supplies destroy/remount/result speech and reports retained control focus |
| Composition input | Use an actual installed OS IME, record its name/settings and entered text, and observe whether composition completes before the query is submitted. Synthetic CompositionEvent checks are separate. | Pass for the bounded German DE real dead-key automatic-query path: composition events and pre-commit suppression observed, followed by café and Long content. Other methods, explicit submission during composition and current physical/AT context retain their separate limits. |

The local inventory identifies VoiceOver 10 (build 993), Safari 27.0.1 (22625.1.29.11.28), and macOS 27.0.1 (26A434). These are inventory facts, not an observed assistive-technology combination. The separate [installed-browser continuation](../evidence/RX-4002-installed.md) records software-driven native Firefox/Safari UI/worker flows and returned AX focus/text; it supplies no spoken announcements or human observations. Those software observations alone do not qualify the human checklist. The later owner-observed filter, empty-results/recovery, worker and teardown/remount checks below pass their bounded flows; exact VoiceOver settings and the remaining flows are still required for overall qualification. NVDA/Windows and other screen-reader/browser combinations have no observation in this slice.

## Physical presentation and input

Use a physically observed device and name its model, display (resolution, scale, refresh rate), browser zoom, keyboard/pointer/touch or OS IME, power mode, and workload. Perform query submission, facet change, Inspector open/close, recovery and teardown on the named workload. The interactive fixtures contain nine direct records or three worker records; do not claim that their display observations cover the separate 1,000/10,000-record resource experiments. Record what appeared and what input remained usable, including stalls or lost input. Describe an observed delay qualitatively unless an actual instrumented physical method measures it. A proposed larger UI/device capacity claim needs a matching interactive workload and observations.

The later [Computer hardware observation](#computer-observed-hardware-and-owner-reported-safari-zoom--2026-10-09) identifies the 16-inch MacBook Pro / Apple M5 Pro / 24 GB, its built-in 3456 × 2234 Liquid Retina XDR display with 1728 × 1117 (Default) and ProMotion selected, and Apple Internal Keyboard / Trackpad. Safari zoom is owner-reported as 100% and up to 400%. The owner confirms using the built-in keyboard/trackpad and performing all guided tests at 400% zoom. The input-source menu observation below separately identifies available sources; the later [German DE dead-key record](../evidence/RX-4002-dead-key.md) adds actual OS composition and pre-commit suppression for that bounded path. No physical-paint, physical-latency, mobile-device, touch or forced-colors hardware pass is claimed. Screenshots, browser keyboard automation, rAF and software timing do not fill these fields.

| Required record | Outcome | Observation needed |
| --- | --- | --- |
| Named device/display/input and actual presentation | Partial; criterion Blocked | Computer identifies current Mac/display/built-in input. The owner confirms built-in keyboard/trackpad use and all guided tests at 400% Safari zoom; power mode and real composing-IME observations remain incomplete. |
| Named VoiceOver/Safari announcements and focus | Blocked | Run the steps above and preserve verbatim announced text plus focus outcomes with exact settings. |
| OS composition | Pass for recorded German DE dead-key path | Actual composition and withheld interim search calls are observed. Other composing methods and explicit Enter during composition remain unobserved; current physical/AT context is separate. |

No support claim or acceptance criterion is narrowed by this record. RX-4002 cannot be marked done while required observations remain unavailable.

The [2026-10-09 installed matrix continuation](../evidence/RX-4002-installed-matrix.md) adds actual finite engine/storage/resource outcomes in Firefox 157.0.1 and Safari 27.0.1 plus independently observed current Firefox UI/worker flows. That continuation received no human observations during its run and recorded no VoiceOver settings or heard speech, physical input/display or named OS IME composition. Browser-matrix results and Node memory sampling do not fill those requirements.

## Preliminary evaluator report — 2026-10-09

During the subsequent guided manual session, the owner supplied the following report. This preserves their transcription rather than replacing it with DOM text or inferred speech:

| Observation | Owner report | Qualification |
| --- | --- | --- |
| Field announcement | “Search documentation, searcg filed,” | Reported speech; transcription preserved as supplied. |
| Query announcement | “waiting for search. if type slowly and space, it announces 7 results. Showing 1–3. but typing normally it is supressed” | Reported announcement reliability concern. Pause duration, Return submission and whether suppression continues after typing stops remain unspecified; no reproduced root cause or full-flow Pass. |
| Focus | “on inpput” | Owner reports focus remained on the input; independent DOM/AT cursor positions were not collected. |
| Disabled controls | “disabled buttons have only aria-disabled=\"true\" and are focusalbe” | Usability concern reported. Source inspection confirms intentional focus retention and guarded activation; actual spoken disabled state and physical activation behavior remain unobserved. |

The initial reply did not supply fixture identity or settings. The owner subsequently confirmed **Safari 27.0.1 (22625.1.29.11.28), macOS 27.0.1 (26A434), English speech** and supplied a recording. Exact VoiceOver version, verbosity, Quick Nav, hint delay, keyboard navigation, display/input and power settings remain unspecified; none are inferred from inventory.

The owner reports that manually adding `aria-live="assertive"` to the status makes “7 results. Showing 1–3.” announce properly, whereas the ordinary behavior is suppressed by the text-field hint. This is a reported announcement failure and a useful diagnostic result, not an accepted production policy. The [follow-up observation record](../evidence/RX-4002-announcement-observations.json) preserves the supplied recording hash, stream metadata, sampled caption observations, exact confirmed environment and remaining uncertainties. Frame inspection shows correct visible results with the text-field hint in the caption panel, a later Searching caption, Guide selection/paging and a dimmed Next-page hint. Frame text is not relabeled as independent heard speech; the available model cannot receive audio. The assertive DOM edit itself is not verified from those samples. A later `blu`/empty result retains the Guide filter and is not treated as a retrieval defect.

The controlled test-only announcement comparison separates the unchanged status stream from an external settled-only polite announcer and an otherwise identical assertive control. It changes neither the library nor the acceptance criteria. At that boundary, candidate speech was pending and all other complete manual flows remained Blocked; subsequent observations are recorded below.

## Busy-scope follow-up

The owner now reports the announcement begins then is interrupted, and suspects parent busy transitions; the comparison mode was not identified. No new-mode human Pass is claimed. The [busy comparison](../evidence/RX-4002-announcements-busy.md) offers each fixed announcement mode with `busy=shell`, `busy=off` or `busy=results`. Begin with B/off, keep settings unchanged, and record whether the full count finishes, the interrupting speech and retained focus. Then change only busy scope before comparing priority. Inspector is unchanged; initial/remount speech remains unverified.

In reply to the explicit B/off test, the owner reports: “it always is interrupted by the word announcement if a known word is recognized”. Parent busy removal therefore did not resolve that reported case. Association is through the test question/reply; there is no independent audio/URL capture or new focus/settings confirmation. Competing typing feedback is a candidate. Next observe explicit submission after word speech finishes, preserving settings; an optional temporary typing-echo comparison must record and restore the original setting.

## Independent announcement investigation and next observation

The explicit-submission follow-up also receives the owner report “is beeign interrupted”. It is associated through the previous question/reply; exact utterance, timing, focus and settings remain incomplete. [RX-4002-F01](RX-4002-announcement-investigation.md) tracks this open failure in a separate independent Codex task. It does not waive the status-announcement requirement.

Continue the independent Inspector observation on the ordinary installed `/ui` page: search `red`, activate **Inspect results**, record the dialog name and initial focused control, use Tab/Shift+Tab to check focus stays inside, then Escape and record focus restoration to **Inspect results**. Record actual VoiceOver speech and physical key behavior, including failures. The URL/package binding is the current fixture preparation; exact human browser/VoiceOver/settings still require the evaluator's confirmation. This procedure is pending, not a Pass.

## Owner-reported Inspector follow-up — 2026-10-09

In reply to the ordinary `/ui` Inspector procedure, the owner reports: “tab and esc function normal as expected. dialog: inspector with 3 items, tabbing between h2 and close button”. This supplies an attributed dialog announcement and reported normal Tab/Escape behavior. It is associated with requested URL `http://127.0.0.1:63024/ui` through the question/reply; browser/URL/audio/focus were not independently captured. Safari/macOS/English were confirmed earlier, while exact tested VoiceOver/settings remain incomplete.

The owner reports traversal between the heading and Close button. Whether that describes DOM keyboard focus or the VoiceOver cursor is unconfirmed; initial focus, explicit Shift+Tab behavior, exact Escape return target, loading/factual-data traversal and the Close action were not separately described. Preserve the positive report without converting it into a complete modal-focus or RX-4002-AC02 Pass. This led to the guided error/retry follow-up below, with the existing word-feedback concern tracked separately.

## Owner-reported error/recovery follow-up — 2026-10-09

In reply to the guided error/retry check, the owner reports the screen reader announces “Search failed. Retry is available.” and, after clicking Search again, “9 results. Showing 1–3.” They report the same announcements across all three activation scenarios, with focus remaining on the Search button when it was clicked, on the input when submitting there, and on the “retry search” button when using Retry. These are positive human speech/focus observations, attributed to the owner; no independent audio or DOM-focus capture accompanies this reply.

The requested fixture is the ordinary `http://127.0.0.1:63024/ui` page. The reply does not explicitly reconfirm the browser/URL, query, filter state, exact VoiceOver settings or timing. Safari/macOS/English were confirmed earlier. Preserve the reported nine-result count without binding it to `red`: the frozen fixture expects seven unfiltered `red` matches, and this reply does not establish what was searched. This recovery observation does not resolve the separately reported normal-typing interruption in RX-4002-F01 or complete RX-4002-AC02.

The next guided check was filters/facets on the same ordinary fixture: explicitly reset Category to All, search `red`, select Guide, then return to All. The literal fixture and `test/ui/packed-browser.test.mjs` establish expected visible totals of 7 → 5 → 7; the owner response follows.

## Owner-verified filter follow-up — 2026-10-09

**Pass for the guided All → Guide → All filter flow.** The owner reports: “all anouncements are correct, not interrupted, when changes to all, guide, and back to all. focus stays on the select. all verified”. This directly supplies human confirmation of correct uninterrupted announcements and retained select focus throughout the requested sequence. The sequence is associated with the preceding ordinary `/ui`, `red`, Category All → Guide → All procedure; the same Safari/macOS/English session was confirmed earlier. Exact VoiceOver version/settings remain an overall qualification field rather than being inferred from inventory.

Two supplied screenshot crops are saved byte-for-byte as supporting evidence. The Guide crop shows visible “5 results. Showing 1–3.” and the VoiceOver caption “Guide (5), Category 1 distinct values; 0 buckets omitted. Counts include the current filters., menu pop up collapsed, button”. The All crop shows visible and caption text “7 results. Showing 1–3.”. These are observed image text; uninterrupted heard speech and retained select focus are established by the owner's report, not inferred from the still images.

| Supplied image | Durable copy | Original dimensions / bytes | SHA-256 |
| --- | --- | --- | --- |
| `codex-clipboard-340fff54-626c-4522-94cc-7240caaf27cc.png` | [Guide caption/results](../evidence/RX-4002-human-facet-guide.png) | 1394 × 412 / 119,307 | `2d2f672e8afc3305677d537f7fd2423c5fc566bf33d819c56b0ebf628f752871` |
| `codex-clipboard-76521f5b-24f4-4acd-8fbe-8f27a1d371c6.png` | [All caption/results](../evidence/RX-4002-human-facet-all.png) | 1732 × 458 / 72,860 | `0557e3bf11ed4bdc684f3ac3407f5e96758c9ce5b50daf30ec39616bea3992a1` |

The filter pass does not resolve the separate normal-typing interruption in RX-4002-F01 or complete the remaining AT/device/IME/memory criteria. The next guided flow was empty results/recovery on ordinary `/ui`: Category All, search `unmatchedword` using Search, pause five seconds and record actual speech/focus, then search `red` again using Search. Expected visible statuses are “No results.” and “7 results. Showing 1–3.”; the owner response follows.

## Owner-observed empty-results/recovery follow-up — 2026-10-09

**Pass for the guided empty-results/recovery flow.** In direct reply to that procedure, the owner reports: “first: No results,s econd search: 7 results. Showing 1–3. focus stays on the control i used”. This supplies the heard empty-state and successful subsequent search announcements, with retained triggering-control focus. The completed second search establishes recovery from the empty state. The reply does not identify a different browser or settings; Safari/macOS/English were confirmed earlier, while exact VoiceOver settings remain an overall qualification field.

The supplied empty-state crop shows `unmatchedword` in the search input and the VoiceOver caption “No results.”. The recovery crop shows input `red` and both visible status and caption “7 results. Showing 1–3.”. Input outlines are visible in both crops; they are image evidence, not an independent DOM-focus trace. Actual speech and retained control focus are owner-reported observations. Both original images are preserved byte-for-byte:

| Supplied image | Durable copy | Original dimensions / bytes | SHA-256 |
| --- | --- | --- | --- |
| `codex-clipboard-b8bb7680-d015-4601-964d-cd91a1598b5e.png` | [Empty-state caption/input](../evidence/RX-4002-human-empty.png) | 1302 × 546 / 68,793 | `47fe3b4ae325500a391e09cfe97ffc449da4a30e81f4e1b67496a1cc0a491200` |
| `codex-clipboard-bfcf5dca-c7ed-4b66-97b0-24a9a698217a.png` | [Recovered caption/input/results](../evidence/RX-4002-human-empty-recovery.png) | 1264 × 560 / 75,507 | `e5ae965e2a53ef59a21b3833a4a20b03d7164bb69748517befd8e4d12a7ecdc1` |

The next guided check was worker failure/recovery at `http://127.0.0.1:63024/worker`: search `red` (two expected matches), activate **Terminate worker**, search `blue` and wait five seconds for the failure, then activate **Recover from authoritative source**, wait for recovery and search `blue` again (one expected match, Beta banana). The three-record worker fixture differs from the nine-record direct UI. Its source and automated checks establish those expected visible outcomes; the owner response follows. This pass does not close RX-4002-F01 or the remaining qualification criteria.

## Owner-verified worker failure/recovery follow-up — 2026-10-09

**Pass for the three guided worker steps.** In reply to the worker procedure, the owner reports: “all three verifeid, focus stays on the control used”. This verifies the requested initial two-result `red` search, failure after terminating the worker and searching `blue`, and explicit authoritative-source recovery followed by the one-result `blue` search, with retained triggering-control focus. This is owner-observed verification; exact spoken failure/recovery/result wording is not supplied and is not reconstructed from DOM strings. No new screenshot, audio or independent DOM-focus capture accompanies this reply.

The pass is associated with the preceding `/worker` procedure in the ongoing Safari/macOS/English session. It does not establish an actual transport error code, physical resource failure, memory observation or resolution of RX-4002-F01. Overall exact-tool settings and remaining qualification observations still need evidence.

The next guided check was teardown/remount on ordinary `/ui`: activate **Destroy UI**, confirm the search controls disappear and the authored fallback documentation link is readable, activate **Remount UI**, confirm labeled controls return, then search `red` (seven expected results). The question requested actual speech, focus after each action, duplicate announcements and any unusable controls; the owner response follows.

## Owner-verified teardown/remount follow-up — 2026-10-09

**Pass for the guided teardown/remount and subsequent search.** The owner replies “all verified, focus stays on the control used” and supplies these heard announcements:

1. Destroy: “UI destroyed; authored fallback restored. Borrowed engine remains usable.”
2. Remount: “UI remounted over the same borrowed engine.”
3. Subsequent `red` search: “7 results”.

The confirmation covers the requested control removal/readable fallback, returned labeled controls and successful search, with focus retained on the control used. No duplicate-announcement or unusable-control failure is reported. Preserve the supplied wording; the abbreviated seven-result report is not expanded into an invented full utterance. These are owner observations in reply to the ordinary `/ui` procedure, without a new independent audio, image or DOM-focus capture. Safari/macOS/English were confirmed earlier; remaining exact VoiceOver/settings fields are not inferred.

The next question asked for an already installed, usable composing OS input method, or “none / not sure”, before guiding the real composition test. No installation or settings change was requested. The owner response follows. Query/result traversal, complete Inspector observations, exact AT settings and named physical device/display/input observations remain incomplete. RX-4002-F01 and the separately tracked scoped memory requirements also remain open; these bounded passes do not complete RX-4002.

## Owner-reported input sources — 2026-10-09

The owner reports: “i actually have only english, german and greek”. The supplied input-source menu screenshot shows **ABC – QWERTZ**, **German** (selected) and **Greek**. Preserve the owner's language description and the literal menu names separately; do not silently relabel ABC – QWERTZ as an English layout. This establishes available sources and the visibly selected German source, without proving a real composition-event sequence or the physical keyboard/display model.

The original `codex-clipboard-9a80631f-4c27-4c55-814d-574d48801032.png` is preserved byte-for-byte as [input-source menu evidence](../evidence/RX-4002-human-input-sources.png): 446 × 510 pixels, 151,203 bytes, SHA-256 `c84aeaab196fd691733e9ef2b71431376a9857e3d215be73327fb1458d9e30b9`.

**Blocked for real composing-IME qualification:** no named usable composing-IME session or real composition observation is established on the reported setup. This is a missing environment/observation, not an implementation failure. Do not infer composition behavior from the source names, accent entry alone or synthetic events. The required evidence remains a named real input method with observed pre-commit/final-commit behavior, preserved text/focus and search submission timing. No input-source installation or settings change is requested or made.

The next guided physical multilingual-entry check used the available sources, on ordinary `/ui` with Category All: physically type `café` with German selected, submit Search (one expected match, Long content), switch to Greek and physically type `δοκιμή`, then submit (expected “No results.”). These expectations come from the frozen nine-record fixture and native lexical normalization; the fixture contains `café` only in Long content and no Greek text. This tests text entry, not Greek-language relevance or a completed IME contract. The question requested actual entered characters/accents, speech, focus and named keyboard/display/Safari zoom; the owner response follows.

## Owner-verified multilingual typing and accent expectation — 2026-10-09

**Pass for the guided multilingual typing checks.** The owner reports: “both verified, first german and ABC qwerz, and the other in greek,”. This confirms the requested accented Latin entry/search using German and ABC – QWERTZ, and the Greek entry/search using Greek. Preserve the confirmation without inventing full spoken utterances. At this reply boundary, physical keyboard/display models, Safari zoom, scale/refresh rate and power mode were unspecified. The subsequent Computer/zoom observation below supplies current hardware/settings and reported zoom; the later owner confirmation binds built-in input and all guided tests at 400%, while power mode remains unspecified. This bounded typing pass does not establish real IME pre-commit/final-commit behavior or complete RX-4002-AC04.

**Search-usability finding:** the owner would normally enter `cafe` rather than `café`, and `δοκιμη` rather than `δοκιμή`, while noting that different Greek accent placement can mean a different word. This is a reported user expectation, separate from the verified entry checks. No human accent-omitting search result is supplied in this reply.

The current [`basic-v1` contract](../specs/CORE_CONTRACT.md#basic-v1-analyzer) explicitly preserves accents under NFKC followed by default lowercasing; `cafe`/`café` and `δοκιμη`/`δοκιμή` therefore remain distinct terms. [Unicode normalization](https://www.unicode.org/reports/tr15/) unifies equivalent representations; it does not by itself define accent-tolerant search. Source inspection confirms the adopted algorithm in `src/core/analyzer/basic.ts`; this is an intentional current limitation, not a newly diagnosed implementation defect.

Record the expectation for the existing deferred [RX-A040 language analyzer pack](../../IMPLEMENTATION_TASKS.md#rx-a040). A future decision should evaluate language/corpus-specific accented and unaccented queries, including Greek ambiguity, with original text/spans and index/query/worker/snapshot compatibility preserved. Optional tolerant recall with preference for exact spelling is a candidate to evaluate, not an approved ranking or matching change. No N5 task is activated, acceptance criterion changed or runtime policy modified. The subsequent Computer/zoom observation supplies current hardware/settings and reported Safari zoom; the later owner confirmation binds built-in input and all guided tests at 400%.

## Computer-observed hardware and owner-reported Safari zoom — 2026-10-09

The owner reports “safari zoom was 100% and up to 400%” and requests Computer inspection of the Mac/display and keyboard/pointer. Read-only native System Settings and System Information navigation supplies the following current inventory. No system preference was changed.

| Field | Observation | Evidence source |
| --- | --- | --- |
| Mac | MacBook Pro, 16-inch, M5 Pro; model identifier Mac17,8; Apple M5 Pro; 24 GB RAM | System Settings → General → About; System Information → Hardware |
| Display | Built-in Liquid Retina XDR Display, 16-inch, 3456 × 2234 Retina; main display, online, internal connection | System Settings → General → About; System Information → Graphics/Displays |
| Display setting | 1728 × 1117 (Default) selected; ProMotion; Apple XDR Display (P3-1600 nits) preset | System Settings → Displays |
| Built-in input | Apple Internal Keyboard / Trackpad | System Information → SPI |
| Listed external input | ERGO K860, Keyboard; LIFT, Mouse; both listed under Not Connected | System Information → Bluetooth |
| Safari zoom | Initially reported 100% and up to 400%; follow-up confirms all guided tests at 400% | Owner replies; this does not establish every intermediate zoom level |

**Pass for identifying the currently reported Mac, display settings and built-in input hardware.** Bluetooth's Not Connected section is an observation about that inventory, not proof of which hardware the owner used earlier or of every possible connection path. The selected display setting and ProMotion are configuration observations, not a fixed refresh-rate or physical-paint measurement. Serial numbers, hardware UUID/UDID, Bluetooth addresses and the owner's device name are omitted from this durable record.

**Owner-confirmed physical session binding.** In direct reply to the input/zoom clarification, the owner states “built-in keyboard/trackpad,all tests on 400 zoom”. Bind the preceding guided Safari manual checks to built-in keyboard/trackpad use at 400% zoom: query/search, Inspector, error/retry, All → Guide → All filtering, empty-results/recovery, worker failure/recovery, teardown/remount and multilingual entry. Preserve each flow’s original Pass/Partial/failure outcome and exact supplied speech; this reply does not close the open announcement finding or complete the partially observed Inspector/query flows. Current display settings are Computer-observed, while the physical input and zoom used are owner-confirmed. Power mode and historical display settings are not separately confirmed. No complete reflow audit, larger interactive workload, physical-latency measurement or real composing-IME pass is claimed. RX-4002-AC04 remains Blocked pending the remaining required observations; no task state, acceptance criterion, runtime behavior or public contract changes.

Documentation verification: `npm run docs:check`, `npm run handoff:check` and `git diff --check` pass. Parent review checks the sanitized transcription against the returned native UI fields and preserves the distinction between inventory, owner reports and unobserved session conditions. No new runtime regression or independent AT test is claimed.

## Owner-reported speech verbosity follow-up — 2026-10-09

The owner reports that changing VoiceOver default speech verbosity from High to Medium makes all announcements complete correctly without interruptions. The supplied [VoiceOver Utility screenshot](../evidence/RX-4002-human-voiceover-medium.png) visibly confirms **Default Speech Verbosity: Medium**. The [F01 finding record](RX-4002-announcement-investigation.md#owner-reported-medium-verbosity-retest--2026-10-09) preserves the verbatim report, original image identity, dimensions, size and SHA-256.

**Owner-reported success at Medium; exact retest scope pending.** No tested URL/mode/busy scope, package identity, specific action sequence, exact utterances or new focus outcome accompanies this report. Do not infer every comparison mode or every checklist flow from “all”. The screenshot is setting evidence, not independent heard-speech evidence. High is the owner-reported earlier setting. Other exact AT settings remain incomplete. Preserve both outcomes; F01 remains Open pending retest identity/disposition, and Medium is not made a required user setting or a production fix.

## Owner-reported atomic query and typing feedback — 2026-10-15

In reply to the guided ordinary-UI traversal question for `http://127.0.0.1:52996/ui`, the owner reports the spoken sequence “waiting for search”, then “1 results. Showing 1–1.”, with “focus didnt move”. The owner confirms that verbosity is **Medium** and reports changing **While typing, speak** to **Words**, adding “this option caused the interpution sometimes”. Preserve this as the owner's association with typing feedback; the reply does not establish a root cause or whether those occasional interruptions occurred before or after the settings change. The earlier interruption evidence and open [RX-4002-F01](RX-4002-announcement-investigation.md) remain unchanged.

The owner then clarifies “i seached for atomic”. This is an `atomic` observation rather than the requested `red` query; do not compare its one-result count with the seven-result `red` expectation. Read-only Computer inspection of the current Safari accessibility tree confirms `/ui` at port 52996, search field `atomic`, Category **All**, visible status **1 results. Showing 1–1.**, the **Search results** level-2 heading and named content list, and one **Atomic alpha** level-3 heading/link. The tree also exposes the snippet “red apple red. Atomic commits retain a coherent revision.” and Page 1 of 1. Source inspection of the nine-record fixture confirms that only Atomic alpha contains the `atomic` term. No browser input, page navigation or setting was changed during this inspection.

**Partial human observation, with matching current AX state.** Actual count speech, reported unchanged focus, current Medium verbosity and the Words typing-feedback setting are recorded. The AX tree does not establish heard heading/list/link/snippet speech, traversal usability or an independent DOM/VoiceOver focus position. The owner has not yet reported that traversal or return-to-edit outcome; the next question continues on the existing `atomic` result. The current Safari page is bound to the [restarted installed-package fixture](../evidence/RX-4002-npm12-launcher.md); browser/OS/VoiceOver versions, zoom and built-in input use are not newly reconfirmed by this reply. No full query/results, announcement, Inspector or physical criterion is promoted to Pass. RX-4002 remains Blocked.

Documentation checks for this bounded observation: `npm run docs:check`, `npm run handoff:check` and `git diff --check` pass. Parent review preserves the owner's actual query/utterances, separates the native AX reading from human speech/focus reports, and leaves the independently owned announcement-investigation edits untouched. No runtime change or new automated AT/audio observation is claimed.

## Result traversal, return-to-edit, pagination and Search report — 2026-10-15

In reply to the guided `atomic` result traversal, the owner reports “list results 1 item, heading level3, link” and the unexpected phrase “you are currently on a selectable item”. This supplies heard list/item-count, heading-level and link-role evidence; the exact spoken title and level-2 heading are not supplied, and snippet reading is not explicitly confirmed. Keep the extra phrase as a usability observation without assigning it to an authored selectable widget or a proven platform cause. Source inspection confirms the results use native `ol`/`li`, `h3` and `a`, without authored `aria-selected` or a custom option/listbox role.

The owner reports returning to the search field, editing to `red`, and receiving the correct results: “it finds averything, all coorect”. This supports usable return-to-edit/recovery. The same reply reports that focusing and repeatedly activating the Search submit button appears to do nothing. Activation method, exact page/modal state, query changes between attempts, visible status transitions and actual request admission are not yet established. Preserve this as an **unresolved reported activation failure**, not a Search-button Pass and not an established implementation defect. Automatic input search can finish before an explicit same-query submission; source inspection alone cannot show which activation occurred or what was heard.

For pagination, the owner hears “searching...” after Next activation, reports that focus stays on the control, and hears the last-page button as “dimmed”. These are bounded human observations of progress speech, retained focus and unavailable-state speech. No final page-count utterance or attempted activation of the unavailable button is supplied; do not infer either. The full query/results flow remains Partial.

Read-only Computer inspection after the report shows the same `/ui` URL at port 52996 with Safari Web Inspector visible and the Raveldex Inspector dialog open. The exposed underlying DOM contains **7 results. Showing 7–7.** and the open Inspector displays revision 1 with one selected document. This is later observed state, not a reconstruction of the earlier Search attempts. No page input, dialog closing, browser navigation or setting was performed by the agent.

The next controlled human check uses an already settled `red` query, closes the Raveldex Inspector and returns to the page, arms **Inject next search error**, then activates **Search** without editing. An actual injected failure makes a new submission observable even if successful repeated results would look identical. Record the activation method, actual visible/spoken failure and focus. If the button produces no failure, press Return in the unchanged input to check whether the armed fault is then consumed. This experiment is requested and pending; no outcome or cause is inferred. The existing open announcement finding, remaining Inspector/IME/memory evidence and RX-4002 Blocked status are unchanged.

Documentation verification: `npm run docs:check`, `npm run handoff:check` and `git diff --check` pass. Parent review checks the transcription and distinguishes human speech, later AX/DOM exposure and unverified activation hypotheses. There is no runtime change or new automated browser/AT test in this documentation-only continuation.

## Search activation and Retry recovery — 2026-10-15

In direct reply to the controlled armed-error procedure, the owner reports:

> yes after activate 'inject error' the search button: search failied, rerty availabel. the button retry available, after clicking the correct announmcnet are heard, searhcin, 7 results, showing 1-3. focus stays on the control

**Pass for this bounded Search/Retry flow.** After arming the next-search fault, Search activation produces the reported search-failed/retry-available outcome. Retry is available and its activation produces the reported searching progress and seven-result first page, with focus retained on the control used. Query binding is through the requested settled `red` procedure and its direct reply; the supplied utterance is preserved above. The exact activation method and independently captured DOM/VoiceOver focus position are not supplied. Earlier confirmed Safari/macOS/English and the later Medium/Words settings remain attributed to their own reports; versions/settings, zoom and input hardware are not newly reconfirmed by this reply.

The earlier apparently ineffective Search-button case is not reproduced by this controlled test. Preserve that earlier report without claiming a proven debounce, repeated-query, modal, browser or AT cause. No production fix occurred or is justified by this successful observation. The older nine-result error/recovery report retains its separate unconfirmed query/filter binding. This bounded Pass does not close normal-typing announcement finding RX-4002-F01 or complete query/result traversal, Inspector, real OS IME, physical or memory qualification. RX-4002 remains Blocked and RX-4003 waits.

Next observe Inspector's initial announced dialog/focused control, factual-content reading and Close-button focus restoration on the recovered `red` result. The owner’s prior Tab/Escape observations are preserved; no new Inspector outcome is inferred.

Documentation verification: `npm run docs:check`, `npm run handoff:check` and `git diff --check` pass. Parent review checks direct procedure/reply attribution and preserves the earlier failure report and independent dirty work. No runtime change, independent speech capture or new automated runtime test is claimed.

## Inspector opening, readable content and heading navigation — 2026-10-15

In direct reply to the recovered-`red` Inspector procedure, the owner reports “inspector, web dialog busy, close inspector”, identifies initial focus on the Close button, says “the content is immediatly readable”, and describes a loop between the level-2 Inspector heading and Close Inspector. This supplies **Pass for the bounded named opening, reported initial Close focus and readable factual content**. The exact navigation keys and the difference between keyboard focus and the VoiceOver cursor are not supplied. Close-button restoration and its actual announcement remain unreported; the complete Inspector flow stays Partial/Blocked.

Source inspection confirms that `src/addons/ui/ui.ts` creates a plain `h2` Inspector heading with no `tabindex`, labels the native `dialog` using that heading, opens with `showModal()` and explicitly calls `close.focus()`. The shared element helper adds only the hook/class/text; no UI code adds `tabindex` or a custom Tab-key trap. The browser supplies native modal behavior. Close/Escape source paths request opener focus restoration, but that source behavior does not replace the missing human Close observation.

The owner's question about making the heading focusable is answered without changing runtime behavior. The [WAI modal-dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) describes using `tabindex="-1"` on a static title/content element when deliberately placing initial programmatic focus there, especially for complex or large content. That is an optional initial-focus strategy, not required just to make a heading available to a screen reader. [Apple's cursor-tracking guidance](https://support.apple.com/en-mide/guide/voiceover/vo15534/mac) distinguishes VoiceOver cursor position from keyboard focus. Those concepts do not establish which moved in this owner's loop or diagnose this exact Safari/VoiceOver setting. Preserve the current plain heading and reported initial Close focus; no `tabindex` change is justified by the supplied observation alone.

The follow-up asks whether the loop used plain Tab/Shift–Tab or VoiceOver Control–Option–Arrow navigation, and asks for actual Close activation, restored focus and speech. These observations are pending. Earlier bounded Search/Retry, editing and pagination outcomes retain their own scope; F01, exact remaining settings and physical/IME/memory gates remain open. RX-4002 stays Blocked and RX-4003 waits.

Documentation verification: `npm run docs:check`, `npm run handoff:check` and `git diff --check` pass. Parent review checks the owner/source/guidance distinctions and preserves independent dirty work. No runtime change, independent audio observation or new automated browser test is claimed.

## Plain Tab sequence and Close/Escape restoration — 2026-10-15

The owner clarifies that the reported loop uses **plain Tab**, not Control–Option–Arrow navigation. The latest perceived focus sequence after opening is Inspector → Close Inspector → Close Inspector → Inspector: one further Tab is reported to remain on Close before the next returns to Inspector. Preserve the duplicate Close step; do not simplify this into an independently verified two-node DOM focus cycle. Plain Shift–Tab is not newly observed in this reply.

The owner now describes Inspector/the heading as the initial focus target, whereas the preceding reply identified the Close button. Preserve both reports and their sequence. No `document.activeElement` or independent keyboard/VoiceOver-cursor capture identifies the focused DOM node at each step; title speech alone does not establish that the `h2` is a sequential Tab stop. Source remains a plain `h2` without `tabindex`, native `dialog.showModal()` and explicit initial Close focus. No heading attribute, initial-focus policy or trap change is made from this evidence.

**Pass for the bounded Close and Escape restoration paths.** The owner explicitly confirms that both activating Close Inspector and pressing Escape return focus to **Inspect results**. The actual post-close utterance is not transcribed. Combined with the previous named opening and immediately readable content, these extend the bounded Inspector observations; exact initial DOM focus and complete current AT/environment settings remain unqualified. Overall RX-4002 remains Blocked, with RX-4003 waiting and F01 preserved.

The next human question returns to the outstanding ordinary-results level-2 heading and first-result snippet reading. Previously accepted search, editing, error/retry, filter, worker, teardown and bounded Inspector outcomes are preserved without requesting a repeat of those flows. Real composing-IME, remaining physical/context fields and scoped memory observations still require separate evidence.

Documentation verification: `npm run docs:check`, `npm run handoff:check` and `git diff --check` pass. Parent review preserves the exact reported Tab sequence, both initial-focus descriptions and the distinction between owner reports and DOM instrumentation. No runtime change or new independent browser/AT test is claimed.

## Result reading and current VoiceOver settings — 2026-10-15

In direct reply to the ordinary-results level-2 heading and first-result snippet check, the owner confirms: “i can hear both and snippet witout interruptions.” **Pass for this bounded heading/snippet reading observation.** Combined with the preceding heard one-item list, level-3 heading/link and usable return-to-edit observations, this completes the requested bounded result-reading checks. It does not close the separate normal-typing status-announcement finding RX-4002-F01 or resolve Inspector's exact initial DOM-focus question. No full spoken snippet text, new version declaration or independent audio capture is invented.

The agent then reads the current VoiceOver Utility through native Computer UI, opening category/tab views and the About dialog without editing preferences. The About dialog reports the literal **VoiceOver Utility Version 10 (993)**. This is a current Utility observation after the user's reading check, not independent confirmation of every historical screen-reader process/version or setting. The About dialog is closed and the original General pane restored.

| Current setting | Computer-observed value |
| --- | --- |
| Default Speech Verbosity | Medium |
| While typing speak | Words |
| Punctuation | Some |
| Speak instructions for using the item in the VoiceOver cursor | Enabled |
| Speak hints after delay | 0.5 seconds |
| Synchronize keyboard focus and VoiceOver cursor | Enabled |
| Automatically interact when using tab key | Enabled |
| Allow cursor wrapping | Disabled |
| Initial position of VoiceOver cursor | Keyboard focused item |
| Grouping behavior | Standard |
| Mouse pointer | Ignores VoiceOver cursor |
| Navigate webpages by | DOM order |
| Enable Web Announcements | Enabled |
| Arrow-key Quick Nav | Disabled |
| Single-key Quick Nav | Disabled |
| Always allow typing in text fields | Enabled |

These values supplement the owner-confirmed Medium/Words reports and the earlier software/hardware inventory. They are neither assumed historical settings nor an established cause of the Tab sequence or interruption. In particular, automatic Tab interaction and cursor synchronization are relevant observed context, without identifying `document.activeElement` at the earlier heading/Close stops. Safari/macOS/English, historical zoom/input conditions and earlier successes/failures retain their own attribution; this inspection does not retroactively reconfirm them.

No further repetition of accepted result-reading or ordinary recovery flows is requested. Remaining qualification includes F01 disposition, exact Inspector focus characterization, real OS composition/pre-commit/final-commit behavior, remaining physical-session context and scoped retained/peak/browser-worker memory. Existing ABC – QWERTZ/German/Greek entry checks remain distinct from actual composition evidence. No input source is installed or requested, no runtime/public contract or acceptance criterion changes, and RX-4002 remains Blocked with RX-4003 waiting.

Documentation verification: `npm run docs:check`, `npm run handoff:check` and `git diff --check` pass. Parent review checks the direct human reply and native Utility fields, distinguishes current from historical settings and preserves independent dirty work. No new automated browser test or independent audio observation is claimed.


## Opt-in physical-input capture prepared — 2026-10-26

The [input-observation continuation](../evidence/RX-4002-input.md) adds `/ui-input` over the same packed nine-record UI. Explicit Start/Stop capture records real event data/flags, composition boundaries, DOM focus/selection, status and fixture search calls. The unchanged ordinary UI is separately available at `/ui`. Trace output remains local to the page and is populated only after Stop; it is not a live announcement channel. Row/text caps and dropped/truncated data are explicit. Browser automation can generate trusted input, so event flags alone never establish physical input or a real OS IME.

The existing German dead-key sequence for `café` is the next bounded human check, with no new input source or settings installation. A current source label, actual pre-commit/final-commit trace and owner-reported final text/result/focus are pending. The probe does not presume that a German dead key produces the required composition sequence. Existing multilingual-entry and AT outcomes remain accepted within their recorded scopes. F01, exact Inspector initial focus, remaining physical context and scoped memory are unchanged open gates; RX-4002 stays Blocked.


## Safari input trace inspection — 2026-10-26

The owner asks to inspect the stopped `/ui-input` recording. Native Safari AX and the parsed selected trace show final `café`, “1 results. Showing 1–1.” and **Long content**. The [inspection evidence](../evidence/RX-4002-input.md#stopped-safari-trace-inspected--2026-10-26) records 71 contiguous rows with none dropped. Five ordinary/replacement input events report `isComposing: false`; there are no composition events. The final `é` replaces an already entered `e` via `insertReplacementText`. Input DOM focus remains through the final result, followed much later by focusout/Stop with body active. Speech and the VoiceOver cursor are not captured.

The source label is blank. Exact input source, separate dead key versus held-key accent selection, current physical input/zoom and any changed VoiceOver settings remain pending owner clarification. Bounded final text/result observation passes; this run does not exercise pre-commit composition suppression or establish a named real composing-IME Pass. No implementation failure is inferred. Earlier accepted flows and all other RX-4002 gates retain their scope.


## Owner confirms long-press accent selection — 2026-10-26

The owner reports “i long pressed e, and then pressed the 1 in the popup selection”. The [follow-up evidence](../evidence/RX-4002-input.md#owner-confirms-accent-picker-method--2026-10-26) binds that action to the inspected ordinary/replacement input sequence. It supplies a concrete accent-picker method, without turning that sequence into a separate-dead-key or composing-IME Pass. Input source, current keyboard/zoom and VoiceOver settings remain unconfirmed. The next clarification requests only the selected source so the subsequent separate-key test can be specific; accepted text/result and prior flows are preserved.


## Current German DE source confirmed — 2026-10-26

The owner answers “german DE” to the current-source question. This binds the next [separate-key procedure](../evidence/RX-4002-input.md#current-german-de-source-and-separate-key-follow-up--2026-10-26) to current German DE; it does not retroactively populate the earlier stopped trace's blank source label. The requested sequence is `caf`, separate `´` tap/release, two-second pause, then `e`, followed by settling and stopped-trace inspection. It has no new outcome yet. No installation or settings change is made; the long-press replacement/result observation remains accepted within its scope.


## Real German DE dead-key composition observed — 2026-10-26

The owner replies “done” to the separate-key procedure after confirming current German DE. Native Safari inspection finds a new stopped recording with **64 contiguous rows and none dropped**. The [dead-key evidence and independent review](../evidence/RX-4002-dead-key.md) establish real compositionstart/update/end and composing input events, with zero search calls over the recorded 728ms pending interval. The requested two-second pause is not relabeled as observed. After compositionend, one main `café` search and its snippet call complete; the result is one Long content item, with input DOM focus in all recorded entry/result snapshots.

**Pass for this bounded real OS dead-key composition/automatic-query path.** The source label remains blank; German DE/method attribution comes from the preceding owner confirmation and guided completion. There is no new speech, explicit submit-during-composition, alternate-IME or full physical/AT Pass. Current keyboard/trackpad, zoom, VoiceOver and power context await clarification. No further typing repetition is requested; prior accent-picker and other accepted flows remain preserved.


## Dead-key run zoom, power and speech clarification — 2026-10-26

The owner reports “power mode: automatic, on battery. 400% confirmed,  voice over 'accute prime'”. Bind the completed dead-key run to **400% Safari zoom, battery power and Automatic power mode**. Preserve VoiceOver's supplied “accute prime” wording as an owner report with no explicit event/target timing; it is not a new result-announcement or verbosity/typing-feedback confirmation. Built-in keyboard/trackpad use and current VoiceOver settings were asked about but not confirmed by this reply. The bounded composition Pass is retained; no typing repetition is requested.

## Remaining AT observation preparation — 2026-10-26

The [peak/AT continuation](../evidence/RX-4002-peaks-at.md) prepares a fresh original `/ui` and separate opt-in `/ui-focus` over the same unchanged installed controller. The latter records bounded DOM activeElement/event/status observations, including modal body boundaries and later-task snapshots, with stopped local JSON and no new live channel or focus/Tab/busy-policy change. Its headless tests prove instrumentation behavior only. New current normal-typing speech is pending on the original UI; Inspector opening/three plain Tabs can then distinguish DOM focus from the spoken heading/VoiceOver cursor. No existing Pass is reset and no new owner outcome is inferred. Current Safari/macOS/VoiceOver Utility version metadata remains 27.0.1 (22625.1.29.11.28), 27.0.1 (26A434), and 10 (993); these values do not reconfirm current speech settings or input hardware. The prior clarification stays pending without requiring a dead-key repeat.

## Inspector DOM focus and owner Tab report — 2026-10-27

The owner supplies a stopped `/ui-focus` appshot and asks to inspect. A separate read-only native Safari AX parse confirms 37 contiguous rows with no drops: initial DOM focus is Close Inspector, and Close activation restores Inspect results, including later-task samples. The [evidence](../evidence/RX-4002-inspector-focus-20261027.md) preserves source/package/session bindings and a selected derived summary. The owner follows up: “i tabbed, the close inspector button got focus.” No new literal announcement, exact activation method or three-Tab count is supplied. There are five captured pre-opening Tabs and none captured while open; no physical keypress or interception conclusion follows.

**Observed for this bounded Inspector initial-focus/restoration check**, alongside prior accepted named dialog, reading and keyboard outcomes. Earlier heading/Close perceptions retain unknown cause. Do not repeat Inspector solely to explain every VoiceOver/DOM transition or add a universal three-Tab gate. No runtime change is justified. Original normal-typing speech/current context and native peaks remain outstanding; RX-4002 stays Blocked and RX-4003 waits.
