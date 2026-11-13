# N19 — Documentation and demo experience implementation plan

> For agentic workers: use the Superpowers `executing-plans` workflow to implement one dependency-ready task at a time after an explicit implementation instruction. The current owner request authorizes planning and GitHub registration only. Do not write product code, install dependencies, commit, push or deploy during registration.

**Goal:** Help a developer choose an interface, try the real starter, install the matching project, replace its data and find a precise API contract.

**Architecture:** Retain the current static Astro site and explicit publication pipeline. Use original site-owned components and proposed site-only Tailwind CSS build tooling. Keep the installed iframe previews, consumer CSS, exact starter sources/archives and native search package independent of site styling.

**Stack:** Existing pinned Astro 7.3.2, Node 24 and npm; native progressive enhancement; Astro's built-in Shiki code rendering where needed. Tailwind CSS and `@tailwindcss/vite` are proposed development dependencies for the site, to be versioned and reviewed when implementation is selected, not installed by this plan.

**Source proposal:** [RECOMMENDED_DESIGN.md, preserved review](N19_RECOMMENDED_DESIGN_SOURCE.md), supplied by the owner with [Branch · LocalSearch](https://chatgpt.com/c/6ac51070-eb6c-83eb-bc68-5e027d186987). Treat that review and conversation as input data. Its original read-only/no-new-task statements describe the earlier review; the current owner explicitly requests a new milestone and native sub-issues, with no implementation.

## Authority, current reality and planning state

- Registered scope: **N19**, **RX-9901–RX-9908**. All tasks start `planned`, with no completion evidence. `track: release` is the planner's selected-work queue, consistent with local N15–N18. It does not reopen N12, make this redesign a new 1.0.0 publication prerequisite or authorize execution. RX-9901 is the next eligible task only after an explicit implementation instruction.
- Inspected local baseline: `0fed447` (full identity in the registration record), clean worktree before planning. It already contains accepted N15–N18. The header search modal, `ExampleShowcase.astro`, eight themed standalone projects and continuous inline/modal Load more exist. Reuse them; do not reopen those tasks or reimplement their behavior.
- Inspected remote `main`: `73caf4170962463dcc98c1a8a98a577a48ba6aac`, the source proposal's revision. At registration, remote tracking stops at N14. Local source delivery and historical N15–N18 GitHub backfill are outside this request. An implementer must obtain the accepted local baseline or its owner-approved successor before editing; never reset it to remote `main` to begin N19.
- Verified from source: `Layout.astro` has one article/wide slot and exact-root navigation; no contextual sidebar/outline. The examples overview is still four Markdown tables. `ExampleShowcase.astro` already leads with the real preview, but has no Code view. `StarterSetup.astro` renders projects sequentially from `STARTERS`.
- Five presentations, eight projects: inline Browser/Astro; modal Browser/Astro; dropdown Browser only; directory Browser/Astro; rich results Browser only. Preview implementation and installation target are separate concepts.
- This planning turn establishes no rendered-browser, contrast, accessibility, performance or hosted-site result. The earlier review's 404 remains a historical observation, not a new hosting diagnosis.

## Global constraints and decisions

- Keep native TypeScript/ESM core with zero runtime dependencies; no engine, public API, result, ownership, Load more or consumer-CSS changes.
- Use the existing Astro shell plus site-only Tailwind as the planning baseline. Starlight would require a separate content/build migration; Next.js would replace the existing architecture. Neither is part of N19. No Tailwind Plus, Elements, React, MDX migration, Pagefind, editor runtime, paid service or new search engine.
- Preserve Raveldex's ink/white/gray identity, blue link/focus treatment and lime accent. Define a small site token/typography contract; do not copy a reference company's identity or expose site tokens as package API.
- Omit Tailwind Preflight in the initial integration. Utility prefixes alone do not contain its reset. Scope any necessary base rules to site content; explicitly test the header's installed modal as well as isolated iframe previews. Do not require Tailwind in downloaded starters or change package runtime/peer dependencies.
- Preserve `/raveldex/`, current routes and meaningful heading anchors. Inventory old anchors before editorial changes; retain alias anchors or explicit static mappings for necessary changes. No URL migration is implied by new navigation labels.
- Navigation labels: **Get started**, **Examples**, **Documentation**, **API reference**; Get started points to `/guide/overview/`, Documentation to `/guide/`. Keep the Developer Workbench reachable as a secondary documentation destination at `/demo/`. Preserve the existing labeled Raveldex header search, shortcut rules, lazy five-guide corpus and focus/cleanup behavior.
- Keep one explicit route/content registry, `STARTERS`, `starterSource()` and `starterArchive()` as authorities. Source/Code views must use the same allowlisted bytes as downloads, including escaped Astro source. No recursive docs/source publishing or duplicate handwritten snippets.
- Author site changes under `site/` and the explicit build pipeline. Keep `docs/_pages-manifest.json` ownership guards, source hashes, Jekyll exclusions and strict preview allowlisting. Never add `.nojekyll`, broad content globs or a server exposing all `docs/`.
- Use semantic HTML and native controls, safe text insertion, visible focus, reduced motion and deliberate announcements. No-JavaScript pages retain navigation, code, requirements, downloads and all installation choices. Tabs may enhance already-readable content; they must not hide the only usable no-JS path.
- Preview/Code switching and installation switching must not recreate the iframe, discard its query or reindex. No iframe auto-height messaging, new sandbox flags or reset action in the initial scope. Modal/dropdown whole-window behavior is demonstrated by the full-page route.
- No arbitrary theme builder, new live-theme controls, console, IDE, account workflow or expansion of the search corpus. Curated CSS examples may use existing documented properties only.
- Do not infer dates, assignees, effort promises, support claims or user approval. Planning, implementation, automated verification, human review and publication are distinct states.

## Entry criteria, sequence and gates

Entry to implementation requires the owner's explicit instruction and an available baseline containing N16–N18. Read this plan, applicable `AGENTS.md`, the task's generated card, surrounding source/tests and the existing site guide. Mark only the selected dependency-ready task `in_progress` and regenerate views.

| Task | Independently reviewable outcome | Dependencies |
| --- | --- | --- |
| RX-9901 | Site-only styling and contextual shell work on representative existing routes | RX-9801 |
| RX-9902 | Five visual choices and truthful comparison at `/examples/` | RX-9901 |
| RX-9903 | Complete Inline choose/try/install/data/style pilot | RX-9901 |
| RX-9904 | Owner records approval or bounded revisions of the rendered pilot | RX-9902, RX-9903 |
| RX-9905 | Modal and dropdown use the reviewed template with their own behavior | RX-9904 |
| RX-9906 | Directory and rich results use the reviewed template with truthful metadata | RX-9904 |
| RX-9907 | Guides and API use readable, navigable templates without lost contracts | RX-9904 |
| RX-9908 | Integrated site qualification, review and truthful handoff | RX-9905, RX-9906, RX-9907 |

RX-9902 and RX-9903 can be developed separately after the shell contract is stable, but coordinate edits to shared components/build inputs. RX-9905–RX-9907 can overlap only with disjoint page ownership and a shared-component integration point. No parallel benchmark campaign is required. Do not describe this ordering as a measured critical path.

**Pilot gate:** RX-9904 cannot pass from screenshots alone, an automated test pass or silence. The owner reviews a local working gallery and Inline flow, including desktop and narrow presentation and Browser/Astro instructions. Record the actual response and inspected identity. If revisions are requested, repair the owning pilot task, rerun affected checks and present the changed result. Rollout waits for approval. This gate does not authorize publication.

## File responsibilities and component interfaces

- `site/Layout.astro`, proposed `site/navigation.mjs` and `site/styles.css`: shared shell, explicit route/category metadata, contextual navigation, prose/example/reference widths, tokens and responsive rules. Metadata provides section, current destination, breadcrumbs and outline policy; exact page `aria-current="page"` is distinct from an active top-level section. Keep the `PAGES` route list authoritative and its existing consumers compatible.
- `scripts/build-pages.mjs`: copies explicitly selected source modules/components, configures the scratch Astro/Vite build, supplies Markdown heading/route metadata and records every new source/asset input. Retain base-path rewriting, safe publication and archive generation.
- Proposed `site/Examples.astro` and `site/SolutionCard.astro`: overview route and inert truthful interface choices. If this replaces the Markdown render at `/examples/`, retain `examples/README.md` as an explicit source-link alias to that route without duplicating public destinations or weakening uniqueness checks.
- `site/ExampleShowcase.astro`, proposed `site/DemoPreview.astro`, `site/CodePanel.astro` and `site/example-controls.mjs`: shared detail presentation, Preview/Code views, exact source/file context and small enhancement controllers. Preview consumes family, fixed browser implementation identity, preview route/title and task hint. Code consumes allowlisted starter ID/file path/text/language. Controls own only site state and removable listeners, not the search engine.
- `site/StarterSetup.astro`: consumes the family and `STARTERS`, presents only real platforms, exact download/source links and ordered run/data/style steps. Selected install ID is independent of preview starter ID. Hide inactive panels only after successful enhancement and restore a readable fallback if enhancement fails.
- Existing `Inline.astro`, `Modal.astro`, `Dropdown.astro`, `Directory.astro`, `Cards.astro`: family-specific content, prerequisites, public CSS recipes and related interfaces. Keep functional standalone examples unchanged.
- `docs/api/GETTING_STARTED.md`, `docs/api/HOSTS.md`, `docs/api/CORE.md`, `site/guides.md` and shared Markdown rendering: representative reading/lookup content and complete public contracts. Preserve executable fenced examples and package-doc identities.
- Existing `test/pages/` and `test/tooling/pages.test.mjs`, plus proposed `docs-shell.test.mjs`, `docs-gallery.test.mjs`, `docs-example-flow.test.mjs`, `docs-reading.test.mjs`: behavioral checks at the changed site layer. These proposed test files need only be created where they avoid duplication; they are not an instruction to split every existing test.

## Task instructions

### RX-9901 — Establish the site styling and contextual navigation shell

**Consumes:** Accepted local N16–N18, current `PAGES`, header-search markup/hooks and public-output guards. **Produces:** Shared route metadata, shell slots and site styling consumed by all later tasks.

- [ ] Capture actual baseline renders and route/anchor/source inventories for `/examples/`, `/examples/inline/`, `/guide/overview/`, `/reference/core/` and `/demo/`. Record exact source/build/browser identities. Do not call source-only findings visual failures.
- [ ] Add focused assertions named `docs shell marks nested routes correctly`, `section navigation remains usable without JavaScript`, and `site styles preserve installed modal and iframe boundaries`. Check exact current page versus category, unique landmarks/heading, keyboard disclosure, 320 CSS px and long labels.
- [ ] Review the maintenance/browser/build cost of the exact Tailwind/Vite development versions selected for the existing pinned toolchain. When N19 implementation is authorized, add only those site development dependencies with npm; preserve unrelated versions and runtime/peer manifests. Record the selected versions and omit Preflight.
- [ ] Adapt `Layout.astro` and the scratch build to explicit route metadata and contextual sidebars/breadcrumbs. Add an outline only for longer pages; hide the right outline before collapsing the left navigation into a labeled disclosure. Keep anchors/focus clear of sticky chrome and avoid duplicate mobile/desktop tab stops.
- [ ] Verify the header's real lazy search, no-JS browse fallback, Workbench link, cross-page active state and safe public asset inventory. Document the stable slots/metadata for RX-9902/9903. Record command results and diff review in `docs/evidence/RX-9901.md` only when performed.

Focused commands after one valid build/site generation: `node --test test/tooling/pages.test.mjs test/pages/docs-shell.test.mjs test/pages/site-search.test.mjs`, then `npm run pages:check`. Existing tests must retain their semantic assertions when navigation copy changes.

### RX-9902 — Lead the examples overview with five visual choices

**Consumes:** RX-9901 shell and existing `STARTERS`. **Produces:** `/examples/` gallery and comparison destinations without changing the starter inventory.

- [ ] Add `gallery exposes five truthful interface choices` and `gallery preserves comparison anchors without initializing demo engines` assertions. Expect five named family destinations and exactly eight real project mappings; dropdown/cards have no Astro option.
- [ ] Create or adapt the overview template. Lead with “Choose a search interface” and one sentence; show real existing interface screenshots or inert previews, one use case, accurate platform labels and a clear demo link. Provide useful alternative text when a thumbnail adds information; decorative copies use empty alternatives.
- [ ] Use compact semantic comparison content after the choices. Keep `choose-a-search-solution`, `data-and-capabilities`, `keyboard-and-cleanup` and `complete-projects-and-smaller-examples` anchors or explicit compatible aliases. Move long details only when precise destinations exist.
- [ ] Keep core-only usage, smaller API recipes and Workbench discoverable as secondary destinations. Add explicit builder copies/hashes and Markdown-source alias mapping if using `Examples.astro`. No five active preview engines or remote thumbnail dependencies.
- [ ] Check card reading/focus order, no-JS navigation, narrow layouts, source/download links and the request inventory. The existing lazy header search is allowed; a static gallery must not load its own five indexes. Record actual evidence in `docs/evidence/RX-9902.md`.

Focused commands: `node --test test/pages/docs-gallery.test.mjs test/pages/solutions-qualification.test.mjs test/tooling/pages.test.mjs` and `npm run pages:check` after generation.

### RX-9903 — Complete the Inline preview and installation pilot

**Consumes:** RX-9901 shell, `ExampleShowcase`, `StarterSetup`, `STARTERS`, actual browser preview. **Produces:** Shared Preview/Code, platform-choice and copy behavior; one complete Inline journey.

- [ ] Add `inline keeps preview implementation separate from install platform`, `source views and copy equal allowlisted bytes`, `switching views retains the same iframe and query`, and `all setup content remains readable without JavaScript` checks. Deny/unavailable clipboard must show a useful manual-selection path without reporting success.
- [ ] Adapt the existing showcase rather than rebuilding the widget: concise purpose, breadcrumb, preview immediately, installation, replacement data, CSS recipe, requirements/help and related interfaces. Preserve `copy-inline`, `inline-theme`, `inline-support` and existing supported anchors.
- [ ] Label the preview **Browser starter** regardless of Browser/Astro installation selection. Add keyboard-operable Preview/Code views and a plainly labeled full-page link. Use one persistent iframe, safe read-only exact source and filename labels; escape HTML/Astro content, including script-looking text. Do not add editing, auto-height messages or reset controls.
- [ ] Enhance `StarterSetup` with one actual Browser/Astro choice and ordered download/extract, install/run, data replacement and style steps. Use the current exact versioned commands and platform-specific files (`content.json`, browser `theme.css`, Astro `src/style.css` and matching build identity). Essential requirements and unpublished/local-package instructions remain visible at installation; never imply registry availability without evidence.
- [ ] Use Astro Code/Shiki for selected exact source and local copy controls. Verify tabs' roles/state/Arrow/Home/End behavior if tabs are chosen, inactive-panel focus exclusion, success/failure announcements, listener cleanup and no new search owner. Existing public CSS recipe changes must preserve native result IDs/totals and focus.
- [ ] Exercise the actual seven-page Browser `walking guide` and six-page Astro `workshop` fixtures without changing them, downloads/source equality, iframe entry/exit and full-page navigation. Record desktop/narrow renders, automation limits and review in `docs/evidence/RX-9903.md`.

Focused commands: `node --test --test-concurrency=1 test/pages/docs-example-flow.test.mjs test/pages/inline-starter.test.mjs test/pages/solutions-qualification.test.mjs test/pages/site-search.test.mjs`, plus `npm run pages:check`. Run affected copied-project consumer checks only if setup/source semantics change.

### RX-9904 — Review and approve the rendered pilot before rollout

**Consumes:** RX-9902 gallery and RX-9903 Inline pilot on the same recorded build. **Produces:** Explicit owner gate decision and bounded revisions, not additional product scope.

- [ ] Prepare a working local URL and desktop/narrow captures of choosing Inline, trying a real result, opening full page, reading Code, selecting Browser/Astro, locating data/style files and reaching API reference. Include code-copy failure and no-JS fallback evidence from the owning tasks.
- [ ] Present one coherent candidate and a short decision checklist. Ask the owner to approve or identify specific revisions to hierarchy, navigation, density and installation clarity. Do not seek new decorative directions or reopen N11/N17.
- [ ] Record the owner's actual decision, date, source/build identity and any accepted limitation in `docs/evidence/RX-9904.md`. Do not interpret silence, elapsed time or previous automated results as approval.
- [ ] If approval is pending, leave this task unfinished with the precise pending decision and no rollout. If changes are requested, update the affected pilot task, rerun changed checks and obtain approval of the revised candidate. Only an explicit approval permits RX-9905–RX-9907 to start.

Verification is the owner's recorded response plus referenced working-pilot evidence; no unchanged runtime rebuild or benchmark is required for this decision-only slice.

### RX-9905 — Apply the approved template to modal and dropdown

**Consumes:** Approved pilot and shared controls. **Produces:** Two complete interface pages preserving distinct top-layer/navigation contracts.

- [ ] Adapt `Modal.astro` and `Dropdown.astro` to the approved content order and shared components. Preserve existing anchors, two modal platforms and browser-only dropdown availability; retain precise provider/platform prerequisites.
- [ ] Add `embedded modal explains its frame boundary` and `dropdown full-page handoff preserves raw query` checks. Clearly label the embedded browser implementation and explain that a modal remains inside its iframe; full-page mode demonstrates whole-window behavior.
- [ ] Run the real modal first-open/cancel/retry/reopen, close/opener focus and section-anchor flow in full-page mode. Run dropdown keyboard selection, Escape/Tab, selected result navigation and See all results in full-page mode. Preserve native Popover fallback and the optional expanded modal's default-off/shared-owner contract.
- [ ] Verify exact source/archives, available install choices, no-JS browsing, CSS recipes, copy failures and narrow layouts. No changes to standalone project themes, core retrieval or consumer lifecycle are needed. Record actual evidence in `docs/evidence/RX-9905.md`.

Focused commands: `node --test --test-concurrency=1 test/pages/docs-example-flow.test.mjs test/pages/modal-starter.test.mjs test/pages/dropdown-starter.test.mjs test/pages/site-search.test.mjs`, then `npm run pages:check`. Reuse generated output until an input changes.

### RX-9906 — Apply the approved template to directory and rich results

**Consumes:** Approved pilot and shared controls. **Produces:** Two complete browse/filter pages with accurate data and presentation guidance.

- [ ] Adapt `Directory.astro` and `Cards.astro`; retain Directory Browser/Astro and rich-results Browser-only choices. Keep real source/provider requirements, scalar formats/multi-value topics, explicit URL state and application-owned metadata mapping beside the relevant steps.
- [ ] Add `directory setup and views preserve native filters and URL state` and `rich result views preserve links and image opt-in` checks. Exercise checkboxes, removable chips, Clear all, native pages and Back/Forward on the existing full-page starters.
- [ ] Verify list/card/grid, density and image controls preserve the current native result state/link Nodes. Images stay off initially; no new network image requests from gallery decoration, platform selection or switching Code/Preview. Failed images retain text and links.
- [ ] Check actual stylesheet/data filenames, exact sources/archives, CSS overrides, no-JS destinations, mobile filter disclosure/focus and long metadata. Do not add ARIA grid navigation or mutate the existing query/URL/public presentation contracts. Record evidence in `docs/evidence/RX-9906.md`.

Focused commands: `node --test --test-concurrency=1 test/pages/docs-example-flow.test.mjs test/pages/directory-starter.test.mjs test/pages/cards-starter.test.mjs test/pages/solutions-qualification.test.mjs`, then `npm run pages:check`. Copied-project checks are needed if installation/source behavior changes.

### RX-9907 — Give guides and API reference distinct reading layouts

**Consumes:** Approved site navigation/style contract and existing accurate Markdown/API examples. **Produces:** Shared reading/reference layouts and representative content transformations, preserving the entire public surface.

- [ ] Inventory old headings/links before editing Getting started, consumer hosts and core reference. Add `guide outline targets real preserved headings`, `reference retains signatures defaults failures and examples` and `long code and tables do not force page overflow` checks.
- [ ] Use contextual documentation navigation and optional page outline. Present Getting started and HOSTS as short task steps with real example destinations; keep installation, public-record restrictions and destructive consequences beside the relevant action.
- [ ] Restructure representative `CORE.md` sections as purpose, signature, minimal use, parameters/defaults/constraints, returns, failures and related recipes. Preserve all remaining content and anchors; remaining pages inherit the tested typography instead of being rewritten speculatively. Migration remains a secondary guide.
- [ ] Render named, highlighted code with local copy where useful; copy excludes filenames/line numbers and matches the underlying snippet. Keep genuine parameter/comparison tables semantic, with local scrolling as needed and no blanket 10rem cell minimum. Keep ordinary prose bounded while examples can use available width.
- [ ] Preserve executable fenced blocks, package documentation self-containment, existing five-guide corpus text/offset identity and installed search results. Before changing a corpus input, identify its owner/fixture and preserve its indexed contract; do not silently reindex editorial content as part of a layout change.
- [ ] Verify no-JS reading, keyboard outline navigation, sticky-header anchor visibility, copy failure, narrow/zoom reflow and links to running examples. Record actual checks and packaged-doc implications in `docs/evidence/RX-9907.md`.

Focused commands: `node --test test/pages/docs-reading.test.mjs test/tooling/pages.test.mjs test/pages/release-guidance.test.mjs test/tooling/usage-corpus.test.mjs`, then `npm run docs:check` and `npm run pages:check`. Use the existing candidate documentation inventory/link/example checks if packaged Markdown changes.

### RX-9908 — Qualify the integrated site and synchronize the handoff

**Consumes:** Completed rollout/reading tasks on one identified candidate. **Produces:** Reviewed site acceptance evidence and synchronized task status, with human/environment limits intact.

- [ ] Review the combined diff against this contract. Check the three page roles and five presentations, exactly eight complete projects, preserved public properties, route/anchor aliases, safe source rendering, one persistent iframe per detail page and no private-record exposure.
- [ ] Run one complete candidate verification for the stable executable input set using `npm run check`. This builds once; reuse its output with `npm run pages:generate`, `npm run pages:check` and `node --test --test-concurrency=1 test/pages/*.test.mjs`. If an executable input changes, rerun the affected checks and invalidate only the identities/results it actually changes.
- [ ] Verify exact downloads and sources, package inventory/links/examples, navigation and fragments, header modal, copied-project installation claims affected by this work, and strict preview/public output boundaries. Keep existing native semantic tests; do not launch an exhaustive N9/N10 performance/recovery campaign.
- [ ] Walk the changed shell, gallery, Inline, modal/dropdown full-page and directory/cards flows with a keyboard. Check visible focus/order, iframe entry/exit, tabs/disclosures, copy success/denial, no-JS reading, loading/error/empty states, reduced motion, forced colors, long labels/code and contrast of the actual final tokens.
- [ ] Inspect 320/768/1280/1440 CSS px and a short viewport; perform actual 200%/400% browser zoom where available. Record exact OS/browser and any human AT version when used. Emulation/axe/screenshots cannot qualify human screen-reader speech, physical input or zoom. Unavailable checks are Not run/Blocked and retain explicit owner disposition for nonessential release claims; essential known navigation/operability defects block acceptance.
- [ ] Record commands, counts, source/build/dependency identities, captures, review repairs, skipped/unavailable scope and the owner's pilot response in `docs/evidence/RX-9908.md`. Update manifest statuses only when their applicable criteria have evidence; regenerate docs and verify targeted GitHub issue/native-parent read-back. Leave unrelated historical tracking unchanged.
- [ ] Synchronize `site/README.md`, project context and handoff with the actual result. Report the next selected work separately from optional follow-ups. Commit/push, hosted Pages activation, npm publication, tags/releases, visibility changes and paid services still require a separate explicit instruction.

## Review focus and acceptance ownership

| Likely failure | Owning check/task |
| --- | --- |
| Nested routes, preserved anchors or sticky chrome leave visitors lost | RX-9901 route/landmark tests; RX-9902 aliases; RX-9907 outline tests |
| Tailwind/site styles alter the installed header modal or leak into consumer output | RX-9901 style/isolation and dependency diff; RX-9908 integrated inventory |
| Platform/source switches relabel, reload or discard a live preview | RX-9903 persistent iframe, request count and separate install/preview state; reused in RX-9905/9906 |
| Script-looking source, clipboard denial or no-JS tabs break reading/setup | RX-9903 safe exact-byte source/copy/fallback checks; RX-9907 code checks |
| Reorganized content drops capability/privacy/lifecycle requirements or changes corpus meaning | RX-9905/9906 family checks; RX-9907 content/anchor/corpus checks; RX-9908 review |

Each issue carries its own steps, criteria, expected files and commands. Native sub-issue links express parentage; the dependency graph above expresses execution order. Checklist links alone are not native relationships.

## Completion and evidence boundary

N19 completes only when the approved pilot has been rolled out, relevant site/package checks pass on the recorded candidate, essential usability defects are repaired, and real manual limitations are stated. Registration is **0/8 accepted**. A planning-registration record is not task implementation evidence and must not be added to these tasks to manufacture completion.

No runtime/browser checks are required merely to register this plan. Registration verification is the roadmap graph, generated views, Markdown references, tracking preview, diff scope, and live milestone/issue/native-parent read-back. Local planning documents may be uncommitted and absent from remote `main`; issue instructions must therefore be self-contained until separately authorized source delivery.

## Authoritative implementation references

- [Tailwind's Astro Vite integration](https://tailwindcss.com/docs/installation/framework-guides/astro): current supported integration; validate exact compatible versions at execution.
- [Tailwind Preflight control](https://tailwindcss.com/docs/preflight): omit the reset while integrating existing site styles.
- [Astro code rendering](https://docs.astro.build/en/guides/syntax-highlighting/): built-in Code/Shiki, separate from a browser editor runtime.
- [Site pipeline and publication contract](../../site/README.md), [canonical roadmap](roadmap.json), [tracking conventions](GITHUB_TRACKING.md), and [N11 identity/scope](../specs/N11_UI_UX_POLISH.md).

Mobbin URLs in the preserved proposal are structural provenance, not templates, copied assets or evidence of usability improvement. This plan adds no new claim about those screenshots.
