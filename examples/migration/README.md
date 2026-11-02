# Explicit companion source rebuild

Use this example to rebuild companion source data as a separate Raveldex engine. From a source checkout with dependencies installed, run the following against the supplied representative export:

```sh
npm run build
node examples/migration/run.mjs test/migration/fixtures/representative.json red
```

You should see JSON containing the old collection's origin, its source revision, the analysis/ranking differences and results for `red`. `nativeSourceFormat` identifies the exported Raveldex source snapshot. The command disposes its engine when finished.

`convert-and-rebuild.mjs` uses public core, converter, source, phrase and snapshot imports. It validates the input before creating a new engine, adds records individually to stay within operation limits and exports a source snapshot. If rebuilding fails, the new engine is disposed. No existing engine is changed.

Read `origin` and `sourceRevision` as information about the old collection, not the new engine's revision. `legacyReturnFields` reminds you which display values to keep in your application; core results contain IDs and scores.

The example selects source retention and phrases so it can export source and run phrase queries. Original values and array boundaries are preserved, while Raveldex's NFKC analysis and BM25 can change matching and ranking. Legacy negative zero becomes positive zero. Rebuilding still has to fit the receiving engine's configuration, work and resource limits.

To persist explicitly in a browser, pass `createSnapshots(engine)` to the optional IndexedDB adapter, call `save({ expectedGeneration: null })`, then use the observed generation for subsequent writes/erasure. An application can save, reload and restore and complete namespace erasure through installed public package exports. No automatic persistence occurs in this example.
