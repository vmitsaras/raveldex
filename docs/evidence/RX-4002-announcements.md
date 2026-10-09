# RX-4002 — Owner-reported announcement failure and controlled comparison

Date: 2026-10-09. Baseline: `7aded86`. This bounded continuation records a real owner-reported announcement problem and prepares a test-only comparison. RX-4002 remains unqualified; RX-4003 still waits. No production source, public API, dependency, limit or acceptance criterion changes.

## Report and recording

The owner reports that normal query typing leaves the result announcement suppressed by VoiceOver's text-field hint, while slow typing with a space sometimes speaks the count. Focus remains on the input. They subsequently report that manually setting `aria-live="assertive"` on the status makes “7 results. Showing 1–3.” speak properly. This is a concrete reported failure of the proposed AT experience; a passing DOM assertion cannot overrule it.

The owner confirms Safari **27.0.1 (22625.1.29.11.28)**, macOS **27.0.1 (26A434)** and **English speech**. Exact VoiceOver version, verbosity, Quick Nav, hint timing, keyboard navigation, display/input and power settings remain unknown. The fixture URL and timing of the assertive edit relative to the clip have not been confirmed.

The supplied local WebM is 8,702,637 bytes, 72.138695 seconds, VP9 3456×2234 with one 48 kHz mono Opus stream. SHA-256: `51345def6ed430d9b83abcb7642d6a83bff07a6ca03679d6f5faa75bbec6ab8b`. It stays in the owner's Downloads; raw desktop media is not copied into the repository. The [observation JSON](RX-4002-announcement-observations.json) records metadata, the actual sampling command, selected caption/visible-state observations and limitations.

The parent inspected twelve sampled frames. Safari and the correct visible seven-result count coexist with a caption reading “You are currently on a text field. To enter text in this field, type.” Another frame shows “Searching...” while the completed count is visible. Guide selection and paging also appear, including a dimmed Next-page hint. Later `blu` has the Guide filter retained, so its empty result is not classified as a retrieval defect. The model's audio-forwarding attempt explicitly returned unsupported audio input; caption text is not presented as independently heard speech or a continuous transcript. The assertive DOM edit is owner-reported, not independently proved by these samples.

## Source-grounded diagnosis

The package already creates a persistent `role="status"` with `aria-atomic="true"`. On input it writes Waiting, execution writes Searching while the enclosing UI is busy, and completion writes the final count before the enclosing busy flag is released. The nine-record fixture selects a 35 ms debounce. Speech priority, competing updates and busy coalescing are plausible contributing mechanisms, not established causes.

[WAI-ARIA live-region guidance](https://www.w3.org/TR/wai-aria-1.2/#aria-live) permits polite announcements to wait for an opportunity and explains that assertive updates may interrupt or clear queued speech. [WCAG status-message guidance](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) uses search counts as ordinary status examples and cautions against unnecessary interruptions. The existing busy grouping is permitted. The owner's successful assertive experiment is evidence for investigation, not grounds to make every Waiting/Searching update assertive.

Focusable `aria-disabled` controls are a separate deliberate focus-retention mechanism with activation guards. The sampled dimmed hint supplements the earlier owner concern but does not establish every control's physical activation behavior. This continuation does not alter that policy.

## Controlled experiment

The installed nine-record fixture now provides `/ui-announcements` and three fixed-per-page modes:

| Mode | Test-only policy | What the comparison can establish |
| --- | --- | --- |
| A — `original` | Unchanged package status stream and busy grouping. | Baseline under the same human settings. |
| B — `settled-polite` | Separate persistent polite announcement outside the busy UI; final/empty/error outcomes only. Existing progress remains visible. | Whether the combined quieter/external candidate improves the experience. It does not isolate chatter from ancestry. |
| C — `settled-assertive` | Identical to B except assertive priority. | B versus C isolates the priority of that experimental channel. |

Mode selection reloads the fixture; no live priority switching or focus move forces speech. The diagnostic trace records DOM/search facts only, caps its history at 200 rows and identifies the mount/main-call generation. Results publish only after the newest nonaborted main/snippet operations finish at one revision, matching the rendered IDs/text with busy released. Errors use the current settled-error presentation gate because injection can throw before a call completes. Identical text from a new submission is a new publication; stale replies and interim composition are excluded. The persistent root observer follows remounts. It silences the original status through a MutationObserver, so no guarantee about initial mount/remount speech follows from DOM tests. The comparison is application-owned instrumentation over the unchanged public package, not an accepted UI fix or public option.

The actual local session serves `http://127.0.0.1:60631`; B is `/ui-announcements?mode=settled-polite`. Its [package preparation record](RX-4002-announcements-package.json) binds the same production tarball SHA-256 `6ff6e90128f60af39bb8f47800c61ed83d85d4ded7a8e3c96d2bd34467f9c437` and comparison bundle SHA-256 `24655edba97f6a2cba0e048835f98dd67fe1a4a900dba5ef844cea44d37f9d16`. All 208 installed production files match the workspace after the fresh build. Preparation-only empty scenario arrays are not human outcomes. The task-owned server remains available for the guided listening session; the owner's earlier server is left alone.

Reproduction uses a fresh package-report destination to preserve earlier artifacts:

```sh
RAVELDEX_QUALIFICATION_BROWSER_REPORT="$(mktemp -d /tmp/raveldex-announcements.XXXXXX)/package.json" npm run qualify:serve
```

Open the printed origin followed by `/ui-announcements?mode=settled-polite`; its links select A and C. The port is chosen anew on each start.

Human procedure: wait for readiness, use the same settings in each mode, type `red` at ordinary speed, pause for five seconds, and record actual speech and usable input focus. Then compare explicit Return, a Guide change/page, empty results and injected error/retry as needed. Preserve failures and interruptions. Do not infer heard speech from the trace.

## Verification and review

The delegated focused command `node --test --test-timeout=120000 test/ui/announcements-browser.test.mjs` passed **4/4** on actual installed headless Chrome 155.0.8059.40, with zero failed/cancelled/skipped. It covers fixed policies and exact result presentation, terminal output outside busy, stale replies, synthetic composition, repeated same-text submissions, bounded trace, empty/error/retry, destroy/remount and invalid-mode rejection. The ordinary sandbox attempt failed its shared setup with localhost `listen EPERM`; the unchanged approved run passed. That setup restriction is separate from the owner-reported AT failure.

The parent's approved full `npm run check` closed with exit 0: **581/581 Pass** (511 package/core/tooling, 19 UI, 24 worker, 26 IndexedDB and one migration-browser test), zero failed/cancelled/skipped. The [direct check log](RX-4002-announcements-check.log) and [final validation JSON](RX-4002-announcements-validation.json) preserve the phase counts, source/package bindings, all 208 production-file comparisons, 188 unchanged prior JSON/evidence-MJS artifacts and unchanged seven criteria/dependencies/30 other task objects.

The [independent review](RX-4002-announcements-review.md) is **Ready with follow-ups** for the bounded fixture and **Blocked / pending** for actual candidate speech and full RX-4002. No blocking source defect was found. Its static checks independently compare the focused and live consumers, source/graph/package identities, preserved evidence and unchanged contracts. No repeated native resource workload or AT-setting change occurred. These DOM/lifecycle checks cannot qualify speech; production behavior is unchanged. The next work is the owner's controlled B/C listening result, then the remaining complete AT, physical input/IME and scoped-memory observations.
