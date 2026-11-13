# Compact header search starter

Copy this complete plain-browser project to add a header dropdown with actual guide links and a full-results page. Search `walking guide`: the header shows three of seven matching pages. **See all results** opens the inline search at `search/`, where repeated Load more appends every match while retaining earlier results. The sample guide pages and browse links also work without JavaScript.

The starter creates one native engine per page. Header, inline results and an optional explicitly opened modal borrow that owner and use the same content and `mode: 'prefix'`. There is no crawler, suggestion service, provider registration, worker, storage, search history or second engine behind the modal.

## Copy, install and run

Use Node 22 or later and npm. Extract the complete starter into an empty directory with `tar -xzf dropdown-browser.tar.gz --strip-components=1`, then enter that directory. From a source checkout, you can instead copy the complete `examples/dropdown-browser/` folder to a new project.

Install Raveldex and the starter's pinned build tooling, then build and preview:

```sh
npm install @vmitsaras/raveldex@1.0.0
npm run build
npm run preview -- --port 4178
```

Keep the generated `package-lock.json` and use `npm ci` for subsequent installs. To test a local Raveldex build, substitute its core tarball path for the package name in the install command.

Open `http://127.0.0.1:4178/`. Stop the preview with Ctrl+C.

The quick header popup needs native manual Popover support; optional expanded search also uses native `dialog`. The normal full-results page can search without Popover support. Serve the built output over HTTP or HTTPS. Without native popovers, the header reveals an ordinary GET search form and explains the limitation. The header does not load an unused engine. Its real full-results page still mounts the inline interface, reads the original query and searches the same records. While a supported browser loads, the authored form stays hidden so mounting cannot discard a typed draft. Without JavaScript, the page offers browse links rather than a form that could not search. The public dropdown preset still refuses unsupported hosts; the starter does not install a positioning polyfill.

## Use a deployment base

Use the same base for build and preview:

```sh
RAVELDEX_DROPDOWN_BASE=/help/ npm run build
RAVELDEX_DROPDOWN_BASE=/help/ npm run preview -- --port 4178
```

Open `http://127.0.0.1:4178/help/`. The base must begin and end with `/`, using ordinary letters, digits, `_` or `-` in each segment. Deploy `dist/` under that base. Generated script/CSS/data, guide links and the real `/help/search/` route all follow it. Data and destination URLs resolve relative to the installed bundle, without assuming the site root. Rebuild after changing the base.

## Replace the records

Edit `content.json`, then rebuild. For example, change the first title to `Plan a riverside walking trip` and add `Riverside paths are part of this walking guide.` to its body. Reload, search `riverside`, and follow the actual new title to its generated guide page.

Every record has exactly `id`, `title`, `body`, `category` and `path` string fields. IDs and `/guides/slug/` paths are unique. Titles must contain non-whitespace text, use well-formed UTF-16 and fit within 1,024 UTF-16 units; valid surrounding whitespace is preserved. `content.mjs` validates at most 1,000 pages, ID/title/body/category/path limits of 256/1,024/50,000/120/128 UTF-16 units and 4,000,000 aggregate units; the loader admits at most 4MiB of UTF-8 JSON and indexes in batches of 100. These are finite example bounds, not speed or memory guarantees. All output is public and text is escaped; author real public content rather than HTML templates or secret records.

`load.mjs` maps title/body into native search text, with title boost two. Display records are `{id, title, url}` and category is only a visible guide label, not a facet. Header, full results and optional modal receive those same documents. To use existing pages, replace the explicit build/content mapping with the real public paths while retaining stable IDs and matching indexed/display content. This example does not extract HTML, snippets or section anchors.

## Full-results query meaning

`configuration.mjs` selects `mode: 'prefix'` once for all three presenters. Earlier words match exactly; only the final word can complete an indexed word. The native engine still owns membership, relevance order and exact totals. Header `maxResults: 3` is a finite projection, not pagination. The inline route appends batches of three until all matches are displayed. Its legacy `maxRenderedResults` setting remains accepted but does not impose a window or change continuation.

The dropdown configures the real `search/?from=header#results` destination. It replaces only `q`, preserving the static parameter/hash and the unchanged current field value. Spaces, punctuation, Unicode and literal percent signs are encoded with URLSearchParams, never trimmed or completed for the link. `readInitialQuery(location.search)` reads the full page's single `q` once. Duplicate `q`, malformed percent/UTF-8 encoding, malformed UTF-16, line breaks or more than 2,048 decoded UTF-16 units are refused with `The query link could not be read. Enter a new search below.` The inline field remains usable. Other parameters are ignored; no history or Back/Forward URL synchronization is installed. Editing the inline field does not rewrite the URL.

Use the same analyzer, content and mode when adapting the destination. Do not send a prefix query to an exact-word destination and describe the results as equivalent.

## Change a few CSS values

`main.mjs` explicitly imports the installed dropdown, inline and modal styles, then `theme.css`. Change the existing `.raveldex-dropdown` rule, rebuild and reload:

```css
.raveldex-dropdown {
  --raveldex-dropdown-accent: #145b45;
  --raveldex-dropdown-radius: .75rem;
  --raveldex-dropdown-gap: .75rem;
}
```

The accent, corners and space between controls change while `walking guide` still has seven matches. Tab through the input and buttons, search again, open full results and follow a native guide link. The inline route has a separate `.raveldex-inline` rule; modal layout uses `.raveldex-modal` while its result theme uses the inner `.raveldex-inline`. Edit complete background/text/muted/border/focus/active palettes together for dark themes. The included dark, forced-colors and reduced-motion rules demonstrate those states without hiding focus.

The header's native top-layer popup can escape an overflow/transform ancestor. Keep its input visible and leave the Search/Clear/full-results controls usable. The same compact layout remains at narrow widths. If neither side fits a usable result row, the runtime collapses the popup, reports exact totals with zero visible results and leaves **See all results** available. It does not automatically open another UI or engine. Scroll the page to reach long controls/labels; changing font size and resizing are separate from actual browser zoom or a physical mobile keyboard.

## Optional explicit modal handoff

The default `modalHandoff: false` in `configuration.mjs` keeps **Open expanded search** hidden. To demonstrate the optional handoff, change it to `true`, rebuild and reload. Enter ` walking guide `, wait for committed input, then activate **Open expanded search**. The header popup closes, a dialog opens, and its field retains those exact spaces and query meaning. Close search to return to the logical button. Narrowing the viewport never opens it automatically. A newer handoff, including a refused composing/invalid request, cancels an older reentrant focus/mount action before it can publish stale text.

`createHeaderSearch` owns the handoff button's click: it admits committed, valid text, closes the dropdown, mounts the modal lazily with the same owner/documents/mode, opens it and searches the exact raw field. Neither UI registers a global shortcut. Native modal opening/capability failures report `Expanded search could not open. Use the header or See all results.` and preserve the owner and original recovery route. A later successful handoff clears its own failure feedback; an unrelated refused full-results URL notice remains. The button listener prevents the modal preset's own trigger listener from bypassing refused composition/invalid-query handoffs. Native result and full-results anchors retain their ordinary activation.

All three presenter modules and styles are explicitly bundled for this complete demonstration. Turning the flag off prevents modal mounting; it is not a zero-byte build switch. A header-only application can remove the modal import/branch/button/styles together and measure its own build. The optional library entries themselves do not change core imports or initialize automatically.

## Loading, retry and cleanup

The loader is explicit on page initialization, including guide pages. While it loads, authored browse links remain usable. Block `content.json` to observe failure; unblock it and select **Load search again** to retry. There is one in-flight initialization per controller. `load(signal)` must transfer a **newly owned** `{engine, documents, dispose}`; never return an engine belonging to another component, because this wrapper disposes it. To borrow an existing application engine, mount the installed dropdown/inline/modal APIs directly and retain disposal with that application's owner.

`createHeaderSearch` takes `root`, `status`, `retry`, `load` and `fullResultsURL`, plus optional `fullRoot`, `initialQuery`, `queryRefused`, `modalRoot`, `modalTrigger` and `modalHandoff`. It returns `{start, openModal, destroy}`. `start()` deduplicates initialization, and `openModal()` only acts explicitly after a ready owner exists and the optional handoff is enabled. `destroy()` returns one stable Promise, invalidates callbacks, aborts loading, removes application listeners, destroys every borrowed presenter and waits for late owners/disposal. Call and await it before removing/replacing the integration. The public UI presets separately suppress stale search replies.

`main.mjs` destroys on `pagehide` and waits for that disposal before recreating on a persisted `pageshow`; overlapping navigation epochs cannot recreate an abandoned controller. It exposes no global debug API. There is no storage, telemetry or URL-state subscription.

Automated browser checks are supporting evidence. Human screen-reader speech, physical IME/touch/on-screen keyboards, actual 200%/400% zoom, Safari and other engine/device combinations need separate application observations. The recorded Playwright WebKit environment uses native Option+Tab control traversal and does not establish modified new-tab support; do not override native editing, links or OS preferences to simulate those claims.
