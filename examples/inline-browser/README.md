# Inline search for a browser site

Copy this complete starter to add a search form, original-text snippets, a type filter and complete result paging. It uses native Raveldex in the browser's main thread and a small explicit guide allowlist. There is no worker, crawler, server API or diagnostic selector. The rendered pages remain usable without JavaScript.

## Install and run

Use Node 22 or later and npm. The packages are currently private and unpublished: these instructions use a local tarball from an authorized source checkout, not a registry release. The starter's pinned esbuild dependency is build tooling and is not shipped as a browser runtime dependency.

From a source checkout with `npm ci` already complete, prepare a private package and copy the entire starter directory. Use fresh directories for these outputs:

```sh
repo="$PWD"
packages="$(mktemp -d /tmp/raveldex-inline-packages.XXXXXX)"
starter="$(mktemp -d /tmp/raveldex-inline-browser.XXXXXX)"
npm run build
npm pack --ignore-scripts --cache "$packages/.npm-cache" --pack-destination "$packages"
cp -R "$repo/examples/inline-browser/." "$starter/"
cd "$starter"
npm install --ignore-scripts --cache "$starter/.npm-cache" --no-audit --no-fund "$packages/vmitsaras-raveldex-0.1.0-rc.0.tgz"
npm run build
npm run preview -- --port 4176
```

If someone supplied the starter and package archive, extract the starter, enter its directory and run `npm install --ignore-scripts --cache .npm-cache --no-audit --no-fund /absolute/path/to/vmitsaras-raveldex-0.1.0-rc.0.tgz`, followed by the two `npm run` commands above. Installation also installs the pinned build tool; it may need registry access or an existing npm cache. Keep the generated `package-lock.json` in your application and use `npm ci` thereafter.

Open `http://127.0.0.1:4176/`. Search `walking guide`: there are seven matches, with three initially visible. Load more shows six; Next results reaches the seventh, and Previous results returns to the first window. Choose Guide to narrow to five pages. A search such as `weather` shows original text with highlighted matches; following its title opens the actual guide page. Ctrl+C stops this preview.

## Deploy under a subdirectory

Use the same base for the build and preview:

```sh
RAVELDEX_INLINE_BASE=/help/ npm run build
RAVELDEX_INLINE_BASE=/help/ npm run preview -- --port 4176
```

Open `http://127.0.0.1:4176/help/`. The base must begin and end with `/`. Deploy the contents of `dist/` under that path. The build places all script, stylesheet, data and browse/result links under that base. The loader resolves `content.json` relative to the bundled module rather than assuming the site root. Do not change the base without rebuilding.

## Replace the sample content

Edit `content.json`, then rebuild. Each entry has a unique `id`, a plain-text `title` and `body`, a string `category` and a unique local `/guides/slug/` path. Titles must contain non-whitespace text, be well-formed UTF-16 and fit within 1,024 UTF-16 units; invalid titles are refused before replacing generated pages or creating a loaded search owner. This starter allows up to 1,000 explicit entries and adds them in batches of 100. Those are starter bounds, not a capacity or speed guarantee. `build.mjs` creates the corresponding browse list and static guide pages, escaping text rather than treating it as HTML. Do not put secrets in this public file or in indexed text.

`load.mjs` maps the same entries to `{ id, text: { title, body }, metadata: { category } }` search records and `{ id, title, url }` display records. If you index existing pages instead, supply their real canonical URLs and preserve the relationship between IDs, original source text and display records. This starter does not extract HTML or invent section anchors. Keep the authored browse links available while data loads and when it fails.

The engine explicitly registers `createSourceProvider({ fields: ['body'] })`, `createSnippetEvidence({ fields: { body: 'source' } })` and `createFacets({ fields: ['category'] })`. Title and body are indexed; only body source is retained for snippets. Equality filtering is native core behavior, so the structured-filter add-on is unnecessary. To use only title/link search, remove the snippet/facet options in `controller.mjs` and their corresponding optional registrations/schema metadata in `load.mjs`.

## Change a few CSS values

`main.mjs` imports the optional `inline.css` first and `theme.css` second. Change the scoped public properties in `theme.css`, then rebuild:

```css
.raveldex-inline {
  --raveldex-inline-accent: #294e82;
  --raveldex-inline-gap: 1.25rem;
  --raveldex-inline-radius: .65rem;
}
```

These affect links/controls, spacing and corner shape without editing generated markup. Check text/focus contrast after changing colors. `controller.mjs` sets the page size, visible-result cap and plain-text labels. The default final-word prefix mode lets `walk` find `walking`; earlier words remain exact.

## Loading, retry and disposal

`main.mjs` explicitly starts a controller. The controller deduplicates concurrent starts, announces loading, leaves browse links available and exposes Retry loading search after a data or initialization failure. Test recovery locally by blocking `content.json`, then unblocking it and selecting Retry loading search. Data fetches use an AbortSignal; an owner created after destruction is disposed before it can mount.

`createInlineSearch` accepts a `load(signal)` callback that transfers a **newly owned** `{ engine, documents, dispose }` object. It destroys the borrowed UI before disposing that owner, including on initialization failure and late completion. Do not return an engine owned elsewhere in your application. To integrate with an existing borrowed engine, mount `mountRaveldexInline` directly, call its `destroy()` when the view ends, and leave engine disposal to its existing owner.

Call and await `controller.destroy()` before removing the integration in your own navigation system. It is idempotent, removes its Retry listener, aborts loading and waits for any late owner to be released. This page calls destruction on `pagehide` and creates a fresh controller on a back/forward-cache `pageshow`. No global debug API is exposed. The inline preset separately handles stale searches and revision-safe retry after initialization.

The headless checks exercise installed bytes, navigation, failure/delay/retry and teardown. They do not establish human screen-reader, physical input, actual zoom, broad browser support or large-data performance qualification.
