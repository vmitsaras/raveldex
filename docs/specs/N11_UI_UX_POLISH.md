# N11 — Raveldex-native consumer identity and usability

## Status and outcome

Planned on 5 November 2026 from the owner's plugin UI/UX and persona review. This selects planning and GitHub registration only; no plugin, CSS, demo, dependency or public API implementation is part of registration. The November 7 owner amendment removes the N10-closeout dependency: use accepted RX-7006/RX-9003 and isolate frozen measurement artifacts; same-host timing isolation is scheduling, not a prerequisite for UI design. No deadline or assignee is inferred.

The outcome is Raveldex's own clear, recognizable, host-friendly consumer experience: clear results, visible context and optional explanations. Familiar search interactions remain useful; Pagefind migration is a secondary use case, not the design target. Scope covers the shipped inline, modal, dropdown, directory and cards add-ons and their integration guidance. The legacy developer workbench remains supported under its existing contract.

## Raveldex design direction and finite acceptance

RX-9101's [consumer identity and interaction contract](N11_CONSUMER_CONTRACT.md) selects **Reading index**: a readable result column, strong linked titles, available context, quiet excerpts and optional explanation. It reconciles F01–F11 against current source/test coverage, maps existing CSS roles to concrete implementation targets, and specifies the five surfaces' shared states and intentional differences. Its design targets are for subsequent delivery tasks; they are not a claim that new styling or copy has shipped.

The [November 7 amendment](../planning/SCOPED_QUALIFICATION_AND_IDENTITY_20261107.md) governs current scope. RX-9101 selects one implementable direction from at most two initial alternatives; RX-9107 applies it. Use restrained readable surfaces, clear title/source/snippet hierarchy, compact optional context, a single configurable accent, deliberate typography/spacing/density and distinct match-versus-focus treatment. Supporting evidence is progressive disclosure, not default numeric/debug chrome. Reuse existing Raveldex identity without importing its dense technical Workbench into consumer interfaces.

The five existing presentations should feel related while respecting their different native interactions. Tokens/classes remain scoped and host-overridable; CSS is optional, fonts/assets are local or host-selected, and no new framework, renderer API or mandatory Inspector is introduced. Originality is not permission to invent unfamiliar editing, focus or link behavior. Record the rationale and review actual states; changing a Pagefind logo/color is not an original design acceptance.

Verification reuses existing shared-component coverage. One primary installed-candidate pass covers changed behavior plus desktop/narrow layouts, forced colors/reduced motion and long-text RTL. Focused secondary-engine smoke remains where relevant. A short real keyboard/screen-reader/zoom walkthrough records actual tools/versions and observations. Known essential behavior failures block acceptance; unavailable expanded device/AT combinations limit claims rather than force environment acquisition or a full statistical benchmark. No unchanged-core benchmark or repeated full build is required for evidence-only edits.

## Evidence and limitations

The preceding review inspected current source, public contracts, existing tests and retained component screenshots. It did not run fresh browser tests, measure contrast or observe screen-reader speech, physical keyboards, mobile keyboards or actual browser zoom. Existing tests are coverage evidence, not a fresh passing run. Findings describe adoption and polish gaps; deliberate contracts are not automatically implementation defects.

Current source anchors include `src/addons/ui/inline.ts`, `inline-render.ts`, `inline.css`, `dropdown.ts`, `dropdown.css`, `modal.ts`, `modal.css`, `directory-view-mount.ts`, `directory-view-options.ts`, `directory.css`, `types.ts` and `directory-cards-types.ts`. Public contracts live in the related search-solution, modal, dropdown and directory specifications and `docs/api/HOSTS.md`.

## Reviewed findings and task coverage

| Finding | Impact | Planned task |
| --- | --- | --- |
| F01: Primary integration guidance can lead a consumer to the legacy workbench, with Inspector and numerical scores, before the consumer presets. | High | RX-9102 |
| F02: Idle inline/modal facet controls initially offer only All; buckets require a successful query and are reset when cleared. | High | RX-9103 |
| F03: Load more, Previous and Next expose multiple pagination concepts and persistent unavailable controls. Persistence currently protects focus. | Medium | RX-9104 |
| F04: Technical count/error copy, generic empty states and an ambiguous Clear label make recovery harder. Clear currently resets query and filters. | Medium | RX-9103, RX-9105 |
| F05: Dropdown selection keys and surface-specific Escape behavior need clearer discoverability. | Medium | RX-9106 |
| F06: Theme behavior, result-link target comfort and narrow header layouts differ across consumer surfaces. | Medium | RX-9107 |
| F07: English defaults and partial message overrides need a coherent localization adoption path. | Medium | RX-9108 |
| F08: Rich metadata and generated matching snippets/sections are available through different surface contracts. | Medium | RX-9102, RX-9109 |
| F09: Counts describe the fully filtered set; a zero-count unselected OR option can still expand the result set when added. | Medium | RX-9110 |
| F10: Captured display data and repeated mounts need clearer CMS refresh/remount and state-preservation guidance. | Medium | RX-9111 |
| F11: A migration-led brief does not define a recognizable Raveldex visual identity. Define result hierarchy, density, typography, spacing and state treatment rather than emulate a competitor. | High | RX-9101, RX-9107, RX-9112 |

RX-9101 establishes the scenario/state contract; its [local acceptance and independent review](../evidence/RX-9101.md) records the selected design without changing runtime behavior. [RX-9102 acceptance](../evidence/RX-9102.md) records native-first adoption guidance, the capability map and secondary migration appendix. [RX-9103 acceptance](../evidence/RX-9103.md) records query-first filter guidance and truthful reset labels without changing query/reset semantics. [RX-9104 acceptance](../evidence/RX-9104.md) records focus-safe action visibility, exact ranges and explicit appended-content discovery. [RX-9105 acceptance](../evidence/RX-9105.md) records safe contextual empty feedback, friendly recovery and preserved translated/typed diagnostics. [RX-9106 acceptance](../evidence/RX-9106.md) records surface-specific keyboard guidance, native Escape parity, accessible descriptions and readable long help. [RX-9107 acceptance](../evidence/RX-9107.md) records coherent scoped Reading index styling, complete host themes and sampled rendered contrast/target evidence. [RX-9109 acceptance](../evidence/RX-9109.md) records the source-verified native content matrix, scenarios and reviewed keep-current rich-display boundary. [RX-9110 acceptance](../evidence/RX-9110.md) records plain current-result counts, a zero-choice expansion example and preserved native filtering/focus. [RX-9108 acceptance](../evidence/RX-9108.md) records the complete message inventory, checked German bundles, explicit fallback/number/remount contract and installed localization cases. [RX-9111 acceptance](../evidence/RX-9111.md) records the installed CMS update/remount walkthrough, explicit query/map/state boundaries and owner/focus cleanup. [RX-9112 acceptance](../evidence/RX-9112.md) records current primary 25/25, focused WebKit 10/10 and clear identity/journey reviews, with exact evidence reuse. The user subsequently reports correct Chrome/VoiceOver/macOS announcements and usable actual 200%/400% browser zoom, recorded within that human scope. The authorized tracking closeout aligns all twelve tasks and the overview as closed/completed, with milestone 11 closed; N11 is 12/12 accepted. Self-contained issue summaries distinguish current local artifact paths from uncommitted source/evidence, with no source push or publication claimed. The aggregate milestone-counter inconsistency and expanded unobserved combinations remain explicit in the evidence.

## Personas and observable scenarios

| Persona | Scenario and expected outcome |
| --- | --- |
| First-time Raveldex adopter maintaining documentation or an application | Chooses inline/modal/dropdown from a clear capability map, prepares explicit records and heading targets, installs only needed modules/CSS, and reaches consumer search without accidentally choosing the workbench. |
| Visitor with cognitive or attention constraints | Understands idle filter availability, submits a query, changes filters, reaches zero results and recovers without guessing what reset will erase. |
| Keyboard-only researcher | Enters a query, discovers dropdown selection keys, follows a native result link, loads another batch and retains a predictable focus location and path to new content. |
| Screen-reader user | Distinguishes idle, settled loading, result totals, appended results, empty and failed requests; can retry without stale replies or duplicate announcements taking over. Speech requires human observation. |
| Mobile visitor with limited dexterity | Uses a compact search header and result links comfortably, opens/dismisses a modal, and can reach actions while the on-screen keyboard is present. |
| Low-vision multilingual visitor | Reads long translated labels in LTR/RTL, host light/dark themes, forced colors, narrow viewports and actual enlarged browser zoom without losing information or focus. |
| CMS integrator maintaining a live catalogue | Applies an engine update, refreshes or remounts captured display data deliberately, restores app-owned query/filter state where supported and releases UI/engine resources in the documented order. |
| Directory shopper | Adds a second OR choice after selecting the first, understands what displayed counts describe, and can remove filters without zero-count choices being wrongly disabled. |

For each applicable surface, the contract must cover idle, composing, loading, results, append/window navigation, empty, failure/retry, clear/reset, close/reopen, refresh and destroy. Include delayed/out-of-order responses, long text, missing optional capabilities and multiple instances where relevant. Preserve native browser link and editing behavior.

## Fixed boundaries and decision gates

- Preserve native TypeScript/ESM, optional DOM/CSS/providers, no foreign engine, no new runtime dependency and no core import-time host effects.
- Preserve exact totals, deterministic native order/scores, original source offsets, revision consistency, capability failures, cancellation, stale-response suppression, IME handling, safe text insertion and teardown/borrowed-engine ownership.
- Do not alter the frozen legacy workbench or change its omitted-mode semantics to improve consumer adoption; correct the route to consumer presets instead.
- Idle search currently performs no automatic query. Do not silently introduce browse-all searches to populate filters. Prefer truthful guidance or presentation under that contract. A new browse action or changed idle contract needs an explicit product decision first.
- Persistent navigation protects focus. Any simpler presentation must establish how a focused control survives result transitions and how appended content is discovered before replacing the behavior.
- Counts remain conjunctive over the complete current filtered set; OR-within/AND-across groups remains unchanged. Disjunctive or predicted counts are outside this milestone unless separately selected.
- Rich-result work first produces a capability matrix and a bounded compatibility decision. A shared display API, renderer callback or added retained metadata is not implicitly approved. A documented keep-current decision can complete that decision task; extension implementation requires separate selection.
- Localization reuses explicit message capture/overrides where possible. Automatic page-language selection, plural/number formatting APIs or new public fields must be specified before adoption; UI translation is separate from query analysis.
- Do not add a crawler, background polling, live subscription or new persistence layer to imitate another product. Static indexing remains explicit and CMS state remains app-owned under existing contracts.
- Do not redesign demo pages, change ranking, raise engine limits, publish packages, deploy, tag or release as part of N11. Test fixtures and usage documentation may change only to prove or explain plugin behavior.

## Sequence and completion gate

RX-9101 follows accepted RX-7006 and RX-9003, independently of RX-9007, and confirms the original identity and state/decision matrix before implementation. RX-9102–RX-9111 follow that contract; localization follows settled copy/keyboard/count messages. RX-9112 depends on every delivery/decision task. Parallel edits to shared UI/message files need explicit ownership; timing collectors remain serial with no builds/tests alongside them.

Completion requires behavior-level regression evidence for changed states, installed consumer verification of each affected surface, visual review under the agreed theme/responsive/translation matrix, and a reviewed scenario report mapping F01–F11 to acceptance criteria. Follow the finite, risk-based qualification amendment rather than multiplying every persona by every platform/theme/state. Capture actual browser/OS/assistive-technology versions and distinguish automated keyboard checks from human speech, actual zoom and physical-device observations. Required unavailable observations remain Blocked or Not run; they are not inferred from screenshots, emulation or axe.

Record actual commands, reviewed source/artifact identities, limitations and review outcomes in each produced `docs/evidence/RX-91xx.md` before marking that task done. Only existing evidence paths belong in the canonical manifest. Keep public guidance, relevant specifications, generated plans and GitHub state aligned; publication remains separate.

## Migration references

The review consulted Pagefind's [current component UI](https://pagefind.app/docs/search-ui/), [supported default UI](https://pagefind.app/docs/ui-usage/), [default UI options](https://pagefind.app/docs/ui/) and [static build integration](https://pagefind.app/docs/running-pagefind/). These serve only an optional migration appendix. They are not visual references, pixel/layout tests, API contracts, feature-parity goals or release criteria for Raveldex. Recheck official documentation before writing version-sensitive migration claims.
