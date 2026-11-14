# Build and preview the documentation site

The intended publishing source is **GitHub Pages → Deploy from a branch → main → /docs**. The generated site uses `/raveldex/`; there is no custom domain or Pages deployment workflow. Building or previewing does not publish anything.

## Local workflow

### Contextual shell contract (RX-9901)

`pages.mjs` remains the only public route/content registry. Its existing
`[source, route, title]` tuple prefix is unchanged; the fourth member adds
`section`, `group`, `parent`, `label` and optional `outline: false` metadata.
`navigation.mjs` derives exact current-page links, section selection, contextual
siblings/selected-family starters and breadcrumbs from those entries. Never infer
page identity by a URL prefix. The four primary destinations are Get started,
Examples, Documentation and API reference; Developer Workbench stays a secondary
documentation link at `/demo/`. Keep all existing public routes and heading IDs.

`Layout.astro` keeps `frontmatter`, `wide`, the default content slot and the `head`
slot. The optional `before-content` and `after-content` slots sit inside the one
main landmark, after its breadcrumb. Markdown receives the explicit public route
through generated frontmatter (including `404.html`) and Astro's actual `headings`;
four or more level-two headings opt into an outline unless explicitly disabled.
The outline hides below 90rem; below 64rem the same section navigation becomes a
native labeled disclosure. Desktop summary hiding requires successful module
enhancement, so a no-JS disclosure closed at a small width can still reopen after
resizing. `shell.mjs` enhances only its responsive open state,
preserves focused links during resizing and removes/rebinds its media listener
across pagehide/bfcache restoration. Without JavaScript, the initially open native
disclosure remains fully operable. Markdown tables/code blocks are keyboard
scrollable using Astro 7's existing Sätteri HTML visitor, without a second parser.

The exact `tailwindcss`/`@tailwindcss/vite` 4.3.5 development tools run only in the
scratch Astro/Vite build (Astro 7.3.2, locked Vite 8.3.5). `styles.css` imports
theme/utilities with the `rx:` prefix, omits Preflight and disables automatic
scanning; only the explicitly named `Layout.astro` source is scanned initially.
Add future site templates deliberately, with matching build copies/input hashes.
Astro publishes compiled, hashed CSS; do not copy unprocessed Tailwind directives
to public output. `--site-ink`, `--site-muted`, `--site-link`, `--site-line`,
`--site-paper`, `--site-wash` and `--site-lime` are site-owned tokens on `.site`.
Prose remains system sans-serif with a 76ch reading column and scrollable code and
tables. These tokens/tools are not a package or starter customization API.

Run `node --test test/tooling/pages.test.mjs test/pages/docs-shell.test.mjs test/pages/site-search.test.mjs`
after generation, plus `npm run pages:check`. Tests exercise actual no-JS/keyboard
navigation, long labels, 320px layout, modal styles and iframe isolation. Tailwind
v4's documented browser baseline applies to the site tooling; it does not change
the library's browser contract. See the [scoped RX-9901 evidence](../docs/evidence/RX-9901.md)
for exact identities, renders, source boundaries and unrun human qualification.

### Existing consumer examples and search

All five galleries opt into `ExampleShowcase`/`StarterSetup` with `pilot`
after the owner approved the RX-9904 gallery/Inline candidate. Directory keeps
Browser/Astro projects; rich results and Dropdown offer Browser only. An embedded
modal stays inside its iframe; the full preview demonstrates whole-window
dialog/focus/section navigation. `DemoPreview` renders one persistent Browser
iframe and an independent Code view; native pressed buttons switch views without
replacing the frame. Installation platform and Code project are separate native
selects. Astro instructions never relabel or rebuild the Browser preview.
Without enhancement, every applicable source project and setup variant remains
readable through ordinary disclosures/links.

The scratch builder creates `starter-code.mjs` from the explicit `STARTERS`
allowlists, then filters by the selected page family. SVG source is highlighted
as literal XML, never embedded as an image. `CodePanel` uses Astro's existing
Code/Shiki renderer with its high-contrast light theme; a transformer restores
its omitted final newline and fails the build on other text drift. Copy uses the
same escaped literal text, without filenames or highlighting. Clipboard
denial/unavailability leaves a manual-selection instruction. Select source
creates and focuses an exact readonly field, including the final newline that
browser range selection omits. Fragment navigation reveals the selected project
before scrolling. `example-controls.mjs` owns removable site UI listeners;
pagehide aborts listeners and suppresses late clipboard feedback, and persisted
pageshow rebinds once. It never owns an engine or rewrites preview markup.

The builder explicitly copies/hashes these components and the controller, keeping
consumer CSS, downloaded source and package inputs separate. Run the RX-9903
selection in `test/pages/docs-example-flow.test.mjs`, `inline-starter.test.mjs`,
`solutions-qualification.test.mjs` and `site-search.test.mjs` after generation,
plus the complete site suite and `pages:check`. Keep real Browser/Astro fixture
verification distinct from human AT, physical input/zoom and owner approval.

`Examples.astro` owns the overview at `/examples/`. Five inert local PNG snapshots
show the real Browser starters; they add no iframe, search owner or remote image
service. `solutions.mjs` supplies presentation names/use cases, while `STARTERS`
alone supplies the eight real platform/project mappings, sources and archives.
`SolutionCard.astro` renders ordinary links that also work without JavaScript.
The compact comparison and supporting sections retain all four legacy section
anchors and the overview's `#examples` anchor. Core-only recipes and the
Developer Workbench remain secondary destinations.

The explicit `SOURCE_ALIASES` registry maps `examples/README.md` links to that
same overview without duplicating a public route. The Markdown remains the fuller
repository comparison. The builder validates aliases against registered public
destinations, copies/hashes each gallery component and all five thumbnails, and
the strict preview serves allowlisted PNGs as `image/png`. Do not replace this
with an asset directory glob. The thumbnails in `site/images/examples/` were
captured from the unchanged generated starters; source/build/browser identities,
queries and result IDs are in the [RX-9902 capture record](../docs/evidence/RX-9902/baseline/inventory.json).
When a starter's visible interface changes, deliberately recapture and review its
snapshot with the task's [capture script](../docs/evidence/RX-9902/capture.mjs).
After generation, run `node --test test/pages/docs-gallery.test.mjs test/pages/solutions-qualification.test.mjs test/tooling/pages.test.mjs`
and `npm run pages:check`. These check truthful choices, exact destinations,
source alias, no-JS/keyboard navigation, narrow/forced-colors layouts and the
request inventory separately from the unchanged lazy header search.

The five consumer galleries share `ExampleShowcase.astro`: a short introduction,
family navigation and the real installed live preview come before setup details.
Full-page previews remain ordinary links. All eight standalone starter projects
carry their own matching theme CSS, so downloaded source and embedded previews
have the same appearance without an external demo stylesheet. Keep public theme
properties effective when refining controls; the existing computed CSS recipe
checks verify that customization still works.

The Search Workbench design is authored in `Home.astro`, `Demo.astro`, the shared `SearchWorkbench.astro`, `Layout.astro`, `styles.css` and `workbench.css`. `pages.mjs` owns their public routes. Edit the Astro sources to change the homepage. The complete core example is still taken from README's executable quick-start block.

Home embeds the unchanged installed inline browser starter: try `walking guide`,
filter by topic and follow a real guide. Its five-interface chooser leads to the
complete galleries. The Workbench lives at `demo/` for exploring guide queries,
Inspector and advanced source/worker settings. The homepage no longer initializes
that engineering demo. Preview browse links and the chooser work without JavaScript.

The Workbench defaults to final-word prefix search: earlier words are exact, and the final word expands from two normalized Unicode code points. Shorter endings remain exact. Advanced settings also offer exact-word and strict-phrase modes. The frozen qualification pilot and integrations omitting the UI `mode` retain exact-word search.

The shared header now uses the installed `mountRaveldexModal` component for real
documentation search. **Search docs** or Ctrl/Command+K opens it; editable fields
keep their shortcuts. The explicit five-guide corpus loads on first open, is
checked against the bundle's build hash, and retains original indexed text and
native results. Category labels and overview text are separate display content.
`search.mjs`, `search-controller.mjs` and `search.css` own the site integration
and theme; the package owns modal focus, queries and rendering. Loading is
cancellable, retry is explicit, ready reopens reuse the index, and pagehide
destroys the borrowed UI before disposing the owner. No-JavaScript/unsupported
dialog hosts retain a guide link. The advanced Workbench remains a secondary
documentation/footer link at `demo/`.

The generator bundles against the same isolated installed tarball used by the
Workbench, serves explicit assets under `site-assets/search/`, and records every
source input. After generating a new asset inventory, restart an existing
`pages:preview` process before testing it. Run
`node --test test/pages/site-search.test.mjs` for native-oracle results, headings,
first-open/retry/cancellation, focus/reopen, narrow layouts and scoped axe checks.

Use Node 24 and npm in a source checkout. The pinned Astro toolchain renders the explicit public source list in [pages.mjs](pages.mjs). The browser demo is bundled from a real locally packed/installed core package. No registry release is needed.

```sh
npm ci
npm run pages:build
npm run pages:check
npm run pages:preview
```

Open `http://127.0.0.1:4174/raveldex/`. Use `npm run pages:preview -- --port 4175` if the default port is occupied. Ctrl+C stops only that preview. Read a guide, open the browser demo, search `module worker`, follow the result to its usage guide, expand Advanced demo settings and compare direct/worker execution.

`pages:build` compiles package output, then generates the site. `pages:generate` reuses existing compiler output; run it only after a successful package build. `pages:check` verifies generated/source identities, local links/fragments and the publishable inventory. Source changes require regeneration. Package `build` and `prepack` remain separate from site generation.

For Astro integration onboarding, follow [the existing fixture walkthrough](../examples/astro/README.md). It includes matching core and Astro packages, isolated installation, root and `/docs/` builds/previews and cleanup. The documentation site does not turn that qualification fixture into a production starter.

For complete consumer integrations, use the [inline solution gallery](Inline.astro) and its [browser](../examples/inline-browser/README.md) and [Astro](../examples/inline-astro/README.md) starters. The gallery runs an unchanged browser starter built against a fresh installed core tarball. `starters.mjs` explicitly lists every source; the generator exposes text copies, escaped Astro source views and complete exact source archives under `example-files/`. Astro source must use an escaped view because Jekyll would parse its frontmatter header; public file names also avoid Jekyll's reserved leading underscores. It reuses only the pinned esbuild tool for the preview build. No recursive repository copy or change to the Workbench corpus is involved. Run `node --test test/pages/inline-starter.test.mjs` after regenerating to check the gallery, exact downloads and live preview.

The [documentation modal gallery](Modal.astro) provides complete [browser](../examples/modal-browser/README.md) and [Astro](../examples/modal-astro/README.md) projects. Its installed browser preview loads on first open and links previews to actual generated heading IDs. The same explicit source/archive inventory covers both modal starters. Run `node --test test/pages/modal-starter.test.mjs` after regeneration for the modal preview, no-JavaScript browsing and exact downloads.

The [compact header gallery](Dropdown.astro) adds one complete [plain-browser starter](../examples/dropdown-browser/README.md). Its installed preview shares one owner between the header and its real inline full-results route on each page; an explicitly enabled modal button uses that same owner. The default does not open a modal. The explicit inventory also publishes its twelve source files and complete archive. After regeneration, run `node --test test/pages/dropdown-starter.test.mjs` for actual navigation, exact downloads and narrow layouts. Its copied root/subdirectory setup and data/CSS edits are covered by `test/consumer/dropdown-browser-starter.test.mjs`. The header is title/link-only and needs native Popover; it does not select snippet/section/facet providers.

The galleries link to one another and explain the selected data/providers, local package availability and a reproducible CSS edit/build/preview check. Run `node --test test/pages/solutions-qualification.test.mjs` for the inline/modal CSS recipes and `node --test test/pages/dropdown-starter.test.mjs` for the header recipe: computed style changes must retain actual result IDs/counts and keyboard focus. The full site regression command is `node --test --test-concurrency=1 test/pages/*.test.mjs`. For the optional installed modal check in an already available Playwright WebKit engine, run `RAVELDEX_MODAL_STARTER_ENGINE=webkit node --test --test-concurrency=1 test/consumer/modal-browser-starter.test.mjs test/consumer/modal-astro-starter.test.mjs` after the root build. The normal test selection remains Chrome; this opt-in neither downloads browsers nor qualifies Safari. First-wave qualification records exact source/tool identities, graph/output measurements and remaining manual scope separately; scripted input, emulated viewports and automated accessibility checks do not establish physical input, human AT, actual zoom or hosted deployment.

## Preserve repository-only records

Existing `docs/` source, evidence, history and planning paths remain intact. Only files in `docs/_pages-manifest.json` are owned by the generator. It refuses unexpected files, symlinks and edited generated output; inspect a refusal rather than deleting the existing tree or overwriting human edits. Scratch builds live under ignored `.tmp/pages/`.

The preview serves only the verified public inventory. Do not substitute a server that exposes the whole `docs/` directory: it also contains repository-only records.

`docs/_config.yml` is required to exclude every original source/maintainer directory when GitHub publishes from the branch. **Never add `.nojekyll`** or an overriding Jekyll `include`: that would bypass this boundary. The local inventory check is deliberately strict, but is not itself a Jekyll build. Before activation, verify an actual Pages-compatible Jekyll build in isolated tooling and inspect its final output. Record unavailable tooling as Blocked.

The generated HTML has no front matter; GitHub's Jekyll stage passes it through as static files. Its only required transformation is excluding non-public records. No theme, custom plugins, Ruby application or server runtime is shipped. See [GitHub's Jekyll configuration](https://docs.github.com/en/pages/setting-up-a-github-pages-site-with-jekyll/about-github-pages-and-jekyll).

For the site's browser regression check, use the same installed Chrome or configured Chromium prerequisite as the package checks, then run `node --test test/pages/browser.test.mjs`. The check starts and stops its own preview, exercises direct/worker search and local links, and records finite DOM behavior rather than human screen-reader or physical-input qualification.

Run `node --test test/pages/workbench.test.mjs` for homepage oracle agreement, sample-query keyboard behavior, initialization failure/retry, no-JavaScript navigation, viewport reflow, forced colors, reduced motion and automated axe checks. Set `RAVELDEX_WORKBENCH_SCREENSHOTS` to an output directory to capture desktop/mobile screenshots. These checks do not establish human AT, physical IME, actual browser zoom or hosted deployment qualification. The [design contract](../docs/specs/SITE_WORKBENCH.md) and N6 task records own the accepted scope and evidence.

## One-time repository settings and later activation

After local review, a maintainer with an eligible GitHub plan selects **Settings → Pages → Build and deployment → Deploy from a branch → main → /docs**, then saves. The expected project address is `https://vmitsaras.github.io/raveldex/`; it is a target address, not a claim that the site is live. Publishing from a private personal repository requires a plan supporting private-repository Pages. Do not change repository visibility to work around missing eligibility.

Commit the generated files with the site sources when explicitly authorized; changing the branch publishing folder requires regenerating first. Do not push or enable Pages merely to run local verification. No packages, tags or releases are created by this workflow.

The source repository is already larger than GitHub's recommended 1 GB repository size. The public file inventory excludes roughly 6.7 GB of raw evidence; nevertheless, GitHub build/checkout duration must be observed during eventual activation. Published output must remain below 1 GB and deployments below ten minutes. See [Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).


The [directory gallery](Directory.astro) adds complete [browser](../examples/directory-browser/README.md) and [Astro](../examples/directory-astro/README.md) resource projects. Both reuse the nonvisual controller and explicit URL binding, with separate DOM/CSS entry points, native checkboxes/chips/pages and a mobile details disclosure. Exact allowlists/archive/source views use the existing starter registry; the installed browser preview is generated under `examples/directory-preview/`. Run `node --test test/pages/directory-starter.test.mjs` for exact downloads, native pages/chips, CSS/focus and no-JavaScript/narrow behavior, alongside the full site suite. Actual copied offline installs/root-help builds are in `test/consumer/directory-starters.test.mjs`; `test/ui/directory-view.test.mjs` owns runtime keyboard, composition, recovery and teardown. Optional engine selectors `RAVELDEX_DIRECTORY_STARTER_BROWSER` and `RAVELDEX_DIRECTORY_VIEW_BROWSER` accept chrome/chromium/webkit and never download engines. Human AT/physical input/actual zoom/Safari/device support remains separately scoped.

The [rich-results gallery](Cards.astro) adds one complete [browser project](../examples/cards-browser/README.md) with explicit metadata mapping, two authored local SVGs and native layout/density/image controls. Its fourteen exact source files/archive and installed `examples/cards-preview/` use the same strict registry. Images start off; the preview server serves approved SVG paths as image/svg+xml. Run `node --test test/pages/cards-starter.test.mjs` for downloads/native pages/CSS/real routes/no-JavaScript behavior, alongside the documented full suite. Copied offline root/help builds and edited data/CSS are in `test/consumer/cards-starter.test.mjs`; runtime projection/image/lifecycle checks are in `test/ui/directory-cards.test.mjs`. Select available chrome/chromium/webkit with `RAVELDEX_CARDS_STARTER_BROWSER` and `RAVELDEX_DIRECTORY_CARDS_BROWSER`. Tests record the browser's native two-link traversal chord; macOS WebKit may use Option+Tab without changing preferences. Human AT/physical input/real zoom/Safari/device qualification remains separate.

The five galleries share the static `SolutionChooser.astro`, explicitly copied and hashed by the Pages builder. The examples index compares all five presentations and eight installed projects; the chooser adds no hydration. Run `node --test test/pages/solutions-qualification.test.mjs` after generation for exact inventories, independent native full result sets, public-output CSS/focus and actual dropdown/rich behavior. `RAVELDEX_FAMILY_BROWSER=chrome|chromium|webkit RAVELDEX_FAMILY_REPORT=/absolute/report.json node --test --test-concurrency=1 --test-timeout=180000 test/consumer/family-qualification.test.mjs` runs the separate installed twenty-group body-only state/query/revision/lifecycle matrix (directory/cards register filters/facets). It does not replace the configured snippet/section/direct-worker/source-offset or fresh copied-project suites. Keep screenshots and DOM/serialized/request metrics separate from human AT, physical input, actual zoom and memory/paint/capacity claims; the family evidence records those scopes and any capture-tool limitations.

The usage Workbench derives a bounded plain-text section overview for ordinary
results. Its original native snippet/score hooks stay intact and the original
excerpts/highlights/scores are deliberately exposed in Inspector. The indexed
records, source offsets and qualification corpus do not change. The demo owns
and disconnects this projection observer before UI teardown; core/consumer
presenters do not parse Markdown. `readable-results.mjs` is an explicit hashed
Pages input. `test/pages/demo-clarity.test.mjs` covers display safety/disclosure
and repeated remount; `test/tooling/usage-corpus.test.mjs` covers original bodies.

The five galleries use `StarterSetup.astro` for exact per-project download,
registry install, content replacement and style-file steps. The explicit starter
registry still owns source inventories; gallery components retain their platform
requirements, CSS recipes and support limits. The Workbench controls use everyday
labels while keeping their stored values and data hooks. Restart or a setting
change retains the query, clears category and returns to page one; Stop removes
controls and releases the application owner.

## Reading and reference pages

`Layout.astro` selects guide/reference reading modes from the existing route
registry. Guides keep a shorter prose column; reference code and semantic tables
can use the wider center column, with local keyboard scrolling. Reading table cells keep ordinary word widths,
so dense comparisons scroll locally rather than compressing to single letters. The right outline
still targets real headings and hides before the left navigation collapses.

`reading.mjs` adds site-only task steps to Getting started and Hosts and groups
representative Core contracts under purpose, signatures, defaults, returns,
failures and related recipes. The complete minimal-use code comes from the
already-published `core.mjs` recipe. All five indexed Markdown sources, their
fenced examples and original UTF-16 section bodies remain byte-identical; packaged
docs and the installed search corpus are not rewritten by this presentation pass.

The installed Satteri/Shiki pipeline highlights named code blocks on guide and
reference routes only. Each figure retains the original fenced code as escaped
text and a copy payload; generation refuses any highlighting normalization drift.
The existing site-only `example-controls.mjs` supplies copy/manual selection and
page lifecycle cleanup and latest-attempt copy feedback. Without JavaScript the names, highlighted code, semantic
tables, all contracts and links remain readable. No new parser, runtime dependency
or package customization API is introduced.

After generation run `node --test test/pages/docs-reading.test.mjs test/tooling/pages.test.mjs test/pages/release-guidance.test.mjs test/tooling/usage-corpus.test.mjs`,
then `npm run docs:check` and `npm run pages:check`. The reading checks cover
preserved headings/signatures/examples/corpus, exact copied text and denial,
late feedback, no-JS, local keyboard scrolling, 320 CSS px and emulated text scale.
They do not establish human AT, physical input, OS clipboard or actual browser zoom.

## Integrated site qualification

RX-9908 qualifies the existing shell, five galleries, eight complete starter
projects and guide/reference layouts together. After one successful `npm run check`,
reuse that build with `npm run pages:generate`, `npm run pages:check` and
`node --test --test-concurrency=1 test/pages/*.test.mjs`. The installed candidate
checker can reuse the same build with `node scripts/candidate-check.mjs --output`
followed by a new, unused evidence directory.

`test/pages/integrated-site.test.mjs` adds the combined 320/768/1280/1440 CSS px
and short-viewport matrix, rendered text/syntax/focus contrast, and scripted
forced-colors/reduced-motion control checks. Set `RAVELDEX_INTEGRATED_REPORT` to
a JSON output path to retain the measured pairs, geometry and adjacent captures.
The existing family, reading, shell, search and public-inventory checks retain
their semantic assertions for exact downloads/source, persistent iframe state,
copy denial/recovery, no-JavaScript reading, empty/error states and keyboard access.
Viewport sizing and media emulation do not qualify actual browser zoom or human AT.

The [integrated evidence](../docs/evidence/RX-9908.md) records the actual candidate,
commands, review, owner-approved manual limits and tracking read-back. Local
acceptance does not publish the site or packages, deliver Git changes, or restore
the deleted hosted workflows.
