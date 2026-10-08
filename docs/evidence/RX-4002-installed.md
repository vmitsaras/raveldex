# RX-4002 — Installed Firefox and Safari continuation

Date: 2026-10-08. Baseline: `c1897c9`. Scope: one bounded native-app observation of the existing nine-record direct `/ui` fixture and three-record `/worker` fixture. Both routes use one actual offline-installed local tarball. Production sources, public contracts, dependencies, limits and analyzer/snapshot qualification policy are unchanged. RX-4002 remains **Blocked**; RX-4003 still waits.

## Environment and method

The owner opened Firefox and Safari. Codex selected `org.mozilla.firefox` and `com.apple.Safari` through `mcp__cua_repl.js`, opened separate task tabs, and used native keyboard input and accessibility-element clicks. Each action was followed by an actual AX state observation. This is software-driven installed-app interaction, not a human, speech, physical-input or display observation.

Native About dialogs in the same non-restarted apps confirm Firefox **156.0 (aarch64)** and Safari **27.0.1 (22625.1.29.11.28)** on macOS **27.0.1 / 26A434**. Info.plist additionally reports Firefox installed build `15626.9.9`; Firefox About does not identify an exact running build, so that metadata is kept separate. About showed Restart to update Firefox; no restart/update button was activated. Both About windows were closed and the original tabs restored. These app identities differ from the earlier patched Firefox cache revisions and automated WebKit 26.5. No browser settings, security protections, default-browser choices or AT settings were changed, and no update/download action was invoked. A stale Safari app binding rejected the first navigation attempt before input; refreshing `getApp` allowed the same navigation and subsequent flows.

The [package identity](RX-4002-installed-package.json) records origin `http://127.0.0.1:60360`, consumer `/private/var/folders/m4/7qvldjl917j4nwbkw7bxmn_m0000gn/T/raveldex-core-consumer-jrcPml`, source/graph identities and local tarball SHA-256 `6ff6e90128f60af39bb8f47800c61ed83d85d4ded7a8e3c96d2bd34467f9c437`. Its empty `records`/`browsers` arrays reflect **serve-only preparation**, not an automated matrix run. Actual native observations are in the separate [curated action/AX record](RX-4002-installed-observations.json). That record transcribes selected returned AX excerpts; it is not an exported full tree, DOM trace or automatic assertion report.

The [static audit](RX-4002-installed-audit.json) verifies the actual tarball digest, parsed installed metadata, all **208 installed production files** against the freshly built workspace, all served bundle/CSS hashes and original fixture sources. The tarball is byte-identical to the previous final facet package. This supplies package identity, not new cost measurements or browser scenario results. The [preservation inventory](RX-4002-installed-preservation.json) binds all 156 previously tracked evidence JSON/probe files to the baseline; none is superseded by this continuation.

## Actual bounded observations

| Flow | Firefox | Safari | Observed outcome and scope |
| --- | --- | --- | --- |
| Initial direct UI and red pagination | Pass | Pass | Initial 9 results. `red` displays 7 over pages 1–3: `gamma,long,alpha`; `epsilon,delta,quoted`; `unsafe`. This is complete literal fixture membership, not a new scoring qualification. Hostile titles/snippets appeared as literal AX text; no script-execution sentinel was inspected. |
| Native Guide selection and All clearing | Pass | Pass | Native `g` selects Guide: 5 over two pages (`gamma,alpha,epsilon`; `quoted,unsafe`). Opened native popup plus Up/Return clears from Guide page two, restoring red7/page1 and reported Category focus. Firefox additionally checked filter selection from red page three resets to Guide page one. No scripted option/value/event assignment was used. |
| Blue and Inspector | Pass | Pass | `blue` displays Beta1. Inspector displays revision1/one selected document and `raveldex-bm25-v1`; Close is reported focused. Escape closes it and restores reported focus to Inspect results. AX truncates the factual JSON; complete facts/arithmetic were not reverified. |
| Deliberately injected error and keyboard Retry | Pass | Pass | `WORK_LIMIT_EXCEEDED` is displayed. Firefox Tab×3 and Safari Option-Tab×3 reach Retry; Return restores Beta1. After success AX reports the disabled Retry control as focused. The existing UI intentionally keeps Retry mounted and uses `aria-disabled` to retain focus; no post-Retry focus transfer is claimed. |
| Empty query outcome | Pass | Pass | `unmatchedword` displays No results; the query remains editable. |
| Destroy and Remount | Pass | Pass | Destroy restores Authored fallback/documentation link. Remount returns labeled search/Category and initial9 results over the same borrowed engine. Public disposal or original-node identity was not inspected in this native observation. |
| Three-record module-worker loss/recovery | Pass | Pass | `red` displays Gamma/Alpha2. Terminate then `blue` displays the existing generic UI `INTERNAL_ERROR`, with no loaded page. Explicit source recovery displays a new-worker message and initial3; subsequent `blue` displays Beta1. Actual transport error details and dead-owner disposal outcomes were not read; the generic UI vocabulary remains disclosed. |

Firefox used ordinary Tab traversal for the observed controls. Safari's existing plain Tab path skipped the Search button and reached Category; Option-Tab reached Search and Retry. Pointer/AX clicks were used for other actions and Safari pagination. Neither browser receives an exhaustive keyboard-flow, visible-focus-style, zoom/reflow, forced-colors, composition, speech or physical-presentation pass from this slice. Task UI/worker tabs were closed and the owner's original Firefox What's New and Safari Start Page were restored. Closing a tab is not evidence of a completed public disposal acknowledgement.

The native popup path is distinct from the preserved headless ArrowUp attempts and idle-typeahead continuation. No cause of the earlier automation gap is inferred. The historical accepted matrix remains unchanged; these observations are not merged into its broad rows.

## Acceptance and remaining work

AC01 gains finite installed Firefox/Safari UI and module-worker observations; **full browser qualification remains Blocked**. Their explicit engine semantics, direct/worker parity, original-range/numerical, IndexedDB and relevant 1,000/10,000-record matrix are not run here. AC02 speech/AT, AC03 scoped retained/peak/component memory and AC04 physical device/display/input/real IME remain Blocked. Existing AC05 results remain scoped to the previously measured configurations. AC06 preserves unavailable observations, and AC07 has no amendment or narrower release waiver. All seven criteria and dependencies are unchanged.

The working native apps make further installed-browser observations possible. Next work is completing those missing matrix observations and the named exact-tool/physical/memory gaps; opening browsers alone does not complete RX-4002.

## Commands and review

`npm ci` passed ([log](RX-4002-installed-ci.log)), with the unchanged esbuild install-script warning. The approved baseline `npm run check` passed **557/557**, with no failures/cancellations/skips ([log](RX-4002-installed-baseline.log)). The localhost fixture was started after that check completed:

```sh
RAVELDEX_QUALIFICATION_BROWSER_REPORT=docs/evidence/RX-4002-installed-package.json node scripts/qualify-browsers.mjs --serve
```

The output printed the actual origin, both routes, installed directory and tarball hash. All native UI actions ran against these routes; neither `/` engine scenarios nor a developer console was used. The task-owned serve process stopped by SIGINT with exit0 after the observation tabs were closed. No new qualification resource/memory workload, original heap dump collection/reanalysis, patched-Firefox launch retry, remote tracking write, push, publication, release or deferred N5 task was performed.

The independent reviewer ran one fresh native Firefox `red` → Reference → All probe: Reference displayed the complete two-record Long/Delta membership; clearing restored red7/page1 with reported Category focus. Its [curated observation record](RX-4002-installed-review-observations.json) and [review](RX-4002-installed-review.md) independently bind package/assets, original evidence and unchanged contract fields. Verdict: **Ready with follow-ups** for this bounded continuation; full RX-4002 is **Unable to verify / Blocked**.

The final approved `npm run check` closed with **557/557 Pass** (491+15+24+26+1), zero failures/cancellations/skips ([log](RX-4002-installed-final-check.log)). It ran after initial evidence/planner synchronization over unchanged source/fixtures. Only documentation, version-observation metadata and actual review references were reconciled while it ran or afterward; final lightweight planner/docs/whitespace checks validate that last state. [Handoff status](RX-4002-installed-handoff-status.log), [next](RX-4002-installed-handoff-next.log) and local-only [tracking preview](RX-4002-installed-tracking-preview.log) retain 19/21 release tasks done, zero ready, RX-4002 Blocked and RX-4003 waiting. No new public contract exists in this slice.
