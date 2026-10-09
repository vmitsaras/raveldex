# RX-4002 — Busy scope announcement comparison

Date: 2026-10-09. Baseline: `bc34353`. Test-only continuation of [the announcement experiment](RX-4002-announcements.md); no production source, public API, dependency, limit or acceptance-criterion change. RX-4002 remains unqualified.

## Human report and hypothesis

The owner now reports: “it is announced but immediatly but interrupted”. The earlier comparison mode was not identified, so this is not attributed to B or C. The owner suspects the parent `aria-busy` transitions and asks to disable busy and try combinations. Safari/macOS and English speech were confirmed in the preceding record; exact VoiceOver version/settings and the mode underlying this new report are still incomplete. No new recording or independently heard speech was observed in this continuation.

[WAI-ARIA 1.2 aria-busy](https://www.w3.org/TR/wai-aria-1.2/#aria-busy) permits a container to defer owned updates until its busy period ends. Applying busy to the whole UI is allowed; applying it only to the changing results is a narrower alternative that leaves input and status outside that grouping. The specification does not establish that a busy transition caused this interruption. This remains a controlled test, not an adopted production policy.

The owner subsequently replied to the explicit B/off listening question: “it always is interrupted by the word announcement if a known word is recognized”. This is an owner-reported interruption persisting with parent busy removed, associated with B/off through the question/reply, without independent browser/URL/audio capture. Exact result utterance, focus on this retest and typing-echo setting were not supplied. It does not establish all-mode behavior or the entire cause. Competing typing feedback is now a candidate; removing shell busy alone did not resolve this reported case. [Apple's typing-echo documentation](https://support.apple.com/guide/voiceover/hear-what-you-type-mchlp2708/mac) confirms configurable spoken typing feedback, but does not prove the owner's exact configuration. Next diagnostic: wait until word speech finishes, then explicitly submit the unchanged query. A separate temporary typing-echo Nothing comparison can isolate feedback, with the original setting recorded and restored; disabling feedback is not an accepted product requirement.

## Fixed-per-page combinations

The existing announcement modes A (`original`), B (`settled-polite`) and C (`settled-assertive`) now each accept a second query parameter:

| `busy` | Search UI shell | Results list | Input and status |
| --- | --- | --- | --- |
| `shell` (default) | Original busy transitions | Original ancestry | Within busy shell |
| `off` | Attribute writes suppressed | No busy attribute | Outside search busy grouping |
| `results` | Attribute writes suppressed | Original requested state redirected to the ordered result list | Outside busy list |

Inspector busy writes remain unchanged. The output node remains external and persistent in B/C, and the package status remains visible. For a fixed announcement mode, changing busy scope changes only where the existing busy writes appear. B versus C still changes only the external channel priority at a fixed busy scope. A versus B changes progress chatter and status location; with whole-shell busy it also changes busy ancestry. Those causes cannot be separated by A/B alone.

The shim is confined to this test page. It intercepts only `setAttribute` busy writes for owned fixture UI shells during known initialization/remount or later operations. Ownership includes the initial connected shell and possible detached construction writes; unrelated nodes and Inspector pass through. Suppression occurs synchronously before the attribute reaches the DOM, not through a later observer. A WeakMap records requested state so terminal publication still waits for the latest settled search, matching same-revision snippets, rendered IDs and status. No artificial timer, focus move, live priority switch, result rerender or engine modification is added. Existing original-status silencing in B/C still uses a MutationObserver, so initial/remount speech silence is not proved.

## Run the next human test

The fresh task-owned server is `http://127.0.0.1:63024`. Start with `/ui-announcements?mode=settled-polite&busy=off`, then the same mode with `busy=results`, then `busy=shell`. Keep VoiceOver settings unchanged. Wait for initialization, type `red` normally, pause five seconds, and record the exact spoken outcome, whether the full count finishes, what interrupts it and whether focus stays on input. If polite remains interrupted, compare `mode=settled-assertive&busy=off` against the same mode with `busy=results` and `busy=shell`. Page links expose all nine combinations without manual DOM editing. Compare one variable at a time; do not label an audible outcome from visible diagnostic text.

Reproduction uses `RAVELDEX_QUALIFICATION_BROWSER_REPORT="$(mktemp -d /tmp/raveldex-announcements-busy.XXXXXX)/package.json" npm run qualify:serve`; the port changes on restart. The actual preparation and hashes are captured in [validation JSON](RX-4002-announcements-busy-validation.json). The same production tarball is installed and all 208 production files match fresh workspace output. The temporary raw preparation report has no human/browser scenario outcomes; the durable validation file retains its identity, environment and hashes rather than duplicating its complete unchanged graph metadata. Earlier reports and servers are preserved.

## Verification and review

The ordinary sandbox focused attempt failed localhost setup with `listen EPERM`; the approved run could bind and launch Chrome. The first browser run had 4 Pass and 3 timeouts caused by a real test-harness ownership defect: it assumed initial busy writes used a detached shell, while production inserts the shell before execution. Independent review identified this; the predicate now accepts the connected fixture shell during known mount calls. This is distinct from both the sandbox failure and the human speech failure.

The repaired focused command `node --test --test-timeout=120000 test/ui/announcements-browser.test.mjs` passes **7/7** on headless installed Chrome 155.0.8059.40, with zero failed/cancelled/skipped. The tests exercise all nine presentations and six nondefault held-call/remount/error/retry combinations, no transient shell busy mutations, requested-state gates, input focus, unrelated branded nodes and Inspector writes, plus original stale/composition/lifecycle regressions and invalid parameters. A subsequent wording correction qualifies the A/B ancestry claim. The full current-source `npm run check` closed with exit 0: **584/584 Pass** (511 package/core/tooling, 22 UI, 24 worker, 26 IndexedDB, one migration browser), zero failed/cancelled/skipped. Its announcement bundle hash matches the live human fixture. Direct output is [the check log](RX-4002-announcements-busy-check.log); the validation JSON records all phase counts, log hash, 208 matching production files, 191 preserved prior JSON/evidence-MJS artifacts, unchanged criteria/dependencies and 30 other tasks.

[Independent review](RX-4002-announcements-busy-review.md) is **Ready with follow-ups** for the bounded comparison, with no remaining blocking source finding. It independently reconciles the closed 584-test log, final live bundle, four graphs and preserved artifacts. B/off now has the owner-reported interrupted outcome above; results-only, other combinations and diagnostic outcomes remain pending. Complete AT flows, physical display/input/OS IME and scoped memory remain unqualified; RX-4003 waits and N5 remains deferred. No accepted resource workload was repeated.
