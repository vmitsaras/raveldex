# RX-4002 — Real German DE dead-key composition

Date: 2026-10-26. Status: **Pass for this bounded OS composition path; RX-4002 remains Blocked.** No production code, public contract, dependency, acceptance criterion or release claim changes.

## Provenance and scope

Immediately before this test the owner confirmed current “german DE”, then replied “done” to the guided physical sequence: `caf`, tap/release the separate acute-accent key, pause, tap `e`, settle and stop. Native Computer inspection found the newer stopped `/ui-input` trace starting at `2026-10-26T13:34:20.505Z` and current `café` / Category All / one **Long content** result. Safari's User-Agent identifies version 27.0.1. The fixture's [served identity](RX-4002-input-package.json) records macOS 27.0.1 (26A434), Node 24.21.0 and the unchanged installed package SHA-256 `6ff6e90128f60af39bb8f47800c61ed83d85d4ded7a8e3c96d2bd34467f9c437`.

The [64-row projection](RX-4002-dead-key.json) preserves selected fields from every stopped trace row read through native Safari accessibility. It is not the original raw JSON: exact event timestamps, full focus hooks/selection offsets and original text-length metadata are omitted. The declared column schema and row order are preserved. A noncryptographic transfer-error check agrees between the Computer-runtime row projection and the saved rows; it is not authentication or a raw-trace hash. Package/session/manifest identities match the served fixture. The Input source used label is still blank: German DE is owner-attributed through the immediately preceding source confirmation and guided completion, not programmatic layout detection. Input text/settings were not edited or synthesized during inspection.

## Actual behavior

| Observation | Result |
| --- | --- |
| Trace completeness within the page's cap | 64 contiguous rows, zero dropped rows: 19 capture, 19 bubble, 16 presentation, eight search calls, Start and Stop. |
| Real composition | Trusted compositionstart/update/end and composing beforeinput/input events are present; `Dead` key data corroborates the guided physical action. Trust flags alone are not the physical provenance. |
| Pending text | `insertCompositionText` produces `caf´`; `deleteCompositionText` removes pending text; `insertFromComposition` produces `café` while `isComposing` is still true; compositionend follows. |
| Pre-commit suppression | Sequence 31 at 4150ms through sequence 53 at 4878ms spans 728ms. Call count remains eight; no main or snippet search call occurs during this interval. |
| Final query/result | One `café` main call at sequence 58 / 4914ms, then snippets at sequence 60 / 4915ms. Final presentation at sequence 61 / 4981ms is “1 results. Showing 1–1.”. Separate current AX identifies Long content. |
| DOM focus | Recorded entry/composition/final-result snapshots keep focus on the input. Much later, focusout at 14341ms and Stop at 14496ms record body; no focus defect or VoiceOver cursor position is inferred. |

The requested pause was two seconds; the observed composition interval is **728ms**, not two seconds. It is longer than the unchanged 35ms UI debounce and directly demonstrates withheld calls in this finite interval. Earlier `c`, `ca` and `caf` searches occur before composition begins and are not labeled suppressed. The first completed-text main call is 36ms after compositionend in the instrumented browser clock; these values do not measure physical latency/paint or promise timing on other hosts.

## Verification and review

The parent parsed the complete selected trace in the Computer runtime, computed event/call counts and boundaries, checked the saved projection against the source transfer check, and reconciled actual current AX text. Independent read-only review separately recomputed the row/event counts, 728ms interval, unchanged call count and post-end query order. It found no structural inconsistency and concluded **Pass for this bounded German DE dead-key composition path**, resolving the former no-real-composition-observation gap for this run.

This documentation/evidence update runs `docs:generate`, `docs:check`, `handoff:check` and whitespace validation. No runtime source changed and no full test suite or accepted resource workload is rerun. The preceding instrumentation slice's 591/591 regression result remains separately attributed to [its run](RX-4002-input.md).

## Remaining boundaries and next observation

There is no Enter/form submission during composition, cancellation, alternate composing input method, other-browser composition or new spoken-announcement observation. The owner subsequently confirms **400% Safari zoom, on battery, Automatic power mode**, reporting “power mode: automatic, on battery. 400% confirmed,  voice over 'accute prime'”. The VoiceOver phrase “accute prime” is preserved literally; its timing/target is not explicitly bound, and it is not substituted for heard result-status speech. Current physical keyboard/trackpad and VoiceOver verbosity/typing-feedback settings are not confirmed by that reply; old context is not silently rebound. These limits do not undo the observed automatic-query dead-key behavior and do not qualify every OS IME. The earlier [long-press replacement run](RX-4002-input.md#owner-confirms-accent-picker-method--2026-10-26) remains a separate accepted result with no composition interval.

No repetition of this typing test is requested. The later owner reply binds zoom/power context; input-hardware and current VoiceOver settings remain separate, without another typing repeat. F01, exact Inspector initial DOM focus and scoped exclusive/peak/browser-worker memory remain open; RX-4003 waits and N5 stays deferred.
