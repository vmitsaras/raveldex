# Runnable API examples

Copy these modules into an ESM application where you installed the local package tarball. They use public imports and show small, complete integrations. Most functions create and dispose their own example engine and return results you can inspect. The UI recipe instead returns a handle you dispose when removing the component. Errors are passed back to your application.

| Module | Invocation / environment |
| --- | --- |
| [inline.mjs](inline.mjs) | `await createInlineSearch(root)` on an HTTP(S) page; core-only consumer search with explicit prefix mode. Import `/addons/ui/inline.css` separately; call returned `dispose()` when removing it. |
| [core.mjs](core.mjs) | `await runCoreExample()` in Node; one record and exact result. |
| [addons.mjs](addons.mjs) | `await runAddonsExample()` in Node with usable `Intl.Segmenter`; phrases, filters/facets, Inspector, diagnostics, ranges/snippets and source/position/mixed parity. |
| [snapshots.mjs](snapshots.mjs) | `await runSnapshotsExample(applicationQualification)` in the application's exactly declared Node environment. The application must supply its own `NativeSnapshotQualification` evidence; version detection alone is insufficient. |
| [migration.mjs](migration.mjs) | `await runMigrationExample(bytes)` with the companion's canonical public source-export `Uint8Array`; conversion/rebuild only. |
| [ui.mjs](ui.mjs) | Developer Workbench: `await createSearchUI(root)` on an HTTP(S) page, with its existing exact-word default and optional Inspector. Import `/addons/ui/styles.css` separately; call returned `dispose()` when removing it. |
| [browser.mjs](browser.mjs) | `await runBrowserExample(document.querySelector('#example-root'))` on an HTTP(S) page with a dedicated empty fixture storage namespace and usable IndexedDB/`Intl.Segmenter`. Mounts, searches and destroys UI; explicitly saves, loads and erases its example namespace. |
| [worker.mjs](worker.mjs), [worker-host.mjs](worker-host.mjs) | Bundle/serve the host as a module-worker URL, then `await runWorkerExample(workerURL)` in the browser; mutation and source-restore receipt reconciliation. |

For a first run, copy `core.mjs` beside your application's `package.json`, then run this command from that directory:

```sh
node --input-type=module -e "import('./core.mjs').then(async ({ runCoreExample }) => console.log(await runCoreExample()))"
```

It prints an object with revision `1`, total `1` and one hit with ID `guide:updates`. The engine has already been disposed when the function returns.

### Browser recipes

For a visitor-facing interface, use [inline.mjs](inline.mjs) and the [consumer setup](../HOSTS.md#mount-a-consumer-search-form), or choose a complete modal/dropdown/directory/cards project from the [solution chooser](../../../examples/README.md). A connected root must exist before calling the recipe; keep ordinary browse links outside it. This small recipe assumes the page retains the root until initialization returns; use the complete starter controller for cancellable loading, removal during initialization and retry.

The browser example expects a real root such as `<main id="example-root"></main>`. It uses adapter-owned database `raveldex-candidate-example` and namespace equal to the root ID; the initial save explicitly expects that namespace to be empty. Successful completion erases its rows, then disposes its borrowed resources. A failed run may leave a saved fixture generation: inspect/recover that generation or select a fresh explicit fixture namespace before rerunning. No general application data is erased automatically. Load [the CSS](../HOSTS.md#native-dom-ui-and-css) separately; the JavaScript module does not inject styling.
