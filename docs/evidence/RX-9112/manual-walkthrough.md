# RX-9112 native AT and zoom observations

8 November 2026. **Human report received: Chrome with VoiceOver on macOS works, announcements were correct in the exercised scope, and actual 200%/400% browser zoom both worked.** The later concrete report supersedes the earlier unavailable reply. These are human-reported outcomes, distinct from the initial agent observations below; no per-action transcript or broad conformance claim is invented.

## Human report and fixture clarifications

[Direct replies](human-feedback.json) identify Chrome/VoiceOver/macOS and confirm both actual zoom levels in response to the readability/reachable-controls/visible-focus question. Contemporaneous installed host versions remain macOS27.0.1(26A434), Chrome156.0.8078.81 and VoiceOver10(993); the tester did not separately read out the exact versions/settings. Correct announcements are recorded for the exercised scope without fabricating individual action outcomes or verbatim speech.

Two reported surprises are explained by the frozen fixture:

- `guide` occurs in display titles, while only `text.body` is indexed. `kind` metadata also is not free text. The [installed native diagnostic](indexed-fields-probe.json) captures all ten actual authored rows: body-only gives guide0/shared7; a separate temporary title+body configuration gives guide8/shared7. To search titles in an integration, declare a title text field and include its value in indexed records; `documents[].title` alone is display data. The product engine and frozen fixture are unchanged.
- **Fail next request** applies to the next actual engine request. This fixture uses a 15ms input debounce; reopening a retained nonempty modal query also requests immediately. Either can consume the failure before a later Search activation. The precise human timeline was not supplied, so this is a source-consistent explanation, not a claim to have reproduced a product defect. The resulting early failure is the observation to assess, followed by Retry.

For a deterministic modal failure check, let a nonempty query settle → Close search → arm Fail next request on that same page → reopen the retained query → assess the error before another Search → Retry. Do not reload/navigate between arming and reopening; the flag belongs to that fixture instance. No runtime/fixture or primary-suite change is needed for this clarification.

## Initial agent-observed environment and actions

The following records predate the human replies. They remain valid historical agent limitations, not the current overall human-outcome status.

[Environment metadata](native-environment.json) records macOS **27.0.1 (26A434)**, installed Google Chrome **156.0.8078.81**, and installed VoiceOver/VoiceOver Utility **10 (993)**. The Chrome primary test process independently reports version 156.0.8078.81. VoiceOver versions come from the installed bundle metadata; a running speech session/version was not established.

- Opened the exact installed candidate's [local native fixture](http://127.0.0.1:56956/inline/) through Chrome and entered `shared` using CUA. The native tab's [AX state](native-inline-ax.txt) exposes the focused named input, seven total results, two displayed native title links and range/Load more text. [Native tab screenshot](native-inline.png) confirms that rendered state. This is UI/AX evidence, not heard speech or a physical-paint measurement.
- The visible layout witness was **width 1166 / client 1166 / scroll 1166 / DPR 2**, before and after the zoom-key attempt. Browser zoom percentage was not visibly established. Therefore **200%: Attempted, unverified**; **400%: Not run**. Two native menu/tab-focus action attempts timed out and reset the CUA session. Stopped that route rather than repeat it or substitute CSS scaling.
- Opened VoiceOver Utility's General pane. Its configured greeting is not proof VoiceOver is currently on. No VoiceOver speech, caption output, Quick Nav setting, verbosity setting or active-reader status was observed. No VoiceOver preference/toggle was changed.
- Native desktop focus did not reliably remain on the review tab. Unrelated browser contents are excluded from evidence. No reflow, keyboard or speech product failure is inferred from this tooling limitation.

## Finite human continuation

The local server is currently at `http://127.0.0.1:56956`; [native-server.json](native-server.json) is authoritative if restarted. To prepare it again from the repository, run `node docs/evidence/RX-9112/native-review-server.mjs` and use its reported origin. It serves only public sample records on localhost, using the accepted physical package and captured fixture, with explicit test-only failure/hold controls outside the product UI. It performs no benchmark or remote write.

Use one available real screen reader/browser, with the running versions and settings recorded. A focused walkthrough is sufficient; there is no requested persona/platform Cartesian product.

1. On inline, find **Search this site**, enter `shared` and submit. Record the name/role/editing guidance and actual settled count speech. Expected *information* is seven total/two displayed, not mandatory exact wording.
2. Activate **Load more**, then the explicit **Go to new results** action. Record retained focus, append information and the new-result focus destination. Search a nonmatching term, then Clear search; record empty and idle recovery. Do not infer speech from visible status.
3. For inline, establish the query first, arm **Fail next request (fixture)**, then use Search without further editing and assess the error before Retry. For modal, use the retained-query close/arm/reopen sequence above: opening itself consumes the failure. This intentional refusal tests recovery, not a measured native resource failure. Record error/retry speech and focus for the request that actually failed.
4. Choose modal. The fixture explicitly opens the dialog. Record its name/help and input focus; use **Close search**, verify opener restoration, reopen and check native Escape behavior. A populated native search field may clear on first Escape before the dialog closes.
5. If practical in the same short session, use dropdown Arrow/Enter/Escape/Tab and directory checkboxes/chip removal. Record only interactions actually performed; do not populate unobserved rows as Pass.
6. In Chrome's real browser controls, visibly set **200%**, then **400%**, and record the displayed percentage, viewport/window context, horizontal overflow, readable content, reachable controls, visible focus and modal close/recovery. The layout witness is supporting DOM evidence; the browser's actual percentage is the zoom authority. Restore the original zoom and AT state when finished.

Report tester/date, running OS/browser/AT versions, relevant settings, exact or faithful speech observations, focus destinations, observed zoom percentages and any missing/confusing output. User-reported hearing will be attributed as a human report, distinct from agent-observed UI/captions.

## Current observation scope

| Action | Current established evidence | Real AT / actual enlarged zoom |
| --- | --- | --- |
| Name/edit/search and settled totals | Current native UI/AX field focus, 7 total / 2 shown; automated native queries pass | User reports correct announcements overall; individual utterances not supplied |
| Append/window navigation | Current automated family and matched controls/modal coverage; every result reachable | Covered only by the broad human success report; individual action trace not supplied |
| Empty/reset and refusal/retry | Current primary/secondary automated behavior plus matched component evidence | Correct announcements reported; modal failure-control timing caveat recorded above |
| Dialog open/close/hints | Current automated names/focus/native behavior and supported Escape decision | Broad human success report; exact dialog/close utterances not supplied |
| Browser enlargement | Existing narrow/RTL/root-text checks are separately labeled automation | Both actual 200% and 400% reported usable by the human tester; agent attempts remain historical |

RX-9112-AC03 now supports **Pass within the reported human scope**, together with the existing primary/secondary automation. Exact settings, per-action transcript and expanded AT/device combinations remain unobserved. The later authorized [tracking closeout](tracking-closeout.md) completes AC05, marks RX-9112 done and closes N11 at 12/12. Current source/evidence remains uncommitted; tracking summaries identify local artifacts explicitly. A known essential failure discovered later still blocks its affected claim.
