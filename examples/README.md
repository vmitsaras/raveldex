# Examples

For a complete interface to copy into your application, choose [inline search](../site/Inline.astro), a [documentation search modal](../site/Modal.astro), or [compact header search](../site/Dropdown.astro). Inline and modal have browser and Astro projects; the header starter is a plain-browser project. Each includes explicit content, controls, styles and cleanup. The browser demo below is also available for exploring query and execution details.

Use inline search for a field and results that stay in the page; use the modal for search opened from a button. The compact header offers a few page links and a complete inline results route. All three galleries include a working installed preview, complete source downloads and an edit/build/preview CSS walkthrough. The current packages are private and unpublished, so each setup guide uses supplied matching local tarballs.

| Example | Run it | What to try |
| --- | --- | --- |
| [Browser inline starter](inline-browser/README.md) | Copy, install local core and run `npm run build` | Replace guide records, search with snippets and topics, adjust CSS and preview at your deployment base. |
| [Astro inline starter](inline-astro/README.md) | Copy, install paired local packages and run `npm run build` | Build an explicit page allowlist and load its search artifacts on demand. |
| [Browser documentation modal](modal-browser/README.md) | Copy, install local core and run `npm run build` | Open search on demand, cancel loading, follow real section links and change the theme. |
| [Astro documentation modal](modal-astro/README.md) | Copy, install paired local packages and run `npm run build` | Build pages and matching section artifacts, then load them on first open. |
| [Browser dropdown header](dropdown-browser/README.md) | Copy, install local core and run `npm run build` | Search from a compact header, follow the real full-results route, change CSS and explicitly enable a shared-owner modal button. |
| [Browser search](docs-search/README.md) | `npm run pilot:ui` | Search usage guides, filter results, inspect scores and compare direct/worker execution. |
| [Core terminal search](core-docs/README.md) | `npm run pilot:core -- 'atomic mutation'` | Index source records and read IDs, scores and exact totals. |
| [Astro static site](astro/README.md) | Follow the copy/install/build/preview steps | Load search on demand, follow a result and rebuild with a subdirectory base. |
| [Migration](migration/README.md) | Follow the converter example | Convert a companion source export and rebuild a native collection. |
| [API recipes](../docs/api/examples/README.md) | Copy a module into your installed ESM application | Core, a minimal browser UI, add-ons, snapshots, workers or storage. |

Repository commands need a source checkout, repository access, Node 24 and an initial `npm ci`. If you only have package tarballs, follow [installation](../docs/api/GETTING_STARTED.md) and use the copied API recipes instead.

The five starters index explicit public records rather than crawling pages. The header uses core-only title/link results and native Popover; its optional larger-search button also needs native `dialog`. Snippets and section previews in the inline/documentation-modal projects need `Intl.Segmenter`; their section/static asset verification needs Web Crypto over HTTPS or localhost. Each guide explains its selected capabilities and how to replace the sample data. Review [starter adoption and local checks](../docs/api/HOSTS.md#starter-adoption-and-local-checks) before changing those capabilities or claiming support for your target browsers and assistive technology.

Each walkthrough explains what you should see and how to clean up. Stop ordinary preview servers with Ctrl+C. The Astro example uses its documented project-scoped stop command.
