# Search solutions implementation plan

Prepared: 2026-10-30; updated 2026-11-02. RX-6001–RX-6008 and RX-7001–RX-7006 are implemented. The [frozen page/section contract](../specs/PAGE_SECTIONS.md) retains its optional evidence projection, inline mode and separate source-only Astro companion. [First-wave evidence](../evidence/RX-6008.md) records complete inline/modal adoption and scoped qualification. [RX-7001](../evidence/RX-7001.md) implements the compact dropdown under its [concrete contract](../specs/DROPDOWN.md), with scoped installed/browser review evidence. [RX-7002](../evidence/RX-7002.md) delivers the complete installed browser header/full-results project and gallery. [RX-7003](../evidence/RX-7003.md) delivers the nonvisual query/URL foundation under its [concrete directory contract](../specs/DIRECTORY.md). [RX-7004](../evidence/RX-7004.md) adds the separate directory view/CSS, complete browser/Astro projects and gallery with native control, URL, lifecycle and copied-install evidence. [RX-7005](../evidence/RX-7005.md) delivers optional rich metadata/images, semantic list/card/grid presentation and a complete installed browser project/gallery under its [display contract](../specs/DIRECTORY_CARDS.md). [RX-7006](../evidence/RX-7006.md) completes the chooser, all eight installed adoption paths and scoped local family qualification. No selected N7/N8 implementation task remains; human/device/real-zoom and publication observations retain their separate scope. The canonical manifest owns completion/dependency state; each task retains its own verification evidence.

## Objective and authority

Deliver complete optional search experiences that a developer can adopt with a working starter, their own explicitly selected content and a few CSS changes. Start with Pagefind-style inline search and the documentation modal, then add dropdown, faceted directory and card/grid presentation.

The original request authorized the plan and local roadmap updates only. Successive owner instructions authorized RX-6001, RX-6002 and RX-6003 implementation, followed by the RX-6004 contract, RX-6005 implementation, RX-6006 modal, RX-6007 installed modal starters, RX-6008 first-wave qualification, RX-7001 compact dropdown, RX-7002 installed header adoption, RX-7003 directory queries/URL state RX-7004 directory controls/adoption RX-7005 rich result presentation and RX-7006 final family qualification. New tasks began as `planned` with empty evidence; a task is advanced only with its own real acceptance record. A later instruction to implement/continue is sufficient to start the next dependency-ready task; ordinary implementation details do not require another approval gate.

The [canonical manifest](roadmap.json) owns task state, dependency order and stable task-specific acceptance criteria. [Generated task cards](../../IMPLEMENTATION_TASKS.md#rx-6001) expand those criteria. The [search-solutions contract](../specs/SEARCH_SOLUTIONS.md) owns required behavior and boundaries. This plan supplies execution details rather than competing task states.

## Inputs, facts and assumptions

- The existing 36 N0–N6 tasks remain complete. New N7/N8 work does not imply that historical qualification covers changed source or that packages have been published.
- Existing UI, evidence/snippets, facets, worker and Astro source are reusable foundations, not proof that the new consumer experiences exist. Current behavior is listed with owning source links in the contract.
- Pagefind is a layout/behavior reference; exact Pagefind API, scoring and indexing/loading parity are not goals. Official reference links are in the contract and should be rechecked when each surface is implemented.
- New preset defaults can differ from the legacy Workbench defaults through explicit additive entry points. Preserve the current `mountRaveldexUI` contract and frozen real-document qualification fixtures.
- One indexed record per page is the planning baseline for grouped docs results. Explicit section maps supply heading/anchor context outside core; the current flat section-record demo stays intact.
- No deadlines, developer capacity, runtime dependencies or public release commitments are inferred. Execute one bounded slice at a time.

## Milestones and delivery gates

| Milestone | Outcome | Tasks | Exit checkpoint |
| --- | --- | --- | --- |
| N7 — Inline and documentation search solutions | Installed inline and docs-modal starters with shared optional presentation, CSS customization and honest page/section behavior | RX-6001–6008 | Inline can be adopted independently; modal has its own lifecycle/keyboard evidence; first-wave gallery and documentation match installed bytes |
| N8 — Dropdown, directory and rich results | The remaining search surfaces reuse the N7 foundation and ship with installed examples | RX-7001–7006 | All five solution presentations have real examples, complete states, regression evidence and documented limitations |

N7/N8 use the existing active/release planner track to make dependency-ready work selectable; this is subsequent owner-selected work, not a retroactive prerequisite or reopening of the original candidate. N5 remains outside automatic selection. The original planning turn marked no task in progress; subsequent implementation updates only the selected task.

## Ordered slices

| Task | Outcome | Start dependencies | Primary acceptance gate |
| --- | --- | --- | --- |
| RX-6001 | First working consumer inline preset and additive UI/CSS contract | RX-5005 | A core-only title/link consumer works; legacy defaults and import isolation remain intact |
| RX-6002 | Inline snippets, filters, Load more, complete states and theme controls | RX-6001 | Exact IDs/totals/order, revision-safe accumulation, explicit capability failures and usable CSS overrides |
| RX-6003 | Complete plain browser/Astro inline starters | RX-6002, RX-A100 | Fresh installed consumers work at root/subdirectory bases without repository-only runtime imports |
| RX-6004 | Frozen page/section display, anchor and static-artifact contract | RX-6003 | Counts/ranking/paging/source ranges/bounds and backward compatibility are specified without unresolved load-bearing ambiguity |
| RX-6005 | Optional evidence-backed page/section previews | RX-6004 | Exact page totals and order survive section presentation; independent anchor/highlight fixtures agree |
| RX-6006 | Documentation modal with explicit trigger and safe lifecycle | RX-6005 | Real modal search works with keyboard, close/reopen, optional shortcut and narrow-screen behavior |
| RX-6007 | Complete plain browser/Astro docs-modal starters | RX-6006, RX-A100 | On-demand initialization, failure/retry, correct deep links and ownership work from installed packages |
| RX-6008 | First-wave gallery and scoped qualification | RX-6003, RX-6007 | Inline/modal evidence, examples, docs, site and accepted support scope agree |
| RX-7001 | Accessible compact dropdown search behavior | RX-6008 | Correct combobox state/navigation, bounded real results and full-results handoff |
| RX-7002 | Installed dropdown starter and gallery example | RX-7001 | Header integration works with existing inline destination, themes and teardown |
| RX-7003 | Native multi-filter directory state and explicit URL integration | RX-6008, RX-2003 | Complete membership/counts/paging and Back/Forward replay agree with independent expectations |
| RX-7004 | Directory controls, mobile filters and installed starter | RX-7003 | Search/checkboxes/chips/clear-all/mobile behavior operate one coherent query state |
| RX-7005 | Rich card/grid directory presentation | RX-7004 | Optional metadata/images and view changes preserve IDs/order/totals, semantics and safety |
| RX-7006 | Complete solution gallery and family qualification | RX-7002, RX-7004, RX-7005 | Installed examples, all state/interaction matrices, graph/cost evidence and documentation are synchronized |

## Requirement traceability

| Contract requirement | Primary tasks | Completion boundary |
| --- | --- | --- |
| SS-01 optionality/compatibility; SS-02 native search meaning | RX-6001/6002, all later presets | Legacy behavior and import isolation remain valid alongside each new installed path |
| SS-03 display/capability data; SS-05 safe content | RX-6001/6002, RX-6004/6005, RX-7005 | Required data, providers, validation and artifact compatibility have explicit tests |
| SS-04 CSS customization; SS-07 states/text/accessibility | RX-6001/6002, each surface/starter, RX-6008/7006 | Short customization walkthrough and per-surface state/interaction evidence |
| SS-06 lifecycle/resources | Every runtime/starter task | Cancellation, freshness, ownership, finite bounds and teardown checked at the affected layer |
| SS-08 inline | RX-6001–6003, RX-6008 | Independent installed inline adoption before grouped docs work |
| SS-09 pages/sections | RX-6004/6005, RX-6007 | Frozen mapping contract, exact native page results and verified original anchor context |
| SS-10 modal | RX-6006/6007, RX-6008 | Installed modal, open/close/focus/shortcut/load-race evidence |
| SS-11 dropdown | RX-7001/7002 | Installed result combobox and real inline full-results handoff |
| SS-12 directory | RX-7003/7004 | Complete native filters/counts/pages and explicitly selected URL replay |
| SS-13 rich results | RX-7005 | Same directory membership/order/totals with safe optional metadata/images |
| SS-14 delivery/qualification | All starter tasks, RX-6008/7006 | Fresh installed walkthroughs, gallery and scoped evidence/documentation synchronization |

## Task execution notes

### RX-6001 — Consumer inline foundation

Goal: prove the first usable vertical slice before generalizing shared UI internals.

Work:

1. Inspect existing UI/options/render/query modules, public export checks and installed consumer fixtures. Capture the legacy behavior that must remain stable.
2. Finalize the smallest additive inline entry point, display projection, local state/handle ownership and message/theme contracts described by SS-01–07. Keep old strict options intact.
3. Mount a labeled form with actual native title/link results, deliberate idle state, explicit clear/submit and consumer diagnostics off. Preserve prefix selection and legacy exact defaults.
4. Extract only shared internals needed by this real inline path, preserving sequence/cancellation/teardown. Keep snippet/facet/Inspector installation optional.
5. Add public declaration, package/export/import-graph and focused browser behavior checks for the new entry point and unchanged legacy caller.

Likely areas: `src/addons/ui/`, `package.json` exports, relevant UI compiler/build lists only if needed, `test/ui/`, `test/consumer/`, `docs/api/HOSTS.md`.

Validation: core-only installed inline search returns independently expected IDs/order/counts; Enter/clear/empty policy and destroy/remount work; importing core/preset has no ambient effects. Run the existing UI and relevant consumer checks, then the project check before completing the slice.

Risk/recovery: a broad controller refactor could change the legacy pilot. Prefer additive entry points and a small shared helper boundary; removing the new entry point must leave existing callers functional. Freeze final API names in the contract before dependent tasks use them.

### RX-6002 — Complete inline experience

Goal: deliver the first Pagefind-style consumer search surface, including failure paths and CSS customization.

Work: add explicitly configured source snippets/highlights and simple native string facets; five-result batches and user-triggered Load more; truthful display/total counts; bounded accumulation and continuation; query/filter/revision reset; settled messages and useful retry. Complete stable theme controls for typography, density, borders, colors and dimensions. Preserve selected facet values outside projected buckets and visible omission information.

Likely areas: `src/addons/ui/`, existing evidence/snippet adapters at their public boundary, `test/ui/`, `test/consumer/`, `docs/api/HOSTS.md` and small fixture data.

Validation: independently enumerate every page without duplicates/omissions; mutate the index during loading; combine filters and snippets; test missing providers, empty/failed/refused queries, stale completion, rapid input and composition. Exercise theme overrides, long content, dark/forced colors, reduced motion and narrow layouts. Measure actual graph bytes and maximum configured rendered output separately from memory claims.

Risk/recovery: appending across revisions can mix results. Invalidate accumulation and show a useful restart state; never relabel partial display as complete retrieval. Recover by resetting the result window without discarding the query.

### RX-6003 — Inline installed starters

Goal: let an external consumer adopt inline search without copying the technical pilot.

Work: prepare plain browser and Astro starters with realistic allowlisted content, a complete data-to-display mapping, exact optional registrations, local installation/build instructions, CSS import/customization and ownership-safe disposal. Use the existing Astro loader, preserve base URLs and provide useful no-JavaScript/load-failure guidance. Link starter files from a first gallery entry when the real source inventory is ready.

Likely areas: new solution-specific directories under `examples/`, `integrations/astro/README.md`, `docs/api/`, `site/`, `scripts/lib/pages.mjs`, `test/consumer/`, `test/pages/` and existing Astro integration tests.

Validation: pack/install into a fresh temporary consumer; execute exactly documented steps, replace sample data and a few CSS values, check root and changed subdirectory bases, block/delay assets, destroy during load and verify cleanup. Do not claim a public npm install while packages remain private/unpublished.

Risk/recovery: example files can accidentally import repository internals. Audit installed dependency graphs and copy/run the exact distributed starter. Recovery removes only the new gallery/starter inventory, retaining the Workbench.

### RX-6004 — Page/section and artifact contract

The [frozen detailed contract](../specs/PAGE_SECTIONS.md) selects original-source, owner/revision-bound maps; at most three source-ordered section previews; an optional provider-context evidence projection; and a separate source-only static companion. Native page totals/order/scores and existing v1 formats remain unchanged. [Independent fixtures](../../test/fixtures/page-sections/README.md) give literal source/page/anchor/failure expectations. Runtime implementation is RX-6005, with actual rendered starter targets in RX-6007.

Goal: settle the data semantics before adding grouped documentation presentation.

Work:

1. Specify one-page-record identity and its relationship to owned optional section maps: heading/anchor identity, original field/value ranges, source/display revision and stable URL resolution.
2. Define native page totals/ranking/paging, up to three section previews by default, deterministic preview order, incomplete evidence/omissions and the absence of an exact global section total.
3. Freeze finite per-page/collection map and output bounds, malformed/duplicate/missing-anchor handling and source-field requirements. State what happens when a page matches across multiple sections.
4. Assess whether the current Astro display artifact can carry the optional data additively or needs a separate versioned artifact. Specify old-reader/new-reader behavior and safe fragment URLs; do not silently broaden existing route validation.
5. Define independent fixtures for repeats, mixed fields/values, Unicode/source offsets, missing sections and changed revisions, plus direct/worker parity cases.

Likely areas: `docs/specs/SEARCH_SOLUTIONS.md`, `docs/specs/STATIC_ASTRO.md`, UI display types, Astro artifact/type documentation and fixture definitions. Implementation of runtime mapping belongs to RX-6005.

Validation: review hand-written expected totals/order/anchors/ranges and compatibility cases against actual engine/evidence/loader constraints. Every material mapping, limit and omission rule has an observable expected result before implementation begins.

Risk/recovery: grouping separately indexed sections after pagination would produce false page totals. Keep the one-page-record model; if it cannot meet the goal within existing constraints, record the actual unresolved incompatible choice before changing core. The inline starter remains usable without section maps.

### RX-6005 — Anchored section presentation

Implementation must follow [PAGE_SECTIONS.md](../specs/PAGE_SECTIONS.md): exact exports/options/payloads, 64-section/per-page and collection budgets, one detailed request in flight, source-clipped original excerpts, explicit page-only context refusal versus whole-window recovery, and the separate companion's old/new reader/source-revision rules. Match-evidence parsing still rejects section descriptors; the private section capture/parser extends the optional seam while keeping old requests unchanged. No core/worker-protocol/snapshot change is required. Every branch/limit has an owner in the contract and handwritten fixtures; do not reopen settled behavior as a routine implementation choice.

Goal: add optional Pagefind-style heading context without changing native page retrieval.

Work: implement capture/validation and evidence-to-section projection under the frozen contract; safe parent/child links, bounded previews, original highlights and explicit omissions; add the selected additive/versioned static display delivery. Keep source maps and renderer state outside core and preserve old artifacts/callers.

Likely areas: `src/addons/ui/`, `integrations/astro/src/` only for the approved artifact extension, section fixtures, `test/ui/`, `test/consumer/`, `test/integrations/astro/` and related API guides.

Validation: compare native IDs/scores/totals/pages with section presentation enabled and disabled; verify anchor targets and original ranges independently; exercise source and offset providers, direct/worker execution, stale/mixed maps and artifacts, unavailable evidence and finite limits. Verify old artifacts and flat-section demos remain valid.

Risk/recovery: wrong offsets or stale maps can create convincing but incorrect context. Reject incoherent data and keep a valid page result with an explicit missing-context state when the declared contract allows it. Disabling the optional projection restores ordinary page results without rebuilding core.

### RX-6006 — Documentation modal

The [concrete modal contract](../specs/DOCS_MODAL.md) freezes the additive `mountRaveldexModal`/CSS/types surface, preservation/reset policy, private inline suspension, opener and backdrop rules, document shortcut coordination, conditional scroll/trigger restoration and failure/cleanup boundaries. It accepts an already supplied borrowed owner; first-open loading remains the starter slice.

Goal: provide a complete docs-search interaction around the proven inline/results foundation.

Work: explicit trigger and native dialog, input/header/results/footer structure, close at every size, native focus containment, opener restoration, close/reopen query policy, optional coordinated shortcut, safe backdrop activation and scrolling restoration. Suppress late loader/search completion and preserve borrowed-engine ownership. Use the page/section view only when supplied.

Likely areas: `src/addons/ui/`, preset CSS, `test/ui/`, `test/consumer/`, `docs/api/HOSTS.md` and modal fixtures.

Validation: keyboard open/search/navigate/close, native modified links, pointer dismissal/drag, repeated trigger activation, opener removal, multiple instances, composition, teardown while open/searching and worker/transport failure. Check 320-pixel/zoomed layouts, long results, theme overrides and actual mobile keyboard behavior where tools are available.

Risk/recovery: global shortcuts and page scroll changes can affect unrelated application controls. Keep them opt-in, locally owned and reversible; destroy removes listeners and restores only the state owned by this instance. No blanket custom Tab loop or global initialization.

### RX-6007 — Documentation modal starters

Goal: ship installed plain browser/Astro integrations with on-demand data loading and real anchored destinations.

Work: create complete starter pages, explicit first-open loader/owner wrapper, deduplicated concurrent loading, retry, close/destroy cancellation, query preservation and local-tarball setup. Document source/map generation by the application and required add-ons. Verify section URLs against actual generated headings, including subdirectory bases.

Likely areas: `examples/`, `site/`, public starter inventory, API/integration guides, `test/consumer/`, `test/pages/` and Astro browser fixtures.

Validation: fresh paired core/Astro installation, real static build/preview, asset delay/failure/stale build, open-close-open races, Escape before loader completion, navigation and disposal. The copied example must run without Workbench selectors or repository-only imports.

Risk/recovery: a late loader can leak an engine or reopen the UI. Generation/abort ownership must dispose newly created abandoned owners while leaving borrowed owners alone. Preserve a normal browse-docs destination if search cannot initialize.

### RX-6008 — First-wave gallery and qualification

Goal: make inline/modal discoverable and establish the scope actually verified before later solutions start.

Work: finish two working gallery entries with starter source/download links and compact CSS recipes; run the complete state/interaction matrix against installed bytes; collect responsive screenshots, scoped human observations and graph/output measurements; review compatibility and document remaining manual/platform limitations. Synchronize API/example guides, context, handoff and task evidence.

Likely areas: `site/`, generated approved public inventory, `docs/api/`, `examples/README.md`, `test/pages/`, `docs/evidence/`, `PROJECT_CONTEXT.md`, `CODEX_HANDOFF.md` and canonical roadmap.

Validation: all inline/modal task acceptance criteria have their own evidence; the shared Workbench and existing site browser suites remain valid; public docs accurately show installed APIs and package availability. Missing speech/device evidence is named and does not become an accessibility qualification claim.

Risk/recovery: a gallery can make a partially qualified feature appear universally ready. State required capabilities and exact verified scope beside each starter. Restore the prior public inventory if the gallery build fails; do not delete repository evidence or weaken Jekyll exclusions.

### RX-7001 — Compact dropdown behavior

Implemented: see the [concrete combobox/grid/native-popover contract](../specs/DROPDOWN.md) and [actual acceptance/review record](../evidence/RX-7001.md). The runtime, separate CSS, public types and installed regression fixtures are delivered; the complete browser header/full-results project and gallery are delivered by RX-7002. Human AT/physical input/actual zoom are unclaimed, and recorded WebKit/Firefox boundaries stay explicit.

Goal: implement the compact search-result combobox after the first-wave foundation is verified.

Work: finalize the APG-aligned input/popup/gridcell structure, stable active IDs, arrow navigation, Enter/Escape/Tab behavior, composition and native editing; bounded actual result display with exact totals; explicit full-results destination; safe outside dismissal and coordinated optional shortcut. Reuse native query, result and state primitives without converting inline lists into comboboxes.

Likely areas: `src/addons/ui/`, CSS, dropdown browser fixtures and public consumer types/docs.

Validation: keyboard/pointer/screen-reader state mapping, stale active options during updates, empty/failure/no-results, long/narrow positioning, zoom, multiple instances and destroy. Verify full-results handoff preserves query meaning and native links keep modified activation.

Risk/recovery: visual selection can diverge from assistive state or a stale result can be activated. Clear invalid active IDs atomically with result replacement. An explicitly configured inline results destination remains the fallback navigation route.

### RX-7002 — Dropdown installed starter

Implemented: the [twelve-file browser project](../../examples/dropdown-browser/README.md) and [gallery](../../site/Dropdown.astro) have fresh installed root/subdirectory, actual query/link/complete-page, data/CSS, lifecycle and explicit shared-owner modal evidence. [RX-7002](../evidence/RX-7002.md) records independent review, the confirmed native pointer-focus repair and all final commands/identities/manual limits. No Astro starter, directory/history layer or public library API is added.

Goal: provide a working header integration with a real full-results page.

Work: prepare and document a packed-installed header example, full-results inline route and theme overrides. Define narrow-screen behavior; enable modal handoff only as an explicit option with shared query/owner identity. Add the real gallery entry and complete replacement-data/disposal instructions.

Likely areas: `examples/`, `site/`, starter inventory, API guides and installed/browser tests.

Validation: copy/run the installed example; check result/full-results links at root/subdirectory bases, dark/forced colors, outside dismissal, optional handoff and native keyboard behavior. Update the public inventory from sources.

Risk/recovery: header embedding may clip the popup or register competing shortcuts. Document positioning/overflow constraints, coordinate bindings and preserve the inline destination as a usable recovery.

### RX-7003 — Directory query and URL state

Goal: prove exact multi-selection and navigation state before building the full directory controls.

Implemented; [acceptance evidence](../evidence/RX-7003.md). The separate `/addons/ui/directory` entry supplies a nonvisual borrowed-engine controller and explicit structural-host URL binding. The [owning contract](../specs/DIRECTORY.md) defines captured state/results, native conjunctive counts, bounded page/revision recovery, opt-in name ownership and push/replace semantics. No DOM, CSS, starter or gallery is added here; those remain RX-7004.

Work: compose native text plus OR-within/AND-across string filters, browse-all policy, native conjunctive facet requests and complete paging; add explicit bounded URL encoding/decoding, unrelated parameter/hash preservation, push/replace policy, Back/Forward replay and loop suppression. Preserve selected values outside the projected buckets and explicit ownership across instances.

Likely areas: optional UI/state helpers, filters/facets public boundary, `test/consumer/`, `test/ui/` and contract/API documentation. Do not modify the core scorer or introduce persistence.

Validation: compare full generated/hand-written filter combinations with an independent scan, native counts and complete pages; replay valid/invalid/stale URL states, query edits, navigation and index revisions. Query strings are written only when URL integration is explicitly selected.

Risk/recovery: own-filter counts can be confused with disjunctive counts, and URL replay can loop or overwrite another feature. Keep conjunctive counts explicit and manage only declared parameter names; replay does not push another history entry. Turning URL integration off leaves in-memory search usable.

### RX-7004 — Directory controls and starter

Goal: complete a usable filterable resource library around the verified state model.

The [concrete view/adoption contract](../specs/DIRECTORY_VIEW.md) defines the separate DOM entry, explicit CSS, borrowed-controller lifecycle, native disclosure, focus/IME recovery and complete installed browser/Astro projects. The nonvisual RX-7003 entry remains DOM-free. Delivered with scoped [acceptance evidence](../evidence/RX-7004.md), actual browser/source identities and a separately unrun human/device handoff.

Work: native grouped checkboxes, exact counts and selected states, removable chips, clear-all, page navigation, mobile filter disclosure/dialog and sensible empty-query browsing. Supply realistic content, plain browser/Astro integration instructions and a working installed gallery example.

Likely areas: `src/addons/ui/`, CSS, `examples/`, `site/`, starter inventory, API docs and consumer/browser fixtures.

Validation: search/filter/page combinations, zero-result recovery, projected/selected values, chip focus after removal, clear-all, Back/Forward, mobile open/close and revised collection state. Check keyboard/labels/announcements, zoom/reflow and actual copied installed examples.

Risk/recovery: rebuilding controls can discard focus or silently remove selected filters. Preserve stable controls and recover to an available adjacent control when removing a chip. A simple unfiltered directory remains a deliberate reset route.

### RX-7005 — Rich card/grid presentation

Goal: support editorial/catalogue result presentation with the same directory state.

The [concrete rich display contract](../specs/DIRECTORY_CARDS.md) and [acceptance evidence](../evidence/RX-7005.md) record the separate optional entry/CSS, finite safe projection, unchanged native state, image opt-in/failure/lifecycle and complete browser project/gallery.

Work: optional declared metadata/image projection, safe URLs and text, appropriate image alternatives/dimensions/error state, semantic list/grid CSS and compact/comfortable theme recipes. Preserve native order and query/filter/page state across view changes. Avoid arbitrary HTML templates, commerce actions and displayed-page sorting.

Likely areas: UI result presentation/styles, display validation, examples/gallery, consumer/browser fixtures and guides. Add a static display extension only if it is required and versioned under the existing compatibility rules.

Validation: equal IDs/order/totals in list and grid, missing/long/localized/hostile metadata, broken images, image loading boundaries, long titles, narrow/zoomed layout and keyboard reading order. Measure optional image/render cost separately from the baseline.

Risk/recovery: images/metadata can change layout or introduce unsafe rendering. Reserve space, validate at capture and retain text-only cards as recovery; turning images/grid off leaves directory behavior unchanged.

### RX-7006 — Full gallery and family qualification

Goal: finish the adoption path and verify shared behavior across all prepared solutions.

Delivered with scoped [family evidence](../evidence/RX-7006.md), a [per-surface/project matrix](../evidence/RX-7006-matrix.md), current source identities and a separately unrun [manual handoff](../evidence/RX-7006-manual.md). The five static gallery links, complete eight-project capability/keyboard guidance, independently expected native results/states, actual copied projects and bounded output/image observations are verified locally; this is not publication or universal browser/AT qualification.

Work: complete the solution chooser, working previews, exact starter/source links, CSS recipes, capability/data matrix and state/keyboard guidance. Run fresh installed examples, family regressions, source/offset/direct/worker matrices where applicable, actual browser checks and measured optional graphs/output costs. Review the resulting boundaries and synchronize planning/context/docs without publication.

Likely areas: `site/`, `examples/`, API/integration guides, public inventory, consumer/UI/site tests, evidence, context/handoff and roadmap.

Validation: every solution can be adopted using its documented files and installation steps; manual limitations and support claims match evidence; all old completed tasks remain unchanged; new tasks become done only with their own acceptance records. A final full check is regression evidence, not a replacement for per-surface observations.

Risk/recovery: shared changes can fix one surface while regressing another. Use a per-surface acceptance matrix and independent result expectations; revert only the new shared/presentation change if it violates legacy compatibility.

## Critical path and coordination

The first-wave path is RX-6001 → RX-6002 → RX-6003 → RX-6004 → RX-6005 → RX-6006 → RX-6007 → RX-6008. The inline-starter checkpoint before the section contract is an intentional delivery-priority gate, so users get a complete inline solution before a larger data change. The legacy UI, native filters and Astro adapter are already completed prerequisites, not tasks to repeat.

After RX-6008, N8 has two technically independent branches: RX-7001 → RX-7002 for dropdown adoption, and RX-7003 → RX-7004 → RX-7005 for directory/cards. RX-7006 joins both branches. The manifest's stable array order recommends dropdown first without pretending that directory queries depend on a dropdown starter.

Inline adoption is useful at RX-6003 before section/modal work. RX-6004 is the architecture/data checkpoint; RX-6008 is the first complete product-adoption checkpoint. Dropdown/directory/cards do not precede those first-wave outcomes.

There is no requirement to run parallel agents. Once public contracts and fixtures are fixed, independent fixture review, screenshots and documentation drafting may overlap implementation only when file/contract/environment ownership is clear. Shared UI, export lists, static artifact schema and gallery inventory remain coordinated; overlapping edits are not an optimization by default.

## Verification matrix and actual commands

| Boundary | Required evidence | Earliest task |
| --- | --- | --- |
| Legacy/native compatibility | Same old UI defaults, exact retrieval/order/totals, optional import isolation and no unexpected capabilities | RX-6001 |
| Consumer presentation | Core-only operation, explicit snippet/facet requirements, safe metadata, messages and CSS customization | RX-6001/6002 |
| Paging/revisions | Every displayed page/batch, no duplicates or omissions, stale query/filter/revision suppression | RX-6002 |
| Static adoption | Fresh paired tarballs, exact copied example, root/subdirectory URLs, loading/retry/disposal | RX-6003/6007 |
| Section semantics | Independent original-range/anchor fixtures, exact page totals/ranking, bounded incomplete previews | RX-6004/6005 |
| Transient interactions | Focus/opener/keyboard, close/reopen, composition, mobile keyboard, shortcut ownership and late loading | RX-6006/7001 |
| Directory state | Independent multi-filter membership/counts/pages, URL replay and focused control recovery | RX-7003/7004 |
| Rich presentation | Same IDs/order/totals, image alternatives/failure, safe metadata and semantic reading order | RX-7005 |
| Adoption and support scope | All installed starters, state matrix, accessible/theme/responsive observations, accurate remaining limits | RX-6008/7006 |

Use configured repository commands, focusing first and broadening after a successful slice:

- Planning/doc changes: `npm run handoff:check`, `npm run docs:generate`, `npm run docs:check`, `npm run handoff:status`, `npm run handoff:next`.
- UI/runtime changes: `npm run test:ui`, relevant `npm run test:consumer` checks, and `npm run check` before completing the slice.
- Filters/facets/worker changes: `npm run test:filters`, `npm run test:facets`, `npm run test:worker` when their behavior or adapters are affected.
- Installed Astro behavior: the existing `test/integrations/astro/runtime.test.mjs` and `test/integrations/astro/browser.test.mjs` suites; extend them when new artifact/section contracts require it. Pack examples in a fresh temporary directory using the established preparation flow; never weaken private guards.
- Gallery/site changes: `npm run pages:build`, `npm run pages:check` and both existing `test/pages/browser.test.mjs` and `test/pages/workbench.test.mjs` suites, allowing the repository's documented browser timeout. Rebuild approved generated output from sources.
- Final regression: `npm run check` after relevant focused checks and fixes. Repeat expensive suites only when changed behavior or an unresolved failure justifies it.

These commands are future implementation verification requirements, not claims that new solutions were tested during planning. The planning edit itself also runs the repository-required full check; any tooling/environment refusal is reported separately from implementation status.

Manual checks per new surface include keyboard/focus/modified links, deliberate result announcements with exact browser/OS/AT versions, physical IME, 320/390/768/1024/1536 CSS pixel reflow, actual 200%/400% zoom as applicable, mobile touch/on-screen keyboard, light/dark/forced colors, reduced motion, long/RTL labels and every loading/empty/refused/error/teardown state. Unavailable environments remain Not run/Blocked for the corresponding claims; scripted proxies do not establish those observations.

## Risks and mitigations

| Risk | Impact | Mitigation/checkpoint |
| --- | --- | --- |
| Broad shared-controller redesign | Legacy UI/Workbench regression | Additive inline slice first, frozen old caller behavior, only extract helpers demanded by implemented surfaces |
| Misleading page grouping | False totals/order/pages or broken anchors | One native page record; freeze complete section contract at RX-6004; independent range/count fixtures |
| Mixed search/evidence/URL revisions | Wrong visible results and counts | Generation/revision checks, atomic state invalidation, deterministic URL replay |
| Public artifact/URL changes | Broken existing Astro consumers | Additive/versioned optional data; old/new reader fixtures and subdirectory link checks |
| CSS that requires internal DOM knowledge | Adoption remains expensive | Stable scoped style hooks/tokens, copied starter and small override walkthrough |
| Missing optional capability | Apparently successful but incomplete UI | Minimal title/link path; explicit requirements/refusal for requested snippets/facets/sections |
| Shortcut, focus or scroll leaks | Other application controls stop behaving normally | Opt-in bindings, native dialog/combobox semantics, local ownership and teardown/race tests |
| Overstated Pagefind parity | Users assume extraction/lazy-index behavior | Document exact UI resemblance and separate indexing/loading non-goals |
| Overstated accessibility/resource support | Public claims exceed observations | Per-task command/environment/source evidence; distinguish automated, human, bytes/work and memory/device results |
| Scope growth | Inline/modal delayed by unrelated features | First-wave gate before dropdown/directory/cards; keep sorting, crawling, arbitrary templates and release outside this plan |

## Resolved specification inputs

These task-owned inputs were finalized by their implemented contracts and acceptance records; they are not outstanding owner-approval gates:

| Detail to freeze | Owning task | Constraint already selected |
| --- | --- | --- |
| Additive export/option/handle names, message bundle and stable theme properties | RX-6001 | Small optional entry points, strict old options unchanged, borrowed-engine ownership |
| Accumulation/output bounds and accessible continuation when a lower display cap is reached | RX-6002 | Exact native total, no silent truncation, all matches reachable through bounded paging |
| Section-map schema, deterministic preview selection, malformed/overlapping-anchor policy and concrete limits | RX-6004 | One page record, original ranges, bounded previews, no fabricated section total |
| Additive versus separate-version static display artifact and fragment representation | RX-6004 | Existing artifacts and directory routes remain valid; old/new readers have explicit behavior |
| Dropdown narrow-screen layout and optional modal handoff wiring | RX-7001/7002 | Explicit handoff preserves one owner/query; no automatic second engine |
| URL parameter namespace, encoding, push/replace behavior and replay recovery | RX-7003 | Explicit opt-in, finite input, unrelated state preserved, no history loop |

All selected implementation tasks are complete; no specification input in this table remains open. If source inspection shows that a selected behavior requires an incompatible legacy/artifact change, new runtime dependency, different data ownership or engine semantics, record that specific decision before dependent implementation rather than silently expanding the plan.

## Delivery, recovery and completion rules

- Add implementation evidence only after it exists. Each task's intended `docs/evidence/RX-####.md` destination belongs in verification text, not its initially empty evidence list.
- A task becomes done only when its own acceptance results, review and affected documentation agree. Keep implementation, verification and synchronization statuses separate, especially for missing human/platform observations.
- The new gallery is additive to the existing Workbench. Preserve original corpus/judgments and current public inventory exclusions. Update user-facing examples only after the corresponding installed API exists.
- No data migration is assumed. If the optional static display contract requires one, RX-6004 must define compatibility and recovery before writing changed artifacts. Do not change source/native snapshot semantics to support presentation.
- Recovery is local: remove/unmount a preset or new gallery entry while retaining the engine and legacy UI; dispose only starter-owned engines. Do not erase application data or silently switch execution hosts.
- Publication, package/version changes, remote issue synchronization, commits, pushes, tags/releases, visibility changes and hosted deployment remain separate from this planning change.

## Immediate next actions

1. Read the selected task card, owning behavior contract and current evidence; recheck the worktree and `npm run handoff:next`.
2. RX-6001–RX-6008 delivered the inline/modal foundation, controls, all four complete installed starters, the frozen page/section contract, optional section presentation and first-wave gallery/qualification. RX-7001 now delivers the compact dropdown runtime. RX-7002 now delivers the complete installed browser header/full-results project and gallery. RX-7003 delivers native directory query/URL state. RX-7004 adds directory controls, complete browser/Astro projects and gallery. RX-7005 adds rich result projection and a complete browser project/gallery. RX-7006 completes the five-solution chooser and scoped local family qualification. All selected tasks are complete; a later continuation should reconcile remaining manual/platform/release decisions or an explicitly selected optional task rather than repeat completed implementation. Do not repeat completed N7 work or change native page semantics.
3. When asked to continue, mark the next dependency-ready task in progress and regenerate before implementation. Preserve legacy behavior and do not repeat the completed foundation.
4. Collect that task's own acceptance evidence, resolve review findings and synchronize docs before marking it done; later tasks and publication are not part of the current slice.
