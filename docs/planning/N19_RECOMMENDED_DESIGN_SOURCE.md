# Raveldex documentation and demo experience

Review date: 13 November 2026  
Inspected repository: `vmitsaras/raveldex`  
Inspected main: `73caf4170962463dcc98c1a8a98a577a48ba6aac`  
Status: read-only review and proposed design. No repository edits, issues, installs, deployment or implementation approval.

## Recommendation

Keep the existing Astro site. Introduce Tailwind CSS for the documentation site's presentation layer, with a small reusable set of Astro components. Organize the experience around choosing an interface, trying it, and integrating it. Keep the underlying search package, consumer plugin CSS and exact downloadable starters independent of the site's styling tools.

The site needs an editorial and navigation redesign before a decorative refresh. Do not replace each paragraph with a card, add a React application merely to get tabs, or turn the developer Workbench into the default user journey.

## Evidence boundary

This review examined the current source templates, routing, stylesheet, starter presentation and active N11 specification. The expected public Pages URL `/raveldex/examples/inline/` returned HTTP 404 during the live fetch. Consequently, findings about layout structure are source-derived; actual rendered wrapping, focus, contrast, mobile behavior and performance were not tested here. No baseline screenshot or before/after implementation was produced.

Mobbin references below were inspected as screenshots. They are examples of particular structures, not evidence that those structures improve conversion or that another company's design should be copied.

Current N11 records its consumer-interface work as accepted and selects the "Reading index" direction. That specification explicitly excludes demo-page redesign. This proposal is a separate website/docs improvement, not a reopening of completed plugin work. [R10]

## 1. Findings grounded in this checkout

### F1. The same shell serves different reading tasks

`site/Layout.astro` supplies a header with Guides, API, Examples and Demo, then an undifferentiated article slot. It has no documentation sidebar, breadcrumbs or page-level contents component. Its top navigation checks the exact category-root URL, so a deeper example URL does not receive the same active root marker. [R1]

Recommendation: create a shared site shell with contextual navigation. Show an examples sidebar on example/detail pages and a documentation sidebar on guides/reference pages. Use a page outline only on longer reading pages. Determine active sections from route metadata, not an accidental exact URL equality.

### F2. The examples index makes choices through four large tables

`examples/README.md` contains tables for choosing a presentation, selected data/platform capabilities, keyboard/cleanup behavior and complete project links. The content is important, but a visitor must parse detailed differences before seeing the five interface choices. [R2]

Recommendation: use five visual interface cards first, each with a real preview thumbnail, one sentence about when it fits, truthful available platform labels, and one link to its demonstration. Keep an optional compact comparison table for people actively comparing choices. Move full per-interface requirements next to that interface's installation section and preserve the complete keyboard/lifecycle guidance in linked reference content.

### F3. The example detail page repeats the decision before showing the example

The inline page places a solution chooser and five introductory/cross-link paragraphs before "Try the browser starter". The modal page follows a similar pattern. Setup, complete-project options, theming instructions and support qualifications then continue in the same column. [R3, R4]

Recommendation: lead with the chosen interface, a short use-case sentence and the real preview. Alternative interfaces belong in the examples navigation and a small "Related interfaces" section, not repeated introductory prose. Keep essential prerequisites visible when the visitor reaches installation.

### F4. Preview and source are disconnected

The inline iframe is declared at 720 pixels high with inline border styling. The modal iframe has an additional viewport cap. The shared setup component separately renders Browser/Astro instructions and source-file disclosures. [R3, R4, R5]

Recommendation: one reusable preview component, with Preview/Code views, a plainly labeled full-page link, an optional reset action, and concise instructions tied to the actual sample data. Code is read-only and derived from the same source inventory as the downloaded project. The surrounding interface must label what implementation the visible preview actually runs.

### F5. The CSS styles articles but does not establish page roles

The site stylesheet applies general heading, paragraph, preformatted-code and table rules. Every table cell has a minimum inline size of 10rem; tables can scroll horizontally. It does provide an existing ink/white/gray palette, blue links/focus and a lime brand button, plus forced-colors and reduced-motion treatment. [R6]

Recommendation: preserve that identity while defining separate prose, example and reference layouts. Keep body text comfortably bounded, let demonstrations occupy more width, and style information according to its purpose. Keep real tabular comparisons as semantic tables; avoid min-width requirements on every cell and do not make all content a table or a card.

## 2. User journey and information architecture

The main visitor is a developer who wants to choose a presentation, see real behavior, install it, replace sample data and style it. A returning developer needs a specific option or lifecycle rule. These need different page structures.

Proposed visible top navigation:

- Get started
- Examples
- Documentation
- API reference

Keep Developer Workbench as an explicit developer destination within documentation or as a secondary header link. Use a labeled site-search trigger powered by Raveldex, with an optional documented shortcut rather than an unlabeled magnifier.

This is a navigation proposal, not an immediate URL migration. Retain current `/guide/`, `/examples/`, `/reference/` and `/demo/` URLs and anchors where possible. If any URL must change, provide an explicit static redirect/mapping and verify every existing link.

Examples navigation should list Inline search, Documentation modal, Header dropdown, Filtered directory and Rich results. Separate UI presentations from engine capabilities. Phrases, typo tolerance, workers and snapshots belong in capability or integration guides, not as competing UI choices.

## 3. Three page templates

### A. Examples overview

Opening: "Choose a search interface" plus a single sentence. Show five illustrated cards from real existing presets. Each card has a named use case and accurate platform availability; there are currently five presentations and eight complete starter projects. Do not imply every presentation has both Browser and Astro starters. [R2]

Below the cards: a collapsed or separate comparison section covering only decision-relevant differences. Further below: a small link to core-only usage and the developer Workbench. Do not run five independent interactive search engines on the gallery landing page just to decorate the cards; use screenshots or inert previews.

### B. Example detail

1. Breadcrumb, concise title and one-sentence use case.
2. Working preview immediately after the introduction.
3. A single installation choice for the platforms actually provided.
4. Guided steps: get the starter, run it, replace data, adjust appearance.
5. Focused customization recipe using real public CSS properties.
6. Requirements, keyboard/cleanup and troubleshooting in concise sections with links to full detail.
7. Related examples.

Proposed large-screen structure:

```text
Raveldex       Get started  Examples  Documentation  API       Search

Examples          Examples / Inline search                    On this page
  Inline          Inline search                               Try it
  Modal           Search and results stay in the page.        Install
  Dropdown                                                    Replace data
  Directory       [ Preview | Code ]       Open full page     Customize
  Rich results    +------------------------------------+      Requirements
                  | Actual installed browser starter   |
                  | Try: walking guide                 |
                  | Search, filter and follow a result |
                  +------------------------------------+

                  Add inline search
                  [ Browser | Astro ]    Only real variants
                  1. Get and run the starter
                  [terminal commands]             Copy
                  2. Replace your public records
                  [content example and short explanation]
                  3. Change the appearance
                  [documented CSS variables]      Copy
```

This is a structural proposal, not a rendered mockup. On smaller screens remove the right outline first, place section navigation behind a labeled disclosure, and stack preview/source. Do not shrink three columns until every column is unusable.

### C. Guide/API reference

Guides explain a task through short steps and working examples. API pages lead with purpose, signature, minimal use, parameters, return value, failures and related recipes. Keep parameter tables when columns genuinely compare the same fields. Split unrelated topics into anchored sections; never turn all error types and options into one unstructured paragraph.

For semantic caveats that affect correctness, keep the note beside the relevant method or example. Longer test provenance and environment histories remain available through precise links rather than copied into every first-run page. Do not hide prerequisites, privacy restrictions or destructive-operation consequences in a collapsed footnote.

## 4. What Mobbin contributes

### GitBook: choice cards and a separate first-use example

The inspected developer-platform page presents three distinct starting paths, followed by a compact getting-started region paired with code. Adapt that separation for the five Raveldex presentations and their first integration step. Do not reproduce the editor sidebar, sign-up controls, subscription prompts or its identity.

Reference: https://mobbin.com/screens/785bc3c1-b47a-498a-8da4-bb773239ce04

### Cloudflare: a bounded example panel

The inspected gateway screen puts code, example selectors and the immediate next action inside a single named panel. Adapt the bounded demonstration area and nearby setup action. Do not bring account provisioning, authentication controls or its orange/gray branding into Raveldex.

Reference: https://mobbin.com/screens/f9e55e3d-7097-491f-8136-58312d972c25

### Neon: steps, file tabs and local copy controls

The inspected setup view shows numbered integration steps with filename tabs and commands. Use that structure for the Browser/Astro setup and exact source snippets. Do not turn the whole documentation page into a modal.

Reference: https://mobbin.com/screens/94fb6fc0-0fb0-4358-b6da-534a1f5addb9

### Browserbase: explicit code and preview regions

The inspected playground separates code, preview and console, with reset/copy controls. The useful part is the clear boundary between example code and its output. Raveldex should remain simpler: read-only code and Preview/Code tabs, with no IDE, chat panel, runtime compiler or account console.

Reference: https://mobbin.com/screens/724aa67d-0f07-476a-a1cc-e6e46c2b8bc6

These are structural references. The final combination, exact component choices and editorial ordering are this proposal, not a claim that Mobbin establishes their success for Raveldex.

## 5. Technology choice

### Recommended: existing Astro plus Tailwind CSS and site-owned components

Tailwind officially supports Astro through its Vite integration. Use it to implement the documentation layout, spacing, states, typography and shared presentation components. It is a build-time site tool, not a dependency of native search or downloadable framework-independent starters. [W1]

Tailwind CSS itself does not provide a finished docs information architecture. Simply applying utility classes to the current paragraphs leaves the primary problem intact. Avoid a parallel global stylesheet and utility system fighting over the same roles; define a small clear site token/style contract during the pilot.

Start with a modest kit: DocsLayout, ExampleLayout, SolutionCard, DemoPreview, FrameworkChoice, CodePanel, SetupSteps, RequirementsPanel and ApiSection. These are proposed reusable responsibilities, not a promise that all nine new files are needed. Existing Layout, SolutionChooser and StarterSetup can be adapted rather than discarded.

Astro already provides Shiki-based code highlighting through its built-in Code component. Add copy behavior and filename/context labels without loading a code editor. MDX is optional for pages that truly need inline components; do not convert every README or move all public source content to adopt it. [W2]

### Alternative: Starlight

Starlight is a reasonable ready-made documentation foundation, with sidebar/outline configuration and reusable cards, steps, code and tabs. It would require a deliberate migration of the current explicit route/source/publication pipeline rather than merely swapping CSS. It is the alternative if maintaining the current custom shell is undesirable, not a second shell to bolt alongside it. [W3, W4]

Its default search is Pagefind. For Raveldex's own documentation, disable Pagefind indexing and supply a Raveldex Search override; installing Starlight need not mean adopting Pagefind as the runtime or visual model. [W5, W6]

### Not recommended for this task: migrate to Next.js for a template

Tailwind Plus Syntax and Protocol are currently React/Next.js templates. They are not drop-in Astro themes. Replacing the functioning Astro/static-export pipeline solely for a visual shell would widen this task substantially. [W7, W8]

### Tailwind Plus components require a separate decision

Tailwind CSS and Tailwind Plus are different products. The latter's HTML interactive examples use Elements and require a commercial license. More importantly here, its published license distinguishes permitted end-product use from redistributing a UI library or starter kit. Do not copy Plus components or derivatives into Raveldex's npm UI components or downloadable example archives under an assumption that they are ordinary MIT code. Check the exact proposed use or obtain permission where needed. The safer default for this reusable library/demo ecosystem is original site components using Tailwind CSS, without Plus-derived downloadable artifacts. [W9, W10]

## 6. Keep the preview isolation; improve its presentation

The existing iframe has a legitimate function: demonstrating an actually packed and installed starter with independent styling. Preserve this. The website should not reproduce the search widget from scratch or make the demo depend on the site's Tailwind reset. [R7]

The preview wrapper should state what is running, offer Preview/Code, expose the existing full-page route, and show one short sample task. Initially use a layout-specific viewport and test real interactions. For a modal or header dropdown, the full-page route is the authoritative whole-window demonstration; explain that an embedded modal is confined to its frame.

Do not silently switch a browser preview to an Astro label when only the setup tab changed. Label the preview implementation and the selected installation target separately.

Only add live theme controls for existing documented CSS variables. A generated CSS snippet must match those actual controls. Start with a few curated examples; do not add an arbitrary-code editor or general theme-builder product.

If automated iframe height reporting is later needed, validate the message origin and source window, use a small bounded schema and scope listeners to the frame lifecycle. Theme and navigation changes should not silently rebuild or discard the embedded instance. Do not blanket-add iframe sandbox flags without verifying which real starter capabilities they would disable.

Tailwind Preflight resets browser defaults including headings and borders. A utility prefix does not scope those resets. Keep documentation styles separate from actual plugin preview assets; omit or carefully control Preflight when mixing old and new site styles. [W11]

## 7. Content transformations

| Current content | Proposed presentation | Preserve |
| --- | --- | --- |
| Repeated alternate-interface paragraphs | Gallery/sidebar plus a compact related-examples region | Every legitimate destination remains reachable |
| Five-row presentation table | Five visual interface cards | Actual use-case and platform availability |
| Large data/browser capability table | Short requirement facts on each example and a compact comparison view | Source/provider, dialog/popover, Segmenter, secure-context and record requirements |
| Browser and Astro setup repeated sequentially | One platform choice with short ordered steps | Exact commands, downloads and platform differences |
| Long source-file link list | Secondary source disclosure or file list next to code/download | Same explicit source/archive inventory |
| Wide API option tables | Purpose-specific parameter sections and genuinely tabular comparisons | Names, types, defaults, constraints and anchors |
| Repeated qualification paragraphs | Brief support note plus detailed compatibility/evidence links | Truthful limitations; no new support claim |
| Bare large iframe | Branded preview wrapper with full-page action and source view | Real installed package, original CSS and working navigation |

## 8. Repository and publication boundaries

Author changes under `site/` and the site's source route/content registry. `docs/` contains both generated public output and repository-only source/evidence/history. The current generator explicitly allowlists public content and relies on the established Pages exclusion configuration. Preserve that boundary; do not recursively publish the repository docs, serve all of it, add `.nojekyll`, or replace the build with a broad content glob merely to adopt a template. [R7, R8]

Keep base-path and heading-anchor behavior. The current starters already cover downloaded source, public destination pages, CSS recipes and actual package integration. Reuse these fixtures and acceptance expectations. Website chrome changes should not mutate native results, snippet boundaries, engine initialization/disposal or the supported consumer component CSS.

## 9. A finite delivery sequence

No new canonical task IDs or milestone changes are authorized by this review.

### D1. Prove the site design with one vertical slice

Build the shared shell, examples overview and inline detail page in a local preview. Use existing real package/preview content. Introduce the chosen Tailwind site integration and minimal presentation components only. Review wide and narrow layouts, navigation, full-page launch, code copying and Browser/Astro setup before rolling out.

Done: a developer can choose Inline, try the actual starter, find the matching installation, identify the data/style files and reach the API without reading the whole capabilities matrix.

### D2. Apply the template to the remaining presentations

Adapt modal, dropdown, directory and rich-results pages. Preserve intentional differences and actual starter availability. Test modal/top-layer and dropdown navigation in full-page mode, not just in an iframe. Consolidate repeated requirements while retaining precise links.

Done: all five pages use the same presentation system but do not invent shared capabilities or break their standalone demos.

### D3. Improve long-form guides and reference

Use the contextual sidebar/outline, code components, real step sequences and purpose-specific API sections. Start with getting started and the consumer hosts guide. Keep full API content accurate and preserve old anchors; make link cards only where a visitor is choosing a destination.

Done: representative reference content can be located from navigation, copied and connected to its working example. Remaining pages inherit tested typography rather than requiring individual redesigns.

### D4. Qualify only the changed site experience

Run site generation, inventory/links/fragments, downloads and affected browser/consumer checks. Inspect actual reflow, keyboard navigation, focus, iframe entry/exit, copy feedback, platform switching, error/empty previews and no-JavaScript reading. Test real contrast of final tokens; do not infer it from the proposed palette. Retain existing plugin behavior tests and do a focused manual walkthrough of the new navigation controls.

Done: no known essential site usability/accessibility failure, no private-record exposure, real demos intact, and one documented review of the new presentation. Do not launch an exhaustive native performance campaign because a docs layout changed.

## 10. Source ledger

Repository links below are pinned to the inspected revision.

R1. Layout: https://github.com/vmitsaras/raveldex/blob/73caf4170962463dcc98c1a8a98a577a48ba6aac/site/Layout.astro

R2. Examples index: https://github.com/vmitsaras/raveldex/blob/73caf4170962463dcc98c1a8a98a577a48ba6aac/examples/README.md

R3. Inline detail: https://github.com/vmitsaras/raveldex/blob/73caf4170962463dcc98c1a8a98a577a48ba6aac/site/Inline.astro

R4. Modal detail: https://github.com/vmitsaras/raveldex/blob/73caf4170962463dcc98c1a8a98a577a48ba6aac/site/Modal.astro

R5. Starter setup: https://github.com/vmitsaras/raveldex/blob/73caf4170962463dcc98c1a8a98a577a48ba6aac/site/StarterSetup.astro

R6. Site styles: https://github.com/vmitsaras/raveldex/blob/73caf4170962463dcc98c1a8a98a577a48ba6aac/site/styles.css

R7. Site build/publication contract: https://github.com/vmitsaras/raveldex/blob/73caf4170962463dcc98c1a8a98a577a48ba6aac/site/README.md

R8. Explicit public routes: https://github.com/vmitsaras/raveldex/blob/73caf4170962463dcc98c1a8a98a577a48ba6aac/site/pages.mjs

R9. Existing solution navigation: https://github.com/vmitsaras/raveldex/blob/73caf4170962463dcc98c1a8a98a577a48ba6aac/site/SolutionChooser.astro

R10. Consumer UI scope and identity: https://github.com/vmitsaras/raveldex/blob/73caf4170962463dcc98c1a8a98a577a48ba6aac/docs/specs/N11_UI_UX_POLISH.md

W1. Tailwind Astro integration: https://tailwindcss.com/docs/installation/framework-guides/astro

W2. Astro syntax highlighting: https://docs.astro.build/en/guides/syntax-highlighting/

W3. Starlight components: https://starlight.astro.build/guides/components/

W4. Starlight configuration: https://starlight.astro.build/reference/configuration/

W5. Starlight search: https://starlight.astro.build/guides/site-search/

W6. Starlight overrides: https://starlight.astro.build/reference/overrides/

W7. Syntax template: https://tailwindcss.com/plus/templates/syntax

W8. Protocol template: https://tailwindcss.com/plus/templates/protocol

W9. Tailwind Plus HTML: https://tailwindcss.com/plus/ui-blocks/documentation/using-html

W10. Tailwind Plus license: https://tailwindcss.com/plus/license

W11. Tailwind Preflight: https://tailwindcss.com/docs/preflight

Public endpoint observation: a live Firecrawl request for https://vmitsaras.github.io/raveldex/examples/inline/ returned 404 and a GitHub Pages not-found page. This does not determine whether an alternative local/private deployment is available.
