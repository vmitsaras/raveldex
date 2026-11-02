# Raveldex static search and Astro integration

Build search files from a list of documents and load them when your application needs search. This package supplies a static builder, an Astro build hook and a browser loader. It does not add Astro as a dependency of core.

Use the exact `@vmitsaras/raveldex@0.1.0-rc.0` core peer. The build hook also needs Astro `7.3.2`; builder and client-only applications can omit that optional peer. Browsers load source snapshots and rebuild with the configured analyzer. Native snapshots still require an exact, application-qualified Node runtime.

For a complete interface to copy, use the [Astro inline starter](../../examples/inline-astro/README.md). It includes real page content, the explicit allowlist, optional snippets and topic facets, CSS customization, loading/retry and ownership-safe disposal. The [inline solutions page](../../site/Inline.astro) links its complete source archive and a working browser preview.

For documentation search opened from a button, use the [Astro modal starter](../../examples/modal-astro/README.md). It renders the same explicit sections it indexes, builds the separate source-only section companion, and loads the matching artifacts on first open. Its wrapper handles loading cancellation, retry and disposal; the [modal solutions page](../../site/Modal.astro) links complete sources and a browser preview.

## Install matching packages

In an ESM application with Node `>=22.12.0`, install matching local tarballs; core and integration must both be version `0.1.0-rc.0`:

```sh
npm install --ignore-scripts --no-audit --no-fund /absolute/artifacts/core/vmitsaras-raveldex-0.1.0-rc.0.tgz /absolute/artifacts/astro/vmitsaras-raveldex-astro-0.1.0-rc.0.tgz astro@7.3.2
```

Replace the absolute paths with your prepared tarballs. After this command, you can import core, the integration and Astro in the application. Resolving Astro and its dependencies needs registry access or a suitable cache. Omit the Astro argument if you only need the builder and client loader. Core-only applications do not need this package.

From a source checkout, run `npm ci`, `npm run build`, pack core with `npm pack --ignore-scripts`, then run `node scripts/pack-astro.mjs --output NEW_DIRECTORY`. Use the resulting matching tarballs in your application.

## Build an explicit allowlist

Choose the records that should be searchable and keep private or draft content out of the list. Save this as a Node `.mjs` file in the installed application and run it with Node:

```js
import { createSourceProvider } from '@vmitsaras/raveldex/addons/phrases/source';
import { buildStaticSearch } from '@vmitsaras/raveldex-astro/build';

const configuration = {
  schema: { text: { title: {}, body: {} } },
  addons: [createSourceProvider({ fields: ['title', 'body'] })],
};
const artifacts = await buildStaticSearch({
  configuration,
  buildId: 'docs-v1',
  base: '/docs/',
  entries: [{
    record: { id: 'guide:mutations', text: { title: 'Atomic mutations', body: 'Incremental writes prepare privately and publish one coherent revision.' } },
    title: 'Atomic mutations',
    path: '/guide/mutations/',
  }],
});
console.log(artifacts.manifest.recordCount, artifacts.manifest.base);
```

This prints `1 /docs/`: one indexed record, with `/docs/` as the deployment base. The frozen `{ manifest, files }` contains JSON strings keyed by safe file names; this example keeps them in memory rather than writing them.

When writing the files yourself, create all content-addressed snapshot and display files in your own `raveldex/` directory before writing `manifest.json`. Keep that directory out of automatic content discovery. The Astro hook can do the writing for you.

You supply the content: the adapter does not crawl routes, parse HTML or Markdown, infer IDs or retain source automatically. Select a source provider for every text field. Display titles and paths are separate from indexed text. Invalid records, duplicate IDs and unsafe paths reject the whole build.

### Paths and generations

Use absolute, directory-style ASCII paths with safe segments and a final slash. Schemes, authorities, queries, fragments, backslashes, encoded separators, repeated separators and dot/traversal segments are rejected. A base change updates result URLs and asset locations, not record IDs. An empty content list is valid.

For changed content, choose a new application `buildId` of 1–64 ASCII token characters and rebuild the complete generation. There is no dev watcher, incremental discovery or in-place update protocol.

File descriptors use SHA-256 names and exact UTF-8 byte counts. The versioned manifest connects the configuration, `buildId`, base, record count and display IDs. These checks catch corruption or mixed generations; they do not authenticate a sender. Use a trusted endpoint and a complete successful site build.

A source rebuild can exceed its work budget even if the records were originally added in smaller batches. Other ceilings are:

- 64 MiB for a snapshot and 4 MiB for display data;
- 256 KiB for the manifest/configuration;
- 10,000 records, 1,000,000 owned structural entries and depth 16.

Native limits also apply. These are finite admission ceilings, not memory or response-time guarantees. Hashing, JSON processing and copying include bounded synchronous work.

## Use the Astro build hook

Install matching core and integration tarballs in an Astro `7.3.2` project. Save your shared `configuration` and `entries` as named exports in `search-content.mjs`, using the builder example above. Put the following in `astro.config.mjs`:

```js
import { defineConfig } from 'astro/config';
import raveldexAstro from '@vmitsaras/raveldex-astro';
import { configuration, entries } from './search-content.mjs';

export default defineConfig({
  output: 'static',
  base: '/docs/',
  trailingSlash: 'always',
  integrations: [raveldexAstro({
    configuration,
    buildId: 'docs-v1',
    getEntries: () => entries,
  })],
});
```

An Astro static build now writes the search files beneath `dist/raveldex/`. The `/docs/` base means their public URLs start with `/docs/raveldex/`. `getEntries` supplies the explicit list of searchable documents after the static directory build completes. The hook writes the content files before the manifest.

The reserved `raveldex/` directory must not already exist as a file, directory or symlink; a collision fails without overwriting it. A failed write may leave an incomplete new directory, so use only a complete successful build.

Use a static build plus preview or another HTTP server. The hook does not support `astro dev`, watchers, SSR/server output or alternate file-output layouts. Your application controls deployment and retention of older generations.

## Load only what the page uses

After serving the generated files over HTTP(S), run this in a bundled browser module. It imports the same shared `configuration`, loads the manifest and source snapshot, searches for `atomic`, then explicitly loads display titles and URLs:

```js
import { loadStaticSearch } from '@vmitsaras/raveldex-astro/client';
import { configuration } from './search-content.mjs';

const search = await loadStaticSearch({
  manifestUrl: new URL('/docs/raveldex/manifest.json', location.origin).href,
  expectedBuildId: 'docs-v1',
  configuration,
});
const result = await search.engine.search('atomic');
// No display data or source page has been fetched by this native query.
const documents = await search.loadDocuments();
// The application may now pass search.engine and documents to mountRaveldexUI.
await search.dispose();
```

With the builder data above, `result.total` is `1` and the hit ID is `guide:mutations`. The separate display list contains **Atomic mutations** at `/docs/guide/mutations/`. Nothing is rendered automatically. The final `dispose()` closes the owned engine; destroy any UI you mount before calling it.

### Loading and display data

SHA-256 needs WebCrypto SubtleCrypto, available in Node 22+ or a secure browser context. Missing crypto gives an explicit error. Choose a trusted HTTP(S) manifest URL whose path matches the deployment base plus `raveldex/manifest.json`. Requests stay in that directory, and redirects are rejected.

Loading happens in two parts:

1. `loadStaticSearch` fetches the manifest and selected source snapshot. It does not fetch your source pages.
2. `loadDocuments()` fetches the separate frozen `{ id, title, url }` list and checks its generation, count, IDs and base URLs. Calls are not implicitly cached.

Neither call mounts a UI. Import the optional UI and CSS separately, mount it after loading documents, then destroy it before disposing the search handle. If you mutate the engine, manage corresponding display-list changes yourself.

### Validation, errors and cleanup

The loader creates its own engine and checks the normalized schema, analyzer ID, capabilities, limits and snapshot compatibility. Before returning the handle, it re-exports public source to verify the actual record count and IDs. That extra bounded codec pass can hit a work or encoding limit after restore; if so, the engine is disposed and no handle is returned. It does not inspect private native index structures or promise faster loading.

Missing assets, stale build IDs, invalid manifests, mismatched configuration, incorrect byte counts or hashes, and malformed display data all fail. When replacing a generation, load the new handle successfully before switching to it, then dispose the old one. There is no automatic retry, fallback, persistence, service worker or global cache.

You can supply `fetch` to control requests and `signal` to abort loading. Checks apply to the decoded JSON response bytes, not the compressed wire Content-Length. Late responses that ignore the signal are closed, and promises created during reentrant aborts remain observed.

Network reads allow at most 1,000,000 reader advances, including empty chunks. The default timeout is 30,000 ms, configurable from 1 to 120,000 ms. Disposing aborts pending display requests and closes the engine. Synchronous validation and hashing sections are bounded but cannot be interrupted midway.

### Snapshot format

For `format:'native'`, supply the same supported `nativeQualification` to the builder and loader through the exact-Node snapshot API. Node/V8/ICU/Unicode/platform/architecture/profile/evidence checks remain in force. Browser native loading refuses instead of silently rebuilding. Source loading preserves the same analyzer ID/schema/capabilities/limits while using the receiving environment; cross-environment Unicode/scoring equality is not promised.

`buildStaticSearch` and `loadStaticSearch` export `StaticSearchError` and fixed `STATIC_SEARCH_ERROR_CODES`: INVALID_INPUT, INVALID_ARTIFACT, STALE_BUILD, INCOMPATIBLE_ARTIFACT, MISSING_ARTIFACT, INTEGRITY_MISMATCH, ASSET_LIMIT, FETCH_FAILED, CANCELLED, DISPOSED. Network timeouts use FETCH_FAILED; existing RaveldexError/SnapshotAdapterError failures stay typed separately. Diagnostics have fixed messages without content/URL/exception causes. Public readonly types describe the builder, manifest, descriptors and loaded handle. The client declaration requires standard DOM fetch/AbortSignal types; root core retains its no-DOM/no-Node declaration boundary.

### Optional heading maps

Pass a separate `pageSections` array to the builder or hook for explicit original-source heading ranges and raw anchor IDs. It emits a separate version-1 `sections-manifest.json` and content-addressed data asset; existing v1 files remain byte-identical for the same configuration, entries and build ID. No heading extraction or route crawling is performed.

New source handles expose explicit uncached `loadSections({ signal?, timeoutMs? })`. The public handle type makes this property optional for caller-authored legacy handles; narrow it before calling in TypeScript. Loading binds the companion to source/display/configuration identity, validates a transient public source export and stamps the receiving owner revision. Native handles refuse this optional operation before companion I/O. Failed optional loads leave ordinary search usable.

Use the returned maps with `mountRaveldexInline({ root, engine: loaded.engine, documents: await loaded.loadDocuments(), pageSections })`. Register the same optional `createSectionEvidence` factory and explicit source providers in build and restore configuration for previews. Destroy the UI before disposing its owner. See the [complete heading-map recipe](../../docs/api/STATIC_ASTRO.md#optional-heading-maps) and [page/section contract](../../docs/specs/PAGE_SECTIONS.md) for limits, encoded links, stale-map recovery and errors.
