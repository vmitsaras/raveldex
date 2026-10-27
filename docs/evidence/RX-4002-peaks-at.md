# RX-4002 buffer/peak capability and remaining AT continuation — 2026-10-26

This continuation adds a calibrated [native allocation capability result](RX-4002-memory-peak-capability.md) and opt-in DOM focus observation over the original packed UI controller. It makes **no production UI or announcement-policy change**. Current normal-typing speech and Inspector's exact initial DOM focus still await a new owner observation; previously accepted flows remain accepted.

## Focus observation and provenance

`test/qualification/browser-focus.mjs` imports the original `browser-ui-driver.mjs`, which mounts the same installed nine-record UI with its existing 35ms fixture debounce. `/ui` retains its original bundle and markup. Separate `/ui-focus` adds explicit Start/Stop controls and a non-live, stopped JSON output. Its recording indicator and trace have no live-region role; it never cancels events, focuses nodes, changes `tabindex`, intercepts Tab or edits busy/live policy. Extra controls outside the root and observer overhead are disclosed instrumentation differences, so its observations are not silently substituted for the original `/ui` speech test.

Recording captures root click, selected navigation-key and focus events, plus later-task DOM activeElement/status snapshots. The body boundary while the native dialog is open is included: a native Tab transition may temporarily leave activeElement at body, and filtering only root targets would omit the next key. A capture-phase keydown is explicitly **before** native traversal. Deferred task samples follow dispatch but do not prove focus causality or VoiceOver cursor position. Event metadata, including `defaultPrevented`, is copied at capture time in both row kinds; only the `current` snapshot is freshly read in the later task. It does not claim the final default-prevention state. Output remains on the page; no trace POST or storage write is implemented. It records bounded test-query/status text (256 code units each, original length retained), up to 300 rows, dropped-row/deferred-sample counts and cancellations. Stop/restart cancels pending timers. Trusted flags do not establish human or physical input.

The [manual package identity](RX-4002-focus-package.json) binds fresh origin **http://127.0.0.1:49158**, the exact source/bundle inputs and manifest/session IDs. Package SHA-256 is unchanged: `6ff6e90128f60af39bb8f47800c61ed83d85d4ded7a8e3c96d2bd34467f9c437`. All original UI graph inputs match their observer-bundle equivalents. The ordinary UI bundle is not replaced by the focus bundle. Server command:

```sh
RAVELDEX_QUALIFICATION_BROWSER_REPORT=/tmp/raveldex-peaks-at-manual-package.json node scripts/qualify-browsers.mjs --serve
```

This temporary server URL is usable only while its task-owned process runs. Verify availability before reuse. Read-only application metadata returns Safari **27.0.1 (22625.1.29.11.28)**, macOS **27.0.1 (26A434)** and VoiceOver Utility **10 (993)**. This is version metadata, not current speech-setting or actual speech evidence. Native Computer inspection observes the original `/ui` ready in a new Safari tab, with All selected and nine initial results; no query, preference or zoom change is made. The unrelated existing demo tab remains intact.

## Actual verification and failure classification

- `npm ci`: Pass; [log](RX-4002-peaks-at-ci.log). Existing esbuild install-script warning is retained; dependencies and lockfile are unchanged.
- Initial focus tests: [preserved log](RX-4002-focus-initial.log). Three checks pass; one times out because the root-only observer misses modal body-boundary keydown. The test process is interrupted while finishing. This is a **test-instrumentation defect**, not a production or AT failure.
- Corrected focused run: **4/4 Pass**, zero failures/cancellations/skips; [log](RX-4002-focus-focused.log). It checks opt-in isolation/original policy, trusted automated activation with pre-default versus later-task focus, heading without tabindex, local trace caps/truncation/cancelled callbacks, frozen stopped output and fail-closed identity setup with usable original search. Native headless Chrome **156.0.8078.48** supplies DOM support only; no screen-reader speech or physical input is inferred.

Full project check, final independent review and durable identity checks are recorded below after integration.

## Next owner observations

1. **Original `/ui`, normal typing only.** On http://127.0.0.1:49158/ui keep current VoiceOver settings unchanged, All selected, type `red` normally without Return, then pause five seconds. Report literal status speech, whether the whole count completes or is interrupted, and focus. Preserve earlier High/settings-unknown failures and later Medium success. No assertive/busy/tabindex production change is inferred. A minimal isolated speech probe remains conditional on continued interruption.
2. **Inspector DOM/VoiceOver distinction, once the first observation is supplied.** Open http://127.0.0.1:49158/ui-focus, start recording, settle `red`, activate Inspect results and report initial speech, then press plain Tab three times. Close and stop the trace for inspection. The requested new observation is opening/Tab characterization, not a repeat qualification of accepted content reading or Close/Escape restoration. Record actual DOM nodes separately from owner-perceived focus/spoken heading.

No new outcome is inferred before the owner performs these checks. Current keyboard/trackpad and VoiceOver setting clarification from the completed German dead-key run remains pending; 400% zoom, battery and Automatic mode retain their confirmed scope. No further dead-key repeat, input-source installation, universal IME/SR gate, or new implementation task is created. RX-4002 stays Blocked and RX-4003 waits.

The [parent identity audit](RX-4002-peaks-at-identity.json) and [audit source](RX-4002-peaks-at-identity.mjs) reconstruct all 16 archive members, match all 208 current production files to the recorded installed consumer, match all 59 original UI graph inputs inside the observation bundle and preserve six prior reports byte-for-byte against commit `448cb80`. Source and dependency files are unchanged against that basis. Reproduction needs that temporary consumer and fails if it is absent. An initial parent-audit command used a nonexistent `memory-collection-v1.json` path and stopped without an output report; the corrected actual frozen path is `memory-collection.json`. No measurement was rerun to repair this inventory error.

## Integrated verification and review

`npm run check` passes **616/616** with zero failures/cancellations/skips: 535 package/core/tooling/memory-method, 30 UI, 24 worker, 26 IndexedDB and one migration-browser scenario; [complete log](RX-4002-peaks-at-check.log). No runtime/test source changed after that run began. Later evidence links/prose were checked with `npm run docs:generate`, `npm run docs:check`, `npm run handoff:check` and `git diff --check`. Local `tracking:preview` succeeds without a network write. [Planner status](RX-4002-peaks-at-status.log) and [next selection](RX-4002-peaks-at-next.log) preserve 19/21 release tasks done, RX-4002 Blocked, RX-4003 waiting and ten optional tasks deferred.

The [independent review](RX-4002-peaks-at-review.md) finds no unresolved blocking implementation/evidence issue in this bounded continuation. It verifies original archive bytes and raw-derived control results, checks focus instrumentation/cleanup and preserves owner versus DOM evidence. Accepted resource matrices, prior frozen reports, production/API/dependency/limit contracts and prior human outcomes remain unchanged. Peaks remain an explicit observability gap, not a failed public operation or waived criterion. Current actual AT speech/Inspector characterization remains pending; broad automated success does not fill it.

Final approved loopback check confirms `/ui` returns HTTP 200 while the task-owned server runs. A sandbox-only connectivity attempt could not reach the same live server and is not a product/server failure. The old port 53366 is separately confirmed unavailable with approved access. No package publication, release/tag, push, remote tracking sync or N5 activation occurred.

## Subsequent Inspector observation — 2026-10-27

The [new stopped trace](RX-4002-inspector-focus-20261027.md) at port 63447 observes Close Inspector initial DOM focus and Inspect results restoration, and the owner confirms tabbing to Close. This supersedes further requests for Inspector opening/three-Tab characterization. Captured modal Tab events and literal speech are absent, so their cause/output is unestablished; they are not an added acceptance gate. Do not repeat accepted Inspector flows. F01 normal typing/current context and scoped peak evidence remain open.

## Subsequent original-UI normal typing — 2026-10-27

The owner now reports the complete “7 results. Showing 1–3.” without interruption, matching visible status and retained input focus on the identified original `/ui` procedure, explicitly confirming Medium/Words. The [bounded observation](RX-4002-normal-typing-20261027.md) resolves F01's retest-identity gap and records its scoped disposition while preserving historical interruptions and unknown cause. This supersedes the pending normal-typing request above. No further typing/Inspector repeat or automatic isolated speech probe is required by this success. Native allocation/transport peaks and outstanding physical-session context remain Blocked independently; no production, criterion or public-contract change.
