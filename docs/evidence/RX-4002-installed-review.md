# RX-4002 installed-browser continuation — Independent review

Date: 2026-10-08. Baseline: `c1897c9`. Reviewer: `qualification_review`, independently assigned from the primary native-app observer. **Ready with follow-ups for this bounded evidence continuation. Unable to verify the full RX-4002 qualification task.**

## Reviewed scope and result

Reviewed the actual task/card, unchanged seven acceptance criteria, verification plan, native UI/worker serve fixtures, production UI focus/error handling, package/graph identities, primary curated action/AX record, preservation inventory and current documentation/planner diff. No native source, public contract, dependency, build setting, analyzer/snapshot qualification policy or defensive limit changed. No release waiver is introduced; RX-4002 remains Blocked and RX-4003 waits.

The primary [native observations](RX-4002-installed-observations.json) describe finite nine-record direct UI and three-record module-worker loss/source recovery through Firefox/Safari apps. Installed Info.plist metadata identifies Firefox 156.0 / 15626.9.9 and Safari 27.0.1 / 22625.1.29.11.28 on macOS 27.0.1 / 26A434. Subsequent primary About observations in the same non-restarted apps report Firefox `156.0 (aarch64)` and Safari `27.0.1 (22625.1.29.11.28)`. Firefox's exact running build remains unknown and its installed build remains separate. Its About dialog offered Restart to update Firefox; that button was not activated. About windows were closed and original tabs restored. No user agent was read. The package report's empty `records` and `browsers` arrays describe serve-only preparation; they are not an automated browser-matrix Pass.

These records are transparent curated transcriptions of actual returned native AX text and actions. They are not exported full trees, DOM/event traces, assertions of trusted events, speech or human/physical observations. I reviewed the Safari primary record without a second Safari replay. The independent runtime surface below is a separate fresh Firefox selection condition.

## Independent native Firefox probe

I owned Firefox exclusively for one new task tab at `http://127.0.0.1:60360/ui`. Actual CUA native actions and returned AX excerpts are in [the independent record](RX-4002-installed-review-observations.json). No developer console, scripted option/value/event assignment or settings change was used.

1. Cmd-T, paste local fixture URL, Return: a second task tab mounted the UI and reported initial 9 results / All.
2. Click labeled search, type `red`, Return: reported **7 results, showing 1–3 / Page 1 of 3**, with links Gamma red, Long content and Atomic alpha; AX reported the query focused.
3. Tab, Tab, `r`: native Category became **Reference (2)**. Reported **2 results, showing 1–2 / Page 1 of 1**, with Long content and Delta only; AX reported Category focused.
4. Up: actual native popup showed All and selected Reference. Up, Return: native Category became All, reported **7 results / Page 1 of 3**, and restored the Gamma/Long/Atomic first-page links; AX reported Category focused.
5. Cmd-W closed only the new task tab. Returned AX restored the original Firefox What's New 156 tab. I released app ownership; the parent later closed the local server cleanly.

The Reference expectation is independently derived from the literal fixture: `delta` and `long` contain red in Reference records. This probes complete two-record membership and visible totals. I did not traverse all red pages in this independent probe, derive BM25 order, read exact main calls/revisions, inspect `Event.isTrusted`, or equate AX focus with DOM `activeElement`. The reported total 7 and restored first page are the observed narrow clearing behavior.

## Package, preservation and contract evidence

Independent read-only Node/crypto/fs checks compared actual bytes, without running package builds or browser/resource workloads. Results are recorded in the independent observation JSON's `staticReview`:

- Actual tarball SHA-256 **`6ff6e90128f60af39bb8f47800c61ed83d85d4ded7a8e3c96d2bd34467f9c437`** matches the [package identity](RX-4002-installed-package.json), primary native report and previous final facet package.
- All **208 installed production files** match current workspace dist and each hash/size in the [primary static audit](RX-4002-installed-audit.json).
- Actual executed UI bundle, all **59 UI graph inputs**, **5 original fixture sources** and CSS match recorded hashes. The graph correctly resolves public installed package imports. The worker staging script deliberately replaces its copied input with the bundle after input hashes are recorded; I do not require that overwritten original-input path to retain its earlier source hash.
- All **156 previously tracked evidence JSON/probe files** equal their recorded SHA and Git baseline `c1897c9` bytes. Historical headless launch/keyboard, accepted matrix, resource/memory and earlier review records are preserved.
- A separate explicit contract audit compares all seven acceptance criteria, dependencies, objective/title/affected paths/specs/verification and every release-task status with the baseline. The evidence list and evidence-dependent blocker text are the authorized changes. The updated blocker still names the unrun full matrix and exact-tool/memory gaps.

The read commands used Node built-ins `fs.readFileSync`, `crypto.createHash('sha256')` and `git show c1897c9:<path>` / scoped `git diff`. The first reviewer harness invocation exceeded Node's default subprocess output buffer while reading `RX-3003-browser-accepted.json` (`ENOBUFS`); the corrected command used `maxBuffer:64*1024*1024`. Its initial fixed-field set then incorrectly included the intentionally updated `blocker`. An explicit final comparison excludes only status/evidence/blocker, separately verifies unchanged statuses, and passes. These are reviewer harness failures, disclosed in the record; there was no product failure or altered input.

## Findings and limitations

No blocking native defect was established in this continuation. The observed post-Retry disabled AX focus matches unchanged source: `ui.ts` keeps Retry mounted once offered; `render.ts` uses `aria-disabled` for focus stability; activation handlers ignore unavailable controls. This is an intentional focus retention mechanism, not evidence of a hidden or removed focused control. Actual DOM focus and speech after recovery were not read and remain a follow-up.

The primary worker termination observation displays the existing generic `INTERNAL_ERROR` UI fallback. Source accepts the core error vocabulary and uses that fallback for transport-specific errors. Actual transport error details and dead-owner disposal results are not observed by this native slice; do not label generic rendering as a newly verified adapter error contract.

| Criterion | Contribution and remaining boundary |
| --- | --- |
| AC01 | Finite installed Firefox/Safari native UI and module-worker observations, plus independent Firefox Reference/All. Later About text supplies running versions and Safari's running build; Firefox's exact running build remains unknown. Full explicit engine/numerical/range, storage and resource matrices in these apps remain Blocked. |
| AC02 | AX text/focus and native actions support the named finite flows; exact-tool spoken query/status/error/facet/Inspector/recovery observations remain Blocked. |
| AC03 | No new retained/peak/transport/process measurement; prior scoped evidence remains preserved and outstanding attribution/isolation stays Blocked. |
| AC04 | Software-driven native input is observed. Physical device/display/input, presentation and actual OS IME outcomes remain Blocked. |
| AC05 | No new 1,000/10,000-record experiment. Earlier admitted configurations retain their existing scope; these installed apps are not promoted by the tiny fixtures. |
| AC06 | Missing exact tools/isolation are explicitly retained, with no proxy substitution. |
| AC07 | Seven criteria unchanged; no narrower release claim or silent waiver. |

The earlier patched Firefox launch failures and automated WebKit 26.5/Chrome facet routes remain historical distinct environments. The new record does not supersede their broad matrix rows, infer the cause of previous native-picker gaps, qualify default basic-v1 across all Unicode, or grant native browser snapshot portability. Tab cleanup establishes restoration of the original page, not a public disposal acknowledgement. Visible focus styling, exhaustive keyboard traversal, zoom/reflow, forced colors, speech and real composition were not independently tested.

## Final reconciliation

The parent's approved baseline `npm run check` closed with **557/557 Pass**, phase counts 491+15+24+26+1 and no failure/cancellation/skip ([log](RX-4002-installed-baseline.log)). The separate final full check also closed exit 0 with **557/557 Pass**, the same phase counts and no failure/cancellation/skip ([final log](RX-4002-installed-final-check.log)). I read both closed logs. These automated regressions are separate from native observations and do not fill their missing matrix/AT/device/resource criteria. Current source/harness/public metadata have no baseline diff. The independent record preserves its earlier static audit digest and separately binds the later About-augmented primary observation SHA and final log; no native replay occurred during reconciliation.

The parent subsequently registered both existing review paths, regenerated documentation and reported passing `handoff:check`, `docs:check` (69 local Markdown files) and whitespace checks. My final light audit verifies all 35 task evidence paths exist, both review paths are registered, all seven criteria/dependencies/fixed contract fields and 21 task statuses remain unchanged from `c1897c9`, and final observation/log digests match. I read the closed handoff status/next and local tracking-preview logs: **19/21 release tasks done, zero ready, RX-4002 Blocked, RX-4003 waiting**. No remote tracking write was made. This final state retains the bounded Ready with follow-ups / full-task Unable to verify verdict.

Independent browser execution is complete and app ownership released. Only this review and its own curated JSON were written by the reviewer. Remaining installed-browser matrix, speech/AT, physical/IME and scoped memory requirements prevent full-task acceptance.
