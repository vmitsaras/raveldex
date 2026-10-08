# RX-4002 native facet keyboard continuation

Date: 2026-10-08. Baseline: `071614a`. Bounded observation: **native Guide selection and clearing observed**. Full RX-4002 remains **Blocked**; RX-4003 still waits. All seven acceptance criteria and dependencies are unchanged.

## Observed behavior

The new [focused runner](../../test/qualification/browser-facet-keyboard.mjs) uses the existing nine-record installed-package `/ui` fixture. It submits `red`, traverses all seven literal matches, chooses Guide with native `g`, traverses its five literal matches, then clears from Guide page two. It requires a trusted keydown and native change, selected value/index/label, focus during the change and after rendering, exactly one new completed main query, exact filter/removal, revision 1, offset 0, returned totals and rendered result IDs. Snippet queries are counted separately. No `selectOption`, script assignment or synthetic selection event can earn a Pass.

| Executed route | Playwright WebKit 26.5 | Installed Chrome 155.0.8059.40 |
| --- | --- | --- |
| Guide page two → native `ArrowUp` | **Blocked**: trusted keydown/keyup, no change, main calls 6 → 6 | **Blocked**: trusted keydown/keyup, no change, main calls 6 → 6 |
| Guide page two → recorded 2,000 ms idle → native `a` | **Pass**: measured idle 2,005 ms; trusted change to All; main calls 6 → 7 | **Pass**: measured idle about 2,005.3 ms; trusted change to All; main calls 6 → 7 |

Both passing clears retain select focus, remove the category restriction, return seven results at revision 1 and offset 0, and restore the earlier same-query first page (`gamma`, `long`, `alpha`). Complete paginated memberships are independently specified from fixture text/category facts: red `{alpha, delta, epsilon, gamma, long, quoted, unsafe}`; Guide `{alpha, epsilon, gamma, quoted, unsafe}`. Rendered order is compared to the actual completed main result; this slice makes no new independent scoring claim.

The earlier quick `g` → `a` failure could involve native typeahead state, but its cause is not established. The new result proves the recorded idle-then-`a` route only. ArrowUp remains a concrete unavailable native route in these headless macOS observations, with nonzero exit status. No native runtime defect was found or patched.

## Identities and preservation

Both attempts run serially on Node 24.21.0, Playwright Core 1.61.1, macOS 27.0.1 build 26A434 arm64. Actual launched versions/executables, fixture/bundle/production graph input identities, events and query observations are in the raw reports. Automated WebKit is distinct from installed Safari. Current Chrome 155 is distinct from the historical Chrome 154 matrix; no old row is relabeled with the new version.

| Artifact | SHA-256 |
| --- | --- |
| [ArrowUp raw](RX-4002-facet-keyboard-arrowup.json) | `7248e34ebbf820e7fea76635e13ac62d75d57a18cac5744d574bd22ab4e03257` |
| [Executed ArrowUp source archive](RX-4002-facet-keyboard-arrowup-source.mjs) | `1a2018dc4783049f1a4d22f49095848ed4f986db16f9868359f8057292a5bbbf` |
| [Idle-typeahead raw](RX-4002-facet-keyboard-idle-typeahead.json) | `2556ce8beb797a6042d14a2173ea8d6f9351b3b601d93e50e603a71e0b618988` |
| Final executed runner | `0d20a6dd06f7e91316257eeeb1f3c6ee9cd1c6a9d7d84589cd341331e710d3fb` |
| Both actual local tarballs | `ce770b1e5de67ba4b01644168c44c102d9e869c4715f20c9a929f7f38dcfb524` |

The first executed source is archived before adding the second route, because its source hash differs from the final runner. The archive establishes source identity; its relative imports refer to the original runner location. The ArrowUp report remains unchanged. Each run creates an exclusive new report path, refusing an existing file before browser/package work.

Consumers are `raveldex-core-consumer-PufsvB` (ArrowUp) and `raveldex-core-consumer-3USw2e` (idle typeahead), under the absolute temporary directory recorded in each raw report. The original [broad UI raw](RX-4002-browsers-ui.json) and [accepted matrix](RX-4002-browsers-accepted.json) retain their original bytes and 15 Pass / one Blocked UI / one Blocked browser history. The narrow new record does not supersede the broad UI row or establish a Chrome 155 engine/storage/resource matrix. Original resource/memory measurements and graph/probe artifacts are preserved; none is rerun.

## Verification and reproduction

`npm ci` passed with the existing esbuild install-script allowlist warning ([log](RX-4002-facets-ci.log)). The sandbox baseline reached 490/491 in the first phase, then failed on the existing packaged UI test's localhost `listen EPERM` ([sandbox log](RX-4002-facets-baseline-sandbox.log)). This is an environment failure. The identical approved baseline passed **557/557**, exit 0, zero failed/cancelled/skipped ([baseline log](RX-4002-facets-baseline.log)).

Both executed runner revisions passed `node --check`. The ArrowUp command exited 1 with 0 Pass / 0 Fail / 2 Blocked ([log](RX-4002-facet-keyboard-arrowup.log)); the second command exited 0 with 2 Pass / 0 Fail / 0 Blocked ([log](RX-4002-facet-keyboard-idle-typeahead.log)).

```sh
node test/qualification/browser-facet-keyboard.mjs --browser=webkit,chrome --clear-method=arrowup --report=NEW_ARROWUP_REPORT.json
node test/qualification/browser-facet-keyboard.mjs --browser=webkit,chrome --clear-method=idle-typeahead --report=NEW_TYPEAHEAD_REPORT.json
```

Use a new report path each time. The current ArrowUp route retains the original key sequence, but its runner identity differs from the separately archived first execution. These are native keyboard integration observations, not resource benchmarks. The recorded pause is an input procedure, not a latency or paint measurement.

The independent [probe](RX-4002-facets-review-probe.json) passes three groups, exit 0 ([source](RX-4002-facets-review-probe.mjs), [log](RX-4002-facets-review-probe.log)). A fresh WebKit 26.5 context over the frozen installed UI chooses Reference with native `r`, checks literal IDs `{delta, long}` and a newly completed restricted query, records a 2,004 ms idle without a query, then clears with trusted native `a`. Focus remains on the select and a new unrestricted query returns seven results at revision 1 and offset 0. This uses different selected conditions without rerunning the broad UI or resource matrix.

The probe also verifies 116 baseline JSON/probe files against `071614a`, unchanged criteria/other task states, native source/lock/public metadata, and all 208 production files in both new installed consumers (416 comparisons). Its first static check incorrectly expected the copied worker filename to remain unchanged after the server intentionally replaces it with a bundle. That review-harness assumption was corrected to verify the complete actually executed UI graph. The [failed static log](RX-4002-facets-review-probe-static-first.log) remains preserved; it ran no browser and is not a native failure.

A [fresh final package](RX-4002-facets-package.json) and [static audit](RX-4002-facets-package-audit.json) pass ([package log](RX-4002-facets-package.log), [audit log](RX-4002-facets-package-audit.log)). The final consumer `raveldex-core-consumer-7eQugC` has tarball SHA-256 `6ff6e90128f60af39bb8f47800c61ed83d85d4ded7a8e3c96d2bd34467f9c437`; it includes the updated README. All 208 production files match across seven historical/final install directories, separately from the probe's two focused consumers. Current final README/metadata match; fixed core/minified/gzip identities and guarded startup reads (`[]`) are unchanged. The core remains 16,829 gzip bytes, 1,469 above the unchanged 15 KiB target. These are static package checks, not repeated resource measurements.

Independent [review](RX-4002-facets-review.md): **Ready with follow-ups** for the bounded continuation; **Unable to verify** full RX-4002 while its required observations remain missing. No unresolved native query/render/focus defect was identified. Final approved `npm run check` passes **557/557**, exit 0: 491 package/core/evaluation/memory-method, 15 UI, 24 worker, 26 IndexedDB and one migration-browser scenario, with zero failures/cancellations/skips ([final log](RX-4002-facets-final-check.log)). The runner, probe, fixtures and production sources remain frozen; subsequent reconciliation edits only evidence/docs. `docs:generate`, `handoff:check`, `docs:check` (67 Markdown files), `git diff --check`, [handoff status](RX-4002-facets-handoff-status.log), [next](RX-4002-facets-handoff-next.log) and local-only [tracking preview](RX-4002-facets-tracking-preview.log) pass. The planner reports 19/21 release tasks done, RX-4002 Blocked, RX-4003 waiting, zero ready and all ten N5 tasks deferred. Preview makes no network request.

## Acceptance and remaining work

AC01 gains an actual native WebKit facet-clearing path, with a Chrome 155 control observation. Firefox still has no behavioral package matrix, installed Safari remains unobserved, and the complete browser criterion remains **Blocked**. AC02 speech/AT, AC03 collector/API-release and staging/encode/decode/browser-worker/transport memory, and AC04 actual display/input/IME observations remain **Blocked**. Prior AC05 measured configurations and AC06/AC07 evidence/claim boundaries are unchanged.

No production source, public contracts, package metadata, dependencies, lockfile, limits, scorer/analyzer or release requirements change. The core's unchanged gzip target miss remains visible. No publication, release/tag, push, tracking sync or deferred N5 activation occurs. Next work is a concrete remaining RX-4002 observation; no new release task is dependency-ready.
