# Static search and Astro

Use `@vmitsaras/raveldex-astro` to add search to a static site. You choose the content during the build, and the browser loads the resulting search files when needed. The package includes a static builder, an Astro build hook and a browser loader; core still works without Astro.

For links to matching headings, supply the [optional heading maps](#optional-heading-maps). The adapter accepts explicit page records, titles and fragment-free directory routes; your application supplies source ranges and renders the target IDs.

## Install matching packages

In your ESM application, install the core and integration tarballs together. Replace both absolute paths with your prepared files. The integration requires core `0.1.0-rc.0`, Node `>=22.12.0` and Astro `7.3.2` for its build hook:

```sh
npm install --ignore-scripts --no-audit --no-fund /absolute/artifacts/core/vmitsaras-raveldex-0.1.0-rc.0.tgz /absolute/artifacts/astro/vmitsaras-raveldex-astro-0.1.0-rc.0.tgz astro@7.3.2
```

This installs core, the integration and the pinned Astro version. Astro and its dependencies need registry access or a suitable npm cache. If you only use the static builder and client loader, you can omit Astro itself. See [building tarballs](GETTING_STARTED.md#build-tarballs-from-a-source-checkout) if you need to prepare the local files.

## Build static search

Start by listing the records you want people to find. Include each record's text, display title and directory-style route. The builder does not crawl your pages or parse Markdown or HTML, so leave drafts and private content out of this list. Add a source provider for every indexed text field.

Save the following as `search-content.mjs` in your application. The later build and browser examples import this shared configuration:

```js
import { createSourceProvider } from '@vmitsaras/raveldex/addons/phrases/source';

export const configuration = {
  schema: { text: { title: {}, body: {} } },
  addons: [createSourceProvider({ fields: ['title', 'body'] })],
};
export const entries = [{
    record: { id: 'updates', text: { title: 'Atomic updates', body: 'Replace a complete record.' } },
    title: 'Atomic updates',
    path: '/guide/updates/',
  }];
```

This file defines one searchable document, **Atomic updates**, at `/guide/updates/`. Importing it alone does not build an index or create that page; your site must provide the page.

Save the next block in a Node `.mjs` build module beside `search-content.mjs`, then run it with Node:

```js
import { buildStaticSearch } from '@vmitsaras/raveldex-astro/build';
import { configuration, entries } from './search-content.mjs';

const artifacts = await buildStaticSearch({
  configuration,
  buildId: 'docs-v1',
  base: '/docs/',
  entries,
});
console.log(artifacts.manifest.recordCount); // 1
```

It prints `1`, the number of records in the generated manifest. The returned `{ manifest, files }` holds the JSON data in memory; this example does not write it to disk. File names include content hashes.

If you use the builder directly, write all content files into your own `raveldex/` directory before writing `manifest.json`. Use a new build ID and a complete generation when content changes. Base paths must be safe directory-style ASCII paths ending in `/`. Changing the deployment base does not change record IDs. The Astro hook below handles file writing for you.

## Use the Astro hook

To build the files automatically with Astro, use the `raveldexAstro` integration in `astro.config.mjs`. It takes your shared configuration, a build ID and a callback returning the records. Use static output and directory-style routes.

Create `astro.config.mjs` beside `search-content.mjs`:

```js
import { defineConfig } from 'astro/config';
import raveldexAstro from '@vmitsaras/raveldex-astro';
import { configuration, entries } from './search-content.mjs';

export default defineConfig({
  output: 'static',
  base: '/docs/',
  trailingSlash: 'always',
  integrations: [raveldexAstro({ configuration, buildId: 'docs-v1', getEntries: () => entries })],
});
```

After an Astro static build, the hook writes search files under `dist/raveldex/`, including `manifest.json`. With this `/docs/` base, the browser requests them beneath `/docs/raveldex/`. The hook does not run in `astro dev`.

For complete copy, install, build and preview commands at both `/` and `/docs/`, follow [the runnable Astro example](https://github.com/vmitsaras/raveldex/blob/main/examples/astro/README.md).

## Load search on demand

Add a `<section id="search" aria-label="Documentation search"></section>` to your page. Put the following in a browser module handled by your bundler and run it after that element exists.

The loader needs the manifest URL, the build ID you expect and the same configuration used by the builder. It loads the search index first; `loadDocuments()` fetches the separate title/URL list needed by the UI:

```js
import { loadStaticSearch } from '@vmitsaras/raveldex-astro/client';
import { mountRaveldexUI } from '@vmitsaras/raveldex/addons/ui';
import '@vmitsaras/raveldex/addons/ui/styles.css';
import { configuration } from './search-content.mjs';

const loaded = await loadStaticSearch({
  manifestUrl: new URL('/docs/raveldex/manifest.json', location.origin).href,
  expectedBuildId: 'docs-v1',
  configuration,
});
const ui = mountRaveldexUI({
  root: document.querySelector('#search'),
  engine: loaded.engine,
  documents: await loaded.loadDocuments(),
});
// When removing the search component:
// ui.destroy();
// await loaded.dispose();
```

You should see search controls in `#search`. Searching `atomic` returns **Atomic updates**, linked to `/docs/guide/updates/`. The UI uses the loaded engine; it does not fetch the destination page until you follow the link.

Resolve the manifest from the deployment base, as above, so it also works on nested pages. Keep ordinary documentation links available while search loads. If loading fails, offer a retry and keep any working engine until its replacement is ready. The loader checks build/configuration identity, file sizes and hashes. SHA-256 detects corruption or mixed generations, but does not establish whether the sender is trustworthy.

## Optional heading maps

Add `pageSections` alongside `entries` in `buildStaticSearch`, or alongside `getEntries` in the Astro hook. It is an array of readonly `PageSectionPage` values from `@vmitsaras/raveldex/addons/sections`; it is not a field on a record or display document:

```js
const pageSections = [{
  pageId: 'updates',
  sections: [{ anchor: 'atomic-writes', heading: 'Atomic writes', headingLevel: 2,
    field: 'body', valueIndex: 0, start: 0, end: entries[0].record.text.body.length }],
}];
const artifacts = await buildStaticSearch({
  configuration, entries, buildId: 'docs-v2', base: '/docs/', pageSections,
});
```

This example assumes the first entry is the `updates` page with a scalar body. Derive real ranges from the exact originals and render `id="atomic-writes"` on its target page. The builder validates all maps, fields, original values and grapheme boundaries before producing artifacts. It fills absent page maps with empty section lists. Omit `pageSections` to emit no companion; an explicit empty array emits empty lists for every allowlisted page.

For previews, explicitly register `createSectionEvidence({ fields: { body: 'source' } })` in both build and restore configuration, alongside the existing complete source providers. Maps may be serialized without that factory, but the owner cannot project them until its configuration supports section evidence. Adding a factory only at restore is an incompatible configuration.

The two extra files are `sections-manifest.json` and content-addressed `sections-<sha256>.json`. The separate metadata binds build ID, base, record count, configuration, sorted IDs, source asset and display asset. Existing v1 files are byte-identical for the same configuration, entries and build ID. Existing readers ignore the additional files. The Astro hook writes contents first, companion metadata next and `manifest.json` last in its exclusively owned output namespace.

Call the optional method explicitly after loading a source handle:

```js
import { mountRaveldexInline } from '@vmitsaras/raveldex/addons/ui/inline';
import '@vmitsaras/raveldex/addons/ui/inline.css';

const pageSections = await loaded.loadSections();
const documents = await loaded.loadDocuments();
const ui = mountRaveldexInline({ root, engine: loaded.engine, documents, pageSections });
// ui.destroy();
// await loaded.dispose();
```

New handles always supply `loadSections`; its public type is optional to preserve application-authored legacy handle objects. TypeScript consumers of the general handle type should narrow that property before calling it. Each call is uncached, reads only the two companion files and validates a transient public source export against the actual restored receiver revision. It does not request display data or destination pages. `loadSections({ signal, timeoutMs })` uses the existing timeout/stream/hash/UTF-8/cancellation rules and shares the owner's disposal lifetime.

Source validation is an additional bounded full-source codec pass and may refuse. A mutation observed before, during or after loading refuses the map; revision probes do not lock the engine. A mutation queued after the final check can make a returned map stale, and the inline UI checks that stamp again before context. Native-format handles reject section loading with `INCOMPATIBLE_ARTIFACT` before companion I/O while remaining usable for ordinary search.

Missing companion files use `MISSING_ARTIFACT`; a changed build ID uses `STALE_BUILD`; incompatible source/display/configuration identity uses `INCOMPATIBLE_ARTIFACT`. Malformed maps use `INVALID_ARTIFACT`, hash/byte mismatches use `INTEGRITY_MISMATCH`, and size ceilings use `ASSET_LIMIT`. Missing or broken grapheme segmentation remains a native `UNSUPPORTED_ENVIRONMENT`. A failed optional load leaves the ordinary loaded engine usable. An application may visibly choose page-only search after a failure; the loader does not silently fall back or retry.

Companion metadata is bounded to 256 KiB and data to 4 MiB, with at most 10,000 pages, 16,384 sections total and 64 per page. Parent paths keep existing ASCII directory validation. Anchors are encoded once; the builder checks the encoded base/path/fragment against 2,048 UTF-16 units, and the UI also checks the real absolute URL including its deployment origin. See [inline section behavior](HOSTS.md#inline-anchored-sections) for map ownership, visible states and theming.

## Release resources and choose formats

When removing the component, call `ui.destroy()` first, then `await loaded.dispose()`, as shown in the comments. The controls disappear, pending display requests are aborted and the owned engine is disposed.

Use source snapshots in browsers. Native loading requires an exact, application-qualified Node runtime and a matching declaration. A browser rejects native loading rather than silently rebuilding it.

The hook supports static builds, not `astro dev`, SSR, route crawling or watchers. Whole-source rebuilds and output sizes remain bounded. See [snapshot requirements](COMPATIBILITY.md#snapshot-compatibility), [operation limits](LIMITATIONS.md#handle-operation-limits) and the [full builder/loader API](https://github.com/vmitsaras/raveldex/blob/main/integrations/astro/README.md).
