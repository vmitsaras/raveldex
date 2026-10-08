# RX-4002 native facet continuation — independent review

Date: 2026-10-08. Reviewer: delegated qualification-review agent, separate from the observer implementer. Baseline: `071614a`.

**Bounded continuation: Ready with follow-ups. Full RX-4002: Unable to verify.** The exact automated idle/typeahead path is observed and independently reproduced. ArrowUp and the historical broad UI row retain their Blocked outcomes. No accepted query/rendering/focus defect or native runtime change was identified. Outstanding exact-tool, browser/device and memory observations still block the full task.

## Reviewed evidence and native observations

I inspected the task's seven original criteria, verification plan, optional UI/query/facet contracts, actual UI sources, test fixture, historical raw/aggregate, both new runner revisions and raw reports. I compared actual returned queries, membership, events, focus and rendering with expectations; the implementer's narrative was not the oracle.

The primary observer executes the installed nine-record direct UI. Its complete paginated red membership is `{alpha, delta, epsilon, gamma, long, quoted, unsafe}`; Guide membership is `{alpha, epsilon, gamma, quoted, unsafe}`. These literal fixture facts are checked separately from score/order claims. The three red pages and two Guide pages contain exactly those sets. Every rendered page matches the completed main result at revision 1. Selection and clearing each require one additional completed main call, with snippets counted separately.

The [ArrowUp report](RX-4002-facet-keyboard-arrowup.json) records **0 Pass / 0 Fail / 2 Blocked**, exit 1: both WebKit 26.5 and Chrome 155.0.8059.40 preserve focused trusted ArrowUp keydown/keyup but no native change and no new query (main calls 6 → 6). Guide page two, status, selected value/index and focus remain unchanged. This supports an unavailable automated route, not a demonstrated Raveldex engine defect.

The [idle-typeahead report](RX-4002-facet-keyboard-idle-typeahead.json) records **2 Pass / 0 Fail / 0 Blocked**, exit 0: after measured idle 2,005 ms in WebKit and about 2,005.3 ms in Chrome, trusted `a` produces a native change to All. Main calls advance 6 → 7. The completed query removes the category predicate, returns seven results at revision 1/offset 0, restores the earlier same-query first page and retains focused selection. The observer first traverses Guide page two, so clearing demonstrably resets paging. Tab/Shift+Tab focus navigation, actual option values/index/labels, event identity, query/filter and completed results are preserved in raw snapshots.

The failed quick typeahead and ArrowUp routes do not establish a cause. The recorded idle/typeahead procedure is an observed route; its pause is not a latency, responsiveness or paint measurement.

## Independent browser probe

Executed the review-owned [probe](RX-4002-facets-review-probe.mjs), with approved localhost/browser access:

```sh
node docs/evidence/RX-4002-facets-review-probe.mjs --primary=docs/evidence/RX-4002-facet-keyboard-idle-typeahead.json
```

The [raw independent record](RX-4002-facets-review-probe.json) and [execution log](RX-4002-facets-review-probe.log) report **Pass, three groups, exit 0**. This is a fresh headless WebKit 26.5 context and separate localhost origin over the exact executed UI bundle/CSS, without packing, installing or rebuilding a consumer. It uses different selected conditions:

- Starts from the second red page, then native `r` chooses Reference.
- A new completed main query is exactly red AND category = Reference, total 2 with literal IDs `{delta, long}`, offset 0 and retained select focus. The raw native event initially selects value `1`/index 2; the UI subsequently remaps the same logical Reference selection to value `0`/index 1 when rendering its conjunctive options. Those states are kept distinct.
- Tab/Shift+Tab returns focus to the select. Measured idle is 2,004 ms, with no new query.
- Native `a` produces a trusted change to empty value/index 0. A distinct completed bare-red query returns seven results at offset 0 and renders `gamma, long, alpha`, with select focus retained.
- A separate public read verifies all seven literal red IDs. Two native change events are trusted; native `r` and `a` keydowns and change-time focus are captured. The probe does not use option selection, value assignment or event dispatch to perform a selection. Browser page errors and cleanup errors are absent.

The probe's expected Reference/red memberships come from the literal fixture, not the production analyzer, ranking implementation or the primary observer's expectations. Rendered order is compared with actual completed hits; this slice supplies no new independent scorer claim.

## Preservation and package identity

The probe byte-compares **116 baseline JSON/probe files** with `071614a` and rechecks their hashes after the browser run. All original criteria and other task states remain unchanged. Production source, lockfile and public package metadata/dependencies are unchanged. The historical accepted matrix remains 15 Pass / one Blocked broad UI / one Blocked browser, and its native WebKit clear remains Blocked.

All **208 production files in each of the two new consumers** match the earlier measured hashes and current build bytes, including complete file inventories (416 comparisons). Every input of the actually executed UI graph, source fixture identities, CSS, tarball and browser version is independently checked. The ArrowUp source archive matches its recorded execution hash; the final runner matches the idle-typeahead execution hash.

I additionally ran read-only assertions over both primary raw reports and the fresh package/static audit: native event/query/focus/paging invariants and literal full memberships agree. All **208 production files across seven legacy/final installed directories** match their hashes, sizes and current bytes (1,456 further comparisons). The fresh installed package metadata/README/license and tarball/core/gzip byte identities match the repository/report. The fixed core remains 16,829 gzip bytes against 15,360; the target miss is retained. Startup reads are empty in the fresh package report; the reviewer did not repeat that startup experiment.

The primary consumer tarballs precede the README evidence-link update and retain their separate identity. The fresh final tarball is `6ff6e90128f60af39bb8f47800c61ed83d85d4ded7a8e3c96d2bd34467f9c437`. Static runtime equality connects those records without relabeling old observations as a new broad matrix.

## Findings and verification boundaries

| Finding | Classification | Outcome |
| --- | --- | --- |
| The historical settle helper could accept old busy/status text; its fallback clear was an untrusted `selectOption` change. | Historical harness/evidence limitation | Preserved. The new observer requires a new trusted change and an additional completed main query; it does not supersede the old broad row. |
| Cleanup errors or a Blocked route could initially retain a passing outcome/zero exit. | New observer harness defect found by the parent before execution | Final executed source records cleanup failure as Fail and returns nonzero for Blocked/Fail. Actual successful raw reports contain no cleanup/page/harness errors. |
| The independent probe initially checked all unexecuted copied graph inputs against current consumer paths, including the intentionally overwritten worker source. | Independent review-harness assumption defect | Failed before browser/server launch. [First failure](RX-4002-facets-review-probe-static-first.log) explicitly copies the original tool output. Corrected probe checks every input of the executed UI graph; the 416 production comparisons remain intact. No native or primary source changed. |
| Typeahead causation, installed Safari, actual AT/human input and broader Chrome 155 behavior are unobserved. | Observation boundary | Remain explicit; no cause, browser identity or criterion waiver inferred. |

Current documentation correctly identifies automated WebKit separately from Safari and Chrome 155 separately from the historical Chrome 154 matrix. The new report kind/scope is narrow; the old accepted aggregate is unchanged. All new evidence paths are added only after actual artifacts exist.

AC01 gains this finite WebKit native-control observation while its Firefox/Safari scope remains incomplete. AC02 exact AT, AC03 collector/API-release/peak/browser-worker memory and AC04 physical display/input remain Blocked. Prior AC05 configurations and AC06/AC07 requirements/claim boundaries are preserved. RX-4003 still waits and N5 remains deferred.

Final approved `npm run check` returned exit 0 (confirmed by the parent). I inspected the closed [log](RX-4002-facets-final-check.log): **557/557**, phase counts 491 + 15 + 24 + 26 + 1, with zero failed/cancelled/skipped/todo. Log SHA-256 is `348a38376de3394df184b309059848ccc814d984d41310ee55c21a208d2fa165`. The full check began against frozen code before this review path was added; final documentation/reference reconciliation followed separately. I did not replay the native/browser suite.

I independently ran `npm run handoff:check`, `npm run docs:check` and `git diff --check`; all passed. Generated files match the manifest and 67 local Markdown files have valid local targets. All 28 task evidence paths exist. RX-4002 remains Blocked; its dependencies/seven criteria and every other task state match `071614a`, with RX-4003 still waiting. Final light assertions reconfirm all 116 preserved hashes, frozen primary/probe source identities and unchanged production source/lockfile. No additional browser, probe or resource execution was used for this reconciliation.
