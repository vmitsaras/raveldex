# Search Workbench site contract

Approved direction: the owner selected the generated Search Workbench preview on 2026-10-30 and requested implementation with a task breakdown. The reference is [the saved preview](../research/site-design-previews/search-workbench.png).

## Goal and boundaries

Implement the reference's white reading surface, bold sans-serif hierarchy, chartreuse actions, graphite working search panel and integration follow-through in the existing static Astro-generated documentation site. Home, documentation navigation and the dedicated demo form one visual family. Preserve the existing guides, public URLs, deep links, real corpus, native package UI and publication exclusions.

No new framework, runtime dependency, web font service, telemetry, backend, search engine or public API. No publication, remote tracker writes, version changes or package release. The original 31 completed tasks remain complete. N6 records this newly authorized site work.

## Required behavior

- Home has the reference headline, short explanation, Getting started action, working search and integration links. Retain the existing working example and task destinations below the main composition, including existing heading IDs.
- Search uses the real locally packed/installed package and the existing five-guide usage corpus. Totals, snippets, pagination, filters and Inspector remain accurate and available. Initial home query is `module worker`; the dedicated demo keeps its ordinary empty-query start.
- Home requests one hit per page and configures the existing snippet provider for one window of at most 160 UTF-16 units. Its omission message remains visible. The dedicated demo and frozen qualification defaults remain unchanged.
- Example-query buttons submit actual queries. They are unavailable during initialization or after teardown, retain focus when used, and are removed from tab order when unavailable. Home and demo load the same bundle and resolve corpus/worker resources relative to that bundle, independent of the page route.
- Dedicated demo retains representation, query-mode and worker controls; destroy/reinitialize and latest-request suppression remain intact. Homepage offers retry for initialization failure without exposing those advanced settings.
- All content and navigation remain usable without optional JavaScript. The search panel supplies loading, failure and no-JavaScript explanations with direct guide links. Search itself requires JavaScript.
- Reuse the package UI's existing semantics and lifecycle. Site styles are scoped outside core and never hide totals, errors or functional controls to resemble a simplified image.
- Keep native links, buttons, labels and dialog behavior. Retain visible focus, keyboard submit, composition handling, Inspector focus restoration and safe text rendering. No essential motion or hover-only meaning.
- Reflow at 320, 390, 768, 1024 and 1536 CSS pixels. Long code and reference tables may scroll within their own containers; the viewport must not scroll horizontally. Use system fonts and local assets.
- Preserve `/raveldex/` links, strict public inventory, Jekyll exclusions and source/asset identity checks. Generated output must be rebuilt from sources.

## Task sequence and evidence

### Owner-requested final-word completion (RX-5005)

The subsequent owner request on 2026-10-30 authorizes final-word prefix matching as the home and ordinary demo default, with exact-word and strict adjacent phrase search retained in Advanced settings. This supersedes the original demo query-mode default and permits one additive optional UI mode, `prefix`; the library's omitted-mode default remains `text`. Core query/scoring contracts and the frozen qualification pilot remain unchanged.

Earlier basic Unicode words must match exactly. The last word expands from two normalized Unicode code points; a shorter ending falls back to exact words. Empty input browses all records, punctuation-only input matches none, and trailing spaces/punctuation do not disable completion. Preserve raw slices for native analysis/validation. Do not stem, correct typos, broaden earlier words, replace totals, truncate expansions silently or hide native errors. Snippets and Inspector use the same typed query as retrieval and pagination, with native prefix occurrences highlighting complete original words.

Verify exact ordered IDs/totals against the independent source oracle, all result pages without duplicates or omissions, category constraints/counts, and original source text/highlight ranges in direct and worker execution with source and offset providers. Mode/host/provider switches retain input and reset category/page. Verify both advanced modes, focus, composition, cancellation, errors, Inspector and teardown. Record actual environments and manual limitations in the RX-5005 evidence record.

### Original site sequence

The canonical roadmap owns status and detailed acceptance criteria:

1. RX-5001 — Shared site shell, typography and responsive reading styles.
2. RX-5002 — Reference homepage with real packed search and sample-query behavior.
3. RX-5003 — Dedicated demo using the same workbench, retaining advanced behavior.
4. RX-5004 — Browser/state/responsive review, evidence and documentation synchronization.

Each task gets its own existing evidence record before it is marked done. Focused checks accompany each slice; final verification includes `npm run check`, site generation/inventory checks and browser tests. Record screenshots and actual environment versions. Automated browser checks do not establish human screen-reader, physical IME, actual browser zoom or hosted deployment qualification.

## Visual interpretation

The reference is an image concept rather than a pixel contract. Preserve its hierarchy, proportions, color relationships and directness while accommodating real search output, category controls, counts and failure behavior. Do not reproduce illustrative result copy, fake performance numbers or a clipboard control with no implemented behavior. Package availability remains accurately labeled as unpublished.
