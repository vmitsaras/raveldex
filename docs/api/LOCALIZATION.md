# Translate a consumer interface

Choose message bundles explicitly when mounting a consumer surface. Raveldex does not detect a locale from `lang`, the browser or a global registry. UI language does not change tokenization, query mode, indexed content or the analyzer. Keep your existing engine and surface contract.

Copy [the complete German example](examples/consumer-messages.de.mjs) into your application and import it by a relative path. It contains all current keys, including optional states, and has `Required<…Messages>` JSDoc checks against public types. Run JavaScript type checking in your application when updating the package so new keys cannot silently fall back to English. Review wording with your own audience; automated checks establish completeness and behavior, not translation quality.

These are option fragments for the complete integrations in [HOSTS](HOSTS.md); retain their required root, engine/controller, records and lifecycle setup:

```js
import { german } from './consumer-messages.de.mjs';

const inlineText = { messages: german.inline }; // No facets.
const inlineFilterText = { messages: german.inlineWithFilters }; // Facets configured.
const modalText = { messages: german.inlineWithFilters, modalMessages: german.modal }; // Same facet choice as inline.
const dropdownText = { messages: german.dropdown };
const directoryText = { messages: german.directory };
const cardsText = { messages: german.directory, imageUnavailable: german.imageUnavailable };
```

Use `german.inline` for a modal without facets. Set the application-authored modal trigger label, page/root `lang` and `dir`, field/group/value labels, results and other surrounding content in the same language. The bundle does not translate your content. Keep the optional CSS imports separate.

## Complete inventory

Inline and modal share **35** `messages` keys; modal additionally needs its four `modalMessages`. Dropdown has **17** keys. Directory and all rich layouts share **29** keys, with a separate card image failure option. Each key below is explicit in the German example, including currently unused optional features.

| Surface / role | Keys |
| --- | --- |
| Inline/modal controls and assistive names | `label`, `placeholder`, `submit`, `clear`, `resultsLabel`, `paginationLabel` |
| Inline/modal states and recovery | `idle`, `searching`, `composing`, `noResults`, `noResultsFiltered`, `resultsOne`, `resultsMany`, `error`, `retry`, `revisionChanged` |
| Inline/modal paging and append | `loadMore`, `newResults`, `resultsAdded`, `previous`, `next`, `pageSummary`, `windowLimit` |
| Inline/modal facets | `all`, `emptyValue`, `nullValue`, `missingValue`, `unlistedValue`, `facetSummary` |
| Inline/modal snippets and sections | `snippetOmissions`, `snippetLimits`, `sectionCaption`, `sectionOmissions`, `sectionUnavailable`, `sectionStale` |
| Modal shell (`modalMessages`) | `title`, `close`, `escapeHint`, `shortcutHint` |
| Dropdown controls, assistive names and guidance | `label`, `placeholder`, `submit`, `clear`, `resultsLabel`, `fullResults`, `keyboardHint` |
| Dropdown states and recovery | `idle`, `composing`, `searching`, `noResults`, `resultsOne`, `resultsMany`, `error`, `retry`, `closed`, `noSpace` |
| Directory/cards controls, assistive names and guidance | `label`, `placeholder`, `submit`, `clear`, `filters`, `closeFilters`, `countHint`, `selectedFilters`, `remove`, `resultsLabel`, `previous`, `next`, `page` |
| Directory/cards counts, states and recovery | `unknownCount`, `emptyValue`, `omittedCounts`, `idle`, `waiting`, `composing`, `searching`, `noResults`, `noResultsFiltered`, `noResultsBrowse`, `resultOne`, `results`, `error`, `stale`, `retry`, `invalid` |
| Cards extra top-level option | `imageUnavailable`; informative failure also includes the authored image alternative, decorative failure is silent |

`label` names the input/form; result and pagination labels name their regions/navigation; named chip removal and keyboard hints are included rather than translated separately through ARIA. Library text is inserted as plain text, never HTML. Native browser/OS control text and key names are outside the bundle.

Translate authored document titles, snippets/source text, page/section headings, directory group/value labels and card excerpts/categories/breadcrumbs/dates/field names/values/image alternatives separately. Inline facet strings come from indexed values; there is no inline value-alias API. Directory can map allowed values through `groups[].values[].label`; unmapped values retain their raw strings. Card dates are already formatted display text. See [result content](RESULT_CONTENT.md) for source/display boundaries.

## Fallback, capture and supported changes

- A partial bundle overrides only its own keys; every other key uses the surface's English default. Bundles are not inherited between surfaces. Partial overrides suit small customizations, but a complete translated interface needs the full relevant bundle, modal shell, card failure text and authored labels.
- Existing overrides keep precedence. Inline's facet-dependent default Clear/idle guidance applies only when those keys are omitted. An inline `noResults` override also supplies an omitted `noResultsFiltered`. A directory `noResults` override also supplies omitted `noResultsFiltered` and `noResultsBrowse`. Individually supplied variants win. This compatibility behavior does not fill other missing translations.
- Messages are captured when mounted. Changing the caller's object does not update the interface. Repeating a same-kind mount returns the existing handle; it is not a language setter. Card `setPresentation()` changes layout/density/images only.
- A deliberate language change uses destroy/remount. Finish composition, or deliberately discard it through teardown as part of the user's switch. Inline/dropdown `search(text)` still defers during composition; it is not an IME-cancellation method. Prefer closing the modal first. The application owns focus handoff and any query/filter restoration: new input nodes do not retain focus, caret, selection or a composing session. Do not promise seamless in-place language switching. See the [CMS lifecycle sequence](CMS_REFRESH.md).
- A directory/card view can remount over the same live controller and current snapshot without querying, changing the page or writing URL state. Keep its URL binding/controller alive. Inline/dropdown remount starts idle and does not preserve submitted text/facets automatically; an explicit search to restore it is a new query. Modal retains its normal closed/open query contract. Destroy the old view before mounting the new one; do not dispose a borrowed engine/controller just to change labels.

Supply own data properties on plain or null-prototype records. Unknown keys/accessors and invalid strings refuse before replacing authored content. A supplied message must be well-formed, nonblank plain text, at most 512 UTF-16 units; use omission rather than `undefined` or an empty string for fallback. Directory labels also reject control-only text. Keep translated helper text concise enough to fit the same bound.

## Tokens, numbers and grammar

Only the following messages interpolate tokens. All other keys are literal strings. Unknown or unavailable tokens remain literal, including `{code}` in a non-error message; there is no global interpolation, HTML, callback or ICU syntax. The submitted `{query}` is a safe preview of at most 160 Unicode code points plus an ellipsis; original input/native queries stay complete.

| Surface / key | Supplied tokens |
| --- | --- |
| Inline `noResults`, `noResultsFiltered`; dropdown `noResults`; directory's three empty variants | `{query}` |
| Inline/dropdown `resultsOne`, `resultsMany` | `{total}`, `{count}` |
| Inline `resultsAdded` | `{added}`, `{start}`, `{end}`, `{total}`, `{count}` |
| Inline `pageSummary` | `{start}`, `{end}`, `{total}`, `{count}` |
| Inline `windowLimit` | `{count}`, `{remaining}`, `{total}` |
| Inline `unlistedValue` | `{value}` |
| Inline `facetSummary` | `{total}`, `{omitted}` |
| Inline `snippetOmissions` | `{count}` |
| Each surface's `error` | `{code}` (stable diagnostic identifier, not translated by the library) |
| Directory `remove` | `{group}`, `{value}` |
| Directory `omittedCounts` | `{shown}`, `{total}` |
| Directory `resultOne`, `results` | `{total}`, `{start}`, `{end}` |
| Directory `page` | `{page}`, `{pages}` |

Numbers use ordinary JavaScript decimal conversion (`String(number)`), including option counts and page/range text: no grouping separators, localized digits or `Intl.NumberFormat`. Singular result text is chosen only when the **exact total is 1** (`resultsOne` or directory `resultOne`); zero uses the relevant empty message, all other positive totals use `resultsMany` or directory `results`. Append and omission messages have no plural-category switch. Use count-neutral wording when that distinction is insufficient for the language, such as “Ergebnisse: {total}”.

This slice keeps the existing two-branch result contract. It adds no locale, formatter, plural-rule, translation callback or analyzer field. Languages requiring additional grammar/digit rules need a separately selected API decision; setting `lang` or translating templates does not provide those rules. Fixed count parentheses, range dashes, snippet ellipses and breadcrumb separators are punctuation, not configurable language services.

## Check the installed interface

Check complete and partial bundles, literal hostile-looking text, capture after caller mutation, zero/one/many results, empty/failure/retry, long RTL labels, keyboard focus, and teardown/remount with an explicit focus handoff. Include optional facets/snippet/section notices when your application enables them. Keep no-automatic-query idle/reset behavior and the directory's deliberate Clear all browse. These automated checks do not establish translation quality, human screen-reader speech, physical input or actual browser zoom.
