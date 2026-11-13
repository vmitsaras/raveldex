# Consumer search, UI and host integrations

Choose a Raveldex consumer interface for your application's records, then add only the capabilities it needs. You supply searchable data and matching display records; no surface crawls pages or downloads an index automatically. Start with [installation and record preparation](GETTING_STARTED.md). Workers, snapshots, storage and the developer Workbench remain separately selected integrations below.

## Consumer search interfaces

| Need | JavaScript entry after `@vmitsaras/raveldex` | Separate CSS entry |
| --- | --- | --- |
| Inline form | `/addons/ui/inline` → `mountRaveldexInline` | `/addons/ui/inline.css` |
| Documentation dialog | `/addons/ui/modal` → `mountRaveldexModal` | `/addons/ui/modal.css` (includes inline CSS) |
| Compact header popup | `/addons/ui/dropdown` → `mountRaveldexDropdown` | `/addons/ui/dropdown.css` |
| Filterable directory | `/addons/ui/directory` → `createDirectory`; `/addons/ui/directory/view` → `mountRaveldexDirectory` | `/addons/ui/directory.css` |
| Rich directory results | Same directory controller; `/addons/ui/directory/cards` → `mountRaveldexDirectoryCards` | Both `/addons/ui/directory.css` and `/addons/ui/directory-cards.css` |

For complete projects, the [solution chooser](https://github.com/vmitsaras/raveldex/blob/main/examples/README.md) links eight browser/Astro starters with explicit data, loading/retry and cleanup. For a small core-only integration, copy the recipe below. The `/addons/ui` Workbench is for developer exploration; it is not required by any consumer preset.

### Mount a consumer search form

Use a connected root on an HTTP(S) page. Keep ordinary navigation outside it so visitors can browse when search is unavailable:

<!-- consumer-example: markup -->
```html
<section id="search" class="help-search" aria-label="Documentation search"></section>
```

Copy [inline.mjs](examples/inline.mjs) into your installed ESM application and run this entry after the root exists, through a bundler with CSS support:

<!-- consumer-example: entry -->
```js
import { createInlineSearch } from './inline.mjs';
import '@vmitsaras/raveldex/addons/ui/inline.css';

const root = document.querySelector('#search');
if (!(root instanceof HTMLElement)) throw new Error('Missing search root');
const search = await createInlineSearch(root);
// When removing this integration, after initialization has returned:
// await search.dispose();
```

The module creates one title/body record, joins its ID to an application-owned title/URL, and mounts `mountRaveldexInline` with explicit `mode: 'prefix'`. It starts idle with no automatic search. Enter `atom` and submit to find **Atomic updates** at `/guide/updates/`; your application must supply that actual page. Prefix completes the final word after two normalized code points; earlier words remain exact. Choose explicit `mode: 'text'` for complete words instead. This example selects no snippet, facet, worker, storage or Inspector capability.

Replace both indexed text and display records, retaining matching stable IDs. `search.ui.search(text)` explicitly updates the input/results; `clear()` clears text and filters to idle. Display data/options are captured: destroy/remount to replace them. `search.dispose()` destroys this UI before disposing the engine created by the recipe. A preset mounted over your existing engine only borrows it; do not dispose that shared engine until its other users are finished.

The recipe assumes the root remains until initialization returns and propagates initialization errors to your app after disposing its engine. For removal during async loading, visible loading/retry, lazy assets or repeated initialization, use the complete starter controllers rather than inventing lifecycle methods on the UI handle.

Import the optional CSS explicitly; the module does not inject it. Override a few scoped component properties in your own stylesheet:

<!-- consumer-example: theme -->
```css
.help-search .raveldex-inline {
  --raveldex-inline-accent: #145b45;
  --raveldex-inline-gap: 1rem;
  --raveldex-inline-radius: .35rem;
}
```

Fonts are inherited. Light/dark palettes, focus and highlight colors are separate roles: supply a complete appropriate set for a dark host and check contrast after overrides. Inline/modal/dropdown use light defaults with explicit host dark overrides; directory/cards also have automatic dark defaults. Properties beginning `--_` are private. There is no JavaScript theme option or mandatory font request. The surface-specific sections below list actual properties; changing CSS never changes search meaning.

### Consumer capability matrix

For the per-field matrix, native documentation/application/catalogue scenarios, supported combinations and the reviewed keep-current boundary, see [native result content and hierarchy](RESULT_CONTENT.md). Authored display excerpts and query-derived matching snippets are different contracts; the guide also covers projecting rich records to strict basic display records.

| Surface | Result content | Filters and exact counts | Paging |
| --- | --- | --- | --- |
| Inline | Title/link alone, or explicit original-source snippets **or** page/section context. Snippets and sections are mutually exclusive; no generic metadata/image row. | Optional single-value string selects; explicit facets registration; counts include all active filters. Starts idle with All-only choices. | Load more appends batches until all matches are displayed. Exact total is separate from visible count. |
| Modal | Same inline result/capability choices in native `dialog`. | Same inline filters/counts. | Same append behavior; earlier results remain displayed. |
| Dropdown | Title/link only. No snippet, section or rich-metadata options. | Exact total, no filters. Required `fullResults` destination supplies a native link for valid nonempty queries. | Bounded first page (`maxResults`, default 5, at most 20); full-results handoff, no accumulated paging. |
| Directory | Title/link ordered list. | Checkbox groups: OR within, AND across. Explicit filters/facets when configured; counts include the complete current filtered set, including their own group. A zero-count choice stays usable; unavailable projected counts are not zero. | Previous/Next replace a page; explicit URL-state binding is optional. No Load more. |
| Rich directory | Authored excerpt/category/breadcrumb/date/labeled fields; optional explicitly enabled dimensioned images with alternatives. No generated snippets/section marks. | Same directory semantics. Display fields do not become filter metadata automatically. | Same directory pages; list/cards/grid, density and image visibility change presentation only. |

Snippets require explicitly installed snippet evidence plus source/offset providers for their selected fields; section previews require section evidence and exact-original, revision-bound heading maps. Core alone retains neither original source text nor offsets. Direct title/link search needs neither capability; static source delivery still requires source providers to rebuild its indexed fields. Missing requested capabilities fail explicitly. A supported section-context refusal may retain valid page links with an explicit unavailable-context notice; it never pretends that context succeeded. Images default off, and enabling them can make image requests; disabling them does not undo requests already sent.

All five consumer text modes default to final-word prefix and allow explicit `text`. UI language is separate from query analysis: captured partial plain-text message overrides use English for omitted keys. Choose an analyzer explicitly when needed; see [English morphology](ENGLISH.md). No automatic locale detection, translated UI or date formatting is implied; card dates are already-authored localized strings.

| Surface | Keyboard model | Ownership and refresh |
| --- | --- | --- |
| Inline | Native input/buttons/selects and links; composition waits; stable navigation preserves focus. | Borrows engine. Search explicitly after index changes; destroy/remount for changed display data. Clear resets query and filters. |
| Modal | Native dialog containment, opening search focus, Close/Escape and appropriate opener restoration. | Borrows engine. Close preserves query/selections by default; reopen revalidates. `resetOnClose` is explicit. |
| Dropdown | Input keeps editing focus; Up/Down selects a virtual current item, Enter searches/follows it, Escape dismisses, Tab traverses normally. Native pointer/modified links remain usable. | Borrows engine. Retains raw query on close; full-results route owns its own presentation/explicitly shared engine. |
| Directory | Native form, checkboxes, chips, disclosure and links; keyboard close returns to the filter summary. | View borrows controller; controller borrows engine. Clear all removes text/filters and browses all. Empty search keeps filters; controller refresh reruns current state at page one. New controller is idle; mounting a view reflects its current snapshot. |
| Rich directory | Same ordered-list interaction; CSS grid adds no ARIA grid or arrow model. | Same owners; presentation changes preserve query/page/link identities. Image handlers are cleaned up. |

Destroy UI/view first, then any explicit directory URL binding/controller, then the engine or static-loader owner you created. Destroying a borrowed view never disposes a shared controller/engine. No automatic mutation subscription or option replacement on same-kind remount is implied. Keep exact results, native links, composition, focus, stale-reply suppression and recovery intact after customization; [starter adoption checks](#starter-adoption-and-local-checks) cover the remaining browser/AT observations.

For dynamic records, use the [CMS refresh/remount guide and complete installed walkthrough](CMS_REFRESH.md). It separates owner writes, explicit query/refresh and captured display maps, checks query outcomes, preserves supported committed state, and identifies inline/modal snapshot/filter restoration limits. Destroy the old view before replacing its host or mounting a changed display map; keep focus handoff and async CMS ordering application-owned.

An existing Pagefind integration may use the [secondary migration appendix](PAGEFIND_MIGRATION.md). New integrations need no Pagefind knowledge, assets or API.

## Native DOM UI and CSS

This section documents the separate **developer Workbench**, with numerical scores and optional Inspector. Its existing exact-word default and public API remain supported. Use the consumer entries above for visitor-facing search.

Use `mountRaveldexUI(options: UIOptions): UIHandle` from `/addons/ui` to put search controls into an element on your page. You supply the engine and keep responsibility for disposing it. Import the UI and its stylesheet through a bundler that handles CSS:

```js
import { mountRaveldexUI } from '@vmitsaras/raveldex/addons/ui';
import '@vmitsaras/raveldex/addons/ui/styles.css';
```

These imports make the function and styles available; they do not mount anything yet.

### Mount a minimal search form

Add this element to your page where you want the search controls to appear:

```html
<section id="search" aria-label="Documentation search"></section>
```

The element starts empty. Copy [ui.mjs](examples/ui.mjs) into your application, then put the following in a browser module processed by your bundler. Run it after the element exists:

```js
import { createSearchUI } from './ui.mjs';
import '@vmitsaras/raveldex/addons/ui/styles.css';

const search = await createSearchUI(document.querySelector('#search'));
// Call this when your application removes the search component:
// await search.dispose();
```

You should now see a search field and results. Type `atomic` to get one result, **Atomic updates**, linked to `/guide/updates/`. The example supplies that URL; your application needs to provide the destination page.

The recipe creates one title/body record and a matching display entry. To use real documents, replace both entries and keep their IDs equal. It keeps data in memory and opens no database. Call the returned `dispose()` when removing the component; it destroys the UI first, then disposes the engine.

| `UIOptions` | Contract |
| --- | --- |
| `root`, `engine`, `documents` | Provide a root element, your engine and a readonly list of `{ id, title, url }` display documents. IDs connect results to this list, which is copied at mount. URLs must resolve to HTTP(S) without credentials. |
| `facets?` | Up to eight `UIFacet` selections `{ field, label }`; requires installed exact string facets. |
| `snippetFields?` | Explicit fields for installed snippets and source providers. |
| `mode?` | `'text'` (default), `'prefix'` (complete the final word), or `'phrase'` (requires phrase capability for selected fields). |
| `pageSize?`, `debounceMs?`, `label?` | Defaults 5, 150 ms and `Search documentation`; page size 1–100 and debounce 0–2,000 ms. Core's configured page bounds still apply. |

The returned handle gives you two methods:

- `search(): Promise<void>` runs the current controls immediately instead of waiting for the debounce timer. It resolves after the result is presented.
- `destroy(): void` cancels UI work, removes its listeners and restores the original DOM nodes. You can call it more than once. It does not dispose your engine.

Mounting on an already mounted root returns the existing handle. Always destroy the UI before separately disposing its engine.

The UI renders text safely, marks highlights explicitly and supplies visible focus and reduced-motion styles. It shows exact totals, pagination, empty results, errors and retry controls. An empty search browses all documents; entered text uses the selected mode.

Set `mode: 'prefix'` to require earlier words exactly and allow the final word to match the beginning of an indexed word. For example, `source provide` can match `source provider`; `sour provide` still requires the exact word `sour`. The UI splits raw words at the basic analyzer's Unicode letter/number boundaries, preserving original text for the engine's selected analyzer. The final word needs at least two normalized Unicode code points; shorter endings use exact-word search. Trailing spaces or punctuation do not disable completion. Prefix expansion keeps native limits, errors and exact totals, and snippets highlight the complete matched word. A stricter engine prefix limit or a selected analyzer's transformed term can still cause a native query refusal. Ordinary demo pages enable this mode; integrations that omit `mode` continue to search exact words.

While you compose text with an input method, pending searches wait until composition ends. Outdated requests are cancelled and stale replies are ignored. The display list is copied when you mount, so destroy and remount the UI when replacing that list. The [browser example](examples/browser.mjs) also shows explicit search calls, cleanup and source persistence.

### Keyboard, focus and status

You provide the root element, engine and display list; the UI creates its own labeled controls, ordered results and named native modal `dialog`. You do not need to author its internal markup.

- Typing schedules a search after the configured delay.
- Return in the search field or the **Search** button submits immediately.
- Selects and result links use the browser's normal keyboard behavior.
- Search, filter and page updates do not deliberately move focus.

Opening Inspector puts keyboard focus on **Close Inspector**. Use that button or Escape to close it and return focus to **Inspect results**, provided the opener is still on the page. Tab navigation follows the browser's native dialog behavior; the UI adds neither a custom Tab loop nor a focusable heading.

Status messages use `role="status"` and `aria-atomic="true"`. The search section is `aria-busy` during a search, and Inspector is busy while facts load. Unavailable page, retry and Inspector buttons use `aria-disabled="true"`: they remain in the tab order, but activation is guarded.

Typing feedback can interrupt spoken status messages. Check important flows with your target browser and screen reader, without requiring users to change their settings. The UI does not change those settings and exposes no public custom-event API.

### CSS customization

Import `@vmitsaras/raveldex/addons/ui/styles.css` separately, then use the five public properties below to adjust the generated `.raveldex-ui` block. The `data-raveldex-*` attributes identify internal elements; do not use them as an alternative application markup API.

| Property | Default | Purpose |
| --- | --- | --- |
| `--raveldex-ui-accent` | `#174ea6` | Link color |
| `--raveldex-ui-background` | `#fff` | Surface background |
| `--raveldex-ui-color` | `#17212b` | Text color |
| `--raveldex-ui-border` | `#596b7d` | Control and structural borders |
| `--raveldex-ui-focus` | `#7a2600` | Visible focus outline |

Set overrides on `.raveldex-ui` itself, where the defaults are declared. For example, `.my-search .raveldex-ui { --raveldex-ui-accent: #174ea6; }` sets the link color inside your `.my-search` container. It leaves the current default unchanged; choose a different accessible color to see a difference. Properties beginning with `--_` are private.

Keep the stylesheet's visible focus, disabled-state borders, scrolling dialog and narrow-screen wrapping usable when customizing it. Reduced-motion rules disable animation, transitions and smooth scrolling. Forced-colors rules use system colors for focus, borders and highlights. Check contrast after changing colors. There is no separate theme or variant registration API.

## Inline search foundation

For all five consumer surfaces, the [localization guide](LOCALIZATION.md) inventories every label/status/hint, documents partial fallback and capture/remount behavior, and supplies a complete checked German bundle. UI language stays separate from query analysis; numbers and grammar retain the explicit existing contract.

To start with a complete project, use the [browser](https://github.com/vmitsaras/raveldex/blob/main/examples/inline-browser/README.md) or [Astro](https://github.com/vmitsaras/raveldex/blob/main/examples/inline-astro/README.md) inline starter. The [solution gallery](https://github.com/vmitsaras/raveldex/blob/main/site/Inline.astro) provides a working preview, exact source files and complete starter downloads. Each guide includes package installation, replacement content, deployment bases, CSS and cleanup.

Import `mountRaveldexInline` from `@vmitsaras/raveldex/addons/ui/inline` and its stylesheet separately from `@vmitsaras/raveldex/addons/ui/inline.css`. The inline preset provides a labeled search form, clear/submit controls, linked titles, optional snippets and simple filters, and Load more in finite batches. Title/link search works with core alone. It never installs snippets, facets, Inspector, workers or storage automatically.

Supply your existing engine and display documents with matching IDs, just as in the DOM recipe above. `InlineUIOptions` accepts only these properties:

| Option | Meaning |
| --- | --- |
| `root`, `engine`, `documents` | Required element, borrowed engine and readonly `{ id, title, url }` entries. Display data is copied at mount with the same validation/limits as the legacy UI: up to 10,000 entries and 4,000,000 aggregate ID/title/URL UTF-16 units; ID/title/URL caps are 256/1,024/2,048. Navigation URLs must resolve to HTTP(S) without credentials. |
| `mode?` | `prefix` by default or explicit `text`. Prefix completes only the final word using the existing two-normalized-code-point threshold. Earlier words remain exact; shorter endings remain exact. |
| `pageSize?` | Batch size, default 5, from 1 to 100 within native engine bounds. The summary reports the exact total and displayed count. |
| `maxRenderedResults?` | Deprecated compatibility option. Supplied values remain validated as integers from `pageSize` to 1,000, but no longer limit retained results or continuation. Omit it in new integrations. |
| `facets?` | Up to eight `{ field, label }` string selections, as `UIFacet` entries. Install facets for those metadata fields when creating the engine; the scalar selections use core equality and need no structured-filters add-on. Counts include all active filters, including their own group. |
| `snippetFields?` | Up to 32 distinct source field names. Install snippets and the required source/offset providers explicitly; a core-only UI needs none of these. |
| `pageSections?` | Captured revision-bound `PageSections` metadata for optional heading previews. Requires the explicit section-evidence factory and source providers when context is requested; mutually exclusive with `snippetFields`. |
| `maxSectionPreviews?` | Default 3, integer 1–3. Requires `pageSections`; selects source-ordered previews per displayed page. |
| `debounceMs?` | Default 150 ms, from 0 to 2,000. Enter and `search()` flush the debounce. |
| `messages?` | A captured partial `InlineUIMessages` bundle; nonempty plain strings up to 512 UTF-16 units each. Unknown keys, accessor properties and malformed strings are rejected before changing the root. |

The frozen `InlineUIHandle` has `search(text?: string): Promise<void>`, `clear(): void` and `destroy(): void`. With text supplied, `search` replaces the input then searches; without text it submits the current field. Native search failures are presented with a retry action and resolve after presentation. A non-string argument is rejected. After destroy, methods are harmless no-ops. Clear cancels pending work, clears text and facet selections, and restores idle without deliberately moving focus. Original root Node objects are restored on destroy; the application separately disposes the borrowed engine afterward.

Mount starts idle and makes no search request. Nonempty input submits after debounce or Enter; an explicit facet selection can browse that category even with no text. Empty input with no active selections returns to idle. Composition waits until it ends; cancelled or stale replies cannot replace current results. Capability/provider checks occur when an actual search is made, including searches with zero matching IDs; requesting a feature that is not installed produces an explicit native error. Result replacement recovers focus to the search input if it would otherwise remove the focused result link. Controls remain in place during updates.

Mounting inline again on the same root returns the existing handle without applying new options. Destroy/remount to replace configuration or display data. Legacy and inline presets cannot own the same root at once: a conflicting mount fails with `INVALID_OPTIONS` before replacing DOM. Independent roots have independent state and label IDs. Neither preset registers a global keyboard shortcut.

### Inline text and styling

The original messages are `label`, `placeholder`, `submit`, `clear`, `idle`, `searching`, `noResults`, `resultsLabel`, `resultsOne`, `resultsMany`, `error` and `retry`. Additive optional keys are `noResultsFiltered`, `composing`, `loadMore`, `newResults`, `resultsAdded`, `previous`, `next`, `paginationLabel`, `pageSummary`, `windowLimit`, `revisionChanged`, `all`, `emptyValue`, `nullValue`, `missingValue`, `unlistedValue`, `facetSummary`, `snippetOmissions` and `snippetLimits`. Existing complete original bundles remain valid; unspecified new keys use English defaults.

The legacy `previous`, `next` and `windowLimit` message keys remain accepted and validated for compatibility, but inline/modal no longer render them. Directory and Workbench paging retain their own controls and messages.

Inline and modal use **Clear search** by default without facets and **Clear search and filters** when facets are configured. Both reset the query and every facet selection; the label does not change that behavior. The button's visible text is also its accessible name. Existing `messages.clear` overrides remain authoritative; choose translated text that describes the complete reset scope.

With facets, default idle guidance is **Enter a search term to see filter choices.** It appears on first mount and after reset, when selects contain only All. Each select references its own count summary and the shared status through `aria-describedby`, so the current guidance or result/error status is available alongside the native label. Controls remain enabled and mounted to preserve focus and selected-value recovery. Search populates choices; changing a selected filter can still intentionally search with an empty query. Mounting, empty input without filters, and reset do not issue a browse-all query. `messages.idle` overrides are captured unchanged; no new message key is required.

Text-only empty results identify the submitted query and suggest a different search; filtered empties name the selected filters and suggest changing a filter or Clear search and filters. Both preserve input/selections. `noResults` and optional `noResultsFiltered` support `{query}`: the submitted text trimmed and bounded to 160 Unicode code points plus an ellipsis, only for feedback. A supplied `noResults` override also covers filtered empties unless `noResultsFiltered` is supplied. Complete old bundles stay valid. Default failures say Search could not complete and offer Retry search or editing; a revision change asks for explicit retry. Codes remain available through an `error` override containing `{code}`. No automatic recovery query is added. Empty outcomes hide the empty results heading/list while keeping feedback visible. After recovery or reset, Retry search remains temporarily visible and unavailable if it still has keyboard focus; it retires after focus leaves. Loading, empty and error feedback use the existing border, gap and color properties, without hiding the polite status region.

Summary templates substitute `{total}` and `{count}`; `pageSummary` also supports `{start}`/`{end}`. `resultsAdded` supports `{added}` (new batch size), `{start}`/`{end}` (displayed range), `{total}` (exact matches) and `{count}` (displayed hits); its default is `Results added: {added}. Showing {start}–{end} of {total}.` The `newResults` button label defaults to Go to new results. `unlistedValue` uses `{value}`, `facetSummary` uses `{total}`/`{omitted}`, and `snippetOmissions` uses `{count}`. The error template substitutes a sanitized native `{code}` (unrecognized failures use `INTERNAL_ERROR`); a revision mismatch uses `revisionChanged`. Every message, title, selection and excerpt is inserted as text, never HTML. UI messages do not select a different engine analyzer. The polite status region announces actual searching, composition and settled outcomes without repeating unchanged messages on each keystroke.

The optional stylesheet uses `.raveldex-inline` and scoped `__form`, `__label`, `__field`, `__icon`, `__input`, `__submit`, `__clear`, `__status`, `__results-heading`, `__results`, `__result`, `__result-heading`, `__result-title` and `__retry` classes. Additional style hooks are `__facets`, `__facet-group`, `__facet-label`, `__facet`, `__facet-summary`, `__snippet`, `__highlight`, `__snippet-omissions`, `__navigation`, `__load-more`, `__new-results` and `__page-summary`. Inline/modal no longer create `__previous` or `__next` elements. `data-raveldex-inline-*` hooks are internal; they are not a caller-authored markup API.

| Public CSS property | Default |
| --- | --- |
| `--raveldex-inline-background`, `--raveldex-inline-color` | `#fff`, `#17212b` |
| `--raveldex-inline-muted`, `--raveldex-inline-accent` | `#465563`, `#174ea6` |
| `--raveldex-inline-border`, `--raveldex-inline-focus` | `#637383`, `#7a2600` |
| `--raveldex-inline-font`, `--raveldex-inline-font-size` | inherited font family, `1rem` |
| `--raveldex-inline-gap`, `--raveldex-inline-radius` | `.75rem`, `.5rem` |
| `--raveldex-inline-max-width` | `48rem` |
| `--raveldex-inline-line-height`, `--raveldex-inline-title-size` | `1.6`, `1.15em` |
| `--raveldex-inline-control-height`, `--raveldex-inline-control-padding` | `2.75rem` minimum, `.6rem .85rem` |
| `--raveldex-inline-border-width`, `--raveldex-inline-result-padding` | `2px` controls, `.75rem 0` |
| `--raveldex-inline-highlight-background`, `--raveldex-inline-highlight-color` | `#ffe59a`, `#17212b` |
| `--raveldex-inline-error` | `#9b1c1c` |

Set properties on the search root or an ancestor. For a small branding change, override the accent, radius and gap; the host's font is inherited. For a dark host theme, supply suitable surface, text, muted, link, directory filled-button text, border, focus and error colors together; set highlight foreground/background together if overriding them. Private `--_` properties are not customization API. Keep visible focus, contrast, reflow and control targets usable. The stylesheet includes scoped reduced-motion and forced-colors behavior and never injects itself from JavaScript.

### Inline result pages, filters and snippets

Load more requests the next native batch at the number of already displayed hits and appends it without changing earlier result nodes, order or exact total. It remains available until every match is displayed; there is no switch to Next/Previous results and no replacement window. The final batch can contain fewer than `pageSize` hits. The range summary sits above the available actions and reports `Showing 1–{count} of {total}.` The [current append contract](https://github.com/vmitsaras/raveldex/blob/main/docs/planning/LOAD_MORE_APPEND.md) supersedes the earlier capped-window behavior.

Loading stays user initiated and each request is bounded by `pageSize` (1–100). The UI admits at most 10,000 display documents and 4,000,000 aggregate ID/title/URL UTF-16 units; earlier rows remain retained as the user loads matching batches. `maxRenderedResults` no longer adds a lower display cap. These admission and batch bounds do not establish memory usage, latency or device capacity. Revision/total consistency, duplicate-hit checks and explicit native refusal behavior still apply to every appended batch.

Load more and Go to new results button nodes stay mounted, but unavailable unfocused actions are hidden. A focused unavailable action remains visible with guarded `aria-disabled` until focus actually moves elsewhere; it then hides. This applies during loading, clear, error and terminal results without stealing focus. Repeated activation of an unavailable action issues no query. A complete single batch has a range summary without unnecessary actions; empty/reset/error states clear the stale range. Directory paging keeps its separate existing policy.

After an append, Load more retains focus. Tab reaches Go to new results; Enter or Space deliberately focuses the first newly appended title link, without another query or a URL-fragment change. Subsequent link traversal stays native. Replacement, reset, failure, modal suspension and teardown invalidate that private target. The new button and append announcement reuse captured optional messages; no handle method, renderer or query behavior is added. The associated style hook is `.raveldex-inline__new-results`.

Changing the query or a filter resets accumulation. Paging checks the native revision; if the index changed, the UI clears old hits/counts and offers Retry from the first window with the query and selections retained. It also requires the snippet reply to match the main reply's revision, IDs, scores and total before committing hits or counts. It does not subscribe to external mutations; a later search/paging action revalidates current state. Native search/provider/transport failure is shown as failure, never as a successful empty result.

Each string facet uses a native select with an All choice. Empty strings are valid distinct values; null/missing buckets are informational unavailable options. Counts apply before hit paging and include every active filter. At most 100 buckets per field are displayed; the summary exposes omitted buckets. A selected value stays available when outside the displayed projection, without an invented count. The separate [directory controller](#directory-queries-and-url-state) supports multi-selection; own-group-excluding counts remain outside its scope.

Explicit snippets use only the new batch of IDs, never all accumulated IDs. Returned text is original source, with validated marks at returned UTF-16 offsets and visible omission notices for undisplayed matches, window/highlight limits and oversized matches. Offsets alone do not supply the original text. A snippet failure clears the whole attempted presentation rather than mixing stale or incomplete context with a successful result list.

The default inline presentation includes neither numerical scores nor Inspector controls. For the developer-oriented presentation, explicitly use the existing native DOM UI instead of hiding controls with CSS. Complete [browser](https://github.com/vmitsaras/raveldex/blob/main/examples/inline-browser/README.md) and [Astro](https://github.com/vmitsaras/raveldex/blob/main/examples/inline-astro/README.md) starters include copy/install steps and explicit ownership. The existing `/addons/ui` Workbench API retains its exact-word default, full navigation and Inspector. No Pagefind runtime/API or indexing/loading compatibility is implied.

### Inline anchored sections

Supply explicit heading metadata from the same originals indexed by your borrowed engine. Import the readonly `PageSections`, `PageSectionPage` and `PageSection` types from `@vmitsaras/raveldex/addons/sections`. Register [section evidence](ADDONS.md#anchored-page-context) when constructing the engine; mounting never installs it.

```js
const pageSections = {
  kind: 'raveldex-page-sections', version: 1, revision: written.revision,
  pages: [{
    pageId: 'repair',
    sections: [{ anchor: 'chain', heading: 'Replace the chain', headingLevel: 2,
      field: 'body', valueIndex: 0, start: 0, end: original.length }],
  }],
};
const ui = mountRaveldexInline({
  root, engine, documents: [{ id: 'repair', title: 'Bicycle repairs', url: '/repair/' }],
  pageSections, maxSectionPreviews: 3,
});
```

Here `written` is the completed index mutation and `original` is its exact body string. Render the corresponding heading with `id="chain"` on `/repair/`. The library does not discover headings or inspect destination pages. Maps are copied, validated and frozen before authored DOM changes. IDs must exist in display records; duplicates, overlapping ranges, accessors, malformed Unicode and invalid headings/anchors reject capture. Whole-source/grapheme validation occurs inside native context requests. A map may cover only some pages; missing/empty entries retain the parent link without inventing context counts.

Use exact raw IDs for `anchor`, with no slugging, decoding or normalization. They must be 1–256 UTF-16 units without control characters, ASCII whitespace or `:~:`. Literal `%`, `#` and Unicode are encoded once: `%#café` becomes `#%25%23caf%C3%A9`. Mapped parent URLs must have no existing fragment delimiter, including an empty trailing `#`; direct URL queries remain intact. The final absolute URL must fit 2,048 UTF-16 units. Keep page text and target documents correctly encoded as UTF-8.

The UI keeps native page totals/order and projects only newly displayed mapped hits, with one detailed request in flight and an atomic batch commit. It shows up to three heading links beneath “Matching text in this page”; any known omitted context gets “More matching context is not shown.” A heading can have no excerpt when its contributing match cannot fit. The optional message keys `sectionCaption`, `sectionOmissions`, `sectionUnavailable` and `sectionStale` customize these texts without changing existing bundles. Section CSS uses `__sections`, `__section`, `__section-title`, `__section-caption`, `__section-omissions` and `__section-unavailable` alongside the existing snippet/theme hooks.

A stale map retains validated parent pages with a visible warning and makes no context requests. Remount with fresh metadata to restore previews; old ranges are never restamped automatically. A typed context-only provider, source-bound, environment or resource refusal retains parents with visible unavailable context. Main search failures, mismatched revisions, malformed/incomplete replies and transport failures reject the whole attempted window and offer Retry. Clear, replacement searches and destroy suppress late work; destroy releases owned maps/previews, restores original nodes and leaves disposal of the borrowed engine to you. Human accessibility/platform qualification remains separate from these automated lifecycle checks.

Maps are bounded to 10,000 pages, 16,384 sections total, 64 per page and 4 MiB serialized UTF-8. There is no import-time map retention or extra core index. As batches are appended, all admitted matching parents can remain displayed, with at most three previews per parent and the existing per-preview excerpt/mark bounds. Earlier output calculations based on a 1,000-parent DOM window describe the superseded window behavior, not the current accumulation ceiling. Output bounds are separate from measured memory usage.

## Consumer visual roles and host themes

The Reading index styles share body `1rem / 1.6`, linked result titles `1.15em / 1.35` at weight 650, smaller `.875em / 1.5` supporting context, a single configurable action accent and quiet dividers. Inline/dropdown Search uses accent text/border and stronger weight; directory keeps its existing filled Search. Reset/paging remain quieter outlined actions. Native result links have at least `2.75rem` target height and explicit underlines even under a plain host link reset. Source marks remain warm inline highlights, distinct from the 3px focus outline and dropdown virtual selection. Excerpts wrap within roughly 65ch; titles/excerpts are not height-clamped to equalize rows. Cards keep their existing comfortable/compact padding and semantic list/grid presentations. No score or Inspector styling is imported into consumers.

Use the complete [optional light/dark host recipes](examples/consumer-themes.css) by copying the file into your application and adding `search-theme-light` or `search-theme-dark` to the component root or an ancestor. Modal uses the inline palette unless you explicitly override modal-specific roles. Recipes set existing component variables plus the optional directory error role; they contain no global reset, font request, mandatory shared stylesheet or automatic theme selection. Directory/cards retain automatic dark defaults; `search-theme-light` can explicitly select light colors on a dark-system host. Inline/modal/dropdown keep explicit theme selection. Set dropdown active text/fill and paired match colors together.

CSS remains optional and component-scoped. Existing public properties take precedence; `--_` aliases remain private. Hosts can choose other accents or card backgrounds, but must check the resulting text, filled-action, boundary and focus contrast together. Text enlargement/emulated viewports are separate from actual browser zoom and mobile keyboard observations.

## Documentation search modal

Use the modal when documentation search should open from an explicit button. It reuses inline search, feedback, paging and optional anchored previews inside a native dialog. Supply an already created engine and matching display data; the modal borrows that owner and starts closed without searching. For first-open loading and complete owned application lifecycle, copy the [browser](https://github.com/vmitsaras/raveldex/blob/main/examples/modal-browser/README.md) or [Astro](https://github.com/vmitsaras/raveldex/blob/main/examples/modal-astro/README.md) starter. The [modal gallery](https://github.com/vmitsaras/raveldex/blob/main/site/Modal.astro) includes an installed preview, exact source downloads and CSS recipes.

```html
<button id="docs-search-trigger" type="button">Search documentation</button>
<div id="docs-search"><a href="/guide/">Browse the documentation</a></div>
```

```js
import { mountRaveldexModal } from '@vmitsaras/raveldex/addons/ui/modal';
import '@vmitsaras/raveldex/addons/ui/modal.css';

const modal = mountRaveldexModal({
  root: document.querySelector('#docs-search'),
  trigger: document.querySelector('#docs-search-trigger'),
  engine, documents,
  shortcut: true,
  // pageSections, // Optional maps from the same indexed originals and revision.
});
// modal.open();
// await modal.search('source prov');
// modal.close();
// modal.destroy();
// await engine.dispose(); // The application owns this separate step.
```

Here `engine` and `documents` come from your ordinary inline setup or explicit static loader. The single modal stylesheet includes inline styling through a local CSS import; JavaScript imports no stylesheet automatically. Keep normal browse links available before initialization and make the existing trigger an accessible named native button. Root and trigger must be connected in the same document, with the trigger outside root. The library preserves the trigger's authored label rather than attempting to recreate the browser's complete accessible-name algorithm.

`ModalUIOptions` includes the existing inline options, including partial inline `messages`, facets, snippets or `pageSections`/`maxSectionPreviews`. Existing bounds and the snippets/maps exclusion still apply. The additional options are:

| Option | Meaning |
| --- | --- |
| `trigger` | Required existing `HTMLButtonElement`. Trigger ownership cannot be shared by two mounted modals. |
| `resetOnClose?` | Default false. Preserve input and facet values; true clears both on close. Results/counts/errors are discarded on every close. |
| `shortcut?` | Default false. Coordinate Ctrl+K or Meta+K within this document. |
| `keyboardHints?` | Default true. Show contextual Escape and, when selected, shortcut hints. Hiding hints does not disable an opted-in shortcut. |
| `modalMessages?` | Partial `ModalUIMessages` with `title`, `close`, `escapeHint`, `shortcutHint`. Plain nonblank text up to 512 UTF-16 units each. Title/close default to “Search documentation” / “Close search”; Escape help says “Close search closes this dialog. Escape may clear the search field first.” Shortcut help says “Ctrl/Command+K opens search outside text fields.” |

The readonly `ModalUIHandle` has `open()`, `close()`, `search(text?)`, `clear()` and `destroy()`. Open focuses the search input and reruns the first native page from preserved controls; an empty unfiltered query remains idle. Repeated open is harmless. Search while closed changes the stored text without searching or reopening; clear also works while closed. Close aborts debounce/main/context work and prevents late replies from publishing. If application code calls the native dialog’s `close()` directly, cleanup follows its queued close event; preexisting hidden feedback may persist until then, while late replies still cannot publish. Reopen checks the current revision/maps again. Reset-on-close clears input/filter values. Destroy cancels work, removes bindings, restores original root Node objects and owned trigger/scroll state, and never disposes the borrowed engine. Methods after destroy do nothing.

Native Escape cancellation, the visible close button and deliberate backdrop activation share cleanup. Some browsers first clear a focused search field on Escape; press Escape again or use **Close search** to dismiss. Backdrop dismissal requires the same primary pointer to press and release outside the dialog, then click there; dragging through the backdrop does not dismiss. Ordinary result links keep their native navigation and modifier behavior. Native dialog behavior contains page focus; a browser may move keyboard focus into its own chrome during Tab traversal. There is no custom Tab loop. Close returns to the connected actual opener when it still owns the focus transition; removed openers, unrelated focus and other modal sessions are respected.

Visible footer hints describe the search input through unique IDs, outside live feedback. Shortcut text and its reference appear only when `shortcut:true`; `keyboardHints:false` omits all hint references. The footer is a named focusable scroll group, adding one deliberate native Tab stop so long translations can be read with native scrolling. Its height remains bounded and its focus outline is inset; help no longer uses line clamps. Neither guidance nor scrolling registers a new shortcut or issues a query.

The optional shortcut ignores already handled/repeated events, composition, editables and visible editable shadow paths, Alt/Shift and simultaneous Control+Meta. Unknown focused shadow-capable hosts are conservatively excluded, including ordinary focusable `div`/`main`/`section` regions that cannot be distinguished from concealed shadow content. Root/trigger shadow trees are captured explicitly; their actual editable controls are respected. The active eligible modal wins; otherwise the first connected enabled opt-in instance wins. An unrelated native modal found in the document or active/known shadow trees blocks opening. This does not discover every externally concealed/inactive shadow tree; coordinate those external modal lifecycles in the application. Destroy unregisters its binding, and the final opt-in instance removes the shared document listener. Merely importing or mounting inline search captures no keyboard shortcut.

Style `.raveldex-modal` and its scoped `__header`, `__title`, `__close`, `__search`, `__body`, `__footer` and `__hint` hooks. The shared inline properties continue to control input/results; modal background/color/border/focus default to those same values. Modal-specific `--raveldex-modal-*` properties include `background`, `color`, `border`, `focus`, `gap`, `padding`, `gutter`, `max-width`, `height`, `border-width`, `radius`, `shadow`, `backdrop`, `title-size` and `control-radius`. Layout defaults are 48rem maximum width, 42rem preferred height, .75rem gutter/gap and 1rem padding. Set public overrides on the dialog or an inherited wrapper; properties starting `--_` are private.

The header/input remain reachable as results and facets scroll in the contained body. Short screens use a compact input row and keep the associated label available to assistive technology. Dynamic viewport/safe-area rules, visible focus, forced colors and reduced motion are included; check contrast and geometry after customization. Automated viewport checks do not establish physical on-screen-keyboard, actual zoom or human AT support. See the [modal contract](https://github.com/vmitsaras/raveldex/blob/main/docs/specs/DOCS_MODAL.md) for exact ownership and lifecycle rules. Native/worker failures remain visible errors with Retry; the modal does not load assets, create another engine or silently change execution hosts.

## Compact dropdown search

Use `mountRaveldexDropdown` from `/addons/ui/dropdown` when a compact field should offer a few real page links. Import `/addons/ui/dropdown.css` separately. It uses core alone, borrows your existing engine and creates no index, snippets, suggestions, worker or storage. Native manual popover support is required; unsupported environments fail before replacing your browse content. Packages remain available separately.

For a complete project, copy the [browser header starter](https://github.com/vmitsaras/raveldex/blob/main/examples/dropdown-browser/README.md). Its [gallery](https://github.com/vmitsaras/raveldex/blob/main/site/Dropdown.astro) has an installed preview, all source files and a CSS walkthrough. The starter builds a real `/search/` inline destination and guide pages at root or a subdirectory base.

This wiring fragment expects your `engine` and `documents`, a connected `#header-search` element, and an existing `/search/` page that accepts `q` and selects the same prefix mode, analyzer and content. The runtime entry itself does not create that destination:

```js
import { mountRaveldexDropdown } from '@vmitsaras/raveldex/addons/ui/dropdown';
import '@vmitsaras/raveldex/addons/ui/dropdown.css';

const dropdown = mountRaveldexDropdown({
  root: document.querySelector('#header-search'),
  engine, documents,
  fullResults: { url: '/search/?mode=prefix#results', queryParameter: 'q' },
  maxResults: 5,
  messages: { label: 'Find a guide', fullResults: 'Search every guide' },
});
// dropdown.open();                 // Focus and refresh a preserved query.
// await dropdown.search('source prov'); // Search without moving focus.
// dropdown.close();                // Keep the words; cancel presentation.
// dropdown.clear();                // Return to idle without a query.
// dropdown.destroy();              // Restore the original nodes.
// await engine.dispose();          // Separate application-owned cleanup.
```

`DropdownUIOptions` requires `root`, `engine`, `documents` and `fullResults`. `maxResults` defaults to 5 and accepts integers 1..20; `debounceMs` defaults to 150 and accepts 0..2000; `mode` is `prefix` by default or `text`; `shortcut` is false by default. Display capture uses the existing finite ID/title/safe-URL limits. A detached root can be prepared, but search/open are inactive until it is connected to its original document. Same-kind duplicate mount returns its existing handle; destroy/remount to change configuration. A different UI preset cannot own that root simultaneously.

The popup is a one-column grid of real native links. Input focus stays in the labeled text field; `aria-activedescendant` identifies only a visible current gridcell. Results never replace your words with a title. The exact native total and shown count are separate from the finite grid. No pagination or vocabulary suggestions are mixed into these hits. The ordinary full-results link is outside the popup and remains in normal Tab order.

| Interaction | Behavior |
| --- | --- |
| Down / Up | Enter first/last actual result, then stop at the boundary. If needed, flush the query and retain that explicit navigation intent for its current reply. |
| Enter with an active result | Follow its actual link without rewriting the field. |
| Enter without an active result / Search | Flush the current search and reopen current results. |
| Escape / Tab / Shift+Tab | Dismiss/cancel; Tab leaves normally. The query is preserved. |
| Editing, selection and modified input keys | Clear virtual selection and retain native editing; modified input Enter does not activate a hit. |
| Composition / Clear | No interim query or activation; committed text schedules search. Clear cancels and returns to idle, retaining input/action/external focus; a focused Retry/full-results/popup-link control that must disappear returns focus to input. |
| Result pointer/context menu / full-results link | Native links retain ordinary and modified activation. |

Native Tab movement follows the browser's keyboard-navigation preferences; the component does not add a Tab loop or force skipped native links/buttons into the sequence.

`fullResults.url` is a captured HTTP(S) URL without credentials, at most 2048 UTF-16 units. Its optional `queryParameter` defaults to `q` and matches `[A-Za-z][A-Za-z0-9_-]{0,63}`. The link replaces that parameter with the exact current field value and preserves other parameters/hash. It does not trim, normalize, autocomplete or silently change query mode. Whitespace-only input is idle; malformed/oversized text has no handoff URL. Programmatic `search(text)` rejects CR/LF rather than silently joining words in a single-line field. Native refusal or transport failure stays visible with Retry; there is no fallback engine.

Every edit/new reply clears old virtual selection before replacing rows. Close, outside pointer/focus, native popup closure, removal and destroy suppress old work. A programmatic search does not steal focus; a later outside interaction can cancel it. There is no live index-mutation subscription: reopen or refresh to obtain a new revision. Destroy restores original Node identities and never disposes your borrowed engine.

Only one owned dropdown popup per document is shown. `shortcut: true` opts into the modal's existing Ctrl/Meta+K coordinator; editing/composition/repeat/modifier/already-handled events and unrelated modality are respected. No global shortcut is registered otherwise. Known owned shadow ancestry is supported; external concealed shadow/modal lifecycles still require application coordination. Automatic modal handoff is not part of this entry.

The dropdown shows a static keyboard hint: Arrow Up/Down selects a result; Enter opens it or searches without a selection; Escape dismisses results; Tab moves on. Its unique ID describes the combobox input outside the live status. Override optional `messages.keyboardHint` through the existing captured text bundle; old complete bundles remain valid. No shortcut is enabled by displaying help. Inline, directory and cards retain native lists and receive no combobox guidance.

Style `.raveldex-dropdown` and its scoped `__form`, `__label`, `__input`, `__submit`, `__clear`, `__hint`, `__status`, `__retry`, `__full-results`, `__popup`, `__row`, `__cell` and `__link` classes. `.is-active` marks the current cell. Public `--raveldex-dropdown-*` properties include `background`, `color`, `muted`, `accent`, `border`, `focus`, `active-background`, `active-color`, `error`, `font`, `font-size`, `line-height`, `gap`, `padding`, `radius`, `border-width`, `max-width`, `max-height` and `shadow`; `--_` geometry values are private. Defaults use a readable light surface, 44px controls, 40rem maximum component width and 20rem maximum popup height. Native top-layer placement escapes clipping ancestors and uses available viewport space with contained scrolling. If a short or enlarged viewport cannot fit a usable result row without covering controls, the popup collapses with the exact total, a space/recovery message and the full-results link. Keep visible focus, non-color active indication, contrast and full-results access when changing a theme.

Dropdown body typography defaults to `1rem / 1.6` with inherited family. Linked result titles use `1.15em / 1.35` at weight 650. Search uses accent text/border and weight 650; reset/paging stay quieter outlined actions. Transparent host backgrounds remain supported without deriving text color from a transparent surface.

Plain-text `DropdownUIMessages` keys are `label`, `placeholder`, `submit`, `clear`, `idle`, `composing`, `searching`, `noResults`, `resultsLabel`, `resultsOne`, `resultsMany`, `error`, `retry`, `fullResults`, `closed` and `noSpace`, with optional `keyboardHint`. Overrides are captured strings of at most 512 UTF-16 units. Counts use `{total}`/`{count}` tokens; `noResults` supports the same bounded submitted `{query}` token as inline. Default empty feedback suggests editing or opening the existing full-results link, and Clear search resets to idle without querying. Default failures offer Retry search without technical codes; an `error` override can include `{code}` for diagnostics. UI language does not select another analyzer. [The concrete contract](https://github.com/vmitsaras/raveldex/blob/main/docs/specs/DROPDOWN.md) records keyboard, focus, placement, lifecycle and finite bounds. Scripted keyboard/composition, computed accessibility trees and emulated layouts are separate from human AT, physical input/mobile keyboard and actual zoom observations.

The complete [header starter](https://github.com/vmitsaras/raveldex/blob/main/examples/dropdown-browser/README.md) uses `configuration.mjs` to select prefix mode, three compact results and three-result inline batches. Load more on the full-results page appends until all matches are displayed. Its `/search/` page reads a single `q` value once, preserves the decoded raw words and refuses duplicate, multiline, malformed or overlong input with a recovery message. Header and destination use the same records and query configuration; the starter does not add URL history synchronization. Both pages keep ordinary browse links. Without native popovers, the header retains its authored GET search form and does not load an unused owner; the destination still uses the existing inline presenter. The public dropdown API continues to refuse unsupported hosts explicitly. No popover polyfill or alternate engine is installed. Build and preview with the same `RAVELDEX_DROPDOWN_BASE` when deploying under a subdirectory.

Set the starter's `modalHandoff` flag to `true` only when you want its explicit larger-search button. The button transfers the committed header text to a modal using the same page owner, display records and mode. It adds no global shortcut, second engine or automatic width switch. The supplied bundle imports all three optional UI styles and presenters so this flag needs only a configuration edit and rebuild; this is the starter's selected bundle cost, not the cost of importing `/addons/ui/dropdown` alone. A new page navigation loads that page's own owner; the controller destroys its borrowed surfaces before releasing it.

## Directory queries and URL state

Import `createDirectory` from `/addons/ui/directory` to compose text, multi-selected string filters and native pages around an existing engine. This nonvisual entry exposes state and results. The separate [directory view](#directory-controls-and-styling) supplies controls and explicit CSS; [complete browser/Astro projects](https://github.com/vmitsaras/raveldex/blob/main/site/Directory.astro) provide installed adoption. Install filters and facets explicitly for the configured groups. With no groups, core alone is enough.

Save this complete example as an ESM module in your installed application and run it with Node. Both `guide` and `manual` are selected within the same group, so either may match. Additional groups combine with AND, as does the text query.

```js
import { createRaveldex } from '@vmitsaras/raveldex';
import { createFilters } from '@vmitsaras/raveldex/addons/filters';
import { createFacets } from '@vmitsaras/raveldex/addons/facets';
import { createDirectory } from '@vmitsaras/raveldex/addons/ui/directory';

const engine = createRaveldex({
  schema: { text: { title: {} }, metadata: { kind: { type: 'string' } } },
  addons: [createFilters({ fields: ['kind'] }), createFacets({ fields: ['kind'] })],
});
const directory = createDirectory({
  engine, groups: [{ field: 'kind', values: ['guide', 'manual'] }], pageSize: 20,
});
try {
  await engine.addMany([
    { id: 'a', text: { title: 'Install guide' }, metadata: { kind: 'guide' } },
    { id: 'b', text: { title: 'Install manual' }, metadata: { kind: 'manual' } },
  ]);
  await directory.update({ text: 'inst', filters: { kind: ['guide', 'manual'] } });
  const snapshot = directory.getSnapshot();
  if (snapshot.status !== 'ready') throw new Error(snapshot.error ?? snapshot.status);
  console.log(snapshot.result.total, snapshot.result.hits.map(hit => hit.id));
} finally {
  directory.destroy();
  await engine.dispose();
}
```

This prints `2` and the IDs `a`, `b`. Construction is inert. `refresh()` starts an empty browse or refreshes the current query at page one. The default mode completes the final word; `mode: 'text'` selects exact words. `update({ text?, filters? })` applies effective edits and resets to page one. A supplied filters object replaces all selections; omitted groups become empty. Equivalent ready/loading state is inert. `setPage(2)` requests the second native page; `restore({ text, filters, page })` admits a complete external state. These operations return Promises; read failures from the resulting snapshot. Invalid command input throws before changing state.

Snapshots contain captured readonly state, status, change reason and a result only when ready. `result.total` and `result.hits` retain native totals, ranking and tie order. `result.facets` counts the complete qualifying set before paging, including each group's own active selections. Counts describe the current conjunction, not the effect of adding another choice. `result.selected[field]` retains selected strings with a count of zero when absent from a complete projection, or `null` when the truncated buckets cannot establish their count. Null/missing metadata buckets are informational, not selectable strings.

Use `subscribe(snapshot => { ... })` to observe transitions; subscription does not invoke an initial callback. At most 64 distinct listeners are supported, including a connected URL binding. Exceptions from an observer do not cancel search. Old responses cannot overwrite newer intent. Paging/replaying the same query across a changed revision reports `stale` with `REVISION_MISMATCH`, clears results and resets page one; explicitly call `refresh()` to accept the new revision. Out-of-range restored pages recover once to page one. Destroy cancels work and releases observers; dispose the borrowed engine separately.

### Connect URL state explicitly

For a long-lived browser controller, add this fragment after creating it and before its initial query. Keep the returned binding for cleanup. Use a real HTTP(S) `window`; there is no ambient URL discovery.

```js
import { connectDirectoryURL } from '@vmitsaras/raveldex/addons/ui/directory';

const url = connectDirectoryURL({
  controller: directory,
  host: window,
  parameters: { query: 'q', page: 'page', filters: { kind: 'kind' } },
  history: 'replace',
});
await url.read();
// When removing this integration, before destroying directory:
// url.destroy();
```

Connection claims names/listens without reading or searching. `read()` admits initial state; native Back/Forward subsequently replays it. The default policy replaces the current entry. Choose `history: 'push'` for explicit committed edits/page changes when traversable entries are wanted; the application controls when to call `update`, so avoid committing every keystroke with that policy. Replay and corrections always replace, with no new traversal entries. `url.write()` retries the current state with replace after a refused write; it does not query or reload an older URL.

Only the mapped query/page/filter names are owned. Unrelated raw query bytes/order, path, hash and `history.state` survive. A controller can have one binding; multiple controllers may use disjoint names on the same host. Overlap rejects before mutation. Destroying a binding releases its claims/listener while retaining the URL and in-memory controller; controller destruction also disconnects it.

Admission bounds are eight groups, 128 allowed strings per group, sixteen selected per group, 1,024 units per string, 65,536 aggregate configuration units and 8,192 selected units. Raw single-line text is at most 2,048 UTF-16 units; page size is 1..100 and pages stay inside the 10,000-document native ceiling. Selected empty strings are valid. URL names are unique bounded ASCII identifiers; href is at most 65,536 units and owned encoded segments at most 16,384. Native reduced limits/capability errors remain explicit.

Invalid/duplicate query or page values reset that field; unknown/duplicate filter values are dropped, excess selections reset their group, and aggregate selection overflow clears filters while retaining admitted text. Any correction resets page one and records bounded `url.getSnapshot().issues`. An oversized owned encoding resets all owned state; a whole-URL or history failure leaves the URL unchanged and reports an error. In-memory search stays usable. There is no storage, telemetry, search-history feature, disjunctive counting or new sorting. The [concrete directory contract](https://github.com/vmitsaras/raveldex/blob/main/docs/specs/DIRECTORY.md) records recovery, ownership and lifecycle details.

## Directory controls and styling

Copy the [complete browser or Astro resource directory](HOSTS.md#directory-controls-and-styling) for a working project with explicit records, actual destination pages, checkbox groups, chips and native page navigation. The browser example indexes its own public JSON; Astro builds an explicit static allowlist and loads matching source/display artifacts on Enable. Both use the same native controller semantics and include loading/Retry, optional URL ownership and teardown.

To add controls to an existing long-lived browser controller, use this fragment after creating it. Supply your own connected HTML `root`, live `directory`, matching `{id,title,url}` `documents` and labels for its configured groups. The complete projects above include that setup; this fragment is not a standalone application.

```js
import { mountRaveldexDirectory } from '@vmitsaras/raveldex/addons/ui/directory/view';
import '@vmitsaras/raveldex/addons/ui/directory.css';

const view = mountRaveldexDirectory({
  root,
  controller: directory,
  documents,
  groups: [{ field: 'kind', label: 'Resource type', values: [
    { value: 'guide', label: 'Guides' },
    { value: 'manual', label: 'Manuals' },
  ] }],
});
await directory.refresh();
// When removing the controls, before separately destroying directory:
// view.destroy();
```

Mount reads the current snapshot and starts no query. It borrows the controller; destroying the view never destroys the controller or engine. Destroy restores the original Node objects when its shell still owns the root, leaves an application's foreign replacement intact and stops timers/listeners/observation. Controller destruction also tears down the view. Same-kind duplicate mount returns its existing handle; destroy/remount to change options. Another UI preset cannot own that root at the same time. Foreign-document adoption suspends commands/presentation; teardown stays available. Focus reads the supplied root's own document/shadow tree; a shadow-root caller also supplies its stylesheet inside that tree.

`DirectoryViewOptions` requires `root`, `controller`, `documents` and `groups`. Supply exactly one `{field,label,values?}` label group for every configured controller field. `values` is an optional list of `{value,label}` mappings for allowed strings; other visible strings keep their raw labels and an empty string has an explicit empty label. Supply a readable mapping for a nonempty whitespace/control-only value. `debounceMs` defaults to 150, integer 0..2000. `filtersOpen` defaults false at every width; native disclosure state is not changed on resize. A `messages` partial bundle supplies captured plain-text labels/status templates, including `label`, `placeholder`, `clear`, `filters`, `remove`, `results`, `resultOne`, `page`, `error`, `stale` and `retry`. Unknown keys, getters and invalid strings refuse before replacing authored content. Messages/explicit value labels are at most 512 UTF-16 units; group labels at most 256. Default raw value labels retain the controller's 1,024-unit value bound. Display documents retain 10,000-entry / 4,000,000 aggregate units and 256/1,024/2,048 ID/title/URL limits. URLs must resolve to HTTP(S) without credentials.

The handle has `search(text?)`, `clear()` and `destroy()`. Search with no argument flushes current controls after composition; explicit validated text cancels draft composition and preserves committed filters. Clear removes text and all selections, resets page one and browses resources. Both return operation Promises; later commands after destroy do nothing. Controller/native errors appear as friendly visible status with Refresh results. Typed codes remain in controller snapshots and in an optional `error` template using `{code}`. A missing display ID refuses visibly, preserving exact totals rather than silently dropping a result. An over-limit selection restores the last admitted controls with a readable message.

Directory/cards empty feedback distinguishes text-only, filtered and empty browse results. `noResults`, optional `noResultsFiltered` and optional `noResultsBrowse` support the bounded submitted `{query}` token described above. A supplied old `noResults` override covers both new variants unless individually overridden; all strings are captured. Active choices/chips stay removable. Empty browse exposes the existing Refresh results button to explicitly check for updates; it does not poll or refresh automatically. Empty results hide the unused heading/list and blank pager. An unavailable Refresh results or pager remains visible while focused through pending work or refusal, then retires when focus leaves; a usable pager or refresh stays available. View mount still starts no query; Clear all retains its explicit browse behavior.

Native labeled checkboxes remain in place while counts/results update. Counts cover **all current results**, not just the visible page, and include the search and every selected filter. Within one group a result can match any selected choice; it must also match each other selected group. These counts describe the current results, rather than predicting what another choice will do. An absent bucket is zero only with a complete projection; otherwise its count is unavailable. Zero choices remain enabled, and selected zero/omitted values stay removable. Missing/null buckets are not selectable strings.

For example, a collection has three Guides and two Manuals, with exactly one type per resource. Selecting Guide gives three results, Guide (3) and Manual (0). Selecting Manual alongside Guide gives five results because either type now qualifies. Selecting a topic in another group then keeps only resources of either type that also match that topic. A zero is a current count, not a reason to disable a choice. The same explanation and native checkbox behavior apply to directory list, cards and grid. Override the visible explanation with captured plain-text `messages.countHint` (at most 512 UTF-16 units); it does not change filtering or counting.

Selected filters form a list of named removal buttons. Removing a focused or activated chip focuses the next surviving chip, previous chip or search input. Stable checkbox/page/Clear controls preserve existing focus. If a removed result held focus, focus recovers to the search input, with reentry checked before presentation continues. Filter resources uses native details/summary: open it normally, then Close filters or Escape inside it closes and restores summary focus. There is no focus trap or automatic resize dismissal. Waiting/composition/loading, exact current totals, no results, invalid selections, native failures and stale revisions have deliberate status outside the busy result section. An older asynchronous recovery cannot discard newer provisional text; external controller/URL replay wins over a pending draft.

Import CSS explicitly, then override the component's public properties in your own stylesheet:

```css
.raveldex-directory {
  --raveldex-directory-accent: #145b45;
  --raveldex-directory-button-color: #fff;
  --raveldex-directory-radius: .75rem;
  --raveldex-directory-gap: 1.25rem;
}
```

| Public property | Light default | Purpose |
| --- | --- | --- |
| `--raveldex-directory-accent` | `#174ea6` | Links, submit background and checkbox accent |
| `--raveldex-directory-background` | `#fff` | Surface/control background |
| `--raveldex-directory-color` | `#17212b` | Main text |
| `--raveldex-directory-muted` | `#465563` | Counts and explanations |
| `--raveldex-directory-border` | `#637383` | Borders and separators |
| `--raveldex-directory-focus` | `#7a2600` | Visible focus outline |
| `--raveldex-directory-button-color` | `#fff` | Text on the accent submit button |
| `--raveldex-directory-error` | `#9b1c1c` | Failure, stale and invalid status text |
| `--raveldex-directory-radius` | `.5rem` | Control/surface corners |
| `--raveldex-directory-gap` | `1rem` | Group/chip/result spacing |
| `--raveldex-directory-padding` | `1rem` | Surface padding |

Dark media uses a dark surface, light text and a light accent with dark submit text; focus defaults to warm `#ffd479` and error text to `#ffb4ab`. Explicit public overrides win in either media mode. Forced colors retains the native system palette. There is no animated transition; reduced-motion styling remains static. Set related colors together when changing the palette. Public classes use `.raveldex-directory__*`; private `--_` variables and data hooks are implementation details. The [concrete view contract](https://github.com/vmitsaras/raveldex/blob/main/docs/specs/DIRECTORY_VIEW.md) owns precise lifecycle, focus and finite bounds.

The complete starters explicitly select URL synchronization and push for committed edits/pages. Choose replace for live edits in one entry, or turn `urlState` off for an in-memory directory. They keep unrelated parameters/hash/history state, show a notice for corrected links, and expose **Update search link** when writing the URL fails; this retries current state without querying again. Native Back/Forward is separate from the scripted pagehide/persisted-pageshow cleanup probes. No storage, telemetry, search-history feature, rich cards/images or new sorting is selected. Human AT speech, physical input/mobile keyboards, actual browser zoom and Safari/device support need separate application checks.

## Rich directory results

Copy the [complete rich-results browser project](https://github.com/vmitsaras/raveldex/blob/main/site/Cards.astro) to start with real resource pages, metadata mapping, local image assets and CSS you can edit. Its layout, density and image controls keep the same directory page and filter selection. Images start off. The basic browser/Astro directories remain available when you need linked titles and controls alone.

For an existing browser controller, use this fragment after creating your own connected HTML `root`, live `directory`, matching display records and group labels. The complete project above includes indexing, loading/Retry, optional URL replay and ownership-safe cleanup; this fragment supplies just the rich view.

```js
import { mountRaveldexDirectoryCards } from '@vmitsaras/raveldex/addons/ui/directory/cards';
import '@vmitsaras/raveldex/addons/ui/directory.css';
import '@vmitsaras/raveldex/addons/ui/directory-cards.css';

const view = mountRaveldexDirectoryCards({
  root,
  controller: directory,
  documents: [{
    id: 'route:river', title: 'Riverside walking guide', url: '/resources/river/',
    excerpt: 'Plan a route with level paths and rest stops.',
    category: 'Route guide', breadcrumb: ['Resources', 'Walking'],
    date: 'Updated November 2026',
    fields: [{ name: 'Distance', value: '5 km' }],
    image: { src: '/images/river.jpg', alt: 'Level path beside the river', width: 640, height: 400 },
  }],
  groups,
  presentation: { layout: 'cards', density: 'comfortable', images: false },
  imageUnavailable: 'Image unavailable',
});
await directory.refresh();
view.setPresentation({ layout: 'grid', density: 'compact' });
// Only this explicit change permits image requests for the current result page:
view.setPresentation({ images: true });
console.log(view.getPresentation());
// When removing the view, before separately destroying its controller:
// view.destroy();
```

Map your public content to `DirectoryCardDocument` records: required `{id,title,url}`, optional `excerpt`, `category`, ordered plain-text `breadcrumb`, already localized `date`, at most four `{name,value}` fields, and an optional `{src,alt,width,height}` image. Optional empty excerpt/category/date strings produce no output. Omit unavailable breadcrumb/field entries. Dates are shown as supplied text; the view does not parse dates or invent ancestor links. It accepts no HTML templates or renderer callbacks. Keep a matching display record for every possible native match.

Admission happens before replacing authored content. Titles and metadata are inserted as text. Result and image URLs resolve to HTTP(S) without credentials, including image data captured while images are disabled. Every image needs a deliberate alternative: `alt: ''` is decorative, otherwise use readable descriptive text. Width/height are required integers 1..4096 and reserve aspect ratio. There are at most 10,000 records and 4,000,000 captured string units, with finite admission work. ID/title/URL limits remain 256/1024/2048 UTF-16 units; excerpts allow 4096, category/date 256, up to eight breadcrumb parts of 256, field names 128 and values 1024, image source 2048 and alt 1024. Unknown keys, getters, duplicate IDs/field names, unreadable nonempty text and invalid image data refuse. `imageUnavailable` is readable localized text of at most 512 units. The [display contract](https://github.com/vmitsaras/raveldex/blob/main/docs/specs/DIRECTORY_CARDS.md) records exact bounds and lifecycle behavior.

`presentation` is a partial `{layout,density,images}`. Defaults are `list`, `comfortable`, false. Layout choices are `list`, `cards`, `grid`; density choices are `compact`, `comfortable`. `getPresentation()` returns a frozen complete snapshot. `setPresentation(partial)` validates first, then changes presentation synchronously without another search/history entry, without reordering results and without losing the existing title-link Nodes/focus. Query, filters, selected chips, page and exact totals remain native. CSS grid uses the same ordered list and ordinary links, with no interactive ARIA grid or extra keyboard model.

Images use native lazy loading, asynchronous decoding and no-referrer policy. Only the current displayed page can create image elements after explicit opt-in. Disabling removes them and their callbacks; it cannot undo a request already sent. Enabling again may create a new request. The browser controls lazy-load timing and caching. A failed informative image shows localized failure text with its authored alternative; a failed decorative image disappears silently. Titles, metadata and links remain usable. There is no automatic alternate source or retry. Teardown clears image listeners as well as the base controls; late detached image events cannot update a newer page or restored/foreign markup. Controller and engine ownership stay with the application.

Import both stylesheets, then edit your own CSS. These properties control the rich layer; the existing directory palette, font, focus and control properties still apply:

```css
.raveldex-directory-cards {
  --raveldex-directory-card-min-width: 18rem;
  --raveldex-directory-card-radius: .85rem;
  --raveldex-directory-card-gap: 1.25rem;
  --raveldex-directory-card-padding: 1.25rem;
  --raveldex-directory-card-compact-padding: .75rem;
  --raveldex-directory-card-image-fit: contain;
}
```

| Public property | Default | Purpose |
| --- | --- | --- |
| `--raveldex-directory-card-min-width` | `16rem` | Preferred grid column minimum, bounded by available width |
| `--raveldex-directory-card-gap` | `1rem`; `.65rem` compact | Card/grid spacing |
| `--raveldex-directory-card-radius` | `.5rem` | Card/image corners |
| `--raveldex-directory-card-padding` | `1rem` | Comfortable card padding |
| `--raveldex-directory-card-compact-padding` | `.6rem` | Compact card padding |
| `--raveldex-directory-card-background` | Directory surface | Card surface |
| `--raveldex-directory-card-border` | Directory border | Card/image borders |
| `--raveldex-directory-card-image-height` | `auto` | Optional image-frame height; auto uses authored aspect ratio |
| `--raveldex-directory-card-image-fit` | `cover` | Image fitting within reserved space |

The public rich classes use `.raveldex-directory-cards__*` alongside the base `.raveldex-directory__*`. Keep internal `--_` variables and data hooks private. Long text/RTL, narrow layout, dark/forced colors and reduced motion retain semantic source order and visible focus. Check your actual colors, image crops/alternatives, browser zoom, devices and assistive technology after changing content or CSS. Graph/CSS bytes, DOM counts and observed requests are separate measurements from memory, latency or paint.

## Starter adoption and local checks

Choose the [inline gallery](https://github.com/vmitsaras/raveldex/blob/main/site/Inline.astro) for simple results in a page, the [modal gallery](https://github.com/vmitsaras/raveldex/blob/main/site/Modal.astro) for documentation search behind a button, the [header gallery](https://github.com/vmitsaras/raveldex/blob/main/site/Dropdown.astro) for a compact field and full-results route, the [directory gallery](https://github.com/vmitsaras/raveldex/blob/main/site/Directory.astro) for checkbox groups/chips/pages and optional URL replay, or [rich directory results](HOSTS.md#rich-directory-results) for metadata and explicit images in list/card/grid layouts. Inline, modal and directory offer complete browser/Astro projects; the header and rich-results galleries offer browser projects. Each has complete source downloads, a live installed preview and a CSS walkthrough. Packages remain available separately: install the matching package versions in the setup guide, with its pinned build tooling, before building the copied project.

| Starter | Selected capabilities and application requirements |
| --- | --- |
| Browser inline | Browser ESM/fetch, original body source, snippet evidence, string category facets and `Intl.Segmenter`. Explicit records build actual guide pages. |
| Astro inline | The same snippets/facets plus the static source loader, matching core/Astro packages and Web Crypto over HTTPS or localhost. Retain original values for every declared text field when reconstructing source snapshots. |
| Browser modal | Native `dialog`, `Intl.Segmenter` and Web Crypto over HTTPS or localhost. Explicit original body/section evidence, page maps, string category facets and real authored heading IDs. |
| Astro modal | The same modal requirements plus the static source loader and matching core/Astro packages. Source, display and the source-only section companion must belong to the same build/base; maps bind to the receiving owner revision. |
| Browser dropdown header | Browser ESM/fetch; native Popover for the quick popup (ordinary GET form and working inline full page otherwise); core-only linked titles, one owner per page and the same prefix mode on its real inline full-results route. Optional explicit modal handoff additionally requires native `dialog`. No source/snippet/facet/section provider or Web Crypto requirement. |
| Browser directory | Browser ESM/fetch, native details/form controls, explicitly installed set filters/facets, one controller and optional named URL binding. No snippet/source provider, worker, storage or Web Crypto requirement. |
| Astro directory | The same directory controls plus the source-format static loader and paired core/Astro packages. Original title/body source is retained for reconstruction; Web Crypto over HTTPS/localhost validates matching artifacts. |
| Browser rich directory | The browser directory controller plus explicitly mapped metadata and the optional cards renderer/CSS. Native image loading requires an explicit image-view choice; local authored assets and complete resource routes are included. |

The [solution chooser](https://github.com/vmitsaras/raveldex/blob/main/examples/README.md) compares all five presentations and all eight complete projects, with their exact data, loading, CSS and keyboard requirements. Every supplied project uses direct main-thread execution. Browser inline/header/directory/rich projects start loading on page initialization; Astro inline/directory wait for their Enable button; documentation modals load on first open. These are complete local indexes, with no route crawling, index shards or automatic worker fallback.

All starters select final-word prefix matching. Complete earlier terms remain exact; a final term with fewer than two normalized code points also stays exact. Empty inline/modal/header search is idle; directory/rich search deliberately browses all records. Selecting a filter may browse without text. Inline/modal results append through Load more until all matches are displayed; header dropdown results are a bounded projection with a real full-results route, while directory/rich controls use complete native pages. Result totals always count matching native records/pages; section previews do not add matches. Layout, density and image choices preserve directory state.

| Presentation | Ordinary keyboard/focus behavior | Recovery and ownership |
| --- | --- | --- |
| Inline | Native input editing, composition, Tab, form submission and ordinary result links | Clear returns to idle; Retry search restarts against the current collection. Destroy restores authored content and leaves a borrowed engine usable. |
| Documentation modal | Trigger opens native dialog; closing restores its logical opener. Escape follows native search/dialog behavior and may clear a focused search field first; Close search remains available. Optional shortcut bindings are explicit. | First-open loading can cancel/retry; closing retains or resets query as configured. Destroy the dialog before disposing its owner. |
| Compact header | Native editing/composition, virtual arrow selection, Enter on the current link, Escape dismissal and ordinary Tab exit | See all results preserves the raw query in the full-results route. Loading/Retry and optional modal handoff share the page owner. |
| Directory | Native grouped checkboxes, named chip removal, complete-page buttons; Close/Escape restores the filter disclosure summary | Unknown counts stay unknown; selected zero/omitted values stay removable. Explicit URL replay wins over drafts, with visible address-write recovery. |
| Rich directory | The same directory behavior with ordinary list links and native presentation controls; CSS grid adds no ARIA grid keyboard model | Presentation changes retain anchor focus and native state. Images require explicit opt-in; failure keeps text/links usable. |

Native link traversal follows the browser/OS keyboard preference. In the automated macOS WebKit environment, Option+Tab traverses ordinary links; this is measured in an unstyled baseline without changing preferences. Check the behavior and speech in your actual browser/assistive-technology combination.

Replace public sample records with your own IDs, original text and real destinations. Keep maps, ranges and heading IDs aligned; native totals, scores and paging still count pages. Do not add private content to generated assets. Title/link-only search can omit snippet/section/facet UI options and their matching optional registrations together. Astro source reconstruction still needs original values for all declared text fields. Deploy the complete rebuilt output with one consistent base and build identity.

The starter wrappers own newly created engines or static handles. Destroy their borrowed UI before releasing those owners, and await wrapper destruction before replacing a view. For an engine owned elsewhere, mount the public UI directly and keep engine disposal with its existing owner. The complete projects show retry and late-owner cleanup; importing a UI entry alone does not create or load an engine. The header starter shares one newly loaded owner across its dropdown, full-page inline surface and explicitly enabled modal; it never creates a second owner merely to change presentation.

Local automated Chrome checks exercise installed bytes, actual native results/counts/pages, snippets/sections, scripted keyboard/composition, cancellation/retry and lifecycle races. Theme/reflow checks use emulated viewports, forced colors and reduced motion. These results do not establish human screen-reader speech, physical IME/touch/on-screen-keyboard behavior, actual 200%/400% browser zoom, other browser/device combinations or universal performance. Check those combinations in your application after replacing data, labels, layout or colors. Keep visible focus, contrast, native links and browse navigation usable in success, no-results, loading and failure states.

## One-owner module worker

Use a module worker to run a complete engine off the main thread. Create the `Worker` yourself, then pass it to `createWorkerRaveldex` from `/adapters/worker`. The [worker example](examples/worker.mjs) and [host module](examples/worker-host.mjs) show both sides.

`createWorkerRaveldex(options: WorkerOptions): Promise<WorkerRaveldex>` takes `{ worker, configuration, ownership: 'owned' | 'external', sameHost: true, maxMessageBytes?, responseTimeoutMs? }`. The initial handshake checks the implementation, analyzer, ranking model and selected registrations. `sameHost: true` describes your browser and its own worker; it does not qualify other environments, and the default analyzer profile stays unqualified.

In the worker module, call `serveRaveldexWorker(scope, options?)` from `/adapters/worker/host`. Its options are `{ addons?, maxMessageBytes? }`. Install matching add-ons in the client configuration and worker host: functions and live registration handles cannot be sent as cloneable data.

`WorkerScope` needs `postMessage`, `addEventListener` and `removeEventListener`; `WorkerEndpoint` also needs `terminate`. The host returns a `WorkerHostHandle` with an asynchronous `dispose()` method.

`WorkerRaveldex` has ordinary methods plus `reconcile(operationId)` and `destroy()` (the disposal alias). Mutation methods return `MutationPromise`, a Promise with a captured `operationId`. `MutationReceipt` is `{ operationId, status: 'pending' | 'expired' }`, `{ operationId, status: 'committed', result }` or `{ operationId, status: 'rejected', error: WireError }`. Reconciliation uses the same owner/session and a bounded 256-receipt window. It is not durable deduplication across worker loss.

Messages default to a maximum of 8 MiB, which you can lower to 1 KiB. Message structure is bounded too, and at most 64 requests can be pending. The default response timeout is 65,000 ms, configurable from 1 to 120,000 ms. Engine deadlines and work limits apply separately.

If a reply is lost or late, an update may already have committed. Check its receipt while the worker survives. If the owner is gone or the receipt has expired, rebuild a new engine from your authoritative source instead of blindly repeating an add, replace or remove. An expired receipt proves neither success nor failure.

`WorkerAdapterError` has `code`, sanitized `details` and optional `operationId`; `WORKER_ERROR_CODES` includes `INVALID_TRANSPORT`, `TRANSPORT_LIMIT`, `INCOMPATIBLE_WORKER`, `TIMEOUT`, `TERMINATED`, `STARTUP_FAILED`, `OUTCOME_UNKNOWN` and `DISPOSED`. Authoritative native errors remain `RaveldexError`; snapshot errors carry their reason. `WireError` preserves the declared category/code rather than serializing an arbitrary Error/cause. `WorkerErrorCode` and `WorkerErrorDetails` are exported types.

Call `destroy()` or `dispose()` when you are done. The adapter asks the owner to acknowledge cleanup, releases client listeners and settles pending work. It terminates an `owned` endpoint; you remain responsible for an `external` one. An acknowledgement timeout still reports an error after local cleanup. Searches never silently fall back to the main thread.

## Source and native snapshots

Use snapshots to export an engine's state and restore it later. Call `createSnapshots(engine, options?)` from `/adapters/snapshots` with a supported direct engine. The helper uses your engine without owning it or adding methods to it.

Its methods are `exportSource(options?)`, `exportNative(options?)` and `restore(encoded: string, options?)`. Each returns a promise and accepts core mutation signal/deadline options. `SnapshotOptions` lets you set `maxEncodedBytes`, from 1 KiB to the default and maximum 64 MiB.

| Format | Requirements / meaning |
| --- | --- |
| `raveldex-source` | Selected originals for every schema text field; exports owned source/configuration and rebuilds under the receiving analyzer. Does not promise prior membership, rank or score equivalence across environments. |
| `raveldex-native` | Explicit exact-Node-runtime qualification from owner creation; validates compatible native index/statistics/provider structures, configuration, analyzer/model, codecs and limits. It is not an arbitrary engine dump or a browser portability promise. |

Both formats export versioned JSON strings with size, structure and corruption checks. Checksums detect changed bytes; they do not authenticate who sent them.

A successful restore replaces the receiving engine's state in one atomic update at its next local revision. It returns `{ format, originRevision, revision, reindexed, receivingAnalyzer }`. `originRevision` records where the snapshot came from; it does not become the local revision. `reindexed` is `true` for a source rebuild and `false` for native state.

Cancellation or a validation, compatibility, work or deadline failure before commit leaves the previous state intact. A complete source rebuild can exceed a single operation's budget even if the original data was added successfully in smaller batches.

For source snapshots, use ordinary `createRaveldex`, source providers for every text field and `createSnapshots`. Choose this path unless you have an exact-runtime native qualification for your application.

For native snapshots, create the engine with `createSnapshotRaveldex(configuration, { nativeQualification })`. You cannot add native qualification to an ordinary engine afterward. The declaration is `NativeSnapshotQualification`: `{ profileId, scope: 'exact-node-runtime', environment, evidence: string[] }`. Its environment includes `{ runtime: 'node', version, v8, icu, unicode, platform, arch }`.

`currentNodeSnapshotEnvironment()` reads the current runtime identity, but detecting versions does not qualify it. The evidence references are declarations supplied and trusted by your application, not proofs executed by the library.

[snapshots.mjs](examples/snapshots.mjs) takes the application's declaration as an argument and exercises source and native round trips. The receiving native owner must match the exact declared profile/environment/evidence and compatible configuration. Use source snapshots when your application does not supply an exact-runtime native declaration.

`SnapshotAdapterError extends RaveldexError` adds `reason: SnapshotReason`. `SNAPSHOT_REASONS` is `MALFORMED_SNAPSHOT`, `ENCODED_LIMIT_EXCEEDED`, `INTEGRITY_MISMATCH`, `UNSUPPORTED_FORMAT`, `UNSUPPORTED_CODEC`, `SCHEMA_MISMATCH`, `ANALYZER_MISMATCH`, `RANKING_MISMATCH`, `CAPABILITY_MISMATCH`, `INDEX_DETAIL_MISMATCH`, `LIMITS_MISMATCH`, `SOURCE_UNAVAILABLE`, `UNQUALIFIED_PROFILE`, `PROFILE_MISMATCH`, `INVALID_NATIVE_STATE`, `UNSUPPORTED_ENGINE`. Reasons distinguish compatibility from the ordinary error code.

Browser workers use the separate source-only bridge: `createWorkerSnapshots(engine)` from `/adapters/worker/snapshots` and `serveSnapshotRaveldexWorker(scope, options?)` from `/adapters/worker/snapshots/host`. [worker.mjs](examples/worker.mjs) and [worker-host.mjs](examples/worker-host.mjs) show a matched pair. `WorkerSnapshots` exposes `exportSource`, `restore` and its own `reconcile`. Restore returns `SnapshotRestorePromise` with `operationId`; its `SnapshotRestoreReceipt` is `pending`, `expired`, `committed` with a restore result, or `rejected` with a wire error. Pending/expired cannot resolve an unknown outcome. Ordinary mutation reconciliation is separate. Browser/worker native export and restore remain unavailable.

The snapshot entry also exports `SnapshotEngineOptions`, `SnapshotOptions`, `SnapshotFormat`, `SnapshotRestoreResult` and `Snapshots` types. Worker snapshot/client/host types are available from their corresponding subpaths; no private control-channel import is supported.

## IndexedDB persistence and recovery

Use `createIndexedDBPersistence(snapshots, options)` from `/adapters/indexeddb` to save and load snapshots explicitly. It manages its own database connections while borrowing the snapshot export/restore handles. Disposing storage does not dispose your engine.

Supply `{ databaseName, namespace }` for a database owned by this adapter, not an unrelated application database. Optional settings are `{ indexedDB?, format?: 'source' | 'native', openTimeoutMs?, operationTimeoutMs? }`. The factory can be supplied directly or found when needed, and the default format is source. Native format requires the qualified direct-engine path; workers support source only.

| Method | Required options / result |
| --- | --- |
| `save(options: PersistenceWriteOptions)` | `{ expectedGeneration: string | null, signal?, deadlineMs? }`; returns `PersistenceSaveResult` `{ generation, format, encodedBytes, durable: true }`. Null explicitly expects an empty namespace. |
| `load(options?: PersistenceOptions)` | `{ signal?, deadlineMs? }`; returns `PersistenceLoadResult` `{ status: 'missing', generation: null }` or `{ status: 'restored', generation, restore }`. |
| `erase(options: PersistenceWriteOptions)` | Same expected-generation requirement; returns `PersistenceEraseResult` `{ erased, generation: null, durable: true }` after deleting the namespace's snapshot and metadata rows. |
| `dispose()` | Releases connections/actions without erasing storage or disposing the borrowed engine. |

Keep the generation returned by a save or load and supply it on your next save or erase. This prevents one writer from silently overwriting another. `GENERATION_CONFLICT` means you need to read the current generation and decide how to resolve the change. A loaded generation describes the snapshot you read, not a lock on later writes.

`durable: true` means the strict-hint IndexedDB transaction completed. It does not guarantee survival of power loss or browser eviction. Saving bytes and later restoring an engine are separate operations.

Open timeout defaults to 5,000 ms (maximum 30,000); action timeout defaults to 30,000 ms (maximum 60,000), with at most 64 pending actions and a 64 MiB encoded ceiling. Actions include queue time, encoding and restore. A timeout during an uncertain restore can return `OUTCOME_UNKNOWN`, including selected generation and operation identity when available. Do not automatically repeat that restore or call it rolled back. Use worker snapshot receipts when available, inspect the surviving owner separately, or explicitly recover into a new owner from authoritative data.

`IndexedDBAdapterError` is separate from core/snapshot errors, with `code` and frozen `details: IndexedDBErrorDetails` (`phase?`, generation fields, `operationId?`, `snapshotReason?`, `selectedGeneration?`). `INDEXEDDB_ERROR_CODES` is `INVALID_OPTIONS`, `UNAVAILABLE`, `QUOTA_EXCEEDED`, `INCOMPATIBLE_DATABASE`, `BLOCKED`, `VERSION_CHANGED`, `GENERATION_CONFLICT`, `CORRUPT_DATA`, `INCOMPATIBLE_SNAPSHOT`, `TRANSACTION_FAILED`, `CANCELLED`, `TIMEOUT`, `DISPOSED`, `OUTCOME_UNKNOWN`, `QUEUE_FULL`. `IndexedDBErrorCode` is exported with the option/result/interface types above. No automatic save, startup restore, retry or namespace deletion occurs on import.

## Recovery choices in your application

Workers, snapshots and persistence are headless APIs. They return typed failures;
your application owns visible messages, retry buttons, authoritative records and
any replacement owner. Keep ordinary browse links outside the enhanced search
root. Never describe a refused operation as an empty search or an uncertain write
as safely rolled back.

| Observed failure | Explain to the person using search | Application recovery |
| --- | --- | --- |
| `MISSING_CAPABILITY` / `INCOMPATIBLE_CAPABILITY` | This search feature is unavailable in the current setup. | Register the explicitly selected provider for each field, or remove that feature from the UI and remount. Repeating the same request cannot install it. Title/link search can use core alone. |
| `INVALID_QUERY`, bounded prefix/suggestion refusal | Try complete words, a shorter query or fewer choices. | Preserve the submitted text and selections. Keep structured parser error spans separate from ordinary literal input. Suggestions are optional vocabulary completions; no suggestion is not a replacement for exact hits. |
| Worker `STARTUP_FAILED`, `INCOMPATIBLE_WORKER`, `DISPOSED` | Background search could not start or its owner has stopped. Offer an explicit restart, browse links or the application's already supported direct mode. | Cancel/invalidate old presentation work. Destroy borrowed presenters before releasing the old owner; rebuild from authoritative data only after explicit recovery. Never accept late results from an abandoned request. |
| Worker read `TIMEOUT`, `TRANSPORT_LIMIT`, `INVALID_TRANSPORT`, `TERMINATED` | This request could not complete. Try Search again or a smaller query; restart explicitly if failures persist. | A refused read does not establish that the worker is gone; even `TERMINATED` can report a single failed send. Preserve the original code and allow an explicit read on the same owner. An invalid received frame can close the adapter; a later `DISPOSED` confirms an unusable adapter. Ignore failures whose request signal is already aborted. |
| `CANCELLED` during loading/search | Loading stopped; the browse links remain available. | Respect the abandoned attempt. Do not show a late result/error or start another owner. A retry is a new explicit attempt. |
| Storage `UNAVAILABLE`, `BLOCKED`, `QUOTA_EXCEEDED` | This browser could not open or save the search cache. Browse the content, or use an independently available in-memory search. | Keep the original adapter error. Do not erase another namespace, request persistence or silently save elsewhere. Retry after a relevant change, such as closing another tab or freeing storage. A storage-only failure does not itself require disposing a borrowed live engine. |
| Storage `GENERATION_CONFLICT` | The saved search changed in another tab. | Decide whether to accept or replace the current cache. `load()` reads its generation **and restores into its receiver**: inspect with a separate compatible receiver when the live engine must stay intact. Never repeat the stale expected generation or erase the namespace to bypass the conflict. |
| Storage `VERSION_CHANGED` | The browser database changed while this operation was running. | The connection was closed by a database version-change event; this is not a namespace generation conflict. Coordinate other database users and check schema compatibility before reopening. Do not delete or downgrade a database automatically. |
| Storage `CORRUPT_DATA` / `INCOMPATIBLE_SNAPSHOT` | The saved search cannot be used with this setup. | These are IndexedDB wrapper codes. Keep the refusal and any `snapshotReason`; rebuild a separate owner from authoritative records before explicitly switching. |
| Direct `SnapshotAdapterError` with its core `code` and `.reason` | The snapshot is invalid or incompatible with this setup. | Use the explicit reason, such as `INTEGRITY_MISMATCH` or `PROFILE_MISMATCH`, rather than interpreting it as an IndexedDB code. Pre-commit refusal preserves the receiver. Do not bypass native qualification. |
| Worker mutation/source-restore `OUTCOME_UNKNOWN` | The update has not been confirmed. Do not claim success or rollback. | Retain its operation ID. While the owner survives, use mutation `reconcile()` or the separate worker-snapshot receipt API as appropriate. Pending/expired is inconclusive. If the owner is gone, rebuild from authoritative data; never blindly repeat a write. Worker mutations do not carry a storage generation. |
| IndexedDB `save()` / `erase()` `OUTCOME_UNKNOWN` | The cache write or deletion has not been confirmed. | The error may contain only a phase: there may be no operation ID, generation or worker receipt. Do not replay it automatically. If examining the current cache with `load()`, use a separate receiver because loading restores engine state; inspect the returned generation/state and authoritative records before deciding the next CAS write. |
| IndexedDB `load()` `OUTCOME_UNKNOWN` during restore | It is not yet clear whether the receiving search was replaced. | Retain `operationId` and `selectedGeneration` **when supplied**. A surviving worker snapshot receipt may settle a worker restore; a direct receiver has no invented worker receipt. Otherwise inspect/recover the receiver separately or rebuild a new owner from authoritative data before switching. |

These are recovery choices, not automatic fallback behavior. The complete starter
controllers demonstrate loading cancellation, single-owner retry and late-owner
cleanup. The developer Workbench distinguishes a refused read from a stopped owner, keeps
the query and shows the stable code in **Technical details**. A refused read can be
retried explicitly with **Search** on the same worker; confirmed owner loss offers
**Retry loading guides** or **This page**. Restarting clears its category/page as documented. It
does not reconnect a dead worker invisibly. The storage recipe below is an explicit
save/load/erase exercise, not an offline search interface.

## LocalSearch source migration

Use `convertLocalSearchSnapshot(bytes)` from `/integrations/localsearch` to convert a supported companion source export before rebuilding a separate Raveldex engine. It checks the snapshot, checksum and supported data mapping.

The supported input identity is companion-v1, format 1, MiniSearch 7.2.0. Arbitrary MiniSearch indexes, worker messages and storage rows are rejected. Conversion needs `crypto.subtle`, accepts at most 32 MiB and includes bounded synchronous work. It is not a queued, cancellable engine operation.

The returned plan contains `{ configuration, records, origin, sourceRevision, returnFields, identity, differences }`. Read `identity` and `differences` for changes in analysis and ranking. `origin` and `sourceRevision` describe the old collection; they do not become the new engine's revision or a storage generation.

The [migration recipe](examples/migration.mjs) rebuilds a separate engine with bounded `addMany` calls, inspects it and disposes it. In your application, switch to the new engine only after the whole rebuild succeeds. Each batch is atomic, but the entire migration is not one transaction.

`MigrationError` has sanitized `code` and `details: { reason, nativeCode? }`. `MIGRATION_ERROR_CODES` is `INVALID_BYTES`, `INVALID_SNAPSHOT`, `INCOMPATIBLE_SNAPSHOT`, `NONCANONICAL_SNAPSHOT`, `CHECKSUM_MISMATCH`, `NATIVE_INCOMPATIBLE`, `CAPABILITY_REQUIRED`. The entry exports `MigrationErrorCode`, `MigrationErrorDetails`, `MigrationReason`, `LocalSearchMigration`, `LocalSearchMigrationIdentity` and `LocalSearchMigrationOrigin`. Foreign indexes, scores, live handles and namespaces are never reused. The repository [migration guide](https://github.com/vmitsaras/raveldex/blob/main/docs/migration/LOCALSEARCH.md) gives mapping and provenance details.
