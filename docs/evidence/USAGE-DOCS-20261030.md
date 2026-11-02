# Usage documentation and demo rewrite — 2026-10-30

Status: **implemented and locally verified**. Publication, remote CI and repository settings were not changed. This documentation slice does not change the 31 completed roadmap tasks.

## What changed

Public navigation is Getting started → Guides → API → Examples → Live demo. The home page starts with a working core example and links to concrete integration tasks. README, API/package guides and example READMEs describe installation, records, queries, optional modules, UI/CSS, cleanup and recovery rather than task completion or qualification history.

The site no longer renders release-scope/publication-status/changelog or implementation-contract pages. Existing support, release, history, specifications and evidence records remain intact. Source/Jekyll exclusions and the safe generated-file ownership mechanism are retained. No `.nojekyll`, dependency, package export, version or private-guard change was introduced.

The ordinary browser example and Pages demo now use a separate **36-section, five-guide** corpus: getting started, core, add-ons, hosts and Astro. Search comes before Advanced demo settings. Visible hashes and historical qualification commentary are removed; the page explains sample searches, category filtering, Inspector, keyboard behavior and the developer copy path. The existing qualification runner still uses its original 34-section contract corpus and independent expectations. Only UI-copy assertions and opening the new settings disclosure changed in those tests.

A minimal `ui.mjs` recipe creates a searchable record and UI with separate CSS and explicit cleanup, without storage. The Astro guide includes a complete shared content module, Node builder, Astro configuration and browser loader. The existing Astro fixture's copy/install/build/preview/stop procedure remains runnable at both `/` and `/docs/`.

## Verification

Environment: Node **24.21.0**, npm **12.2.0**, Darwin arm64, Astro **7.3.2**, Chrome **156.0.8078.74**. Native Safari version **27.0.1 (22625.1.29.11.28)** was read from About Safari. Browser/localhost operations used the necessary execution permissions.

| Command or method | Actual result |
| --- | --- |
| `npm ci --cache /tmp/raveldex-docs-npm-cache --no-audit --no-fund` | Pass. Existing npm install-hook approval settings were preserved. |
| `npm run check` | **868/868 Pass**, batches 784 + 30 + 24 + 26 + 1 + 3; zero failures/cancellations/skips/TODOs. Includes the unchanged qualification corpus/oracles and two new usage-corpus extraction tests. Later Astro code-example completion and prose whitespace cleanup received focused checks below. |
| `node --test --test-concurrency=1 test/pages/browser.test.mjs test/pages/ui-example.test.mjs` | **2/2 Pass** on closed output, in separate `verified-browser` logs. The real demo agrees with the independent source evaluator for three sample queries. All 36 section heading destinations exist; navigation/refresh, facets, pagination, direct/worker/source/offset phrase parity, Inspector focus, empty recovery, destroy/remount, same-origin requests and zero page/request errors passed. |
| Exact minimal UI markup/JS/CSS copied from the installed package | Pass: `atomic` finds Atomic updates; CSS loads, search retains input focus, cleanup removes UI and the disposed engine rejects. The final check used core artifact `e58d02aa…`. |
| Source-checkout/installation/English/Astro walkthrough | Pass: exact current shell/code fences were executed in fresh consumers. Source compilation and three local packs require no browser qualification command. Core and English examples produced their expected IDs; actual Astro root and `/docs/` builds/previews passed atomic search, draft exclusion, injected error/retry, navigation, fallback/unload and root-scoped preview stop. |
| Four Astro guide JavaScript blocks executed together | Pass: shared `search-content.mjs`, Node builder, genuine Astro hook and browser loader were copied as documented. One source record loaded at `/docs/`, the result URL served a real page and UI/owned-engine cleanup completed. |
| `npm run pilot:ui -- --no-serve --output NEW_DIRECTORY` | Pass: the ordinary command prepares the new 36-section usage demo and its real installed-package assets. |
| Two final `npm run pages:generate` runs and manifest `cmp` | Pass: identical output and input identities. |
| `npm run pages:check` | Pass: **29 HTML pages, 427 links/fragments, 44 public files / 624,784 bytes**. Required local targets/anchors resolve, obsolete owned routes are removed and unknown publication inputs remain refused. |
| Actual Jekyll **3.10.0** `build --safe` in isolated tooling | Pass: exactly those 44 public files, byte-for-byte equal to the approved inventory. No source/evidence/history/planning/configuration/manifest files enter the Jekyll output. This is a local Jekyll-core check, not GitHub's complete hosted runtime or a live deployment. |
| Responsive interaction and visual review | Pass at **320, 390, 768, 1024 and 1280 CSS pixels**. Search, navigation, code and horizontally scrollable reference tables remain within the page width. Screenshots were inspected separately. |
| Actual Safari 200% page zoom through Computer Use | The page-menu value was explicitly observed as **200%**. Home/navigation reflow, advanced disclosure, `module worker` search (one result), Inspector opening on Close and Escape returning to Inspect results were observed. Normal zoom was restored afterwards. This is automated native-app observation, not human speech, physical keyboard/IME or broad Safari qualification. |
| Fresh `candidate-check.mjs --output NEW_DIRECTORY` | Pass for final README/API payloads, declarations/imports and existing private-candidate guards. All packaged Markdown equals its current corresponding source. |
| Preservation audit | **988 existing protected records** retain their original sizes/mtimes; closed October 30 artifact hashes also match. Runtime/specifications/provenance/frozen fixtures/roadmap and package metadata are unchanged. Production tar members remain byte-identical: core 280, English 2, Astro 12. |
| Final `docs:check`, `handoff:status`, `git diff --check` | Pass; all 31 tasks still done. |

The public-text audit excludes code samples and checks for dated owner reports, task IDs, CI identities and historical measurement prose; no findings remain in rendered pages. Real API concepts such as revision, original match evidence and native qualification are retained.

## Final identities

| Item | SHA-256 |
| --- | --- |
| Generated inventory | `17c886ff691cebe3be475958a99a6e144022f2aebc3c51a8390a2089547148b7` |
| New usage corpus | `4f997d5bba719ae37e41ff20d73fde326e0b13f84585c1a5d0015cd54fa540e1` |
| Preserved qualification corpus | `267ec0eeb44c09bb3e24cf8a8e71cd90a73441d16f406a891c73f8f8603fdded` |
| Core `0.1.0-rc.0`, 230,342 bytes / 315 members | `e58d02aaacf8cda01480d5a1198e03cd2e789fb86c2e6552d59adf2db1245a37` |
| English `0.1.0-rc.0`, 4,927 bytes / 5 members | `4f3a94f3a3502ab183cdff5cc2ecdd3b51647e7b8ff4976494c080635f8e4171` |
| Astro `0.1.0-rc.0`, 14,231 bytes / 15 members | `56ff2a1318153478d85e0c632288b1298a450b0f31d8e3a4fd3f7439f2f4aae3` |

The [machine record](USAGE-DOCS-20261030.json) identifies the [raw verification archive](USAGE-DOCS-20261030-raw.tar.gz), reports, source snapshots, package artifacts and final generated output. It excludes installed dependencies, caches and credentials.

## Failures, review and limits

- An overlapping browser run exceeded its 120-second test limit. A concurrent successful run shared its output filename, making that combined log unsuitable as acceptance evidence. The cause of the timeout was not established. Acceptance uses a subsequent isolated sequential run in new `verified-browser` files: 2/2 Pass in about 48 seconds. The harness now prevents a cancelled/timed-out run from recording a false Pass.
- Diff review found trailing prose whitespace and a missing shared-content definition in the new Astro copy path. Whitespace was corrected; all four completed Astro blocks were then executed together successfully.
- The exact source-checkout `npm ci` command reported one low-severity development-tooling advisory. No dependency or approval policy was changed as part of this documentation task; the raw command output is retained.
- Review was a separate author review pass with independent source-oracle comparisons and installed consumers, not attributed to another reviewer.

No new human screen-reader, physical-input, memory/transport-peak or universal-browser claim is made. No remote CI or hosted deployment was run. Earlier Pages eligibility/hosted-checkout-duration limitations remain in the separate Pages preparation record. Changes remain uncommitted; nothing was pushed, tagged, published or deployed.
