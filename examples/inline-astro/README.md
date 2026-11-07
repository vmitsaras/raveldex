# Inline search starter for Astro

This complete starter builds six workshop guide pages and an optional inline search. It uses the installed Astro adapter's explicit allowlist and source-artifact loader. Search starts when a visitor selects **Enable search**; the ordinary page links work before loading and without JavaScript.

## Copy and install

Use Node 24 and npm. Raveldex packages are currently private and unpublished: use matching local core and Astro `.tgz` files, rather than a registry install. Follow [build tarballs from a source checkout](https://github.com/vmitsaras/raveldex/blob/main/docs/api/GETTING_STARTED.md#build-tarballs-from-a-source-checkout) first if you need to create them. Keep `RAVELDEX_REPOSITORY` and `RAVELDEX_ARTIFACTS` set to their actual absolute paths in the same shell.

Copy every file in this directory into a new project, including `content.json`, `configuration.mjs` and `src/`. From a source checkout, run:

```sh
export RAVELDEX_INLINE_ASTRO="$(mktemp -d "${TMPDIR:-/tmp}/raveldex-inline-astro.XXXXXX")"
export RAVELDEX_INLINE_ASTRO="$(cd "$RAVELDEX_INLINE_ASTRO" && pwd -P)"
cp -R "$RAVELDEX_REPOSITORY/examples/inline-astro/." "$RAVELDEX_INLINE_ASTRO/"
npm --prefix "$RAVELDEX_INLINE_ASTRO" install --ignore-scripts --no-audit --no-fund "$RAVELDEX_ARTIFACTS/core/vmitsaras-raveldex-0.1.0-rc.0.tgz" "$RAVELDEX_ARTIFACTS/astro/vmitsaras-raveldex-astro-0.1.0-rc.0.tgz"
```

The copied `package.json` pins Astro `7.3.2`; installation resolves its build tools as well as the two local packages. Tool installation needs registry access or a suitable npm cache. No additional search runtime dependencies are installed. If you received the complete starter archive from the [inline solution page](https://github.com/vmitsaras/raveldex/blob/main/site/Inline.astro), extract its `package/` directory into a fresh project instead of copying from a checkout, then run the same install command with that project's absolute path.

## Build and preview

```sh
ASTRO_TELEMETRY_DISABLED=1 npm --prefix "$RAVELDEX_INLINE_ASTRO" run build
ASTRO_TELEMETRY_DISABLED=1 npm --prefix "$RAVELDEX_INLINE_ASTRO" run preview -- --host 127.0.0.1 --port 4321
```

Open the HTTP URL Astro prints. The preview runs in the foreground; use Ctrl+C to stop this preview before rebuilding. Keep another existing server running if the port is occupied and choose another port. Do not open the generated HTML with a `file:` URL: the loader fetches same-origin assets.

Choose **Enable search**, type `workshop` and select **Search**. Three results appear first; **Load more** shows the remaining matches. While those results are displayed, choose **Tools** in the Topic filter to narrow them to two tool pages. The filter choices come from the current search results. Select a result title to open its actual static page. **Clear search and filters** resets both the words and topic. No Workbench controls or developer diagnostics are included.

The build writes `dist/raveldex/manifest.json` plus integrity-checked source and display files. The client loads all source data once on demand, then its display mapping. This is a complete local index, not a lazy or sharded index. It uses direct browser execution; no worker file is required.

## Use a subdirectory

Stop the preview, then rebuild and preview with the same changed base:

```sh
RAVELDEX_ASTRO_BASE=/help/ ASTRO_TELEMETRY_DISABLED=1 npm --prefix "$RAVELDEX_INLINE_ASTRO" run build
RAVELDEX_ASTRO_BASE=/help/ ASTRO_TELEMETRY_DISABLED=1 npm --prefix "$RAVELDEX_INLINE_ASTRO" run preview -- --host 127.0.0.1 --port 4321
```

Open `http://127.0.0.1:4321/help/` (or the actual port reported). Astro resolves scripts and CSS using its base; the loader's manifest URL and generated result URLs use that same base. Deploy the complete new `dist/` together. An old HTML page paired with a different build's manifest is rejected rather than displaying mixed data.

## Replace the content

Edit `content.json`: each entry has a unique route-safe `slug`, a display/search `title`, one string `category` and original plain-text `body`. The same entry renders the page, creates its indexed record and supplies its display title and URL. Change `buildId` whenever deploying changed content or configuration, then rebuild. This example intentionally indexes only those entries; it never extracts HTML or automatically crawls routes. Do not put private material in the allowlist or generated artifacts.

`configuration.mjs` explicitly declares title/body search fields and category metadata. The title has boost 2. It registers original title and body storage with `createSourceProvider`, source-based `createSnippetEvidence` and `createFacets` for category counts. Static source snapshots require original values for every declared text field, including title. `src/search.mjs` requests only `body` snippets and that native string facet. Retain the same configuration for both build and restore. To adopt only title/link search, remove the snippet/facet UI options and their registrations together, while retaining the complete source provider required by static reconstruction.

## Change the appearance

The package stylesheet is imported separately in `src/main.mjs`. Change the scoped public properties in `src/style.css`; no runtime or DOM changes are required. For example:

```css
.raveldex-inline {
  --raveldex-inline-accent: #563c83;
  --raveldex-inline-focus: #874a00;
  --raveldex-inline-radius: .75rem;
}
```

Rebuild, enable search and inspect the new link/control color and corner radius. Keep text, focus and highlight contrast usable when changing colors. The [inline API guide](https://github.com/vmitsaras/raveldex/blob/main/docs/api/HOSTS.md#inline-result-pages-filters-and-snippets) lists the other supported messages and style properties. The starter uses prefix matching, three hits per batch and at most six rendered hits; configure these in `src/search.mjs` for your own dataset.

## Loading, retry and cleanup

The wrapper displays a loading message while the manifest, source snapshot and display mapping load. Guide links remain usable. Asset failure leaves those links and a **Retry search** button; retry creates a new candidate and never reuses partial state. Concurrent `start()` calls share the same pending initialization.

`createInlineSearch()` in `src/search.mjs` returns `start()` and `destroy()`. The wrapper owns only the loader handle it creates: the inline UI borrows its engine, and teardown destroys the UI before disposing that owned handle. It accepts no borrowed application engine. `destroy()` removes its click listener, aborts initialization, restores the authored search fallback and returns a promise that settles after any late candidate is disposed. Call and await it before removing or replacing the search host in a client-side route integration; this starter uses ordinary static navigation.

`src/main.mjs` disposes on `pagehide` and recreates the wrapper when a document is restored from the browser's back/forward cache. The page contains browse links and useful text without JavaScript; a script-loading failure leaves that fallback intact. No package publication, deployment, telemetry or browser storage is part of this starter.
