# Add search to Astro pages

Try a small Astro site that loads search when you ask for it. Three documentation pages are searchable; a rendered draft is deliberately left out. The example shows how to choose the records, display titles and routes yourself.

## Prepare artifacts

Use Node 24 and npm. First follow [build tarballs from a source checkout](../../docs/api/GETTING_STARTED.md#build-tarballs-from-a-source-checkout). You should then have matching core and integration files, with `RAVELDEX_REPOSITORY` and `RAVELDEX_ARTIFACTS` set in the same shell.

If you open another terminal, set those variables again to the actual absolute paths before continuing.

## Copy and install the fixture

Run the following to copy the example to a new temporary directory and install its packages there. The second line resolves the physical path, so build and preview agree on the project root even when macOS uses a temporary-directory alias:

```sh
export RAVELDEX_EXAMPLE="$(mktemp -d "${TMPDIR:-/tmp}/raveldex-astro-example.XXXXXX")"
export RAVELDEX_EXAMPLE="$(cd "$RAVELDEX_EXAMPLE" && pwd -P)"
cp -R "$RAVELDEX_REPOSITORY/examples/astro/." "$RAVELDEX_EXAMPLE/"
printf '%s\n' '{"name":"raveldex-astro-example","private":true,"type":"module"}' > "$RAVELDEX_EXAMPLE/package.json"
npm --prefix "$RAVELDEX_EXAMPLE" install --ignore-scripts --no-audit --no-fund "$RAVELDEX_ARTIFACTS/core/vmitsaras-raveldex-0.1.0-rc.0.tgz" "$RAVELDEX_ARTIFACTS/astro/vmitsaras-raveldex-astro-0.1.0-rc.0.tgz" astro@7.3.2
```

You now have an independent example project at `$RAVELDEX_EXAMPLE`, with local core and integration packages plus Astro `7.3.2` installed. The repository copy is unchanged. Resolving Astro and its dependencies needs registry access or a suitable npm cache.

## Build and preview at the root

Build the static pages, then start a local preview:

```sh
ASTRO_TELEMETRY_DISABLED=1 node "$RAVELDEX_EXAMPLE/node_modules/astro/bin/astro.mjs" build --root "$RAVELDEX_EXAMPLE"
ASTRO_TELEMETRY_DISABLED=1 node "$RAVELDEX_EXAMPLE/node_modules/astro/bin/astro.mjs" preview --background --root "$RAVELDEX_EXAMPLE" --host 127.0.0.1 --port 4321
```

After a successful build, you should have `dist/raveldex/manifest.json` and its source and display files. Open the URL Astro prints, normally `http://127.0.0.1:4321/`, to see the documentation links and search controls.

`--background` keeps the preview running after the command returns. Leave it running while you try the example. Use the HTTP URL rather than opening `dist/index.html` as a file: search needs to fetch assets from the same origin.

When you finish either preview session, run this command before rebuilding. It stops the preview registered for this example's project root:

```sh
ASTRO_TELEMETRY_DISABLED=1 node "$RAVELDEX_EXAMPLE/node_modules/astro/bin/astro.mjs" preview stop --root "$RAVELDEX_EXAMPLE"
```

The preview should now be stopped; the built files remain. If port `4321` was busy, use the actual URL Astro reported instead of replacing an unrelated server with `--force`.

## Rebuild for a subdirectory

After stopping the root preview, rebuild with `/docs/` as the base. Set the same base for preview so its routes match the generated URLs:

```sh
RAVELDEX_ASTRO_BASE=/docs/ ASTRO_TELEMETRY_DISABLED=1 node "$RAVELDEX_EXAMPLE/node_modules/astro/bin/astro.mjs" build --root "$RAVELDEX_EXAMPLE"
RAVELDEX_ASTRO_BASE=/docs/ ASTRO_TELEMETRY_DISABLED=1 node "$RAVELDEX_EXAMPLE/node_modules/astro/bin/astro.mjs" preview --background --root "$RAVELDEX_EXAMPLE" --host 127.0.0.1 --port 4321
```

Open `http://127.0.0.1:4321/docs/`, or use the actual port Astro reports. You should see the same site, with page links and search-file requests beneath `/docs/`. Stop this preview with the command above when finished.

Let the hook create the fresh build's `raveldex/` directory. Copying an old one into the output causes a collision, which fails the build rather than overwriting it.

## What to try

1. Follow an ordinary documentation link before loading search. The site remains useful without the search interface.
2. Activate **Load search data**. The manifest and source snapshot load; titles, URLs and the search UI wait until you open search.
3. Activate **Open search** and search `atomic`. You should get one result, **Atomic publication**. Follow it to read the page. Search `marzipanprivate` to see **No results.** because the draft was not indexed.
4. Use the labeled controls and open Inspector to read matching and scoring facts. Close it with its button or Escape.
5. Activate **Inject next search error**, submit a search and use **Retry search** to recover. **Close search** restores the original content; **Unload search data** releases the engine. Unloading while search is opening should leave it unloaded.
6. Repeat at `/docs/`. Result links and source/display requests should keep that base.

## Use the pattern in your application

Define the records you want indexed, configure the Astro hook and load the source manifest from your client module. Keep draft/private content out of the index allowlist. See [the Astro integration guide](../../docs/api/STATIC_ASTRO.md) for the public imports, configuration and loader lifecycle.

The browser path uses source snapshots and rebuilds them with its configured analyzer. The example also contains `qualification.mjs` for its native-snapshot test path. You do not need that declaration for ordinary source loading, and you cannot reuse it to qualify a different application.
