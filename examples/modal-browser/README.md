# Documentation search for a browser site

Copy this complete starter to add a native documentation modal with real page results and anchored section previews. The six workshop pages are an explicit allowlist; the same authored section content builds the index, original UTF-16 ranges and real heading IDs. Nothing crawls or extracts HTML. Ordinary browse links work before search loads and without JavaScript.

## Install, build and preview

Use Node 22 or later and npm. Raveldex is currently private and unpublished: use a local tarball from an authorized source checkout. esbuild 0.28.2 is pinned build tooling, not a browser runtime dependency.

From a source checkout after `npm ci`, prepare a package and copy the whole directory into a fresh location:

```sh
repo="$PWD"
packages="$(mktemp -d /tmp/raveldex-modal-packages.XXXXXX)"
starter="$(mktemp -d /tmp/raveldex-modal-browser.XXXXXX)"
npm run build
npm pack --ignore-scripts --cache "$packages/.npm-cache" --pack-destination "$packages"
cp -R "$repo/examples/modal-browser/." "$starter/"
cd "$starter"
npm install --ignore-scripts --cache "$starter/.npm-cache" --no-audit --no-fund "$packages/vmitsaras-raveldex-0.1.0-rc.0.tgz"
npm run build
npm run preview -- --port 4177
```

Open `http://127.0.0.1:4177/`. Choose **Search documentation**, then search `bobbin`. The sewing page has one matching **Thread the machine** section preview; following that link opens its actual `threading-100%` heading. Search `workshop` for all six matching pages, with three initially displayed; **Load more** reveals the next batch. The Topic filter narrows matching pages. Close with Escape or **Close search**, then reopen to check the preserved words/filter. Some browsers clear a focused search field on the first Escape; press Escape again or use **Close search** to dismiss. Ctrl+C stops this preview.

If you received the complete starter archive, extract its `package/` directory into a new project. Run `npm install --ignore-scripts --cache .npm-cache --no-audit --no-fund /absolute/path/to/vmitsaras-raveldex-0.1.0-rc.0.tgz`, then the build/preview commands above. Tool installation may need registry access or an npm cache. Keep your generated `package-lock.json` and use `npm ci` for subsequent installs.

## Deploy below a path

Stop the preview and use the same base when rebuilding and serving:

```sh
RAVELDEX_MODAL_BASE=/help/ npm run build
RAVELDEX_MODAL_BASE=/help/ npm run preview -- --port 4177
```

Open `http://127.0.0.1:4177/help/`. Deploy the complete new `dist/` together under that base. Scripts, CSS, data, browse links, result pages and anchors use the same base. Rebuild whenever it changes. The preview is an HTTP server, so do not open HTML using `file:`.

## Replace the pages and sections

Edit `content.json` and rebuild. Each entry has a unique nonempty `id`, a plain `title`, string `category`, unique `/guide/slug/` path, and one to 64 explicit sections. Titles must contain non-whitespace text, be well-formed UTF-16 and fit within 1,024 UTF-16 units. A section supplies its exact raw HTML `anchor`, plain non-whitespace `heading` and original `body`. Valid surrounding title/heading whitespace is preserved. Percent signs and `#` characters in anchors are literal; the result link URL-encodes them exactly once. Do not pre-encode or slugify the anchor. Keep IDs stable and paths unique. This starter accepts 1–1,000 explicit pages and indexes batches of 100; these bounds are not performance guarantees. Do not put private material in public artifacts.

`content.mjs` creates one original body string per page: heading, newline, section body, then two newlines before the next section. Its section map uses half-open original UTF-16 offsets in that exact string. `build.mjs` renders the matching heading IDs. `load.mjs` indexes one record per page and binds maps to that receiving engine's successful mutation revision. Native totals, scores, ordering and filters continue to count pages; previews are bounded context, not a global count of matching sections. If you render existing pages yourself, retain these relationships and supply their real canonical URLs and exact original source ranges. The UI does not inspect target pages for you.

The explicit optional registrations are `createSourceProvider({ fields: ['body'] })`, `createSectionEvidence({ fields: { body: 'source' } })` and `createFacets({ fields: ['category'] })`. Title and body are searched, with title boosted by two. Source-based section evidence retains original body text. Sections and ordinary `snippetFields` are mutually exclusive. Remove section maps/evidence together to use plain title/link results, and remove facet UI/metadata/registration together when no Topic filter is needed.

The build compiles the SHA-256 of the exact `content.json` bytes into the client. On first open, the loader checks fetched bytes before creating an engine, so changed/stale/mixed content fails visibly instead of silently pointing at different sections. Deploy matching HTML, bundle, CSS, data and rendered targets together; the digest does not authenticate a publisher or prove that separately deployed pages have the promised IDs. Rebuild after editing data. The complete data file is loaded once and used to create a full local index; this is not a lazy or sharded index. There is no worker, server search, persistence or telemetry.

## Change a few CSS values

`main.mjs` explicitly imports the package's `modal.css` (including shared inline CSS), then `theme.css`. Change scoped public properties and rebuild:

```css
.raveldex-modal {
  --raveldex-modal-max-width: 44rem;
  --raveldex-modal-radius: .8rem;
}
.raveldex-inline {
  --raveldex-inline-accent: #294e82;
  --raveldex-inline-gap: 1rem;
}
```

The modal properties control the surface/layout; inline properties control shared results/controls. Keep contrast and visible focus usable. `controller.mjs` sets labels, batch size and `resetOnClose`; setting `resetOnClose: true` clears words and filters on close. The default is preservation with a fresh native query when reopened. No global keyboard shortcut is installed by this application wrapper. Direct public modal integrations can explicitly opt into coordinated shortcuts.

## First-open loading, retry and disposal

`main.mjs` creates a controller without fetching data or creating an engine. The first trigger activation opens an immediate native loading dialog with **Cancel loading search**. It then fetches and verifies the data and transfers one newly created owner to the modal. Repeated opens share the current initialization. Cancel/Escape/native close abort the attempt; a late owner is disposed and cannot reopen the abandoned UI. Reopening while an old attempt unwinds creates a new current attempt; old finalizers cannot clear it. On failure, **Retry loading search** starts a fresh attempt. Try blocking `content.json`, open search, then unblock and Retry. Browse links remain available after closing the loading dialog.

`createDocumentationSearch({ root, trigger, loadingDialog, status, retry, load, resetOnClose })` returns `open()`, `close()` and `destroy()`. `load(signal)` must transfer a **newly owned** `{ engine, documents, pageSections, dispose }`. This controller disposes that owner on initialization failure, late completion or destruction. Do not return a borrowed application engine. To integrate an engine owned elsewhere, use `mountRaveldexModal` directly and destroy that UI before the existing owner disposes its engine.

Closing an initialized modal keeps its engine and current words/filter values; it cancels presentation work and revalidates on reopen. `destroy()` is idempotent, returns one stable promise, removes loading/retry/trigger listeners, aborts initialization, destroys the borrowed modal before disposing its owned engine, and waits for late owners to be released. Call and await it before replacing the host in a client navigation system. `pagehide` destroys this page's controller; a persisted `pageshow` creates a fresh, closed controller for a back/forward-cache restore. Native dialog support, `Intl.Segmenter` and Web Crypto in a secure context (localhost or HTTPS) are required. Failures leave the complete browse route intact.

Installed headless tests exercise copied files, real package bytes, base changes, anchors, loading failure/retry and lifecycle races. Human screen-reader, physical input/on-screen keyboard, actual zoom, broad browser/device and large-data performance qualification remain separate.
