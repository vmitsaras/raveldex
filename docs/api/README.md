# Public API reference

Start with [Raveldex adoption and installation](GETTING_STARTED.md), then choose a [consumer interface and its capabilities](HOSTS.md#consumer-search-interfaces), or use core with your own UI. This page lists exact imports; the developer Workbench is separately identified below. Every JavaScript entry uses ESM and includes TypeScript declarations. Use the public paths listed here rather than importing from `dist/` or `src/`. CommonJS is not supported.

## Export map

Add `@vmitsaras/raveldex` before each subpath below. For example, `/addons/ui` means `@vmitsaras/raveldex/addons/ui`; the root entry is just `@vmitsaras/raveldex`. Importing a factory makes it available to call but does not enable its feature. TypeScript types are removed at runtime.

| Entry | Runtime exports / purpose | Reference |
| --- | --- | --- |
| root | `createRaveldex`, `RaveldexError`, `ERROR_CODES` | [Core](CORE.md) |
| `/addons/patch` | `createPatch` | [Explicit record patches](RECORD_PATCH.md) |
| `/addons/query-syntax` | `createQuerySyntax`, `QuerySyntaxError`, `QUERY_SYNTAX_POLICY`, `QUERY_SYNTAX_ERROR_CODES` | [Explicit query syntax](QUERY_SYNTAX.md) |
| `/addons/proximity` | `createProximity`, `PROXIMITY_POLICY` | [Ordered proximity](PROXIMITY.md) |
| `/addons/literal` | `createLiteral`, `LITERAL_POLICY` | [Literal and infix](LITERAL.md) |
| `/addons/identifiers` | `createIdentifierAnalyzer`, `IDENTIFIER_ANALYZER` | [Code and identifiers](IDENTIFIERS.md) |
| `/integrations/languages/english` | `createEnglishAnalyzer`, `ENGLISH_ANALYZER` | [English morphology](ENGLISH.md) |
| `/addons/synonyms` | `createSynonyms`, `SYNONYMS_POLICY` | [Directional synonyms](SYNONYMS.md) |
| `/addons/suggestions` | `createSuggestions`, `SUGGESTIONS_POLICY` | [Token suggestions](SUGGESTIONS.md) |
| `/addons/typo` | `createTypoTolerance`, `TYPO_POLICY` | [Bounded typo tolerance](TYPO.md) |
| `/addons/phrases` | `createSourceProvider`, `createSourcePhrases` | [Source phrases](ADDONS.md#source-positions-and-phrases) |
| `/addons/phrases/source` | `createSourceProvider` without phrase evaluation | [Source](ADDONS.md#source-positions-and-phrases) |
| `/addons/positions` | `createPositionProvider` without phrase evaluation | [Positions](ADDONS.md#source-positions-and-phrases) |
| `/addons/phrases/positions` | `createPositionPhrases` | [Position phrases](ADDONS.md#source-positions-and-phrases) |
| `/addons/phrases/mixed` | `createPhrases` | [Mixed phrases](ADDONS.md#source-positions-and-phrases) |
| `/addons/filters` | `createFilters` | [Typed predicates](ADDONS.md#typed-filters-and-exact-facets) |
| `/addons/facets` | `createFacets` | [Facets](ADDONS.md#typed-filters-and-exact-facets) |
| `/addons/inspector` | `createInspector`, `exportDiagnostics` | [Native Inspector](ADDONS.md#native-inspector) |
| `/addons/evidence` | `createMatchEvidence` | [Original ranges](ADDONS.md#original-ranges-and-snippets) |
| `/addons/snippets` | `createSnippetEvidence` | [Snippets](ADDONS.md#original-ranges-and-snippets) |
| `/addons/sections` | `createSectionEvidence` and readonly page/section types | [Anchored page context](ADDONS.md#anchored-page-context) |
| `/addons/ui` | `mountRaveldexUI` — developer Workbench | [Workbench](HOSTS.md#native-dom-ui-and-css) |
| `/addons/ui/styles.css` | Independent CSS asset | [CSS](HOSTS.md#native-dom-ui-and-css) |
| `/addons/ui/inline` | `mountRaveldexInline` | [Inline foundation](HOSTS.md#inline-search-foundation) |
| `/addons/ui/inline.css` | Independent inline CSS asset | [Inline styling](HOSTS.md#inline-text-and-styling) |
| `/addons/ui/modal` | `mountRaveldexModal` and readonly modal types | [Documentation modal](HOSTS.md#documentation-search-modal) |
| `/addons/ui/modal.css` | Explicit modal CSS, including shared inline CSS | [Modal styling](HOSTS.md#documentation-search-modal) |
| `/addons/ui/dropdown` | `mountRaveldexDropdown` and readonly dropdown types | [Compact dropdown](HOSTS.md#compact-dropdown-search) |
| `/addons/ui/dropdown.css` | Independent dropdown CSS asset | [Dropdown styling](HOSTS.md#compact-dropdown-search) |
| `/addons/ui/directory` | `createDirectory`, `connectDirectoryURL` and readonly state/URL types | [Directory queries and URL state](HOSTS.md#directory-queries-and-url-state) |
| `/addons/ui/directory/view` | `mountRaveldexDirectory` and readonly view types | [Directory controls](HOSTS.md#directory-controls-and-styling) |
| `/addons/ui/directory.css` | Independent directory CSS asset | [Directory styling](HOSTS.md#directory-controls-and-styling) |
| `/addons/ui/directory/cards` | `mountRaveldexDirectoryCards` and readonly display/presentation types | [Rich directory results](HOSTS.md#rich-directory-results) |
| `/addons/ui/directory-cards.css` | Explicit rich-result CSS, used with directory CSS | [Rich directory styling](HOSTS.md#rich-directory-results) |
| `/adapters/worker` | `createWorkerRaveldex`, `WorkerAdapterError`, `WORKER_ERROR_CODES` | [Worker client](HOSTS.md#one-owner-module-worker) |
| `/adapters/worker/host` | `serveRaveldexWorker` | [Ordinary worker host](HOSTS.md#one-owner-module-worker) |
| `/adapters/snapshots` | `createSnapshots`, `createSnapshotRaveldex`, `currentNodeSnapshotEnvironment`, `SnapshotAdapterError`, `SNAPSHOT_REASONS` | [Snapshots](HOSTS.md#source-and-native-snapshots) |
| `/adapters/indexeddb` | `createIndexedDBPersistence`, `IndexedDBAdapterError`, `INDEXEDDB_ERROR_CODES` | [Persistence](HOSTS.md#indexeddb-persistence-and-recovery) |
| `/adapters/worker/snapshots` | `createWorkerSnapshots` | [Worker source bridge](HOSTS.md#source-and-native-snapshots) |
| `/adapters/worker/snapshots/host` | `serveSnapshotRaveldexWorker` | [Snapshot worker host](HOSTS.md#source-and-native-snapshots) |
| `/integrations/localsearch` | `convertLocalSearchSnapshot`, `MigrationError`, `MIGRATION_ERROR_CODES` | [Source migration](HOSTS.md#localsearch-source-migration) |

## Choose the cost you need

Core stores the information needed for word matching and ranking, plus your declared equality metadata. Choose extra data only when you need it:

- A source provider keeps the original text of selected fields.
- A position provider keeps token locations. Select offset fields separately if you need original character ranges.
- Core alone keeps neither original text, positions nor offsets.

Pass the registrations in `Configuration.addons` when creating the engine. To change providers later, create a new engine and rebuild.

Filters and facets read existing core metadata without adding another metadata index. Request Inspector or original match evidence only for searches that need it. The UI uses an engine you own and a display list you provide.

Set up workers, snapshots and storage separately. Importing core makes no network request, accesses no DOM, creates no worker, opens no database and starts no timer or automatic indexing.

[Runnable examples](examples/README.md) use these public entries. Read [compatibility](COMPATIBILITY.md) for host requirements and [practical limits](LIMITATIONS.md) for matching and recovery behavior.

## Separate static-build package

Install [`@vmitsaras/raveldex-astro`](STATIC_ASTRO.md) separately to build search files during a static build and load them on demand. It needs the matching core version and, for its build hook, the optional Astro peer. It is not an export of the core package.


## Complete search interfaces

The [solution chooser](../../examples/README.md) links five presentations and eight installed browser/Astro projects. Compare the explicit data/capability, loading and CSS requirements before copying one. [Starter adoption](HOSTS.md#starter-adoption-and-local-checks) explains shared query/paging behavior, keyboard recovery and ownership. Core and the UI remain separately selected; images, sections, URL replay and workers require their own explicit choices.

## Installation and evaluation routes

Use [Getting started](GETTING_STARTED.md) for installation, [Core](CORE.md) for records and queries, and [UI and host integrations](HOSTS.md) for browser controls, workers and storage. If you prefer to learn by running code, start with the [example modules](examples/README.md).

The separately installable `@vmitsaras/raveldex-english` uses the same analyzer policy as the convenience subpath; choose one factory import. See [English installation](ENGLISH.md#separate-package). The Astro integration is a separate package; see [static search and Astro](STATIC_ASTRO.md).
