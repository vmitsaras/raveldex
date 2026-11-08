# RX-9106 independent keyboard review

7 November 2026. Parent owned all changes. Read-only subagent `rx9106_keyboard_audit` traced actual dropdown/modal key handling and reviewed the resulting source, CSS, contracts and test diff. No suites, benchmarks, external mutations or nested delegation were performed by the reviewer.

Guidance matches the implementation: dropdown Arrow Up/Down selects virtually; Enter on a selection activates its native anchor while Enter without selection submits the form; Escape dismisses results and Tab moves normally. Modal has no custom Escape key handler, so text acknowledges native search-field clearing and identifies Close search as reliable. Existing shortcut eligibility remains opt-in and excludes editing/composition/handled or invalid modifier events.

Hints use safe captured strings and unique input-description IDs outside live status. Hints-off leaves no dangling references; shortcut descriptions appear only when enabled. The optional dropdown field preserves old complete bundles. The named bounded footer is deliberately focusable to make long text keyboard-scrollable without a line clamp; initial/editing/settlement focus and close restoration stay unchanged.

The concrete CSS finding was an outward footer focus outline that could be clipped by the dialog's overflow boundary. An inset `outline-offset: -3px` fixed it before the accepted build. The reviewer reread the correction and tests, including plain-native Escape comparison, unique references, native accessible descriptions, hostile/translatable capture, opt-in behavior and long footer scrolling, and found no remaining actionable source/test issue.

Parent review includes the actual diff, installed browser results and desktop/narrow/short RTL captures. Browser/native-AX evidence does not establish human speech, physical IME or actual browser zoom. Those limitations remain explicit.
