# RX-4002 Inspector focus observation — 2026-10-27

**Observed for this bounded run:** the original installed UI controller opens Inspector with DOM focus on **Close Inspector**, and activating Close restores DOM focus to **Inspect results**. The owner additionally reports “i tabbed, the close inspector button got focus.” No repeated Inspector run is required to characterize every Tab/VoiceOver transition.

## Source and actual observations

The owner supplies the stopped Safari appshot and requests “inspect”. A separate read-only native Safari AX read parses the full textarea JSON: **37 contiguous rows**, recording false, zero dropped rows, zero dropped/cancelled deferred samples. [Selected derived summary](RX-4002-inspector-focus-20261027.json). The complete textarea JSON is not archived here; its observed UTF-8 length is 34,082 bytes and SHA-256 `1c6caf65b34558c9e4bb44692f192710fcd32e5fcd3d867bc6b053a763b2b8b8`. The selected summary is explicitly not a byte-preserved replacement for it.

The [fresh package report archive](RX-4002-inspector-focus-package-20261027.json.gz) preserves the server's original report bytes and source/bundle identities. Its session and manifest match the textarea: `1e2abf8c-ee47-4580-935a-15a5257b0810`, `e04485452f607dccec68de604b6781a21bf69b33485fc1e760a7880d2941774d`. URL: `http://127.0.0.1:63447/ui-focus`. Package hash remains `6ff6e90128f60af39bb8f47800c61ed83d85d4ded7a8e3c96d2bd34467f9c437`; focus bundle `aa983e634414b92a54cb1100da502d3babd514e6bdb79a9aacd764adc0269cf7` matches the four-test/616-test continuation. The archive's raw/compressed hashes and byte length are recorded in the summary. User-agent says Safari 27.0.1, English language metadata `en-US`; devicePixelRatio 3.5 does not independently establish browser zoom or hardware. No fresh VoiceOver setting/version declaration or exact physical activation method is inferred.

| Recorded point | DOM observation |
| --- | --- |
| Row 23, 29,928ms | Trusted click on Inspect results, dialog not yet open, opener focused. |
| Row 25, 29,930ms | Dialog open; focusin and activeElement identify Close Inspector. |
| Row 27, 29,932ms | Later-task sample after opening still identifies Close Inspector. |
| Rows 29–31, 66,611–66,690ms | Space keydown followed by trusted click on Close Inspector. Exact physical/AT activation method is unspecified. |
| Row 33, 66,692ms | Dialog closed; focusin/activeElement identify Inspect results. |
| Row 35, 66,693ms | Later-task sample confirms opener restoration. |

Five captured Tab keydowns occur **before** the dialog opens. No Tab keydown or h2 focus is captured while it is open. This is not proof that no physical Tab was pressed: the owner explicitly says they tabbed. There is no new verbatim speech or independently recorded VoiceOver cursor state. Do not infer an interception cause, silently reconstruct three modal Tabs, or use heading speech as DOM-focus evidence. After closing, the eventual body focus in the Stop snapshot does not erase the immediately observed opener restoration.

## Scope and disposition

Inspector is implemented in `src/addons/ui/ui.ts` by the optional UI add-on: a plain h2 names the native dialog; `showModal(); close.focus()` establishes initial focus, and Close restores the opener. It belongs to the declared RX-4002 UI flows (AC02). It is optional to core-only consumers. Qualification of that flow does not require a universal account of every browser/AT cursor transition.

This run characterizes initial DOM focus and Close restoration; prior named dialog, readable factual content, Close/Escape and owner keyboard observations remain accepted. The older heading/Close loop and differing initial-focus perceptions remain historical reports with **unknown cause**, rather than an additional release gate. No speculative tabindex, custom Tab trap or production change is justified. No further Inspector repetition is requested.

Original-UI normal-typing speech finding RX-4002-F01 and current input/AT context retain their actual unreported fields. Native peak/copy evidence also remains open. RX-4002 stays Blocked; RX-4003 waits and N5 stays deferred. This evidence-only continuation changes no runtime, tests, public contracts, limits or dependencies. Documentation/reference checks are recorded after synchronization; no new automated speech or full test run is claimed.

Verification: `npm run docs:generate`, `npm run docs:check` (94 local Markdown files), `npm run handoff:check` and `git diff --check` pass. Parent review compares the supplied appshot, independently parsed row sequences, selected summary and package/session identity. Production and test files are unchanged; the previous 616-test passing run retains its historical scope and is not rerun for these evidence-only changes.
