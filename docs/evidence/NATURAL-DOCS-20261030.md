# Plain-language documentation — 2026-10-30

Status: **Pass — local documentation preparation**. No publication or remote write was performed. Work remains uncommitted on top of the existing documentation/site changes at `87fb5c3`.

## Change and review

Rewrote 30 public source files: the website's authored pages, root README, API guides, package READMEs, example instructions and browser-demo explanations. Short paragraphs explain the task before the API details. Lists describe choices and behavior; procedures use numbered steps. Examples now state their prerequisites, how to run them and what output or interface to expect. Query/options fragments are explicitly identified as fragments.

The separate editorial/diff review checked every public Markdown code block and both demo code blocks. All **43 fenced code blocks**, **two HTML demo code blocks** and existing headings remain unchanged. Navigation, route inventory, CSS, runtime APIs, commands, production code, tests, package metadata and the 31 completed roadmap states are unchanged. No test assertions were relaxed or rewritten.

The usage demo's indexed text intentionally changes with the five rewritten guides. It still has **36 sections**. The frozen qualification corpus remains **34 sections**, SHA-256 `267ec0eeb44c09bb3e24cf8a8e71cd90a73441d16f406a891c73f8f8603fdded`.

## Environment

- macOS 27.0.1, build 26A434; Darwin/arm64; Node 24.21.0, npm 12.2.0.
- Automated Chrome 156.0.8078.74 with the locked Playwright/esbuild/Astro toolchain.
- Native Safari 27.0.1 (22625.1.29.11.28), read from About Safari.
- Ruby 2.6.10p210 and isolated Jekyll 3.10.0 from the preceding local Pages preparation. No new gems or dependencies were installed.

## Verification

| Check | Actual result |
| --- | --- |
| Locked dependency installation | `npm ci --offline --cache /tmp/raveldex-docs-npm-cache`: 193 packages installed. Offline audit metadata reported zero vulnerabilities; this is not a fresh registry security assessment. Existing script-approval warnings were preserved. |
| Full repository and package check | `npm run candidate:prepare -- --output /tmp/raveldex-natural-docs-20261030/candidate-local`: **Pass**. The underlying `npm run check` passed **868/868** tests, in batches 784 + 30 + 24 + 26 + 1 + 3, with no failures, cancellations, skips or TODOs. |
| Installed package documentation | Candidate verification ran the unchanged README example and the packaged core, add-on, snapshot, migration, browser/storage and worker recipes against the real local tarball. |
| Exact installation and Astro walkthroughs | The task-local `follow.mjs` executed the current documented shell fences and copied README/getting-started/English code in fresh applications. Both Astro root and `/docs/` builds/previews passed: three indexed records, one atomic result, draft exclusion, injected failure/retry, fallback restoration, unload, result navigation and project-scoped server stop. Five observations passed. Only placeholder artifact paths were substituted; offline mode was supplied through the environment. |
| Individual examples and fragments | `blocks.mjs`: nine exact standalone add-on examples, four query/options fragments with the stated setup, and the separate Astro README builder produced their described results. Eleven grouped observations passed. |
| Copied Astro guide | `astro-snippets.mjs` executed all four JavaScript blocks together: shared content, Node builder, real Astro hook and browser loader/UI. One result, correct `/docs/` URL and cleanup passed. |
| Minimal copied UI | `test/pages/ui-example.test.mjs` installed a fresh core tarball, copied the installed guide's HTML/JavaScript and UI recipe, bundled the public CSS and verified one Atomic updates result, retained input focus and disposal. |
| Site generation | Two `npm run pages:generate` runs produced byte-identical generated manifests. Route inventory is unchanged. |
| Site links and inventory | `npm run pages:check`: **29 HTML pages, 431 local links/fragments, 44 public files, 650,802 bytes**. |
| Real Pages-compatible exclusions | `jekyll build --safe` over the actual `docs/` directory produced exactly the approved 44 public files, with byte-identical contents. No evidence, history, planning, source, configuration or ownership-manifest file entered that output. |
| Site browser checks | `RAVELDEX_PAGES_REPORT=.../pages-browser.json node --test --test-concurrency=1 test/pages/browser.test.mjs test/pages/ui-example.test.mjs`: **2/2 Pass**. Sample-query destinations and first-page results matched the independent evaluator. All 36 full-guide anchors resolve. Navigation/refresh, empty recovery, filters, pagination, phrase/source/offset/worker parity, Inspector and destroy/reinitialize passed without page/request errors. |
| Layout and keyboard | Browser checks covered 320, 390, 768, 1024 and 1280 px. The additional `layout.mjs` verified actual DOM scrolling within overflowing code/table containers without page-level horizontal scroll, plus a visible focus outline and retained input focus. Eleven observations passed; screenshots were inspected. These widths are viewport emulation. |
| Actual browser zoom | Agent-operated native Safari Page Menu explicitly showed **200%**. Homepage/navigation reflow, the getting-started example/explanations and the demo remained usable. Searching module worker returned One-owner module worker with input focus retained. Inspector focused Close Inspector; Escape returned focus to Inspect results. Command-0 restored normal zoom. This is separate from viewport emulation and is not human AT evidence. |

## Artifact identity and preservation

| Artifact | Bytes / members | SHA-256 |
| --- | --- | --- |
| Core | 234,727 / 315 | `a36d16db008451147939cebf8196dcb4444f89342e998cfe446b65ebbf629648` |
| English | 5,089 / 5 | `ec81da5e1a1ae8d1356a2eef533e2c656382558ffdd685225fcd04ede5daf6e4` |
| Astro | 14,784 / 15 | `daa0d682473b061d3b6e17e79bd41133eeb8ec0e4234be15342c9067a8d2496f` |

Core/English/Astro production members (**280 / 2 / 12**) are byte-identical to the preceding usage-docs artifacts. Package members, metadata, versions, private guards and exports are unchanged; current packaged Markdown matches its source. Packaged `.mjs` recipes are unchanged. All three packages remain private `0.1.0-rc.0`.

Generated-manifest SHA-256: `634ef500132b3d399ee05ca28e232572222d21a8478257436b9750582a4c183a`. Usage-corpus SHA-256: `daad81964095e2bd40cac46077d7f0924b3cd1c90e74c29a510a0aabb29c1161`.

The preservation audit checked size/mtime for **979 existing maintainer records**, with SHA-256 also checked for each record under 2 MB. All remain unchanged. Existing source, test and metadata hashes were checked separately. Prior evidence was neither rewritten nor used as proof of the new prose/package bytes.

## Environment failures and limits

The first `npm ci` used an empty task cache and failed with `ENOTFOUND registry.npmjs.org`. The successful retry used the existing locked offline cache. No dependency or script-approval policy was changed.

The first candidate-preparation run could not bind two browser-test servers to `127.0.0.1` (`listen EPERM`). That run failed and packed no candidate. The complete unchanged suite subsequently passed with loopback permission. Both attempts are retained; the permission failure is environment evidence, not an engine defect or a skipped acceptance check.

This record covers local preparation. It does not establish hosted GitHub Pages behavior, remote CI for these uncommitted bytes, publication readiness, universal browser/AT support, new human screen-reader observations or performance improvements. No public contract changed.

## Records

[Structured results](NATURAL-DOCS-20261030.json) and the [raw verification archive](NATURAL-DOCS-20261030-raw.tar.gz) retain commands, environments, successes, failed attempts, original/current source snapshots, reports, package artifacts, comparisons, screenshots and Jekyll output. The structured results record the archive's final size, member count and hash. The task scratch directory is `/tmp/raveldex-natural-docs-20261030`; it is not required to read the durable record.

The local preview is <http://127.0.0.1:58172/raveldex/> and serves only the approved public inventory. The separate documentation tab was left open in Safari; no original user tab was replaced.
