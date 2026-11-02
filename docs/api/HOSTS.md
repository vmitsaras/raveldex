# UI, workers, snapshots, storage and migration

Use these integrations to add a browser interface, move work to a module worker or save and restore an index. You decide when each integration starts and when to clean it up. Importing a module does not start a worker, mount controls, open a database or restore data. The [example modules](examples/README.md) show complete small setups.

## Native DOM UI and CSS

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

To start with a complete project, use the [browser](../../examples/inline-browser/README.md) or [Astro](../../examples/inline-astro/README.md) inline starter. The [solution gallery](../../site/Inline.astro) provides a working preview, exact source files and complete starter downloads. Each guide includes local package installation, replacement content, deployment bases, CSS and cleanup.

Import `mountRaveldexInline` from `@vmitsaras/raveldex/addons/ui/inline` and its stylesheet separately from `@vmitsaras/raveldex/addons/ui/inline.css`. The inline preset provides a labeled search form, clear/submit controls, linked titles, optional snippets and simple filters, and bounded Load more/navigation. Title/link search works with core alone. It never installs snippets, facets, Inspector, workers or storage automatically.

Supply your existing engine and display documents with matching IDs, just as in the DOM recipe above. `InlineUIOptions` accepts only these properties:

| Option | Meaning |
| --- | --- |
| `root`, `engine`, `documents` | Required element, borrowed engine and readonly `{ id, title, url }` entries. Display data is copied at mount with the same validation/limits as the legacy UI: up to 10,000 entries and 4,000,000 aggregate ID/title/URL UTF-16 units; ID/title/URL caps are 256/1,024/2,048. Navigation URLs must resolve to HTTP(S) without credentials. |
| `mode?` | `prefix` by default or explicit `text`. Prefix completes only the final word using the existing two-normalized-code-point threshold. Earlier words remain exact; shorter endings remain exact. |
| `pageSize?` | Batch size, default 5, from 1 to 100 within native engine bounds. The summary reports the exact total and displayed count. |
| `maxRenderedResults?` | Maximum hits in a visible result window; default 100, integer from `pageSize` to 1,000. Load more appends only within this cap; Next/Previous results reach the other windows. |
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

The original messages are `label`, `placeholder`, `submit`, `clear`, `idle`, `searching`, `noResults`, `resultsLabel`, `resultsOne`, `resultsMany`, `error` and `retry`. Additive optional keys are `composing`, `loadMore`, `previous`, `next`, `paginationLabel`, `pageSummary`, `windowLimit`, `revisionChanged`, `all`, `emptyValue`, `nullValue`, `missingValue`, `unlistedValue`, `facetSummary`, `snippetOmissions` and `snippetLimits`. Existing complete original bundles remain valid; unspecified new keys use English defaults.

Summary templates substitute `{total}` and `{count}`; `pageSummary` also supports `{start}`/`{end}`, and `windowLimit` supports `{remaining}`. `unlistedValue` uses `{value}`, `facetSummary` uses `{total}`/`{omitted}`, and `snippetOmissions` uses `{count}`. The error template substitutes a sanitized native `{code}` (unrecognized failures use `INTERNAL_ERROR`); a revision mismatch uses `revisionChanged`. Every message, title, selection and excerpt is inserted as text, never HTML. UI messages do not select a different engine analyzer. The polite status region announces actual searching, composition and settled outcomes without repeating unchanged messages on each keystroke.

The optional stylesheet uses `.raveldex-inline` and scoped `__form`, `__label`, `__field`, `__icon`, `__input`, `__submit`, `__clear`, `__status`, `__results-heading`, `__results`, `__result`, `__result-heading`, `__result-title` and `__retry` classes. Additional style hooks are `__facets`, `__facet-group`, `__facet-label`, `__facet`, `__facet-summary`, `__snippet`, `__highlight`, `__snippet-omissions`, `__navigation`, `__load-more`, `__previous`, `__next` and `__page-summary`. `data-raveldex-inline-*` hooks are internal; they are not a caller-authored markup API.

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
| `--raveldex-inline-border-width`, `--raveldex-inline-result-padding` | `2px` controls, current gap / `0` |
| `--raveldex-inline-highlight-background`, `--raveldex-inline-highlight-color` | `#ffe59a`, `#17212b` |
| `--raveldex-inline-error` | `#9b1c1c` |

Set properties on the search root or an ancestor. For a small branding change, override the accent, radius and gap; the host's font is inherited. For a dark host theme, supply suitable surface, text, muted, link, border, focus and error colors together; set highlight foreground/background together if overriding them. Private `--_` properties are not customization API. Keep visible focus, contrast, reflow and control targets usable. The stylesheet includes scoped reduced-motion and forced-colors behavior and never injects itself from JavaScript.

### Inline result pages, filters and snippets

Load more appends the next native batch without changing its order or exact total. A partial batch can fill a window whose cap is not a multiple of `pageSize`. At the cap, Load more becomes unavailable and Next results starts the following window. Previous results reloads the first batch of the previous window; Load more can then expand that window again. The range summary states which matches are visible and how many remain. All matches remain reachable, while at most `maxRenderedResults` hit elements are retained. Navigation controls stay mounted once shown and use guarded `aria-disabled` states so an asynchronous update does not remove the focused button.

Changing the query or a filter resets accumulation. Paging checks the native revision; if the index changed, the UI clears old hits/counts and offers Retry from the first window with the query and selections retained. It also requires the snippet reply to match the main reply's revision, IDs, scores and total before committing hits or counts. It does not subscribe to external mutations; a later search/paging action revalidates current state. Native search/provider/transport failure is shown as failure, never as a successful empty result.

Each string facet uses a native select with an All choice. Empty strings are valid distinct values; null/missing buckets are informational unavailable options. Counts apply before hit paging and include every active filter. At most 100 buckets per field are displayed; the summary exposes omitted buckets. A selected value stays available when outside the displayed projection, without an invented count. Multi-selection and own-group-excluding counts belong to a later directory solution.

Explicit snippets use only the new batch of IDs, never all accumulated IDs. Returned text is original source, with validated marks at returned UTF-16 offsets and visible omission notices for undisplayed matches, window/highlight limits and oversized matches. Offsets alone do not supply the original text. A snippet failure clears the whole attempted presentation rather than mixing stale or incomplete context with a successful result list.

The default inline presentation includes neither numerical scores nor Inspector controls. For the developer-oriented presentation, explicitly use the existing native DOM UI instead of hiding controls with CSS. Complete [browser](../../examples/inline-browser/README.md) and [Astro](../../examples/inline-astro/README.md) starters include copy/install steps and explicit ownership. The existing `/addons/ui` Workbench API retains its exact-word default, full navigation and Inspector. No Pagefind runtime/API or indexing/loading compatibility is implied.

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

Maps are bounded to 10,000 pages, 16,384 sections total, 64 per page and 4 MiB serialized UTF-8. There is no import-time map retention or extra core index. At the existing 1,000-parent DOM ceiling, section mode adds at most 3,000 previews, 720,000 excerpt UTF-16 units and 96,000 marks. These are output ceilings, not measured memory usage.

## Documentation search modal

Use the modal when documentation search should open from an explicit button. It reuses inline search, feedback, paging and optional anchored previews inside a native dialog. Supply an already created engine and matching display data; the modal borrows that owner and starts closed without searching. For first-open loading and complete owned application lifecycle, copy the [browser](../../examples/modal-browser/README.md) or [Astro](../../examples/modal-astro/README.md) starter. The [modal gallery](../../site/Modal.astro) includes an installed preview, exact source downloads and CSS recipes.

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
| `modalMessages?` | Partial `ModalUIMessages` with `title`, `close`, `escapeHint`, `shortcutHint`. Plain nonblank text up to 512 UTF-16 units each. Defaults are “Search documentation”, “Close search”, “Esc to close”, “Ctrl/⌘ K”. |

The readonly `ModalUIHandle` has `open()`, `close()`, `search(text?)`, `clear()` and `destroy()`. Open focuses the search input and reruns the first native page from preserved controls; an empty unfiltered query remains idle. Repeated open is harmless. Search while closed changes the stored text without searching or reopening; clear also works while closed. Close aborts debounce/main/context work and prevents late replies from publishing. If application code calls the native dialog’s `close()` directly, cleanup follows its queued close event; preexisting hidden feedback may persist until then, while late replies still cannot publish. Reopen checks the current revision/maps again. Reset-on-close clears input/filter values. Destroy cancels work, removes bindings, restores original root Node objects and owned trigger/scroll state, and never disposes the borrowed engine. Methods after destroy do nothing.

Native Escape cancellation, the visible close button and deliberate backdrop activation share cleanup. Some browsers first clear a focused search field on Escape; press Escape again or use **Close search** to dismiss. Backdrop dismissal requires the same primary pointer to press and release outside the dialog, then click there; dragging through the backdrop does not dismiss. Ordinary result links keep their native navigation and modifier behavior. Native dialog behavior contains page focus; a browser may move keyboard focus into its own chrome during Tab traversal. There is no custom Tab loop. Close returns to the connected actual opener when it still owns the focus transition; removed openers, unrelated focus and other modal sessions are respected.

The optional shortcut ignores already handled/repeated events, composition, editables and visible editable shadow paths, Alt/Shift and simultaneous Control+Meta. Unknown focused shadow-capable hosts are conservatively excluded, including ordinary focusable `div`/`main`/`section` regions that cannot be distinguished from concealed shadow content. Root/trigger shadow trees are captured explicitly; their actual editable controls are respected. The active eligible modal wins; otherwise the first connected enabled opt-in instance wins. An unrelated native modal found in the document or active/known shadow trees blocks opening. This does not discover every externally concealed/inactive shadow tree; coordinate those external modal lifecycles in the application. Destroy unregisters its binding, and the final opt-in instance removes the shared document listener. Merely importing or mounting inline search captures no keyboard shortcut.

Style `.raveldex-modal` and its scoped `__header`, `__title`, `__close`, `__search`, `__body`, `__footer` and `__hint` hooks. The shared inline properties continue to control input/results; modal background/color/border/focus default to those same values. Modal-specific `--raveldex-modal-*` properties include `background`, `color`, `border`, `focus`, `gap`, `padding`, `gutter`, `max-width`, `height`, `border-width`, `radius`, `shadow`, `backdrop`, `title-size` and `control-radius`. Layout defaults are 48rem maximum width, 42rem preferred height, .75rem gutter/gap and 1rem padding. Set public overrides on the dialog or an inherited wrapper; properties starting `--_` are private.

The header/input remain reachable as results and facets scroll in the contained body. Short screens use a compact input row and keep the associated label available to assistive technology. Dynamic viewport/safe-area rules, visible focus, forced colors and reduced motion are included; check contrast and geometry after customization. Automated viewport checks do not establish physical on-screen-keyboard, actual zoom or human AT support. See the [modal contract](../specs/DOCS_MODAL.md) for exact ownership and lifecycle rules. Native/worker failures remain visible errors with Retry; the modal does not load assets, create another engine or silently change execution hosts.

## Compact dropdown search

Use `mountRaveldexDropdown` from `/addons/ui/dropdown` when a compact field should offer a few real page links. Import `/addons/ui/dropdown.css` separately. It uses core alone, borrows your existing engine and creates no index, snippets, suggestions, worker or storage. Native manual popover support is required; unsupported environments fail before replacing your browse content. Packages remain private and unpublished.

For a complete project, copy the [browser header starter](../../examples/dropdown-browser/README.md). Its [gallery](../../site/Dropdown.astro) has an installed preview, all source files and a CSS walkthrough. The starter builds a real `/search/` inline destination and guide pages at root or a subdirectory base.

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

Style `.raveldex-dropdown` and its scoped `__form`, `__label`, `__input`, `__submit`, `__clear`, `__status`, `__retry`, `__full-results`, `__popup`, `__row`, `__cell` and `__link` classes. `.is-active` marks the current cell. Public `--raveldex-dropdown-*` properties include `background`, `color`, `muted`, `accent`, `border`, `focus`, `active-background`, `active-color`, `error`, `font`, `font-size`, `line-height`, `gap`, `padding`, `radius`, `border-width`, `max-width`, `max-height` and `shadow`; `--_` geometry values are private. Defaults use a readable light surface, 44px controls, 40rem maximum component width and 20rem maximum popup height. Native top-layer placement escapes clipping ancestors and uses available viewport space with contained scrolling. If a short or enlarged viewport cannot fit a usable result row without covering controls, the popup collapses with the exact total, a space/recovery message and the full-results link. Keep visible focus, non-color active indication, contrast and full-results access when changing a theme.

Plain-text `DropdownUIMessages` keys are `label`, `placeholder`, `submit`, `clear`, `idle`, `composing`, `searching`, `noResults`, `resultsLabel`, `resultsOne`, `resultsMany`, `error`, `retry`, `fullResults`, `closed` and `noSpace`. Overrides are captured strings of at most 512 UTF-16 units. Counts use `{total}`/`{count}` tokens and errors use `{code}`. UI language does not select another analyzer. [The concrete contract](../specs/DROPDOWN.md) records keyboard, focus, placement, lifecycle and finite bounds. Scripted keyboard/composition, computed accessibility trees and emulated layouts are separate from human AT, physical input/mobile keyboard and actual zoom observations.

The complete [header starter](../../examples/dropdown-browser/README.md) uses `configuration.mjs` to select prefix mode, three compact results and a three-result inline batch with a six-result window. Its `/search/` page reads a single `q` value once, preserves the decoded raw words and refuses duplicate, multiline, malformed or overlong input with a recovery message. Header and destination use the same records and query configuration; the starter does not add URL history synchronization. Both pages keep ordinary browse links. Build and preview with the same `RAVELDEX_DROPDOWN_BASE` when deploying under a subdirectory.

Set the starter's `modalHandoff` flag to `true` only when you want its explicit larger-search button. The button transfers the committed header text to a modal using the same page owner, display records and mode. It adds no global shortcut, second engine or automatic width switch. The supplied bundle imports all three optional UI styles and presenters so this flag needs only a configuration edit and rebuild; this is the starter's selected bundle cost, not the cost of importing `/addons/ui/dropdown` alone. A new page navigation loads that page's own owner; the controller destroys its borrowed surfaces before releasing it.

## Starter adoption and local checks

Choose the [inline gallery](../../site/Inline.astro) for results in a page, the [modal gallery](../../site/Modal.astro) for documentation search behind a button, or the [header gallery](../../site/Dropdown.astro) for a compact field and full-results route. Inline and documentation-modal galleries offer browser/Astro projects; the header gallery offers one plain-browser project. Each has complete source downloads, a live installed preview and a small CSS walkthrough. Packages remain private and unpublished: install the matching local tarballs in the setup guide, with its pinned build tooling, before building the copied project.

| Starter | Selected capabilities and application requirements |
| --- | --- |
| Browser inline | Browser ESM/fetch, original body source, snippet evidence, string category facets and `Intl.Segmenter`. Explicit records build actual guide pages. |
| Astro inline | The same snippets/facets plus the static source loader, matching core/Astro packages and Web Crypto over HTTPS or localhost. Retain original values for every declared text field when reconstructing source snapshots. |
| Browser modal | Native `dialog`, `Intl.Segmenter` and Web Crypto over HTTPS or localhost. Explicit original body/section evidence, page maps, string category facets and real authored heading IDs. |
| Astro modal | The same modal requirements plus the static source loader and matching core/Astro packages. Source, display and the source-only section companion must belong to the same build/base; maps bind to the receiving owner revision. |
| Browser dropdown header | Browser ESM/fetch and native Popover; core-only linked titles, one owner per page and the same prefix mode on its real inline full-results route. Optional explicit modal handoff additionally requires native `dialog`. No source/snippet/facet/section provider or Web Crypto requirement. |

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

## LocalSearch source migration

Use `convertLocalSearchSnapshot(bytes)` from `/integrations/localsearch` to convert a supported companion source export before rebuilding a separate Raveldex engine. It checks the snapshot, checksum and supported data mapping.

The supported input identity is companion-v1, format 1, MiniSearch 7.2.0. Arbitrary MiniSearch indexes, worker messages and storage rows are rejected. Conversion needs `crypto.subtle`, accepts at most 32 MiB and includes bounded synchronous work. It is not a queued, cancellable engine operation.

The returned plan contains `{ configuration, records, origin, sourceRevision, returnFields, identity, differences }`. Read `identity` and `differences` for changes in analysis and ranking. `origin` and `sourceRevision` describe the old collection; they do not become the new engine's revision or a storage generation.

The [migration recipe](examples/migration.mjs) rebuilds a separate engine with bounded `addMany` calls, inspects it and disposes it. In your application, switch to the new engine only after the whole rebuild succeeds. Each batch is atomic, but the entire migration is not one transaction.

`MigrationError` has sanitized `code` and `details: { reason, nativeCode? }`. `MIGRATION_ERROR_CODES` is `INVALID_BYTES`, `INVALID_SNAPSHOT`, `INCOMPATIBLE_SNAPSHOT`, `NONCANONICAL_SNAPSHOT`, `CHECKSUM_MISMATCH`, `NATIVE_INCOMPATIBLE`, `CAPABILITY_REQUIRED`. The entry exports `MigrationErrorCode`, `MigrationErrorDetails`, `MigrationReason`, `LocalSearchMigration`, `LocalSearchMigrationIdentity` and `LocalSearchMigrationOrigin`. Foreign indexes, scores, live handles and namespaces are never reused. The repository [migration guide](https://github.com/vmitsaras/raveldex/blob/main/docs/migration/LOCALSEARCH.md) gives mapping and provenance details.
