# Browser rich-results starter

Copy this complete resource directory, replace the explicit public records and adjust a few CSS properties. Search `walking resource`: seven genuine native matches span three pages. Choose List, Cards or Grid, adjust density and opt into local illustrations with **Show images**. Query, selections, native order, page and exact total stay the same. Every result opens a real generated resource page; the complete browse list also works without JavaScript.

## Copy, install and run

Use Node 22 or later and npm. Raveldex is private and unpublished, supplied as a matching local tarball. The pinned esbuild 0.28.2 dependency is build tooling. From an authorized source checkout after `npm ci`:

```sh
repo="$PWD"
packages="$(mktemp -d /tmp/raveldex-cards-packages.XXXXXX)"
starter="$(mktemp -d /tmp/raveldex-cards-browser.XXXXXX)"
npm run build
npm pack --ignore-scripts --cache "$packages/.npm-cache" --pack-destination "$packages"
cp -R "$repo/examples/cards-browser/." "$starter/"
cd "$starter"
npm install --ignore-scripts --cache "$starter/.npm-cache" --no-audit --no-fund "$packages/vmitsaras-raveldex-0.1.0-rc.0.tgz"
npm run build
npm run preview -- --port 4179
```

Open `http://127.0.0.1:4179/`; stop with Ctrl+C. For a downloaded archive, extract into an empty directory with `tar -xzf cards-browser.tar.gz --strip-components=1`, enter it and install the supplied tarball with `npm install --ignore-scripts --cache .npm-cache --no-audit --no-fund /absolute/path/to/vmitsaras-raveldex-0.1.0-rc.0.tgz`. Run build and preview as above. The first tooling install needs registry access or a suitable cache. Keep the generated lockfile and use `npm ci` afterward.

Serve over HTTP(S). This project imports the separate directory controller, optional card view, base directory stylesheet and card stylesheet explicitly. Filters/facets are configured in `configuration.mjs`; it does not select snippets, a worker, storage, crawling, commerce actions or full-set sorting.

## Deploy under a subdirectory

Use the same slash-terminated base for build and preview:

```sh
RAVELDEX_CARDS_BASE=/help/ npm run build
RAVELDEX_CARDS_BASE=/help/ npm run preview -- --port 4179
```

Open `http://127.0.0.1:4179/help/`. Deploy all rebuilt `dist/` files there, including content, images and resource routes. Paths resolve from the bundle/content base; `/help/` does not require runtime code changes.

## Replace data and display metadata

Edit `content.json`, then rebuild. `id`, `title`, `body`, `format`, `topics` and unique `/resources/slug/` paths are the searchable resource data. `load.mjs` indexes title/body and native format/topics only. It explicitly maps optional `excerpt`, `category`, `breadcrumb`, `date`, `fields` and `image` into display documents. None of these extra display values changes the native ranking or filter schema. Dates are authored localized text. Breadcrumbs are text segments, without invented navigation. Each named field is an explicit `{ "name": "Format", "value": "Field guide" }` pair.

Try changing the first title to `Plan a riverside walking trip`, adding `Riverside paths are part of this walking resource.` to its body and replacing its excerpt. Rebuild, search `riverside`, switch Grid/Compact and follow the actual changed page. Missing optional fields simply have no presentation. Text is inserted safely; HTML strings stay literal text.

The example admits up to 1,000 records and 4,000,000 aggregate serialized text units, refuses more than 4MiB fetched UTF-8 JSON, and indexes in batches of 100. ID/title/body/path bounds are 256/1,024/50,000/128 UTF-16 units. Optional excerpt/category/date bounds are 2,048/256/256; breadcrumbs contain up to eight 256-unit strings and fields up to four name/value pairs (128/512 units). These are example admission bounds, not memory or latency claims. Match records, `groups`, `labels` and the native schema in `configuration.mjs` when changing filter values.

## Images are an explicit choice

`settings.presentation` starts with `layout: 'list'`, `density: 'comfortable'`, `images: false`. No result image elements or requests are created until **Show images** is checked. List, Cards and Grid all support the same optional images. Enabling images affects only the current native page. The view validates HTTP(S) image URLs without credentials, explicit alternative text and dimensions; local sample paths resolve relative to the content base. Requests use native lazy loading, async decoding and no-referrer policy. Turning images off removes the image presentation; already started browser requests are not a cancellation guarantee.

`images/map.svg` has informative authored alternative text. `images/weather.svg` deliberately uses `alt: ""` because its illustration repeats the adjacent weather title. Both reserve 640×360 dimensions. The final resource deliberately points at missing `images/unavailable.svg` to demonstrate readable broken-image recovery: enabling images on that page keeps the resource title, link and metadata usable. No automatic image retry occurs.

When adding assets, change the explicit allowlist in `content.mjs`, the copy list in `build.mjs` and `package.json` together. Do not point to private or unapproved remote image hosts. The example performs no extraction or automatic image discovery.

## Change layout, density and CSS

The native appearance controls call only `view.setPresentation(...)`. They do not query the engine or write URL state. Change `settings.presentation` for initial presentation; these preferences are in memory and reset on a fresh page load. The directory URL still describes query, filters and page.

`main.mjs` loads `directory.css`, then `directory-cards.css`, then `theme.css`. Edit the existing component rules:

```css
.raveldex-directory {
  --raveldex-directory-accent: #145b45;
  --raveldex-directory-button-color: #fff;
  --raveldex-directory-radius: .75rem;
  --raveldex-directory-card-min-width: 17rem;
  --raveldex-directory-card-gap: 1.25rem;
  --raveldex-directory-card-radius: 1rem;
}
```

Stop preview, rebuild and restart with the same base. Reload: the accent is green, corners are rounder and card spacing is wider. Update the matching dark-theme rule too. Switch Grid/Compact, follow Tab order and browse all pages: visible sequence and DOM reading order remain native. Set background/color/muted/border/focus colors together to preserve contrast. Private `--_` properties and `data-*` hooks are implementation details.

## Query, navigation and ownership

The application owns one native engine, a borrowed-engine directory controller, one optional URL binding and one borrowed card view. The same native checkboxes, counts, chips, Clear all, mobile disclosure, error/revision recovery and complete pagination are used as the plain resource directory. OR combines choices in one group; AND combines groups and text. Counts include every active filter before native paging, including the group's own selections. Zero-count choices remain usable; unavailable counts are named explicitly.

`settings` explicitly enables URL synchronization with push for committed query/filter/page changes. Named parameters are `q`, `page`, `format` and repeated `topic`. Back/Forward replays coherent state without another entry; unrelated parameters/hash/history.state survive. Choose `history: 'replace'` for edits in one entry or `urlState: false` for in-memory search. Invalid links visibly recover. A refused address write keeps search usable; **Update search link** retries without querying again.

`controller.mjs` deduplicates loading, preserves fallback browse links on failure and exposes genuine Retry. It removes native appearance listeners and destroys view, URL binding and controller before disposing only its owned engine. Await `destroy()` when removing the application. A late owner is released even if a custom loader ignores abort. `main.mjs` waits for teardown on pagehide and recreates after persisted pageshow. A custom loader transfers ownership; do not return a borrowed shared engine.

## Check your content and theme

Use native Tab/Enter/Space for links and controls. Filter resources is a native disclosure, initially closed at all widths. Close filters/Escape restores summary focus; removing a chip recovers adjacent focus. Layout/density changes preserve focused result links. No interactive ARIA grid is introduced.

Check all native pages, metadata omissions, long and RTL text, images off/on/broken, zero results, loading/Retry, Back/Forward, teardown, light/dark/forced colors and reduced motion. Automated browser/axe and emulated viewport checks are distinct from human screen-reader speech, physical IME/touch/mobile keyboards, real 200%/400% browser zoom, Safari/device support and hosted deployment. Verify those in your target application.
