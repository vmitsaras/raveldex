# Native result content and hierarchy

Choose the result content your application needs, then choose the Raveldex surface that already supports it. The result title and destination are the primary action; available context, excerpts and metadata support that action. Native identity, order, exact totals and page boundaries remain authoritative.

**RX-9109 decision: keep the current five surface contracts.** Inline/modal offer optional query-derived context; rich directory offers authored display metadata. This decision introduces no renderer callback, shared display record extension, mandatory provider, automatic image loading or engine-side display index. Start with [installation and surface selection](HOSTS.md#consumer-capability-matrix).

## Source-verified capability matrix

“Authored” means application-supplied display data. “Generated” means evidence from the selected native query/source capabilities; an authored excerpt is not a matching snippet.

| Content | Inline | Modal | Dropdown | Directory | Rich directory/cards |
| --- | --- | --- | --- | --- | --- |
| Title and destination | Required `title` / `url` | Same inline contract | Required `title` / `url` | Required `title` / `url` | Required `title` / `url` |
| Generic visible source/location row | None; URL is a link destination | Same | None | None | No generic source row; authored category/breadcrumb can supply context |
| Authored excerpt | Not a display field | Same | Not supported | Not supported | Optional `excerpt` |
| Matching snippets / highlights | Explicit `snippetFields` and snippet/source capabilities | Same | Not supported | Not supported | Not supported; excerpt remains plain authored text |
| Matching heading links / section context | Explicit revision-bound `pageSections` and section evidence, instead of `snippetFields` | Same | Not supported | Not supported | Not supported |
| Category / breadcrumb | Not display fields | Same | Not supported | Not supported | Optional `category`, `breadcrumb`; breadcrumb is joined text, not generated route links |
| Date | Not a display field | Same | Not supported | Not supported | Optional already-localized `date` string; no parsing/formatting |
| Labeled metadata | Not display fields | Same | Not supported | Not supported | Optional `fields: [{name, value}]`, rendered as a description list |
| Images | Not supported | Not supported | Not supported | Not supported | Optional validated image metadata; requests require explicit image presentation opt-in |

The compact dropdown has a separate configured `fullResults` link. It hands off the raw query; it does not add snippets, metadata or another page to the popup. Directory filter labels, choices, counts and selected chips are control context, not new result fields. Rich display metadata does not automatically become indexed text or filter metadata.

## Actual rendered hierarchy

- **Inline/modal:** parent linked title, then selected generated snippets **or** section caption/child heading links and their optional excerpts, followed by applicable omission/context-availability feedback. A mapped section can legitimately have a heading link with no excerpt. Section links do not increase the exact parent-page total.
- **Dropdown/base directory:** title links are complete results. Do not fabricate a source label from the URL or add a metadata row to satisfy a visual specimen. Keep total, paging and full-results recovery outside individual results.
- **Cards:** when explicitly enabled, an image frame is prepended in the DOM. The remaining order is linked `h3` title, category, breadcrumb, authored excerpt, authored date, then labeled fields. The image is not an additional result or action. Optional missing content produces no placeholder row; empty optional excerpt/category/date strings and empty breadcrumb/field arrays render nothing. List/cards/grid keep the same ordered-list/native-link model.

The [Reading index styles and optional host themes](HOSTS.md#consumer-visual-roles-and-host-themes) emphasize titles and keep context secondary. CSS changes presentation, not the available fields, query evidence or native interaction model.

## Choose by the native task

| Application need | Existing choice and hierarchy | Boundary / alternative |
| --- | --- | --- |
| Documentation: a visitor should reach the matching heading within a long guide | Inline or modal with `pageSections`. Parent title identifies the page; supplied section headings/native anchors and available source excerpts sit beneath it. Use the [heading-map workflow](STATIC_ASTRO.md#optional-heading-maps). | Maps bind exact original text and revision; they are not extracted by the UI. An absent map, or an empty map at the current revision, leaves parent-only output without a section notice. A stale map or accepted context refusal can retain the page link with an explicit unavailable-context notice. Choose snippets instead when paragraph context is useful but heading maps are unavailable. |
| Application/help search: a visitor needs a title/destination, optionally the matching paragraph | Title-only inline/modal works with basic display records and no snippet/section capability. Select `snippetFields: ['body']` with explicit source/snippet capabilities when query-derived paragraphs are needed. | Snippet fields are indexed original-source fields, not authored card excerpts. A compact header can use dropdown plus a full-results destination; it retains title-only rows. Base directory is appropriate for title-only filtered browsing. |
| Catalogue/content browsing: a visitor compares authored descriptions and attributes | Rich directory/cards: title first in the text group, category/breadcrumb context, excerpt, localized date and labeled fields. Keep images off unless the application explicitly selects them. See [rich directory setup](HOSTS.md#rich-directory-results). | Index searchable words and filter metadata separately. Dates, breadcrumb parts and labeled fields are display strings, not inferred ranking/filter rules or generated heading links. If matching source evidence is essential, use inline/modal; combining that evidence with card metadata needs a separately selected contract. |

These choices serve Raveldex's documentation, application and catalogue needs. A migration does not require reproducing another product's layout or metadata behavior.

## Supported combinations and captured data

Inline/modal `documents` contain only `{id, title, url}`. Base directory and dropdown use that same basic projection. Runtime admission rejects additional display keys even when TypeScript structural assignment would accept a richer object. Explicitly project card data before reusing it with a basic surface:

```js
const basicDocuments = cardDocuments.map(({ id, title, url }) => ({ id, title, url }));
```

Keep stable display IDs aligned with every possible native hit. UI mounting captures its display map; later mutation of the caller's objects or an engine update does not replace it. Destroy/remount for changed display data. Controller refresh updates native results, not captured card metadata. Rich `setPresentation()` changes retain native link identities, query, filters, page and optional URL state; the application still owns the controller and engine lifecycle.

For inline/modal:

- Supply `snippetFields` **or** `pageSections`, never both. Supplying `snippetFields: []` with maps is also rejected. `maxSectionPreviews` requires maps and is an integer 1–3, default 3.
- Snippet/section capabilities and source strategy remain explicit. Offset-backed strategies select their offset support; core title-only retrieval does not promise original text or source offsets. Static source delivery has its own source-provider requirements.
- Section-enabled parent destinations cannot already contain fragments. Maps provide exact authored anchors and source ranges; the validated child links retain the parent origin/path/query and encode the anchor. See [inline page context](HOSTS.md#inline-result-pages-filters-and-snippets).
- Missing snippet/facet capabilities can fail explicitly even with zero matches. Section evidence is requested only for actual mapped hits with a nonempty current-revision map; zero hits or absent/empty/stale maps do not trigger a section-capability probe. A recognized typed section-evidence refusal can retain parent links with an unavailable notice; corrupt replies fail rather than masquerading as missing context. Native totals/order/revisions and source offsets remain unchanged.

All display text is inserted as text, never an HTML template. Basic/card destinations and card image sources resolve to HTTP(S) URLs without embedded user/password credentials. Rich records are bounded to 10,000 entries and 4,000,000 captured string units. Card excerpt limit is 4096 UTF-16 units, category/date 256 each, up to eight breadcrumb parts and four uniquely named labeled fields. Admission validates unknown keys, getters, string readability, URLs and image metadata before replacing authored content; [HOSTS](HOSTS.md#rich-directory-results) lists the complete bounds.

## Image ownership and request boundary

Cards capture and retain supplied image metadata even while images are off; they do not create image elements or assign `src` under the default `images:false`. Metadata opt-out is omission of the optional image field, not a promise that the declared display map is discarded.

`presentation: { images: true }` or `setPresentation({ images: true })` explicitly allows current-page image elements/src assignment. Mounting over an already-ready controller can do this immediately without a new query. Images have required `alt` (explicit empty text means decorative) and integer dimensions 1–4096, with reserved aspect ratio. The code selects lazy loading, async decoding and `referrerPolicy: 'no-referrer'`; it supplies no origin allowlist, `crossOrigin` or credential-omission option. Do not treat these attributes as anonymous or credential-free request guarantees. Image-host and content selection remain application-owned.

An informative image failure preserves the title/metadata and shows failure text plus its authored alternative; decorative failure stays silent. Disabling images, page replacement or teardown removes image sources/listeners, guards late events and preserves borrowed ownership. It cannot undo requests already sent or promise how the browser handles an in-flight request, cache or cookies.

## Compatibility decision

Keep the current split between query-derived context and authored rich display. It covers the scenarios above without an expanded runtime dependency, retained side index, mandatory source capability, renderer callback, implicit date/URL interpretation or new image request policy. Missing optional rows remain a complete native result.

A future requirement for another field, mixed snippets/card metadata, rich dropdown or custom renderer must be separately selected and define ownership, finite admission/retention, revision/source consistency, safe text/URLs, image privacy/alternatives, focus/native activation and teardown. This task implements none of those extensions. Existing engine identity/order/totals, surface query/reset/paging, composition, focus and optional CSS contracts remain intact.
