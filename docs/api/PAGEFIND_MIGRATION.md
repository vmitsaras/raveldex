# Optional Pagefind migration appendix

Start with [Raveldex adoption](GETTING_STARTED.md) to prepare data and choose inline, modal, dropdown, directory or rich results. This appendix is for an existing Pagefind integration. It does not define Raveldex's visual identity or require matching another product's components, API or features.

Migration rebuilds search from your authoritative content. Raveldex does not read Pagefind's generated index, process its HTML attributes or translate its UI/options/styles. There is no drop-in converter in this guide. Keep the existing search available until the replacement meets your application's requirements.

## Map content decisions to explicit records

Pagefind's documented build workflow indexes generated HTML after the site build. Its content-selection attributes can identify selected bodies or excluded regions. Use your current public-content decisions to prepare an explicit Raveldex allowlist rather than assuming an entire page should become searchable. See the official [build workflow](https://pagefind.app/docs/) and [content selection](https://pagefind.app/docs/indexing/).

| Existing integration concern | Raveldex preparation |
| --- | --- |
| Which built pages and body regions are searchable | Select public records and exact text yourself. Declare text fields in `schema.text`, then add records with stable IDs. Exclude private/draft content before producing public assets. |
| Titles and destinations | Supply application-owned `{ id, title, url }` display entries with the same IDs as indexed records. Keep real destination pages and safe routes available. |
| Searchable metadata and filters | Put searchable words in text fields. Declare filter metadata separately and explicitly install the selected filters/facets. Card display metadata is not indexed automatically. Do not assume the old metadata/search/count semantics are preserved. |
| Descriptions, breadcrumbs, images | Choose a surface that actually supports the required authored data. [Rich directory results](HOSTS.md#rich-directory-results) support authored excerpts/metadata and explicit image opt-in; title-only surfaces do not gain those fields through migration. |
| Links to matching headings | Render the target IDs, preserve exact original text, and prepare Raveldex page/section maps with validated source ranges. Select source/section capabilities explicitly; no heading extraction happens in the UI. |
| Query language and translated labels | Choose the query analyzer separately from UI message overrides. Check tokenization, stemming, prefix behavior and language coverage against your own records; no equivalent ranking or automatic translation is promised. |
| Static deployment and later updates | Use the [static/Astro builder](STATIC_ASTRO.md) with explicit entries and matching source providers. Deploy the complete generation/base together; a content change needs a deliberate rebuild or supported engine update. |

Pagefind documents metadata, heading sub-results and multilingual processing under its own contracts. Consult the versions/configuration actually used by your site: [metadata](https://pagefind.app/docs/metadata/), [sub-results](https://pagefind.app/docs/sub-results/), [languages](https://pagefind.app/docs/multilingual/). This mapping makes no promise that those contracts or outcomes transfer to Raveldex.

## Walk through one page first

Take a public page at `/guide/updates/` with title **Atomic updates**, heading target `atomic-writes`, and paragraph **Replace a complete record.**

1. Assign stable record ID `updates`. Declare text fields `title` and `body`; add `text: { title: 'Atomic updates', body: 'Replace a complete record.' }`. Supply display entry `{ id: 'updates', title: 'Atomic updates', url: '/guide/updates/' }`. Keep the real page reachable while search initializes.
2. Copy the complete [inline recipe](examples/inline.mjs) through the [installed consumer setup](HOSTS.md#mount-a-consumer-search-form). It uses that same record/display pair, explicit `mode: 'prefix'`, its own optional CSS and application-owned cleanup. Searching `atom` should find the page; the original Pagefind results are not the membership/ranking oracle.
3. If heading previews are required, use the [section recipe](STATIC_ASTRO.md#optional-heading-maps). The body range is `[0, body.length)` for this one paragraph, tied to the exact original body string. Keep `id="atomic-writes"` on the actual heading and search `replace` to check its body-section link; `atom` matches the title, not this mapped body. The build and restore configurations must both include the selected source/section factories. Direct title/link-only UI needs no snippet/section factories, but static source delivery still needs source providers for every indexed text field. Section previews do not add extra pages to the exact page total.
4. For a static site, pass the explicit record/title/path through the [static build and on-demand load flow](STATIC_ASTRO.md). Use the same deployment base for generated pages, manifest and display destinations; do not reuse another engine's generated index files.
5. Check that the expected native IDs, exact totals, actual destination and optional heading link agree with this authored content. Then extend to your real filters/counts, snippet ranges, paging, language and long labels. Keep loading/failure distinct from zero results and verify native keyboard/composition, reset/retry and teardown.

The `atom` result and owned inline cleanup are exercised by RX-9102's installed consumer check. The optional heading workflow points to the existing section contract; this documentation task does not claim a fresh Pagefind-versus-Raveldex comparison or a new heading-browser qualification.

## Replace the interface deliberately

Choose the Raveldex surface from its [capability matrix](HOSTS.md#consumer-capability-matrix), import that surface's CSS and use its documented keyboard model. Existing Pagefind markup, classes, callbacks, defaults or assets are not Raveldex APIs. Preserve browse links and show useful failure/retry before retiring the old integration.

Destroy borrowed UI/view before releasing its engine or static-loader owner. Directory integrations also release their explicit URL binding/controller. Display records are captured at mount; replacing them requires destroy/remount rather than calling an invented refresh or snapshot method on a view.

Official Pagefind references were checked on 7 November 2026. No version-specific competitor constructor/options example, compatibility claim, migration automation or performance claim is made here.
