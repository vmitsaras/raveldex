# Public API reference

This reference describes the private `0.1.0-rc.0` candidate. Install its local tarball as described in the [root quick start](../../README.md). All JavaScript entries are ESM and include TypeScript declarations. There is no CommonJS entry or supported deep import into `dist/` or `src/`.

## Export map

Prefix every entry below with `@vmitsaras/raveldex`. The root entry is the package name itself. Types are erased at runtime; factories listed here do not install themselves by being imported.

| Entry | Runtime exports / purpose | Reference |
| --- | --- | --- |
| root | `createRaveldex`, `RaveldexError`, `ERROR_CODES` | [Core](CORE.md) |
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
| `/addons/ui` | `mountRaveldexUI` | [DOM UI](HOSTS.md#native-dom-ui-and-css) |
| `/addons/ui/styles.css` | Independent CSS asset | [CSS](HOSTS.md#native-dom-ui-and-css) |
| `/adapters/worker` | `createWorkerRaveldex`, `WorkerAdapterError`, `WORKER_ERROR_CODES` | [Worker client](HOSTS.md#one-owner-module-worker) |
| `/adapters/worker/host` | `serveRaveldexWorker` | [Ordinary worker host](HOSTS.md#one-owner-module-worker) |
| `/adapters/snapshots` | `createSnapshots`, `createSnapshotRaveldex`, `currentNodeSnapshotEnvironment`, `SnapshotAdapterError`, `SNAPSHOT_REASONS` | [Snapshots](HOSTS.md#source-and-native-snapshots) |
| `/adapters/indexeddb` | `createIndexedDBPersistence`, `IndexedDBAdapterError`, `INDEXEDDB_ERROR_CODES` | [Persistence](HOSTS.md#indexeddb-persistence-and-recovery) |
| `/adapters/worker/snapshots` | `createWorkerSnapshots` | [Worker source bridge](HOSTS.md#source-and-native-snapshots) |
| `/adapters/worker/snapshots/host` | `serveSnapshotRaveldexWorker` | [Snapshot worker host](HOSTS.md#source-and-native-snapshots) |
| `/integrations/localsearch` | `convertLocalSearchSnapshot`, `MigrationError`, `MIGRATION_ERROR_CODES` | [Source migration](HOSTS.md#localsearch-source-migration) |

## Choose the cost you need

Core alone stores frequencies, lengths, statistics and declared equality metadata. It retains no original text, token positions or offsets. A source provider retains selected original fields. A position provider retains selected token occurrences; offsets are a separate field selection. A registration is supplied in `Configuration.addons` at owner creation. Registration/provider changes require a new owner, not a live retrofit.

Filters and facets read core metadata and add no metadata side index. Inspector and original evidence are requested per search. The UI borrows a caller-owned engine and display records. Worker, snapshots and storage are separate explicit host selections. Importing core performs no network request, DOM access, worker creation, database open, timer initialization or automatic indexing.

[Runnable examples](examples/README.md) use these public entries and are executed from the installed candidate. [Support and limitations](../support/RX-4003.md) records what the evidence establishes. [Compatibility policy](../release/COMPATIBILITY.md) owns version, snapshot and worker compatibility promises.
