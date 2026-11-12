# Astro resource-directory starter

Copy this complete static Astro project to build seven explicit public resource pages and an optional filterable directory. Enable the directory, then search `walking resource`: seven pages match, with three on each native result page. Use the resource-type/topic checkboxes, remove selected chips, navigate Back/Forward and follow a real resource link. All browse links work before enabling search and without JavaScript.

The project reuses the source-format static search loader, native filters/facets, the directory controller and its separate view. It adds no crawler, SSR search service, development watcher, card/image renderer, sorting or storage.

## Copy and install matching packages

Use Node 22.12 or later (Node 24 is used for this walkthrough), npm and the starter's pinned Astro `7.3.2`. Extract the complete project with `tar -xzf directory-astro.tar.gz --strip-components=1` into an empty directory and enter it. From a checkout, copy `examples/directory-astro/` into a new project instead.

```sh
npm install @vmitsaras/raveldex@1.0.0 @vmitsaras/raveldex-astro@1.0.0
npm run build
npm run preview -- --host 127.0.0.1 --port 4180
```

Keep the generated lockfile and use `npm ci` afterward. To test a local build, substitute matching core and Astro tarball paths in the install command.

Open `http://127.0.0.1:4180/` and choose **Enable directory**. Stop with Ctrl+C.

The source loader needs Web Crypto over HTTPS or localhost. The browser view uses native forms, checkboxes and details. There is no Popover/dialog or `Intl.Segmenter` requirement for these title/link results. `configuration.mjs` explicitly installs filters/facets and original title/body source for static reconstruction; no snippet/source UI is selected.

## Build at your deployment base

```sh
RAVELDEX_ASTRO_BASE=/help/ npm run build
RAVELDEX_ASTRO_BASE=/help/ npm run preview -- --host 127.0.0.1 --port 4180
```

Open `http://127.0.0.1:4180/help/`. The allowlisted `/resources/maps/` route becomes `/help/resources/maps/`; manifest/source/display and JavaScript/CSS URLs use the same base. Deploy the complete rebuilt `dist/`. Keep build ID, base, configuration and all three search assets together. Mixed/stale artifacts refuse rather than loading a partial directory.

## Replace records, groups and labels

Edit `content.json`: `buildId` identifies one complete generation and `entries` contains explicit `{id,title,body,format,topics,path}` records. Paths use `/resources/slug/`; IDs and paths are unique. Change the first title to `Plan a riverside walking trip`, append `Riverside paths are part of this walking resource.` to its body and change `buildId` when publishing a new generation. Rebuild, enable, search `riverside` and follow the actual changed resource page.

`content.mjs` validates up to 1,000 records, bounded strings and topics and 4,000,000 aggregate text units. ID/title/body/path caps are 256/1,024/50,000/128 UTF-16 units. Every topic/format must be explicitly allowed in `configuration.mjs`. These are finite example limits, not latency or memory claims. All records/assets are public. The static allowlist maps each record to its title and path without crawling HTML. Dynamic resource routes derive their slug from those same paths.

The configuration function is used by both the build and browser restore. It keeps title boost two, basic text analysis, scalar string format and multi-value string topics. Original source for **every declared text field** is required for source snapshots. Keep the title/body source registration even though this view displays only linked titles. Do not substitute the browser example's source-free configuration for the static loader.

`groups` declares allowed values and `labels` supplies field/value names. `settings` selects a three-result native page, prefix mode, debounce and optional URL names/policy. OR applies within one group; AND applies across groups/text. Counts describe all current matches before paging and include own active selections. Zero choices stay enabled; absent projected counts are labeled unavailable. Native scores, order and exact totals remain authoritative.

## URL, CSS and lifecycle

The starter explicitly selects `urlState: true` and `history: 'push'`, owning only `q`, `page`, `format` and repeated `topic`. Debounced text commits, Search, filters/chips/Clear all and page changes create entries when state changes. Back/Forward replays without adding another entry. Choose `history: 'replace'` to collapse live edits or `urlState: false` for in-memory search with no URL read/write. Unrelated query/hash/history state survives. Invalid link corrections have a visible notice. If writing the address fails, search stays usable and **Update search link** retries the current state with replace, without another query. Give any additional independent application disjoint names. No local search-history store or telemetry is added.

`src/main.mjs` loads the real source manifest only on Enable/Retry, then loads its matching display documents. `src/search.mjs` owns that returned loader handle, one controller, one URL binding and one view. It cancels/deduplicates initialization, retains browse links after refusal, releases late owners and waits for cleanup. View/binding/controller teardown precedes owned-loader disposal. Pagehide stops it; persisted pageshow recreates a closed application ready to enable. Never pass an application's borrowed owner through this owning wrapper.

`src/style.css` loads after explicit package `directory.css`. Change the existing public component properties, then rebuild and restart preview:

```css
.raveldex-directory {
  --raveldex-directory-accent: #145b45;
  --raveldex-directory-button-color: #fff;
  --raveldex-directory-radius: .75rem;
  --raveldex-directory-gap: 1.25rem;
}
```

Reload, enable and search `walking resource` again. Seven pages still match, three appear per page, checkboxes/chips retain their meaning and links reach real destinations. Inspect visible Tab focus. Update matching dark-theme overrides too; background, color, muted, border, focus and padding are additional supported properties. Private `--_` variables/data hooks are not customization APIs.

Filter resources uses a native details disclosure. Close filters/Escape restores summary focus; resizing does not close it. Native Tab/Space/Enter, stable checkbox focus, adjacent chip focus, Clear all, selected zero values, no-results recovery and Refresh after a changed revision belong to the view. Initialization asset failure retains ordinary links and Retry. Check these flows with your own data/theme, including long/RTL labels, narrow layouts, dark/forced colors and reduced motion. Automated input/axe/viewport checks are separate from human AT, physical IME/touch/mobile keyboards, actual browser zoom, Safari/device support and hosted deployment.
