# Raveldex static search and Astro integration

This private package builds explicit native search artifacts and loads them on demand. Core stays framework independent with zero runtime dependencies. Astro7.3.2 is an optional exact framework peer; static builder/client users need only the exact `@vmitsaras/raveldex`0.1.0-rc.0 core peer. Browser source loading rebuilds under the configured receiving analyzer. Native snapshots retain their existing exact-Node qualification requirement and do not become browser portable.

## Build an explicit allowlist

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

This prints `1 /docs/`. The returned frozen `{manifest,files}` contains JSON strings keyed by safe basenames. Write every content-addressed snapshot/display file before `manifest.json` into your owned `raveldex/` output namespace. Keep the directory out of any automatic content discovery. The adapter does not crawl routes, parse HTML/Markdown, extract metadata, follow links, infer IDs or retain source for you. Every text field requires a deliberately selected source provider. Records use ordinary native validation, bounds and analysis. Display title/path are explicit and separate from index text. Duplicate IDs, unknown/malformed data and unsafe paths refuse the complete build.

Paths/base are directory-style absolute ASCII pathnames with safe segments and a final slash. Schemes/authorities, query/fragment, backslash, encoded separators, repeated or dot/traversal segments are not accepted in this slice. IDs remain explicit opaque record IDs; changing the deployment base changes result URLs and asset locations without changing IDs. Allowlists may be empty. New releases/content generations use a new application buildId (1–64 ASCII token characters) and a complete rebuild; there is no dev watcher, incremental discovery or in-place update protocol.

Files use SHA-256 names and exact UTF-8 byte counts; the versioned manifest binds configuration, buildId, deployment base, count and display ID identity. Checksums detect corruption/mixed generations, not sender authenticity. Deploy only a complete successful site build and trust its endpoint. A source rebuild can refuse its budget even if records were admitted in smaller batches. Snapshot64MiB, display4MiB, manifest/configuration256KiB,10,000 records,1,000,000 owned structural entries/depth16 and native limits are finite ceilings, not memory/latency guarantees. Hashing, JSON and ownership include bounded synchronous host work.

## Use the Astro build hook

Install the separately prepared core and integration tarballs into an Astro7.3.2 project. The integration remains private; packing does not publish.

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

`getEntries` is the explicit published-content allowlist callback. The hook runs it only after an actual static directory build completes, captures Astro's base, prepares all artifacts, exclusively creates the reserved `raveldex/` namespace, writes content assets, then writes the manifest last. Existing namespaces/symlinks/collisions fail without overwriting user assets. A failed write may leave an incomplete fresh namespace; the build fails and those files must not be deployed. Site deployment and retaining older generations remain application responsibilities. `astro dev`, watchers, SSR/server output and alternate file-output layouts are outside this slice; use a static build plus preview/server.

## Load only what the page uses

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

SHA-256 requires WebCrypto SubtleCrypto (Node22+ or a secure browser context); missing crypto refuses explicitly. The explicit manifest URL chooses the trusted HTTP(S) artifact origin; asset requests stay in that manifest directory and redirects are refused. Its pathname must match the declared deployment base plus `raveldex/manifest.json`. Initial loading fetches only manifest and the selected source snapshot. `loadDocuments()` explicitly requests the separate frozen UIDocument-compatible `{id,title,url}` allowlist, validating generation/count/ID identity/base URLs. It never mounts UI or fetches source pages. Calls are not implicitly cached. The existing optional native UI/CSS remain separate imports; mount after choosing to load documents, destroy the UI, then dispose this owned search handle. Engine mutations require application-managed display changes.

A loader creates a private candidate owner, checks normalized schema/analyzer ID/capabilities/limits identity and actual native snapshot compatibility, then re-exports public source to verify actual record count/ID identity before publishing a completely restored handle. This extra bounded codec pass can refuse work/encoding after restore; the private candidate is disposed and no handle is returned. It does not parse private native index structures or promise faster loading. Missing404/native assets, stale build IDs, invalid manifests, mismatched configuration, wrong byte counts/digests and malformed display data fail without returning an owner. New generations load separately; swap only after success and dispose the prior handle. There is no fallback, automatic retry, storage, service worker or global cache. Inject `fetch` for host control. `signal` aborts loading; Response byte/hash checks apply to Fetch-decoded JSON; compressed wire Content-Length is not confused with decoded size. Ignored-signal late responses are closed, and reentrant aborts keep their already-created promises observed. Network reads cap1,000,000 reader advances (including empty chunks) and have a30,000ms default timeout (1–120,000ms). Dispose aborts pending display requests and closes the owned engine. Synchronous bounded validation/hashing sections are not preemptible.

For `format:'native'`, build and loader must explicitly supply the same supported `nativeQualification` to the existing exact-Node snapshot API. Node/V8/ICU/Unicode/platform/architecture/profile/evidence checks remain in force. Browser native loading refuses instead of silently rebuilding. Source loading preserves the same analyzer ID/schema/capabilities/limits while using the receiving environment; cross-environment Unicode/scoring equality is not promised.

`buildStaticSearch` and `loadStaticSearch` export `StaticSearchError` and fixed `STATIC_SEARCH_ERROR_CODES`: INVALID_INPUT, INVALID_ARTIFACT, STALE_BUILD, INCOMPATIBLE_ARTIFACT, MISSING_ARTIFACT, INTEGRITY_MISMATCH, ASSET_LIMIT, FETCH_FAILED, CANCELLED, DISPOSED. Network timeouts use FETCH_FAILED; existing RaveldexError/SnapshotAdapterError failures stay typed separately. Diagnostics have fixed messages without content/URL/exception causes. Public readonly types describe the builder, manifest, descriptors and loaded handle. The client declaration requires standard DOM fetch/AbortSignal types; root core retains its no-DOM/no-Node declaration boundary.

From the repository, `npm run astro:pack -- --output /tmp/raveldex-astro-candidate` compiles and prepares a new exclusive local package directory. Root `npm run check` includes the actual packed Astro fixture. Its source documentation prose and explicit draft exclusion are finite technical examples, not a general relevance/AT study or remote CI. See the repository RX-A100 evidence for commands, actual environments, failed attempts, compatibility and measured separate graph costs. No publication is part of these commands.
