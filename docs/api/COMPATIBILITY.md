# Runtime and integration requirements

## Versioning and public contracts

The library packages use version `1.0.0` and follow [Semantic Versioning](https://semver.org/): compatible fixes use patch releases, compatible additions use minor releases, and incompatible documented API or behavior changes require a major release and migration notes. Published bytes are never replaced under the same version.

The explicit exports map, declarations and documented CSS hooks define the supported surface. Internal paths and scheduler/test instrumentation are implementation details. Exact totals, deterministic order at a revision/configuration, atomic writes, sanitized errors, original UTF-16 coordinates, explicit capability failures and resource bounds are documented contracts. Scores depend on the indexed corpus and configuration.

## Modules and runtimes

Use Raveldex in an ESM application. JavaScript imports and TypeScript declarations are available through the public package exports. Do not import implementation files from `dist/` or `src/`; there is no CommonJS entry.

| Package or feature | Requirement |
| --- | --- |
| Core and English analyzer | Node `>=22` for Node applications. Core has no DOM dependency. |
| Astro integration | Node `>=22.12.0`, exact core peer `1.0.0`; the build hook requires Astro `7.3.2`. |
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

## Optional format compatibility

Identifier analysis uses reserved `code-identifiers-v1` with `identifier-tokenizer`, separate from the general one-to-one transform role. Other raw-tokenizer IDs and one-to-one handles impersonating that reserved ID reject at configuration capture. Selected code positions use an explicit `raveldex-positions-v2` payload within the existing codec family, bound jointly to that selected analyzer and exact module/worker policy. Dense v1 parsing remains strict; prior runtimes without this role/pack cannot accept the new configuration. Basic and English position data retain their v1 shape. Reindexing/source recovery and exact native qualification requirements remain explicit.

Literal/infix matching is an explicit raw-source predicate and does not depend on analyzer normalization. Its policy/fields/work/range/output identity participates in normal worker/snapshot compatibility; source/native codecs are unchanged. Source providers are required separately. Original ranges are code-point-aligned UTF-16 spans and can divide a grapheme; no normalized-to-source mapping, token positions, case-insensitive equivalence or native browser qualification is introduced.

Ordered proximity uses protocol-v1 `ordered-token-groups` as an explicit leaf-refinement kind. Core owns raw alternative capture, one-time selected analysis and native canonical groups; immutable groups/maxGap are supplied only to ordered handlers. Existing exact-token-sequence contexts and strict phrase semantics stay unchanged. Position requirements and `ordered-adjacent-gap-v1` policy/options bind worker identity; existing position/source/native codecs are reused. Proximity requires exact compatible providers; no migration or universal runtime qualification is implied. Token evidence/snippets explicitly refuse queries containing ordered leaves.

Query syntax provides caller-side `explicit-boolean-fields-v1` syntax compilation through a separate public entry. It returns existing raw native ASTs, which destinations validate normally; it adds no worker registration, protocol role, codec or snapshot identity. Parser configuration is explicitly supplied and captured separately; parsing does not prepare live providers. Grammar/diagnostic policy is versioned independently of native eligibility/scoring. Ordinary string/UI behavior and core implementation remain unchanged.
