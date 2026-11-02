# Runtime and integration requirements

## Modules and runtimes

Use Raveldex in an ESM application. JavaScript imports and TypeScript declarations are available through the public package exports. Do not import implementation files from `dist/` or `src/`; there is no CommonJS entry.

| Package or feature | Requirement |
| --- | --- |
| Core and English analyzer | Node `>=22` for Node applications. Core has no DOM dependency. |
| Astro integration | Node `>=22.12.0`, exact core peer `0.1.0-rc.0`; the build hook requires Astro `7.3.2`. |
| Native DOM UI | A browser DOM and a bundler or static build that resolves the public ESM imports. Import UI CSS separately. |
| Snippets | Usable `Intl.Segmenter` for grapheme-safe display boundaries. |
| Worker adapter | Module workers and matching client/host configuration and add-ons. |
| IndexedDB adapter | An available IndexedDB factory and an application-selected database/namespace. |

You can import core without starting a UI, worker, database or network request. Create only the integrations your application needs.

## Analyzer compatibility

The default analyzer applies NFKC normalization and lowercase. It keeps accents significant, so `cafe` and `café` can give different results. Choose [English analysis](ENGLISH.md) for English word forms, or [identifier analysis](IDENTIFIERS.md) for code names, when those rules fit your content. Rebuild the index if you change its analyzer.

For a worker, use matching analyzer, schema, limits and capabilities on both sides. Install functions and live add-on handles inside each host; they cannot be sent as cloneable configuration.

## Snapshot compatibility

Use source snapshots when rebuilding in a browser or worker. Select source providers for every text field you need to export. Restore runs in the receiving analyzer and runtime, so tokenization and scores may differ across runtimes.

Native snapshots require an application-supplied `NativeSnapshotQualification` at engine creation and the exact declared Node/V8/ICU/Unicode/platform/architecture environment. Version detection alone does not establish that qualification. Browser and worker native loading is unavailable. See [snapshot setup and methods](HOSTS.md#source-and-native-snapshots).

## UI integration

The UI uses native forms, selects, links and dialogs. Result updates do not deliberately move focus. Closing Inspector returns focus to the button that opened it, while that button remains connected.

Spoken status messages depend on the browser and screen reader, and typing feedback can interrupt them. Check your application's target combination without requiring users to change their screen-reader settings.

See [keyboard, focus and status](HOSTS.md#keyboard-focus-and-status) and [practical limits](LIMITATIONS.md).
