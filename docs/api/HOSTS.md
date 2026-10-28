# UI, workers, snapshots, storage and migration

These optional entries leave host ownership explicit. Importing them does not construct a worker, mount UI, open a database, restore state or start a migration. The [example modules](examples/README.md) are complete small scenarios using public imports.

## Native DOM UI and CSS

`mountRaveldexUI(options: UIOptions): UIHandle` from `/addons/ui` borrows an engine and mounts into a caller-supplied `HTMLElement`. CSS is a separate import for a bundler that handles CSS:

```js
import { mountRaveldexUI } from '@vmitsaras/raveldex/addons/ui';
import '@vmitsaras/raveldex/addons/ui/styles.css';
```

| `UIOptions` | Contract |
| --- | --- |
| `root`, `engine`, `documents` | Required root, borrowed `Raveldex` and captured readonly `UIDocument[]`. Each display document is `{ id, title, url }`; IDs are the index/display join. URLs must resolve to HTTP(S) without credentials. |
| `facets?` | Up to eight `UIFacet` selections `{ field, label }`; requires installed exact string facets. |
| `snippetFields?` | Explicit fields for installed snippets and source providers. |
| `mode?` | `'text'` (default) or `'phrase'` (requires phrase capability for selected fields). |
| `pageSize?`, `debounceMs?`, `label?` | Defaults 5, 150 ms and `Search documentation`; page size 1–100 and debounce 0–2,000 ms. Core's configured page bounds still apply. |

`UIHandle.search(): Promise<void>` flushes debounce and presents current controls; it resolves after presentation. `UIHandle.destroy(): void` is idempotent, cancels UI work, detaches resources and restores the original Node objects. It does not dispose the borrowed engine. Mounting an already mounted root returns its existing handle. Dispose the engine separately after destroying the UI.

The UI uses native form/select/dialog controls, safe text insertion, explicit marks, visible focus and reduced-motion CSS. It suppresses pending composition queries, cancels obsolete requests and ignores stale responses. Empty controls explicitly browse all documents; nonempty text uses the selected text/phrase mode. It presents exact totals/pages, empty/error/retry states and requested factual Inspector data. It captures display records at mount; replacing that allowlist requires destroy/remount. The [browser example](examples/browser.mjs) includes explicit UI search, teardown and source persistence. Automated accessibility checks and selected human observations have different scopes; see [support](../support/RX-4003.md).

## One-owner module worker

`createWorkerRaveldex(options: WorkerOptions): Promise<WorkerRaveldex>` from `/adapters/worker` takes `{ worker, configuration, ownership: 'owned' | 'external', sameHost: true, maxMessageBytes?, responseTimeoutMs? }`. The caller constructs a module Worker. A successful handshake establishes one complete native owner, matching implementation/analyzer/model and explicitly compatible registrations. The ordinary default analyzer remains unqualified; `sameHost: true` declares the browser main-thread/own-worker pairing and does not qualify other hosts.

The ordinary worker module entry explicitly calls `serveRaveldexWorker(scope, options?)` from `/adapters/worker/host`. `WorkerHostOptions` is `{ addons?, maxMessageBytes? }`; install matching first-party registration choices locally in both client configuration and host options. Functions/live add-on handles are not sent as cloneable configuration. `WorkerScope` has `postMessage`, `addEventListener` and `removeEventListener`; `WorkerEndpoint` also requires `terminate`. The host returns a `WorkerHostHandle` with asynchronous `dispose()`.

`WorkerRaveldex` has ordinary methods plus `reconcile(operationId)` and `destroy()` (the disposal alias). Mutation methods return `MutationPromise`, a Promise with a captured `operationId`. `MutationReceipt` is `{ operationId, status: 'pending' | 'expired' }`, `{ operationId, status: 'committed', result }` or `{ operationId, status: 'rejected', error: WireError }`. Reconciliation uses the same owner/session and a bounded 256-receipt window. It is not durable deduplication across worker loss.

Default/maximum message size is 8 MiB (configurable down to 1 KiB); transport structure is also bounded. At most 64 requests may be pending. Default response timeout is 65,000 ms, configurable from 1 through 120,000 ms; engine work/deadline bounds remain independent. Transport loss, timeout or late replies can leave a mutation's outcome unknown. Do not blindly retry an uncertain add/replace/remove; reconcile while the owner survives, or explicitly rebuild a new owner from authoritative source. Expired receipts do not establish success or failure.

`WorkerAdapterError` has `code`, sanitized `details` and optional `operationId`; `WORKER_ERROR_CODES` includes `INVALID_TRANSPORT`, `TRANSPORT_LIMIT`, `INCOMPATIBLE_WORKER`, `TIMEOUT`, `TERMINATED`, `STARTUP_FAILED`, `OUTCOME_UNKNOWN` and `DISPOSED`. Authoritative native errors remain `RaveldexError`; snapshot errors carry their reason. `WireError` preserves the declared category/code rather than serializing an arbitrary Error/cause. `WorkerErrorCode` and `WorkerErrorDetails` are exported types.

Destroy/dispose attempts the owner acknowledgement and releases client listeners/pending work; an owned endpoint is terminated, while an external endpoint remains caller-owned. An acknowledgement timeout remains an error even after client cleanup. No worker starts on import, and no hidden fallback executes searches on the main thread.

## Source and native snapshots

`createSnapshots(engine, options?: SnapshotOptions): Snapshots` from `/adapters/snapshots` borrows a supported direct engine; it adds no method to the core facade. Options are `{ maxEncodedBytes? }`, default/maximum 64 MiB and minimum 1 KiB. The returned methods are `exportSource(options?)`, `exportNative(options?)` and `restore(encoded: string, options?)`, all promises with core mutation signal/deadline options.

| Format | Requirements / meaning |
| --- | --- |
| `raveldex-source` | Selected originals for every schema text field; exports owned source/configuration and rebuilds under the receiving analyzer. Does not promise prior membership, rank or score equivalence across environments. |
| `raveldex-native` | Explicit exact-Node-runtime qualification from owner creation; validates compatible native index/statistics/provider structures, configuration, analyzer/model, codecs and limits. It is not an arbitrary engine dump or a browser portability promise. |

Both exports are versioned JSON strings with bounded validation and corruption checks. Checksums detect corruption, not sender authenticity. A successful restore atomically replaces complete receiving state at its next local revision; origin revision is informational. `SnapshotRestoreResult` is `{ format, originRevision, revision, reindexed, receivingAnalyzer }`, with `reindexed: true` for source rebuilds and false for native state. Precommit cancellation, corruption, incompatible configuration or work/deadline refusal preserves prior state. A whole-source rebuild can exceed its budget even when the original collection was built successfully in batches.

For a source-only application, ordinary `createRaveldex` plus a source provider and `createSnapshots` suffices. For native state, use `createSnapshotRaveldex(configuration, { nativeQualification }): Raveldex` at creation. `NativeSnapshotQualification` is `{ profileId, scope: 'exact-node-runtime', environment, evidence: string[] }`. `NodeSnapshotEnvironment` includes `{ runtime: 'node', version, v8, icu, unicode, platform, arch }`. `currentNodeSnapshotEnvironment()` lazily reads that exact running identity; it supplies no qualification evidence by itself. Evidence references are trusted application declarations, not executable proofs. An ordinary unqualified owner cannot be promoted by attaching `createSnapshots` later.

[snapshots.mjs](examples/snapshots.mjs) takes the application's declaration as an argument and exercises source and native round trips. The receiving native owner must match the exact declared profile/environment/evidence and compatible configuration. Qualification fixtures cover their recorded inputs/runtime; neither matching versions nor the separately modified memory profiler qualifies all Unicode or all normal Node runtimes.

`SnapshotAdapterError extends RaveldexError` adds `reason: SnapshotReason`. `SNAPSHOT_REASONS` is `MALFORMED_SNAPSHOT`, `ENCODED_LIMIT_EXCEEDED`, `INTEGRITY_MISMATCH`, `UNSUPPORTED_FORMAT`, `UNSUPPORTED_CODEC`, `SCHEMA_MISMATCH`, `ANALYZER_MISMATCH`, `RANKING_MISMATCH`, `CAPABILITY_MISMATCH`, `INDEX_DETAIL_MISMATCH`, `LIMITS_MISMATCH`, `SOURCE_UNAVAILABLE`, `UNQUALIFIED_PROFILE`, `PROFILE_MISMATCH`, `INVALID_NATIVE_STATE`, `UNSUPPORTED_ENGINE`. Reasons distinguish compatibility from the ordinary error code.

Browser workers use the separate source-only bridge: `createWorkerSnapshots(engine)` from `/adapters/worker/snapshots` and `serveSnapshotRaveldexWorker(scope, options?)` from `/adapters/worker/snapshots/host`. [worker.mjs](examples/worker.mjs) and [worker-host.mjs](examples/worker-host.mjs) show a matched pair. `WorkerSnapshots` exposes `exportSource`, `restore` and its own `reconcile`. Restore returns `SnapshotRestorePromise` with `operationId`; its `SnapshotRestoreReceipt` is `pending`, `expired`, `committed` with a restore result, or `rejected` with a wire error. Pending/expired cannot resolve an unknown outcome. Ordinary mutation reconciliation is separate. Browser/worker native export and restore remain unavailable.

The snapshot entry also exports `SnapshotEngineOptions`, `SnapshotOptions`, `SnapshotFormat`, `SnapshotRestoreResult` and `Snapshots` types. Worker snapshot/client/host types are available from their corresponding subpaths; no private control-channel import is supported.

## IndexedDB persistence and recovery

`createIndexedDBPersistence(snapshots: PersistenceSnapshots, options: IndexedDBOptions): IndexedDBPersistence` from `/adapters/indexeddb` borrows source restore/export handles (optionally native export) and owns its database connections/actions. Required `{ databaseName, namespace }` names an adapter-owned database, never an unrelated application database. Optional `{ indexedDB?, format?: 'source' | 'native', openTimeoutMs?, operationTimeoutMs? }` selects a live factory or lazy host lookup and export format (default source). Native format needs the qualified direct native path; the worker bridge remains source-only.

| Method | Required options / result |
| --- | --- |
| `save(options: PersistenceWriteOptions)` | `{ expectedGeneration: string | null, signal?, deadlineMs? }`; returns `PersistenceSaveResult` `{ generation, format, encodedBytes, durable: true }`. Null explicitly expects an empty namespace. |
| `load(options?: PersistenceOptions)` | `{ signal?, deadlineMs? }`; returns `PersistenceLoadResult` `{ status: 'missing', generation: null }` or `{ status: 'restored', generation, restore }`. |
| `erase(options: PersistenceWriteOptions)` | Same expected-generation requirement; returns `PersistenceEraseResult` `{ erased, generation: null, durable: true }` after deleting the namespace's snapshot and metadata rows. |
| `dispose()` | Releases connections/actions without erasing storage or disposing the borrowed engine. |

Writes use optimistic generation comparison. Keep the returned generation and supply it on the next save/erase; `GENERATION_CONFLICT` asks the application to resolve concurrent ownership, not overwrite silently. A loaded generation describes the selected readonly snapshot, not a lease on the later database head. `durable: true` means observed strict-hint IndexedDB transaction completion, not tested power-loss/eviction durability. A storage commit and a later engine restore are separate outcomes.

Open timeout defaults to 5,000 ms (maximum 30,000); action timeout defaults to 30,000 ms (maximum 60,000), with at most 64 pending actions and a 64 MiB encoded ceiling. Actions include queue time, encoding and restore. A timeout during an uncertain restore can return `OUTCOME_UNKNOWN`, including selected generation and operation identity when available. Do not automatically repeat that restore or call it rolled back. Use worker snapshot receipts when available, inspect the surviving owner separately, or explicitly recover into a new owner from authoritative data.

`IndexedDBAdapterError` is separate from core/snapshot errors, with `code` and frozen `details: IndexedDBErrorDetails` (`phase?`, generation fields, `operationId?`, `snapshotReason?`, `selectedGeneration?`). `INDEXEDDB_ERROR_CODES` is `INVALID_OPTIONS`, `UNAVAILABLE`, `QUOTA_EXCEEDED`, `INCOMPATIBLE_DATABASE`, `BLOCKED`, `VERSION_CHANGED`, `GENERATION_CONFLICT`, `CORRUPT_DATA`, `INCOMPATIBLE_SNAPSHOT`, `TRANSACTION_FAILED`, `CANCELLED`, `TIMEOUT`, `DISPOSED`, `OUTCOME_UNKNOWN`, `QUEUE_FULL`. `IndexedDBErrorCode` is exported with the option/result/interface types above. No automatic save, startup restore, retry or namespace deletion occurs on import.

## LocalSearch source migration

`convertLocalSearchSnapshot(bytes: Uint8Array): Promise<LocalSearchMigration>` from `/integrations/localsearch` validates the supported canonical companion source snapshot, checksum and native contract intersection. The supported identity is companion-v1, format 1, MiniSearch 7.2.0; arbitrary MiniSearch indexes, worker messages and storage rows are refused. Conversion needs `crypto.subtle`, has a 32 MiB input ceiling, and includes bounded synchronous host work. It is not a queued cancellable engine method.

The returned owned plan is `{ configuration, records, origin, sourceRevision, returnFields, identity, differences }`. `LocalSearchMigrationIdentity` declares the foreign/native analyzer and score-model differences. `LocalSearchMigrationOrigin` describes provenance; it does not become the receiving revision or storage generation. [migration.mjs](examples/migration.mjs) rebuilds a separate candidate using ordinary bounded `addMany` calls and disposes it after inspection. In an application, publish the new owner to application state only after the whole rebuild succeeds; individual batch commits do not make migration one transaction.

`MigrationError` has sanitized `code` and `details: { reason, nativeCode? }`. `MIGRATION_ERROR_CODES` is `INVALID_BYTES`, `INVALID_SNAPSHOT`, `INCOMPATIBLE_SNAPSHOT`, `NONCANONICAL_SNAPSHOT`, `CHECKSUM_MISMATCH`, `NATIVE_INCOMPATIBLE`, `CAPABILITY_REQUIRED`. The entry exports `MigrationErrorCode`, `MigrationErrorDetails`, `MigrationReason`, `LocalSearchMigration`, `LocalSearchMigrationIdentity` and `LocalSearchMigrationOrigin`. Foreign indexes, scores, live handles and namespaces are never reused. The repository [migration guide](https://github.com/vmitsaras/raveldex/blob/main/docs/migration/LOCALSEARCH.md) gives mapping and provenance details.
