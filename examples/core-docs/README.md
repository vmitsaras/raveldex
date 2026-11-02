# Search documentation from the terminal

Try core search from the terminal, without a browser or database. This example indexes selected implementation-contract sections and prints their matching IDs, scores and exact total. For guides about using Raveldex, use the browser demo linked below.

## Run

From a source checkout, use Node 24 and npm:

```sh
npm ci
npm run pilot:core -- 'atomic mutation'
```

You should see the temporary consumer directory followed by results for `atomic mutation`. Each hit has an ID and relevance score; `total` counts all matches. The command compiles and installs a local core tarball, then disposes its engine when finished. It creates no browser UI or database.

## Search another term

Change into the temporary consumer directory printed above, then run:

```sh
node run.mjs corpus.json judgments.json 'original source'
```

This starts a new search for `original source` and prints its results, without rebuilding the package. Both complete analyzed terms must match. Queries use exact analyzed terms by default. Use the typed query shapes in [core usage](../../docs/api/CORE.md#query-shapes) for prefixes, fields, Boolean groups and metadata equality.

## Use your own records

Start from [the core recipe](../../docs/api/examples/core.mjs): define the schema, add your records and call `search`. Keep titles/URLs in your application and join them to returned IDs. Use `replace`, `remove` or `clear` to update the collection, then dispose the engine when finished.

For an interactive search example, use [the usage-guide browser demo](../docs-search/README.md).
