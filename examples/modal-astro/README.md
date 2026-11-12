# Documentation modal starter for Astro

Copy this complete starter to build a workshop guide with optional search in a native dialog. It creates one search record per actual guide page, with evidence-backed links to the page's authored headings. The ordinary guide links work before loading and without JavaScript. Search data loads only when someone selects **Search the guide**.

## Copy and install

Use Node 24 and npm. Extract the complete starter into an empty directory with `tar -xzf modal-astro.tar.gz --strip-components=1`, then enter it. From a source checkout, copy the entire `examples/modal-astro/` folder into a new project instead.

```sh
export RAVELDEX_MODAL_ASTRO="$(pwd -P)"
npm --prefix "$RAVELDEX_MODAL_ASTRO" install @vmitsaras/raveldex@1.0.0 @vmitsaras/raveldex-astro@1.0.0
```

The starter pins Astro `7.3.2`. Keep the generated `package-lock.json` and use `npm ci` afterward. To test local changes, substitute matching core and Astro tarball paths in the install command. Keep `RAVELDEX_MODAL_ASTRO` set for the build and preview commands below.

## Build and preview

```sh
ASTRO_TELEMETRY_DISABLED=1 npm --prefix "$RAVELDEX_MODAL_ASTRO" run build
ASTRO_TELEMETRY_DISABLED=1 npm --prefix "$RAVELDEX_MODAL_ASTRO" run preview -- --host 127.0.0.1 --port 4321
```

Open the HTTP URL Astro prints. Choose another port if occupied; Ctrl+C stops a foreground preview. Astro may start a background server in an agent environment; use `npm --prefix "$RAVELDEX_MODAL_ASTRO" run preview -- stop` to stop that project's background preview before rebuilding. Select **Search the guide**, enter `workshop` and select **Search**. There are six matching pages; three appear first, and **Load more** shows all six. The Topic filter can narrow these pages. Search `bobbin` to find **Sewing machines**, then follow **Wind the bobbin** to the actual heading. That example intentionally includes `%`, `#` and non-ASCII characters in its raw anchor: the URL encodes them once.

The initial loading window has a visible close button and native Escape support. In the ready search window, some browsers clear a focused search field on the first Escape; press Escape again or use **Close search** to dismiss. Closing it cancels initialization. A failed artifact shows **Retry loading search**; guide navigation remains available after closing the window. Block a `/raveldex/` asset locally, open search, unblock it and retry to exercise recovery.

## Deploy under a subdirectory

Stop preview, then rebuild and preview with the same base:

```sh
RAVELDEX_ASTRO_BASE=/help/ ASTRO_TELEMETRY_DISABLED=1 npm --prefix "$RAVELDEX_MODAL_ASTRO" run build
RAVELDEX_ASTRO_BASE=/help/ ASTRO_TELEMETRY_DISABLED=1 npm --prefix "$RAVELDEX_MODAL_ASTRO" run preview -- --host 127.0.0.1 --port 4321
```

Open `http://127.0.0.1:4321/help/` or the actual reported port. Deploy the complete rebuilt `dist/` together. The build, manifest URL, result pages and heading links share the same Astro base. Old HTML mixed with a different build's manifest is refused; source/display/section byte and identity checks refuse mixed assets. Do not change the base without rebuilding.

## Replace pages and sections

Edit `content.json`: choose a new `buildId` when content or configuration changes, then rebuild. Each entry has a unique route-safe `slug`, plain title, string category and explicitly authored sections. Each section has an exact raw `anchor`, a heading and original plain-text `text`. Its anchor must be unique within that page and match the real rendered heading's ID.

`content.mjs` joins section texts with two newlines and calculates their disjoint original UTF-16 ranges. The exact same entries render headings in `src/pages/guide/[slug].astro`, create native records in `astro.config.mjs` and supply the separate optional section maps. Do not normalize or rewrite text after calculating offsets. When integrating existing pages, provide the original indexed field/value text, real URLs/IDs and equivalent ranges yourself. This starter does not crawl routes or extract HTML/Markdown. Never put private content into public artifacts.

`configuration.mjs` explicitly registers all original source fields for static source reconstruction, source-based section evidence and native category facets. `src/search.mjs` loads the source owner, then display records and the source-only section companion through that same handle. The companion validates source/display/build/base identity and stamps the receiving owner's revision; the modal checks it again when searching. `dist/raveldex/` contains the manifest, complete source/display files and separate section files. This is a complete local index loaded on first use, not a sharded or lazy index format.

## Change the appearance and query policy

`src/main.mjs` explicitly imports `modal.css` and then `src/style.css`. Change the scoped public properties in the latter, then rebuild:

```css
.raveldex-inline {
  --raveldex-inline-accent: #563c83;
  --raveldex-inline-focus: #874a00;
}
.raveldex-modal {
  --raveldex-modal-max-width: 46rem;
  --raveldex-modal-radius: .75rem;
}
```

Keep text/focus/highlight contrast usable. The modal uses final-word prefix matching, three pages per batch and at most six rendered pages. Close preserves words and selected Topic by default, clears results, and reruns the first page on reopen. Set `resetOnClose: true` in the options in `src/main.mjs` to clear words and Topic instead. No global shortcut is installed by this loading wrapper. Once you already own a ready engine, the direct public modal supports its coordinated opt-in shortcut.

## Ownership, cancellation and cleanup

`createDocumentationSearch()` returns `open()`, `close()` and `destroy()`. Concurrent opens share the current initialization. Close invalidates that attempt before aborting it. A rapid reopen can start a fresh attempt while an abort-ignoring earlier loader unwinds; old completion cannot mount or reopen search. Each newly returned abandoned handle is disposed. Successful initialization retains its owned handle across closes so controls can preserve their values. There is no automatic network retry or reused partial candidate after failure.

A custom `load` must transfer a **fresh newly owned** `LoadedStaticSearch` handle on every call. The wrapper owns that handle and destroys its borrowed modal before disposing it. Never return an engine or static handle owned elsewhere. To use an existing borrowed application engine, mount `mountRaveldexModal` directly with its documents/maps, destroy only that UI when the view ends, and let the existing owner dispose its engine.

Call and await `destroy()` before replacing this integration. The stable destruction promise waits for late loader handles; listeners are removed, the loading shell closes, the original search fallback is restored and owners are released once. `src/main.mjs` handles `pagehide` and creates a fresh wrapper after teardown on back/forward-cache `pageshow`. The example uses static navigation, without Workbench selectors, global debug state, storage or telemetry.

Automated installed tests cover finite native browser interaction and cleanup. Human screen-reader behavior, physical IME/touch/on-screen keyboard, actual zoom, broader browsers/devices, calibrated memory/latency and hosted deployment require separate qualification.
