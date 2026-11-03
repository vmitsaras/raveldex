# Examples

For a complete interface to copy into your application, choose [inline search](../site/Inline.astro), a [documentation search modal](../site/Modal.astro), [compact header search](../site/Dropdown.astro), a [faceted resource directory](../site/Directory.astro), or [rich directory results](../site/Cards.astro). Inline, modal and directory have browser and Astro projects; header and rich-results starters are plain-browser projects. Each includes explicit content, controls, styles and cleanup. The browser demo below is also available for exploring query and execution details.

Use inline search for a field and results that stay in the page; use the modal for search opened from a button. The compact header offers a few page links and a complete inline results route. The directory supplies multi-selection checkboxes, chips, complete pages and explicit URL replay. Rich results add declared metadata and optional images with list/card/grid layouts over that directory state. All five galleries include a working installed preview, complete source downloads and an edit/build/preview CSS walkthrough. The current packages are private and unpublished, so each setup guide uses supplied matching local tarballs.

## Choose a search solution

Choose the presentation that fits the task, then use its gallery to try the installed preview, download every original source file and copy its CSS recipe. The eight projects below include indexing/loading, real destination pages and cleanup; the smaller API recipes are separate examples.

| Presentation | Choose it when | Complete projects |
| --- | --- | --- |
| [Open inline gallery](../site/Inline.astro) | A field, filters and highlighted page excerpts should stay in the page. | [Browser inline](inline-browser/README.md), [Astro inline](inline-astro/README.md) |
| [Open documentation modal gallery](../site/Modal.astro) | Search opens from a button and results should reach matching documentation headings. | [Browser modal](modal-browser/README.md), [Astro modal](modal-astro/README.md) |
| [Open compact dropdown gallery](../site/Dropdown.astro) | A header needs a few quick page links and a complete full-results route. | [Browser header](dropdown-browser/README.md) |
| [Open directory gallery](../site/Directory.astro) | Visitors browse a library with several filter choices, selected chips and shareable pages. | [Browser directory](directory-browser/README.md), [Astro directory](directory-astro/README.md) |
| [Open rich-results gallery](../site/Cards.astro) | The same directory needs excerpts, named metadata and optional images in list/card/grid layouts. | [Browser rich results](cards-browser/README.md) |

## Data and capabilities

These are the capabilities selected by the complete projects. Core and each presenter remain separately usable with the smaller data/capability set documented in the API. Every project indexes an explicit public allowlist; none crawls a site or adds a remote search service.

| Presentation | Explicit data and registrations | Browser/platform needs |
| --- | --- | --- |
| Inline | Stable page IDs, title/body, real path and category. Original body source, snippet evidence and a string facet are selected. | Browser ESM/fetch and `Intl.Segmenter`. Astro adds matching source/display artifacts and Web Crypto over HTTPS/localhost. |
| Documentation modal | The same page data plus original section text/ranges and exact real heading anchors. Source/section evidence and a category facet are selected; native totals still count pages. | Native `dialog`, `Intl.Segmenter` and Web Crypto over HTTPS/localhost. Astro also needs matching core/adapter packages and the source-only section companion from the same build/base. |
| Compact dropdown | Stable ID/title/body/path records. The header displays title/links from core; the full-results route uses the same prefix meaning. No snippet/facet/section registration is selected. | Native Popover. The optional expanded-search button additionally needs `dialog`; it defaults off. Its code/CSS is included in the complete demonstration and shares one page owner. |
| Directory | Stable ID/title/body/path plus scalar format and multi-value topics. Explicit native set filters/facets supply complete matching counts before paging. | Native form controls and `details`. URL replay is an explicit application choice. Astro adds matching source/display artifacts, original values for title/body reconstruction and Web Crypto over HTTPS/localhost. |
| Rich results | Directory data plus an application-owned plain-text projection: optional excerpt/category/breadcrumb/date/named fields, and image URL/alt/width/height. The separate rich presenter/CSS is selected. | Directory requirements. Images start off and are requested only after explicit opt-in for the displayed page; no new static artifact format or source/snippet registration is required. |

Browser inline, header, directory and rich-results projects start loading during page initialization. Astro inline/directory projects use their Enable button. Documentation modals load the complete index on first open and reuse that owner on reopen. First-open loading is not index sharding or a query-specific network backend. All these starters run directly on the main thread; workers are a separate explicit integration.

Browser projects use esbuild 0.28.2; Astro projects use Astro 7.3.2. Their setup guides use Node 24/npm and matching unpublished local tarballs, then show root/subdirectory builds and actual previews. Deploy the complete rebuilt page/content/asset set with a consistent base. Do not place private content in public assets.

## Keyboard and cleanup

| Presentation | Interaction to keep when changing the CSS | Ownership and recovery |
| --- | --- | --- |
| Inline | Native field, submit/Clear/filter controls, Load more and bounded Next/Previous windows; ordinary result links. Composition waits before searching. | The application wrapper owns the loaded engine; the UI borrows it. Loading/Retry, no-results/Clear and destroy remain usable. |
| Documentation modal | Native trigger/dialog, deliberate close, opener restoration and preserved query on reopen. Some browsers clear a focused search field on the first Escape; Close search remains available. | First-open loading can be cancelled or retried. The wrapper destroys the UI before disposing its owner; late loads cannot reopen a closed attempt. |
| Compact dropdown | Arrow keys select a virtual result while editing stays in the field. Enter follows the selected link; Escape dismisses; Tab leaves normally. See all results keeps the raw query. | A page has one owner for header/full results and the optional modal. Keep the full-results route and ordinary browse links available after loading failure. |
| Directory | Stable native checkboxes, named chip removal, Clear all, complete pages and native filter disclosure. Close filters/Escape restores the summary; Back/Forward replays explicit URL state. | Destroy the borrowed view, URL binding and controller before releasing the application engine. Zero or projected-out selections remain removable; visible status/Refresh handles failures or changed revisions. |
| Rich results | The directory keyboard model and ordinary link reading order. Layout/density/image changes preserve the same native state and link Nodes; CSS grid adds no ARIA grid keyboard model. | Image callbacks are removed on page replacement/destroy. Failed images keep text and links usable. Disabling images cannot undo a request already sent. |

Use your browser/OS's native link-traversal settings; for example, macOS WebKit may use Option+Tab. Keep visible focus, non-color state and readable long/RTL content. Automated browser events, selected axe checks and emulated narrow/light/dark/forced-color/reduced-motion layouts do not establish human AT speech, physical IME/touch/on-screen keyboards, actual 200%/400% zoom, native Safari/device support or hosted deployment. Recheck those combinations after replacing content, controls, colors or image alternatives.

## Complete projects and smaller examples

| Example | Run it | What to try |
| --- | --- | --- |
| [Browser inline starter](inline-browser/README.md) | Copy, install local core and run `npm run build` | Replace guide records, search with snippets and topics, adjust CSS and preview at your deployment base. |
| [Astro inline starter](inline-astro/README.md) | Copy, install paired local packages and run `npm run build` | Build an explicit page allowlist and load its search artifacts on demand. |
| [Browser documentation modal](modal-browser/README.md) | Copy, install local core and run `npm run build` | Open search on demand, cancel loading, follow real section links and change the theme. |
| [Astro documentation modal](modal-astro/README.md) | Copy, install paired local packages and run `npm run build` | Build pages and matching section artifacts, then load them on first open. |
| [Browser dropdown header](dropdown-browser/README.md) | Copy, install local core and run `npm run build` | Search from a compact header, follow the real full-results route, change CSS and explicitly enable a shared-owner modal button. |
| [Browser directory](directory-browser/README.md) | Copy, install local core and run `npm run build` | Replace resource records and filters, change CSS and try chips/pages/Back-Forward. |
| [Astro directory](directory-astro/README.md) | Copy, install paired local packages and run `npm run build` | Build an explicit resource allowlist, enable the directory and follow native filtered results at your deployment base. |
| [Browser rich results](cards-browser/README.md) | Copy, install local core and run `npm run build` | Map resource metadata, opt into local images, switch list/card/grid without changing the native result page, and adjust CSS density. |
| [Browser search](docs-search/README.md) | `npm run pilot:ui` | Search usage guides, filter results, inspect scores and compare direct/worker execution. |
| [Core terminal search](core-docs/README.md) | `npm run pilot:core -- 'atomic mutation'` | Index source records and read IDs, scores and exact totals. |
| [Astro static site](astro/README.md) | Follow the copy/install/build/preview steps | Load search on demand, follow a result and rebuild with a subdirectory base. |
| [Migration](migration/README.md) | Follow the converter example | Convert a companion source export and rebuild a native collection. |
| [API recipes](../docs/api/examples/README.md) | Copy a module into your installed ESM application | Core, a minimal browser UI, add-ons, snapshots, workers or storage. |

Repository commands need a source checkout, repository access, Node 24 and an initial `npm ci`. If you only have package tarballs, follow [installation](../docs/api/GETTING_STARTED.md) and use the copied API recipes instead.

The eight starters index explicit public records rather than crawling pages. The header uses core-only title/link results and native Popover; its optional larger-search button also needs native `dialog`. Snippets and section previews in the inline/documentation-modal projects need `Intl.Segmenter`; their section/static asset verification needs Web Crypto over HTTPS or localhost. Directory examples explicitly register filters/facets; Astro directory also retains original title/body source for static reconstruction. Each guide explains its selected capabilities and how to replace the sample data. Review [starter adoption and local checks](../docs/api/HOSTS.md#starter-adoption-and-local-checks) before changing those capabilities or claiming support for your target browsers and assistive technology.

Each walkthrough explains what you should see and how to clean up. Stop ordinary preview servers with Ctrl+C. The Astro example uses its documented project-scoped stop command.
