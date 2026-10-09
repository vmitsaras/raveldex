# RX-4002 exact-tool and physical observations

Status: **Blocked — preliminary human query/focus, Inspector and error/recovery observations reported; exact environment and complete flows remain unqualified.** Automated browser checks are linked separately from this record. Installing or identifying VoiceOver does not prove that it announced the native interface correctly.

The evaluator must record the date, tested package hash, exact browser/OS/screen-reader versions, speech language, VoiceOver verbosity, Quick Nav state, keyboard navigation settings, and the actual announced text and focus outcome for each step. Record failures as failures; do not copy the visible DOM text into an announcement field unless the tool actually spoke it. A caption panel may help preserve output, but it does not establish what a listener heard. Apple's [caption-panel guidance](https://support.apple.com/en-am/guide/voiceover/unac078/mac) describes that tool.

## Local observation procedure

Use the installed-package fixture served by `npm run qualify:serve` after installing dependencies. Record its printed URL and package identity. Open the printed `/ui` URL for the nine-record native UI, or `/worker` for the three-record module-worker recovery fixture. Both mount automatically and have labeled native fault controls; no developer console is required. The injected errors are test application behavior, not package APIs. Use the documentation pilot separately for real content if desired.

| Flow | Required action and observation | Outcome |
| --- | --- | --- |
| Query and results | Navigate to the labeled search field with VoiceOver, enter `red`, submit, and record the field/button names, searching/result announcement, result heading/list/link traversal, and whether focus stays usable. | Partial human report below; full flow Blocked |
| Empty results | Search for `unmatchedword`; record the announced empty state and the ability to edit and resubmit. | Blocked |
| Error and retry | Activate **Inject next search error**, submit a query, record the error/retry announcement and focus, activate Retry, and record recovery. Injection is not a physical resource failure. | Owner-reported error/recovery speech and retained focus across three activation paths below; exact environment and query binding incomplete |
| Filters and facets | Search `red`, select a Category option, record its name/count, changed results/status, retained control focus, and clearing the filter. | Blocked |
| Inspector | Open Inspector after a successful search; record dialog/title/loading/factual-content traversal, focus containment, Escape/Close behavior, and focus restoration to the opener. | Partial human Tab/Escape/dialog report below; complete flow Blocked |
| Worker failure and recovery | Open `/worker`, activate **Terminate worker**, submit, record the honest error, activate **Recover from authoritative source**, then search again. A fresh owner is distinct from retrying an uncertain mutation. | Blocked |
| Teardown and initialization | On `/ui`, activate **Destroy UI**, then **Remount UI**; record restored authored content, focus destination, control names, and duplicate announcements if any. | Blocked |
| Composition input | Use an actual installed OS IME, record its name/settings and entered text, and observe whether composition completes before the query is submitted. Synthetic CompositionEvent checks are separate. | Blocked |

The local inventory identifies VoiceOver 10 (build 993), Safari 27.0.1 (22625.1.29.11.28), and macOS 27.0.1 (26A434). These are inventory facts, not an observed assistive-technology combination. The separate [installed-browser continuation](../evidence/RX-4002-installed.md) records software-driven native Firefox/Safari UI/worker flows and returned AX focus/text; it supplies no spoken announcements or human observations. No complete checklist flow above is qualified by those software observations or the preliminary human report below. NVDA/Windows and other screen-reader/browser combinations have no observation in this slice.

## Physical presentation and input

Use a physically observed device and name its model, display (resolution, scale, refresh rate), browser zoom, keyboard/pointer/touch or OS IME, power mode, and workload. Perform query submission, facet change, Inspector open/close, recovery and teardown on the named workload. The interactive fixtures contain nine direct records or three worker records; do not claim that their display observations cover the separate 1,000/10,000-record resource experiments. Record what appeared and what input remained usable, including stalls or lost input. Describe an observed delay qualitatively unless an actual instrumented physical method measures it. A proposed larger UI/device capacity claim needs a matching interactive workload and observations.

Local hardware inventory reports Mac17,8, Apple M5 Pro, 18 CPU cores and 24 GB RAM. The inventory returned no display rows; there is no observed display or input method. No physical-paint, physical-latency, mobile-device, touch, forced-colors hardware, or real OS IME pass is claimed. Screenshots, browser keyboard automation, rAF and software timing do not fill these fields.

| Required record | Outcome | Observation needed |
| --- | --- | --- |
| Named device/display/input and actual presentation | Blocked | A human or physical instrumentation must identify the display/input and observe the specified flows. |
| Named VoiceOver/Safari announcements and focus | Blocked | Run the steps above and preserve verbatim announced text plus focus outcomes with exact settings. |
| OS IME | Blocked | Complete the composition flow with a named real input method. |

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

The controlled test-only announcement comparison separates the unchanged status stream from an external settled-only polite announcer and an otherwise identical assertive control. It changes neither the library nor the acceptance criteria. Actual candidate speech remains pending; all other complete manual flows remain Blocked.

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

The next guided check is filters/facets on the same ordinary fixture: explicitly reset Category to All, search `red`, select Guide, then return to All. The literal fixture and `test/ui/packed-browser.test.mjs` establish expected visible totals of 7 → 5 → 7; human control/option speech, result announcements, interruptions and retained Category focus remain to be observed.
