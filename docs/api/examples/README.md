# Runnable candidate examples

These ES modules import only public package entries. Copy them into an ESM application that installed the local candidate tarball. Each exported function owns and disposes its small fixture, returns inspectable results and propagates operational errors. They are examples, not another search API.

| Module | Invocation / environment |
| --- | --- |
| [core.mjs](core.mjs) | `await runCoreExample()` in Node; one record and exact result. |
| [addons.mjs](addons.mjs) | `await runAddonsExample()` in Node with usable `Intl.Segmenter`; phrases, filters/facets, Inspector, diagnostics, ranges/snippets and source/position/mixed parity. |
| [snapshots.mjs](snapshots.mjs) | `await runSnapshotsExample(applicationQualification)` in the application's exactly declared Node environment. The application must supply its own `NativeSnapshotQualification` evidence; version detection alone is insufficient. |
| [migration.mjs](migration.mjs) | `await runMigrationExample(bytes)` with the companion's canonical public source-export `Uint8Array`; conversion/rebuild only. |
| [browser.mjs](browser.mjs) | `await runBrowserExample(document.querySelector('#example-root'))` on an HTTP(S) page with a dedicated empty fixture storage namespace and usable IndexedDB/`Intl.Segmenter`. Mounts, searches and destroys UI; explicitly saves, loads and erases its example namespace. |
| [worker.mjs](worker.mjs), [worker-host.mjs](worker-host.mjs) | Bundle/serve the host as a module-worker URL, then `await runWorkerExample(workerURL)` in the browser; mutation and source-restore receipt reconciliation. |

For example, after copying `core.mjs` to the installed application's directory:

```sh
node --input-type=module -e "import('./core.mjs').then(async ({ runCoreExample }) => console.log(await runCoreExample()))"
```

The browser example expects a real root such as `<main id="example-root"></main>`. It uses adapter-owned database `raveldex-candidate-example` and namespace equal to the root ID; the initial save explicitly expects that namespace to be empty. Successful completion erases its rows, then disposes its borrowed resources. A failed run may leave a saved fixture generation: inspect/recover that generation or select a fresh explicit fixture namespace before rerunning. No general application data is erased automatically. Load [the CSS](../HOSTS.md#native-dom-ui-and-css) separately; the JavaScript module does not inject styling.

The repository's `node scripts/candidate-check.mjs --output /absolute/new/output-directory` packs/installs the candidate, copies these exact sources and executes Node plus actual browser examples. Its report records versions, hashes, results and limits. Browser/worker examples need the recorded locally available Chrome host and existing browser tooling. Passing these examples establishes their finite API scenarios, not new cross-browser, physical, all-AT or whole-corpus snapshot qualification. See [candidate evidence](https://github.com/vmitsaras/raveldex/blob/main/docs/evidence/RX-4003.md) for the actual run and [support](../../support/RX-4003.md) for inherited qualification.
