# Browser resource-directory starter

Copy this complete project to search a public resource library with checkboxes, removable selected filters and complete result pages. Search `walking resource`: all seven pages match. Filter by resource type and topic, remove a chip or choose **Clear all**. Every result opens a real generated resource page. The browse list also works without JavaScript.

The application owns one native engine, one directory controller, its optional URL binding and one borrowed view. Filters use OR within a group and AND across groups/text. Counts include every active filter, including the group's own selections, before result paging. A count describes the current matches; it does not predict what adding another OR choice will do. Zero-count choices remain usable.

## Copy, install and run

Use Node 22 or later and npm. Raveldex is private and unpublished, supplied as a local tarball. The pinned esbuild 0.28.2 dependency is build tooling. From an authorized source checkout after `npm ci`:

```sh
repo="$PWD"
packages="$(mktemp -d /tmp/raveldex-directory-packages.XXXXXX)"
starter="$(mktemp -d /tmp/raveldex-directory-browser.XXXXXX)"
npm run build
npm pack --ignore-scripts --cache "$packages/.npm-cache" --pack-destination "$packages"
cp -R "$repo/examples/directory-browser/." "$starter/"
cd "$starter"
npm install --ignore-scripts --cache "$starter/.npm-cache" --no-audit --no-fund "$packages/vmitsaras-raveldex-0.1.0-rc.0.tgz"
npm run build
npm run preview -- --port 4179
```

Open `http://127.0.0.1:4179/`. Stop with Ctrl+C. For a downloaded archive, extract into an empty directory with `tar -xzf directory-browser.tar.gz --strip-components=1`, enter it and install the supplied core tarball with `npm install --ignore-scripts --cache .npm-cache --no-audit --no-fund /absolute/path/to/vmitsaras-raveldex-0.1.0-rc.0.tgz`. Run the build/preview commands above. The first install needs registry access or a suitable cache for the pinned tooling; keep its generated lockfile and use `npm ci` afterward.

Serve output over HTTP(S). The browser uses native forms, checkboxes and a details disclosure. No Popover, dialog, snippets, worker, storage or search-history feature is selected. Explicit filters and facets are installed in `configuration.mjs`; missing capabilities remain visible errors.

## Deploy under a subdirectory

Use the same slash-terminated base for build and preview:

```sh
RAVELDEX_DIRECTORY_BASE=/help/ npm run build
RAVELDEX_DIRECTORY_BASE=/help/ npm run preview -- --port 4179
```

Open `http://127.0.0.1:4179/help/`. Deploy the rebuilt `dist/` there, including assets, content and resource pages. The base allows ordinary letters, numbers, `_` and `-` path segments. URLs resolve from the bundle/content location, including `/help/resources/maps/`; no runtime path assumes the domain root.

## Replace content and labels

Edit `content.json`, then rebuild. Each entry has `id`, `title`, `body`, `format`, `topics` and `path`. IDs and `/resources/slug/` paths are unique. Change the first title to `Plan a riverside walking trip` and append `Riverside paths are part of this walking resource.` to its body. Rebuild, search `riverside` and follow the actual changed page.

`content.mjs` validates up to 1,000 explicit pages and 4,000,000 aggregate text units. ID/title/body/path bounds are 256/1,024/50,000/128 UTF-16 units. Topics are a distinct array of up to eight configured strings. The loader refuses more than 4MiB of fetched UTF-8 JSON and indexes in batches of 100. These are admission limits, not latency/memory guarantees. All generated data is public. The build escapes text and creates only the declared resource routes; it does not crawl HTML.

`configuration.mjs` declares native title/body text, title boost two, one scalar string `format` and multi-value string `topics`. Its `groups` list owns allowed filter values; `labels` supplies visible field/value labels. Change matching records, allowed values and labels together. `settings` selects prefix mode, a three-result native page, input debounce and URL policy. Earlier words match exactly; the final word may complete a native word. Native relevance order, ties and totals remain authoritative. No full-set sorting or card/image renderer is added.

## URL state and navigation

This starter explicitly selects `urlState: true` and `history: 'push'`. Named parameters are `q`, `page`, `format` and repeated `topic`. Each debounced text commit, explicit Search, checkbox change, chip removal, Clear all or page change can create a history entry when state changes. Back/Forward replays coherent text/filters/page without pushing another entry. Choose `history: 'replace'` to keep live edits in the current entry, or `urlState: false` to leave the URL untouched and browse only in memory. Connect the binding before the initial read/query, as `controller.mjs` does.

Unrelated raw parameters, pathname/hash and history.state survive. Invalid/stale owned values recover with the existing bounded URL codec. Query/filter changes reset page one; stale native revisions show **Refresh results**. A refused history write leaves search usable and shows an address-update message. **Update search link** retries the current state with replace, without another query. Corrected invalid link values have a visible notice.

Only one controller may claim a given parameter name on a host. Give separately configured application instances disjoint names; this starter mounts one per page. URL state is explicit session-history integration, with no localStorage, retained search-history store or telemetry.

## Change a few CSS values

`main.mjs` imports the package's explicit `directory.css`, then `theme.css`. In the existing `.raveldex-directory` rule, change these values:

```css
.raveldex-directory {
  --raveldex-directory-accent: #145b45;
  --raveldex-directory-button-color: #fff;
  --raveldex-directory-radius: .75rem;
  --raveldex-directory-gap: 1.25rem;
}
```

Stop preview, rebuild and restart it with the same base, then reload. The accent is green, corners are rounder and filter/result spacing is wider. Search `walking resource` again: seven pages still match, three appear per page, and **Next page** reaches the other matches. Check Tab focus and follow a real result. For dark colors, change the matching media rule too. Supported properties also include background, color, muted, border, focus and padding; set related colors together to preserve contrast. Private `--_` variables and `data-*` hooks are implementation details.

## Keyboard, mobile filters and recovery

Search/checkboxes/buttons/links use native Tab, Enter and Space behavior. **Filter resources** opens a native disclosure at every width; it defaults closed. Close filters or Escape inside it returns focus to its summary. Resizing does not silently close focused filters. Removing a selected-filter chip focuses the next chip, previous chip or search input. Clear all retains its button. A selected zero or projected-out value remains checked and removable; omitted counts are labeled unavailable rather than invented as zero.

Typing waits for composition to finish. Loading, no results, native failure and revised collections have visible live status and recovery. No-results can recover by removing chips or clearing all. Initialization fetch/validation/mount failures retain the authored browse links and show **Retry loading directory**. The view does not silently install missing capabilities.

`controller.mjs` deduplicates start, aborts loading and releases a late owner even if its loader ignores abort. Destroy tears down view, URL binding and controller before disposing only the owned engine. Main waits for teardown on pagehide and recreates the application after persisted pageshow. Call/await `destroy()` when removing the application. Do not supply a borrowed engine from `load`: this wrapper owns and disposes the returned candidate.

Before adopting your theme, check keyboard, chip focus, mobile disclosure, all pages, Back/Forward, zero results, loading/retry, long/RTL labels, dark/forced colors and reduced motion. Scripted browser/axe/reflow checks do not establish human screen-reader speech, physical IME/touch/on-screen keyboard or actual 200%/400% browser zoom; check those in your target application. Playwright WebKit is not Safari qualification.
