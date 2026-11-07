# Ready-to-use search solutions

Status: RX-6001–RX-6008 are implemented, with verification scoped to each task's evidence. [First-wave qualification](../evidence/RX-6008.md) records the complete inline/modal galleries, installed browser/Astro starters, CSS walkthroughs, per-surface state/interaction evidence, measured graphs/output and remaining manual/platform boundaries. The frozen [page/section contract](PAGE_SECTIONS.md), optional native projection and source-only Astro companion remain unchanged. [RX-7001](../evidence/RX-7001.md) implements the compact dropdown runtime under its [concrete contract](DROPDOWN.md), with installed automated browser evidence and explicit manual/platform limits. [RX-7002](../evidence/RX-7002.md) delivers the complete installed browser header/full-results project and gallery, with an explicit shared-owner modal option and scoped regression evidence. [RX-7003](../evidence/RX-7003.md) implements the nonvisual directory query/URL foundation under its [concrete contract](DIRECTORY.md). [RX-7004](../evidence/RX-7004.md) delivers native directory controls/CSS, complete browser/Astro projects and gallery under its [view contract](DIRECTORY_VIEW.md), with scoped browser/state/lifecycle evidence. [RX-7005](../evidence/RX-7005.md) delivers optional declared card/grid metadata and images, a complete browser project and gallery under its [rich display contract](DIRECTORY_CARDS.md). [RX-7006](../evidence/RX-7006.md) completes the five-presentation chooser and scoped local family qualification for all eight installed projects. All selected N7/N8 tasks are implemented; human/device/real-zoom and publication scope remain separate. Earlier [modal starter](../evidence/RX-6007.md), [inline starter](../evidence/RX-6003.md), [controls](../evidence/RX-6002.md) and [contract](../evidence/RX-6004.md) records retain their original scope.

The [canonical roadmap](../planning/roadmap.json) owns task status, dependencies and acceptance criteria. The [implementation plan](../planning/SEARCH_SOLUTIONS_IMPLEMENTATION_PLAN.md) owns sequencing, task execution notes and verification gates. N7 and N8 extend the completed N0–N6 work; existing tasks and evidence remain intact. Successive owner instructions selected RX-6001, RX-6002, RX-6003, the RX-6004 contract, RX-6005 implementation, RX-6006 modal lifecycle, RX-6007 installed modal starters, RX-6008 first-wave qualification, RX-7001 compact dropdown implementation, RX-7002 installed header adoption, RX-7003 directory query/URL state, RX-7004 directory controls/installed adoption, RX-7005 rich results and RX-7006 final gallery/family qualification. All selected implementation slices are complete; subsequent review evidence is recorded separately.

## RX-6001 frozen foundation contract

For subsequent N11 consumer polish, the selected [Raveldex identity and interaction contract](N11_CONSUMER_CONTRACT.md) defines visual roles and per-surface state expectations. It preserves these shipped foundation/API contracts: inline/modal snippets or sections, title-only dropdown/base directory, authored card metadata, native links, optional CSS and explicit ownership. Its proposed visual/copy changes belong to the later N11 delivery tasks; the API guide continues to describe current runtime behavior.

The additive entry is `/addons/ui/inline`, exporting `mountRaveldexInline` and types `InlineUIOptions`, `InlineUIHandle`, `InlineUIMessages`, `UIDocument`. CSS is `/addons/ui/inline.css`. The legacy `/addons/ui` export stays unchanged. [The API guide](../api/HOSTS.md#inline-search-foundation) defines the exact options, message keys/default policies, safe display capture, initial public style properties and handle methods.

The foundation accepts only root/borrowed engine/display documents, optional text-or-prefix mode, page size, debounce and captured plain-text messages. Prefix is its default; idle makes no search request. It renders one bounded title/link window with exact native total/displayed count, no diagnostics or required optional providers. Complete paging, snippets, filters, rich presentation and installed starters are later slices. Existing-root duplicate mounts return the same handle; conflicting legacy/inline ownership is explicitly rejected. Both UI entry graphs remain optional and inert on import. No core, artifact, dependency or legacy-default change is authorized by this foundation contract.

## RX-6002 frozen controls contract

The subsequent owner request selects RX-6002. The inline entry adds optional `facets`, `snippetFields` and `maxRenderedResults`, and exports the existing `UIFacet` type. Existing required options/handle methods and original complete message bundles remain compatible; new message keys are optional publicly and resolved internally.

Five-hit batches append within a visible window of at most 100 hits by default, configurable from page size through 1,000. Partial final cap batches are supported. Next results is offered only after reaching the cap and starts at the next undisplayed offset; Previous resets to the preceding cap-aligned window's first batch. Native exact totals/ranges stay explicit, and all hits remain reachable. Controls stay mounted once revealed. Query/filter changes restart; native revision changes during paging or evidence retrieval discard mixed hits/counts and require a first-page retry retaining query/selections. No live mutation subscription is claimed.

Empty/no-filter input remains idle. A deliberate facet selection may browse matching records without text. Clear resets both text and selections. Requested capabilities are enforced on actual searches even if the matching set is empty. Facets use exact native conjunctive counts and bounded 100-bucket projections; selected undisplayed values remain selected. Snippet evidence is requested for only the new batch, with revision/ID/order/score/total consistency before any result/facet commit. Source/offset semantics and explicit omissions remain unchanged.

The [API guide](../api/HOSTS.md#inline-result-pages-filters-and-snippets) owns exact defaults, message tokens, paging behavior and expanded style properties. Diagnostics stay off in the consumer preset; the legacy UI remains the explicit developer presentation. Complete installed starters and their gallery are specified below; no engine/artifact/dependency change is introduced by these runtime controls.

## RX-6003 installed starter contract

The complete applications live in `examples/inline-browser/` and `examples/inline-astro/`. Each has its own private starter metadata, explicit content, display mapping, source/snippet/facet registrations, inline CSS import and small overrides, static destination pages, copy/install/build/preview instructions and lifecycle controller. They use direct browser execution and the unchanged public inline API. No new library runtime dependency, export, worker protocol or artifact version is introduced.

The plain browser application explicitly starts loading its seven-guide JSON allowlist. It creates and owns an engine, batches up to 1,000 allowed records in writes of 100 and maps the same data to generated static pages. The Astro application waits for Enable search, uses the existing source-artifact loader and explicit six-page allowlist, then separately loads display records before mounting. Its source provider retains every indexed text field for complete source snapshots; snippets request only body text. Both use three-hit batches and a six-hit visible window. Replacement data and the deployment base require a complete rebuild.

Controllers deduplicate pending starts, expose useful failure/retry with browse links retained, keep candidates local until initialization succeeds and dispose failed or abandoned candidates. Destroy publishes one stable promise before host callbacks, aborts initialization, destroys UI before its owned handle and waits for late initialization/disposal. Reentrant authored-DOM callbacks cannot publish abandoned state or lose the disposal wait. Neither wrapper accepts an externally borrowed owner; applications with borrowed engines mount/destroy the public inline UI directly. Static navigation uses pagehide cleanup and fresh controllers on back/forward-cache restoration.

The first gallery entry runs the unchanged browser starter against an installed private core tarball. An explicit source allowlist supplies complete archives and source views; Astro frontmatter is escaped in HTML views and route-parameter filenames avoid Jekyll's reserved leading underscores. The archives retain exact original paths/bytes. Existing Workbench, frozen qualification data, strict inventory checks and Jekyll exclusions remain intact. Installed checks cover root and `/help/` bases and changed content/CSS; the gallery preview uses its own project subdirectory. Publication and broader human/platform qualification remain separate.

## Outcome and scope

A developer chooses a search experience, supplies explicitly selected content, installs only its required optional capabilities, and adjusts a documented set of CSS properties. Each solution includes a working consumer starter and complete failure/cleanup behavior.

Prepare these experiences in order:

| Wave | Experience | Primary use | Deliverable |
| --- | --- | --- | --- |
| N7 first | Pagefind-style inline search | Websites, blogs and help centres | Optional inline preset, stylesheet, plain browser and Astro starters |
| N7 second | Documentation search modal | Documentation and knowledge bases | Explicit trigger/dialog preset, optional section previews, plain browser and Astro starters |
| N8 first | Compact dropdown search | Navigation and headers | Accessible search-result combobox and installed starter |
| N8 second | Faceted directory search | Resource libraries and listings | Query/filter controls, explicit URL-state integration and list starter |
| N8 third | Rich card/grid results | Editorial and product catalogues | Optional presentation of directory results with configured metadata and images |

Themes are shared visual choices, not additional search experiences. The scope is sequential implementation by default, without calendar or capacity commitments.

## Current-system facts

- [UI options](../../src/addons/ui/types.ts) accept a borrowed engine and display documents containing only ID, title and URL. Facets are single-select string controls; source snippets are explicitly selected.
- [UI execution](../../src/addons/ui/ui.ts) owns debouncing, composition handling, cancellation, stale-response suppression, exact result totals, replace-page navigation and teardown. Its only modal is Inspector. It starts an empty-input search on mount.
- [Rendering](../../src/addons/ui/render.ts) uses safe text nodes and explicit highlight marks. It always includes a numerical score for a hit and has no page/section grouping or image presentation contract.
- The existing [stylesheet](../../src/addons/ui/styles.css) documents five color properties. [Host documentation](../api/HOSTS.md) states that there is no public theme/variant or custom-event API.
- The [ordinary demo](../../examples/docs-search/main.mjs) maps separately indexed sections to a flat result list. Final-word prefix mode is explicitly selected by that example; omitted library UI mode remains exact text.
- The [Astro contract](STATIC_ASTRO.md) uses explicit allowlisted entries and directory-style routes. It does not crawl HTML/Markdown. Its [display type](../../integrations/astro/src/types.ts) contains only ID, title and URL.
- Core owns native ranking, exact totals, revisions and finite execution limits. Optional capabilities and their costs must stay outside core-only imports and retained state.

## Reference boundary

The Pagefind documentation inspected for the preceding analysis distinguishes the supported older Default UI from the newer recommended Component UI. The reference is behavior and layout, not binary/API compatibility, identical ranking or a pixel-accurate promise:

- [Default UI usage and styling](https://pagefind.app/docs/ui-usage/) and [configuration](https://pagefind.app/docs/ui/) describe inline search, optional images/sub-results, five-result batches and Load more.
- [Component UI](https://pagefind.app/docs/search-ui/), [modal](https://pagefind.app/docs/components/modal/) and [searchbox](https://pagefind.app/docs/components/searchbox/) describe the current complete experiences.
- [Sub-results](https://pagefind.app/docs/sub-results/) describe heading/anchor context. [Results](https://pagefind.app/docs/components/results/) describe current result templates and viewport-driven detail loading.
- [CSS variables](https://pagefind.app/docs/css-variables/) describe theme, typography, dimensions and layout controls.

Recheck the selected reference when implementing a surface and record the version/date examined. Do not make the new UI depend on Pagefind or another search engine. Match the reference's useful hierarchy and interactions while preserving Raveldex semantics, accessible sizing and finite resource behavior.

## SS-01 — Optional UI and compatibility

- Extend the existing optional DOM UI architecture with small explicit preset entry points. Reuse the smallest necessary internal primitives; do not introduce a framework, global state/event bus, template language, custom-element registry or general component platform as a prerequisite.
- Preserve the existing `mountRaveldexUI`, strict options, exact-word default, workbench appearance, Inspector behavior and frozen qualification corpus. Consumer presets provide their own documented defaults without silently changing legacy callers.
- Presets borrow the supplied engine. Destroy cancels preset-owned work and removes listeners/DOM without disposing that borrowed engine. A starter that creates an engine owns its separate disposal.
- Importing core or an unmounted preset performs no DOM access, network request, global keyboard registration, worker creation or storage initialization. CSS remains a separate explicit import.
- Exact additive export/type/option names are finalized in RX-6001 and documented before dependent surfaces use them. An incompatible change requires an explicit compatibility decision; ordinary naming does not require another owner approval.

## SS-02 — Native search meaning

- Use actual native search results, ordering, totals and revisions. There are no fabricated hits, replacement scorers or fallback engines.
- Consumer text presets select final-word prefix matching by default where supported by the selected analyzer. Preserve the existing two-normalized-code-point threshold, exact earlier words, short-ending fallback and explicit native refusal behavior. The original UI's omitted-mode default stays exact.
- Vocabulary suggestions, typo correction, synonyms and phrase modes remain explicit optional selections; do not silently add them to consumer searches.
- Keep result matches separate from query suggestions. Search text is not rewritten by the UI without a deliberate user action.
- A response or associated snippets/counts from an older query, filter, owner generation or revision must not overwrite current state. Revision mismatch invalidates the relevant accumulated presentation.

## SS-03 — Display data and capability requirements

- Keep required display data minimal: a stable ID, nonempty title and validated navigation URL, joined to actual engine hits by ID.
- Rich display data is optional and explicitly captured: description, breadcrumb/category text, date/other declared metadata, image URL/alternative and page/section relationships as required by a selected surface.
- Do not put renderer-specific content or retained section maps into the core. Use an owned UI/display projection, or a separately versioned optional integration artifact when static delivery needs one.
- Document capture/remount/update semantics and finite limits. Validate duplicate/missing IDs, excessive data, malformed strings, unsupported fields and unsafe URLs before partial UI replacement.
- A title/link-only preset works without snippets, facets or Inspector. Explicitly requesting a capability requires that capability and its providers; missing capabilities produce a useful error, not silently incomplete success.
- Changing the Astro display artifact, route model or types is a separately reviewed additive/versioned contract change in RX-6004/6005. Existing valid artifacts and directory-style routes keep their behavior.

## SS-04 — CSS customization

- Provide a restrained readable default using host-compatible/system typography, clear hierarchy, visible focus, comfortable controls and local assets.
- Document stable component-scoped classes and public properties for surface/text/muted/accent/border/focus/highlight colors; font and text sizes; spacing/density; control/result radius; border width; maximum width; image dimensions; and modal/dropdown dimensions where applicable.
- Preserve the existing five properties for existing callers. New preset properties have a component-specific public prefix; implementation-only properties use `--_` and stay private.
- Support a host site's light/dark choice through explicit theme scope or overrides. Do not install another independent site theme toggle.
- Supply a short customization guide showing which few properties achieve common changes and where overrides belong. Changing a theme never changes query semantics, capabilities or accessible names.
- Keep resets scoped, styling specificity low, and layouts usable with long titles, missing images, localized labels, narrow screens, zoom, forced colors and reduced motion.

## SS-05 — Safe content and links

- Render supplied titles, metadata and source excerpts as text. Derive highlight marks from validated original UTF-16 ranges; never insert user-provided HTML or require unsafe inline script/template evaluation.
- Preserve source field/value boundaries. Normalized strings are not source coordinates.
- Apply explicit URL validation/resolution to result links, anchored links and optional images. Retain the current HTTP(S)/no-credentials navigation boundary unless a separately approved contract changes it.
- Preserve native link behavior, including modified activation and browser context menus. New-tab links use appropriate relationship attributes.
- Optional images have explicit alternatives or a deliberate decorative treatment, stable reserved space and a non-destructive missing-image state. They load only for an explicitly enabled image view.

## SS-06 — Lifecycle and resources

- Preserve composition handling, debouncing, cooperative cancellation, request sequencing, query validation and reentrant teardown behavior.
- Support independent instances with local state and explicit roots. Mount/destroy/reinitialize and repeated navigation do not duplicate listeners, global shortcuts or engine owners.
- Closing a transient surface cancels pending presentation work; reopening retains the documented query policy and revalidates stale results. A late loader/search cannot reopen a closed or destroyed surface.
- Configure finite page, retained-display, section-map and rendered-result limits. Bound accumulated Load more results and expose any intentional display limit with an accurate unshown count and a usable paging/recovery route.
- Measure actual bundle/import graphs, work and DOM/output growth. Serialized bytes do not establish memory, and no latency or device-capacity claim follows from admission limits.
- Keep direct and module-worker semantics consistent. Worker or asset failure stays explicit; there is no silent main-thread fallback.

## SS-07 — State, text and accessibility

| State | Required behavior |
| --- | --- |
| Uninitialized/loading assets | Explain what is loading; allow safe close/destroy; offer recovery on failure |
| Idle/empty input | Inline and docs search invite a query by default; directories browse all records; an explicit policy can change this |
| Debouncing/composing | Preserve input and focus; do not submit intermediate composition or announce every keystroke |
| Searching/updating | Mark the relevant region busy; suppress stale results and avoid disabling/removing the active control |
| Results | Announce a settled useful count/range; keep keyboard focus predictable |
| No results | Show the submitted query safely and offer clear-query/clear-filter recovery |
| Native refusal/transport failure | Explain failure, retain input and distinguish recovery from successful empty results |
| Closed/destroyed | Suppress late work; restore the appropriate opener/original DOM without leaking ownership |

- Provide English defaults and a complete overridable message bundle, including visible labels, assistive text, summaries, plural forms and errors. UI language does not change the engine's analyzer.
- Use semantic search forms, native links/controls, logical headings and deliberate polite status updates. Interactive composite semantics are added only where the selected surface needs them.
- Require keyboard operation, visible focus, non-color state, usable targets, 320 CSS pixel reflow, 200%/400% zoom checks where applicable, reduced motion, dark theme and forced colors. Include RTL/long-label checks for the theme contract.
- Automated accessibility and scripted composition checks are supporting evidence. Human screen-reader speech, physical IME, touch/on-screen keyboard and actual browser zoom require separately recorded environments and observations.

## SS-08 — Pagefind-style inline search

- Mount a labeled search field, search icon, explicit clear action, submit behavior, settled result summary and semantic list of actual linked titles/excerpts. Native Enter submission works immediately.
- Start with a working title/link-only vertical slice; add snippets only when their providers are selected. Scores and Inspector are off in the new consumer default and remain available through an explicit developer-oriented selection.
- Use five-hit batches by default, within native limits. Provide Load more with exact total/displayed counts, deterministic order and no duplicates; retain a documented bounded paging route. Reset accumulation when query, filter or revision changes.
- Keep simple optional string filters usable; present accurate native counts and preserve a selected value that falls outside a displayed bucket projection. Multi-selection directory behavior belongs to SS-12.
- Support optional image/result metadata and section previews through the later display contracts without making them required for basic search.
- Preserve native input/submit/link interaction and focus during updates; an inline results list does not become a combobox merely because it searches as the user types.

## SS-09 — Pages and anchored section previews

The frozen [page/section display contract](PAGE_SECTIONS.md) owns exact shapes, canonical selection, clipped windows, failure/revision policy, finite bounds and the separate optional static companion. RX-6005 implements these optional APIs and artifacts. Native page retrieval stays authoritative, and current flat-section demos remain unchanged.

- The first grouped docs solution uses one native indexed record per page. The exact native total therefore means matching pages, and native page ranking/ties/pagination remain authoritative.
- Optional caller-supplied section maps connect page IDs to original-source field/value ranges, heading titles and stable anchor IDs. Content extraction remains explicit. Existing flat section-record demos are not silently reinterpreted or rewritten.
- Resolve explicit raw anchors once against fragment-free mapped parent URLs; repeated labels with distinct anchors are valid. Reject structural/overlapping maps at capture and validate source/value/grapheme bounds through the selected contract's provider/build/load rules.
- Show at most three evidence-backed section previews per displayed page by default. A preview reflects qualifying original match evidence within that section; it does not claim that every page-level query clause matches inside the section.
- Specify deterministic preview selection, heading hierarchy, source-order ties, prefix highlight behavior and field/value boundaries. Define finite scan/output limits and omission behavior using the existing evidence contract.
- A bounded preview is not an exact global matching-section total. Do not show such a total unless a complete independently checked calculation exists. Page results without an available section preview remain navigable and honest about missing/omitted context.
- Never deduplicate only one page of section hits and label the result an exact page total. Supporting legacy section-record grouping would be separate scope with complete grouping/ranking/pagination semantics.
- Keep section maps optional and versioned outside core. A new optional provider-context evidence presentation is selected because existing bounded snippets cannot discover all sections or guarantee section-clipped text. Static maps use a separately versioned companion with source/display identity, transient original-source validation and receiver revision binding; native-format companion loading is outside this first wave. Ordinary snippets are not automatic heading extraction.

## SS-10 — Documentation modal

The concrete [modal API and lifecycle contract](DOCS_MODAL.md) owns option capture, native dialog/openers, private inline suspension, coordinated shortcuts, scroll ownership and verification for RX-6006. First-open asset/owner wrappers and complete installed browser/Astro starters are delivered by RX-6007 under the separate application ownership contract.

- Provide an explicit accessible trigger and a native dialog search surface with a pinned input/header, scrollable results body, explicit close control at every size and optional contextual keyboard hints.
- Focus the search input on open; contain focus through native dialog behavior; support Escape and deliberate backdrop dismissal; restore the actual opener when it still exists. Do not close from a drag that begins inside the dialog and ends on its backdrop.
- Preserve the query by default on close, abort pending presentation, and revalidate on reopen. A documented reset-on-close option can opt out. Do not dispose a borrowed engine just because the modal closes.
- Offer an opt-in Cmd/Ctrl+K shortcut, with a visible hint matching the chosen binding. Respect composition, editable contexts, already-handled events and multiple instances. Importing or merely mounting unrelated UI does not capture global shortcuts.
- Reuse the consumer results/feedback/theme primitives and optional page/section previews. Do not embed the whole workbench/Inspector interface inside the modal.
- On narrow/zoomed screens, keep input and close action reachable with the on-screen keyboard, use available dynamic viewport space, contain result scrolling and restore any changed page scroll state.
- Starter loaders initialize explicitly/on first open, deduplicate concurrent opens, recover from failed loading and suppress late completion after close/destroy.

## SS-11 — Compact dropdown

The [concrete RX-7001 contract](DROPDOWN.md) now owns the implemented combobox/grid/native-popover semantics, public API, finite bounds, placement, focus, lifecycle and verification scope. [RX-7001 evidence](../evidence/RX-7001.md) records actual installed/runtime checks and remaining human/platform boundaries. The complete [browser header/full-results project](../../examples/dropdown-browser/README.md) and [gallery](../../site/Dropdown.astro) are delivered by [RX-7002](../evidence/RX-7002.md), including a default-off explicit modal handoff using the same owner/query.

- Implement a separate ARIA combobox/search-result popup, using the applicable [APG pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/). Keep its result semantics separate from inline lists and modal dialog semantics.
- Track an active result without moving text editing focus on every update. Arrow keys navigate, Enter follows, Escape dismisses and Tab leaves normally. Preserve native editing and modified link activation.
- Show a bounded number of actual hits, with the exact total and an explicitly configured full-results destination. The full-results destination preserves query meaning and uses the inline starter.
- Position/reflow the popup without viewport clipping. At narrow sizes use a documented dropdown layout or explicitly enabled modal handoff preserving the query; do not invent a hidden second engine.
- Keep global shortcuts opt-in and coordinated with the modal. Test empty/loading/failure states, pointer/keyboard interaction, composition, clear, outside dismissal and multiple instances.

## SS-12 — Faceted directory

The [concrete directory contract](DIRECTORY.md) owns the optional nonvisual controller, named URL parameters, finite bounds, recovery and lifecycle. The [directory view/adoption contract](DIRECTORY_VIEW.md) owns the separate native controls/CSS and complete browser/Astro starters in RX-7004.

- Browse all admitted records on an empty query. Combine optional final-word-prefix text with native string filters; use OR within a multi-selected group and AND across groups.
- Display native conjunctive facet counts over the complete qualifying set before hit paging, including the group's own active filter. Label that meaning and preserve selected zero/missing-projection values. Own-group-excluding counts are excluded from the first directory implementation.
- Provide native checkbox groups, selected-filter chips with named removal, clear-all, exact totals and complete bounded page navigation. Mobile filters use a usable disclosure or deliberate dialog with focus restoration.
- URL synchronization is an explicit starter/preset option, not new persistence by default across all search surfaces. Define bounded parameter encoding for query, allowed filters and result page; preserve unrelated parameters/hash, support Back/Forward and prevent update loops.
- Filter/query changes reset paging. Invalid/stale URL values have deterministic recovery. Multi-instance URL ownership is explicit. No local search history, telemetry or storage is added.
- Retain native relevance order and ties. Date/price/alphabetical sorting of the full result set and numeric range controls are separate scope, not sorting of just the displayed page.

## SS-13 — Rich result cards/grid

- Add a selectable presentation of the same directory query/results/controller, not another engine or ranking model.
- Map only declared display metadata to title, excerpt, image, category/breadcrumb, date or a small set of named extra text fields. Use safe text and links rather than arbitrary HTML templates.
- Missing optional metadata does not break layout or reorder results. A list/grid change preserves query, filters, page, total and deterministic item order.
- Use responsive CSS layout and semantic lists, not an interactive ARIA grid. Keep DOM order equal to reading order and retain ordinary navigation.
- Enable image requests explicitly, reserve dimensions, use appropriate alternatives and verify missing-image behavior and result-density customization.

## SS-14 — Delivery, verification and completion

- Each experience ships with a locally installed/packed consumer starter, realistic small sample content, replacement-data instructions, exact required add-ons, matching CSS, initialization and disposal. Runtime dependencies remain unchanged unless a separate owner decision authorizes one.
- Plain browser starters document their bundler/build requirements. Astro starters reuse the explicit static loader and verify root/subdirectory asset and result URLs. Current unpublished/local-tarball installation remains accurately described.
- Add a solution gallery to the existing site with working previews, links to complete starter files and compact CSS recipes. Preserve the Workbench, published-path allowlist/Jekyll exclusions and original qualification fixtures. No deployment is part of these milestones.
- Verify every task alongside its implementation, not only in the final milestone task. Use independent expected IDs/totals/pages and source ranges, packed public imports/types, real browser behavior, failure/cleanup probes and import/cost inspection.
- Record task evidence only after it exists, with acceptance outcomes, commands, source/environment identity, failures, review and manual limitations. Implementation complete, verified and project synchronized remain separate states.
- The first-wave gate covers inline and modal independently. The final family gate includes dropdown, directory and cards. Missing manual/platform evidence stays visible and cannot support a broad accessibility/device qualification claim.

## Non-goals and boundaries

No foreign search engine, Pagefind compatibility package, framework migration, automatic site crawler, HTML/Markdown extractor, network backend, sharded/lazy index format, semantic/AI search, command launcher, editable table/grid, commerce actions, automatic typo/suggestion behavior, analytics, search-history persistence, new paid service or blanket browser/AT claim.

Preserve the existing Workbench and frozen qualification corpus, prior completed task evidence, versions and private guards. This began as a planning-only change; subsequent explicit owner instructions authorized RX-6001–RX-6008 and RX-7001–RX-7006 implementation and local qualification, which are now complete. Package publication, tags/releases, pushes, deployment and remote tracking synchronization remain separate and were not performed.
