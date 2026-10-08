# Packed browser documentation pilot

This optional native interface searches 34 complete sections from the same five current specification/architecture files allowlisted by [the core corpus builder](../core-docs/corpus.mjs). Section bodies stay unchanged, including Markdown and code. The application owns titles, IDs, category metadata, original source and GitHub source links. Archived plans, evidence and historical proposals are excluded.

From the repository root:

```sh
npm ci
npm run pilot:ui
```

Open the local URL printed by the command. Stop its local server with Ctrl+C. The runner builds the private ESM package, packs it, installs the actual tarball into an isolated consumer, generates `corpus.json` from the explicit allowlist, bundles [main.mjs](main.mjs) through public installed package imports, and copies the separately exported UI CSS. No package is published, no remote service is called, and loading the pilot fetches its local corpus and, when selected, its local module-worker entry. Following a source link navigates to the corresponding GitHub section.

## Interactions

- Submit a query such as `term contribution`, `atomic mutation`, or `original source`. Exact-term mode uses AND over analyzed exact terms; strict phrase mode also requires adjacent tokens in one original field value.
- Select a document category, inspect its exact conjunctive count, clear the selection, and move through pages without changing the complete total.
- Open a result's Inspector to request actual native facts, inspect score contributions and configuration, then close it. Source is not selected for Inspector output by default.
- Switch between source reanalysis and stored positions/original offsets. Both use the same original corpus. The application destroys the previous interface, awaits owner disposal and then indexes a new owner. It preserves search text; category selection and page reset.
- Switch **Execution** between direct mode and one module worker. Each selected owner has the whole corpus and field statistics; startup compares the complete configuration and local capability manifests. Switching disposes the previous owner and starts a fresh revision-0 owner before one atomic corpus add.
- Use **Destroy interface** and **Reinitialize search** to exercise cleanup. Rapid setup changes suppress stale mounts and abort in-flight indexing. Leaving the page tears down the application listeners and active UI/owner.

Snippets come from the packaged optional evidence module and are inserted as text plus explicit marks. Bounded snippets can omit context or matches; complete original range evidence remains separate. Neither normalization nor HTML rendering rewrites displayed source. UI and CSS are independent optional exports, outside the core import graph. The example uses the optional worker adapter through the public client and host entries, with explicit worker ownership and same-host unqualified analyzer pairing. It uses no framework or persistence adapter. Worker failure never triggers an automatic mutation retry; Reinitialize search is an explicit fresh-corpus recovery action.

## Evidence boundaries

The local packed-consumer browser checks cover concrete UI behavior and are recorded separately from source inspection, build/type checks and direct engine relevance judgments. The appearance of results is not proof of assistive-technology behavior. Exact-tool screen-reader observations, broad browser support, retained/peak heap and physical interaction latency require separate qualification. Inspector work units and corpus hashes identify logical work and evaluated bytes; they do not measure those costs.

Existing real-document judgments remain useful for lexical/ranking observations. “Atomic batch” may miss its intended section, natural-language questions need not find an exact-term document, and a matching intended source can rank below another relevant section. The pilot retains such findings without changing the adopted analyzer or scorer.

## Explicit storage selection

The existing page keeps in-memory initialization and explicit fresh-corpus recovery. It opens no database. Applications choosing durable recovery can borrow the same source-enabled direct owner with `createSnapshots` and `createIndexedDBPersistence` from their optional public entries; call `load`, `save({ expectedGeneration })`, and `erase({ expectedGeneration })` explicitly. An absent namespace has token `null`; a loaded token identifies that selected snapshot and can become stale during recovery. Save does not make an engine write and a database transaction one atomic operation.

For the worker path, opt into `serveSnapshotRaveldexWorker` from `@vmitsaras/raveldex/adapters/worker/snapshots/host` in the application's own module entry, passing `makeAddons(strategy)`. Attach `createWorkerSnapshots(workerEngine)` from `/adapters/worker/snapshots` on the page, then supply that handle to `createIndexedDBPersistence`. This uses source rebuild with the existing complete owner, original source and selected positions/evidence. Its 8 MiB transport bound can be narrower than the 64 MiB snapshot ceiling. A missing restore reply is an unknown engine outcome; reconcile its operation ID or explicitly create a new owner, without assuming rollback or retrying automatically.

The application selects a dedicated database name and namespace. Storage disposal releases only adapter resources; engine disposal and namespace erasure remain distinct actions. Quota/unavailable storage leaves the current engine usable but never claims a successful durable save. See the [storage contract](../../docs/architecture/ADDONS_AND_ADAPTERS.md#indexeddb-adapter-contract-rx-3003) and [public API recipe](../../README.md#optional-indexeddb-persistence). The installed storage browser tests exercise these explicit actions separately from this pilot's UI behavior.
