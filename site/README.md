# Build and preview the documentation site

The intended publishing source is **GitHub Pages → Deploy from a branch → main → /docs**. The generated site uses `/raveldex/`; there is no custom domain or Pages deployment workflow. Building or previewing does not publish anything.

## Local workflow

The Search Workbench design is authored in `Home.astro`, `Demo.astro`, the shared `SearchWorkbench.astro`, `Layout.astro`, `styles.css` and `workbench.css`. `pages.mjs` owns their public routes. The previous `index.md` is retained as the pre-redesign content baseline; it is no longer rendered. Edit the Astro sources to change the homepage. The complete core example is still taken from README's executable quick-start block.

Home and demo load the same real packed-package browser bundle. Home starts with `module worker`, uses one hit per page and requests one snippet of at most 160 UTF-16 units through existing provider options. Counts, omission notices, category selection, pagination and Inspector remain visible. The dedicated demo retains its empty-query start and full snippets. Only the dedicated demo exposes representation, query-mode, worker and teardown controls.

Home and the ordinary demo default to final-word prefix search: earlier words are exact, and the final word expands from two normalized Unicode code points. Shorter endings remain exact. Advanced settings also offer exact-word and strict-phrase modes. The frozen qualification pilot and integrations omitting the UI `mode` retain exact-word search.

Use Node 24 and npm in a source checkout. The pinned Astro toolchain renders the explicit public source list in [pages.mjs](pages.mjs). The browser demo is bundled from a real locally packed/installed core package. No registry release is needed.

```sh
npm ci
npm run pages:build
npm run pages:check
npm run pages:preview
```

Open `http://127.0.0.1:4174/raveldex/`. Use `npm run pages:preview -- --port 4175` if the default port is occupied. Ctrl+C stops only that preview. Read a guide, open the browser demo, search `module worker`, follow the result to its usage guide, expand Advanced demo settings and compare direct/worker execution.

`pages:build` compiles package output, then generates the site. `pages:generate` reuses existing compiler output; run it only after a successful package build. `pages:check` verifies generated/source identities, local links/fragments and the publishable inventory. Source changes require regeneration. Package `build` and `prepack` remain separate from site generation.

For Astro integration onboarding, follow [the existing fixture walkthrough](../examples/astro/README.md). It includes paired local packages, isolated installation, root and `/docs/` builds/previews and cleanup. The documentation site does not turn that qualification fixture into a production starter.

For complete consumer integrations, use the [inline solution gallery](Inline.astro) and its [browser](../examples/inline-browser/README.md) and [Astro](../examples/inline-astro/README.md) starters. The gallery runs an unchanged browser starter built against a fresh installed private core tarball. `starters.mjs` explicitly lists every source; the generator exposes text copies, escaped Astro source views and complete exact source archives under `example-files/`. Astro source must use an escaped view because Jekyll would parse its frontmatter header; public file names also avoid Jekyll's reserved leading underscores. It reuses only the pinned esbuild tool for the preview build. No recursive repository copy or change to the Workbench corpus is involved. Run `node --test test/pages/inline-starter.test.mjs` after regenerating to check the gallery, exact downloads and live preview.

The [documentation modal gallery](Modal.astro) provides complete [browser](../examples/modal-browser/README.md) and [Astro](../examples/modal-astro/README.md) projects. Its installed browser preview loads on first open and links previews to actual generated heading IDs. The same explicit source/archive inventory covers both modal starters. Run `node --test test/pages/modal-starter.test.mjs` after regeneration for the modal preview, no-JavaScript browsing and exact downloads.

The [compact header gallery](Dropdown.astro) adds one complete [plain-browser starter](../examples/dropdown-browser/README.md). Its installed preview shares one owner between the header and its real inline full-results route on each page; an explicitly enabled modal button uses that same owner. The default does not open a modal. The explicit inventory also publishes its twelve source files and complete archive. After regeneration, run `node --test test/pages/dropdown-starter.test.mjs` for actual navigation, exact downloads and narrow layouts. Its copied root/subdirectory setup and data/CSS edits are covered by `test/consumer/dropdown-browser-starter.test.mjs`. The header is title/link-only and needs native Popover; it does not select snippet/section/facet providers.

All three galleries link to one another and explain the selected data/providers, local package availability and a reproducible CSS edit/build/preview check. Run `node --test test/pages/solutions-qualification.test.mjs` for the inline/modal CSS recipes and `node --test test/pages/dropdown-starter.test.mjs` for the header recipe: computed style changes must retain actual result IDs/counts and keyboard focus. The full site regression command is `node --test --test-concurrency=1 test/pages/*.test.mjs`. For the optional installed modal check in an already available Playwright WebKit engine, run `RAVELDEX_MODAL_STARTER_ENGINE=webkit node --test --test-concurrency=1 test/consumer/modal-browser-starter.test.mjs test/consumer/modal-astro-starter.test.mjs` after the root build. The normal test selection remains Chrome; this opt-in neither downloads browsers nor qualifies Safari. First-wave qualification records exact source/tool identities, graph/output measurements and remaining manual scope separately; scripted input, emulated viewports and automated accessibility checks do not establish physical input, human AT, actual zoom or hosted deployment.

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
