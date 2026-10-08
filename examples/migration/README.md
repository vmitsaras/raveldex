# Explicit companion source rebuild

Run the executable example against actual exported companion source bytes:

```sh
npm run build
node examples/migration/run.mjs test/migration/fixtures/representative.json red
```

`convert-and-rebuild.mjs` uses public static imports from the core, the optional `/integrations/localsearch` converter, optional selected-source and source-phrase add-ons, and `/adapters/snapshots`. It validates and owns the source before constructing a new native owner, adds records individually to stay within per-operation admission bounds, and explicitly exports a native source snapshot. A failed candidate is disposed; conversion does not modify an existing owner.

The returned `origin` and `sourceRevision` retain companion provenance and are not the native revision. `legacyReturnFields` is a mapping reminder; native core search returns IDs/scores. The example deliberately installs source retention and phrases so source snapshot export and phrase queries are available. Original values and array boundaries are retained, while native NFKC normalization and native BM25 intentionally change analysis/ranking. Native scalar normalization maps legacy negative zero to positive zero. Reindexing remains subject to receiving configuration/work/resource bounds.

To persist explicitly in a browser, pass `createSnapshots(engine)` to the optional IndexedDB adapter, call `save({ expectedGeneration: null })`, then use the observed generation for subsequent writes/erasure. The migration browser fixture verifies actual save, page reload, restore, and complete namespace erasure through installed public package exports. No automatic persistence occurs in this example.

The supported producer, bytes, SHA256 checksums, original source generation, and historical verification-file identities are recorded in `test/migration/fixtures/provenance.json`. Rebuilding those positive fixtures requires an explicit clean pinned LocalSearch checkout:

```sh
node test/migration/fixtures/generate.mjs /absolute/path/to/LocalSearch
```

Public `createLocalSearch`, `addAll`, and `exportSnapshot` generate the fixtures; private codecs are not used. Opaque MiniSearch index state has no migration route.
