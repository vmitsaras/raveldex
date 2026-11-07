# Getting started

Raveldex adds search to data you already have. Tell it which fields to search, add your records and use the matching IDs to look up titles, URLs or other details in your application.

## Choose your search experience

| Your application needs | Start here |
| --- | --- |
| A search form within the page | [Inline](HOSTS.md#inline-search-foundation) |
| Search opened from a documentation button | [Modal](HOSTS.md#documentation-search-modal) |
| A small header popup with a full-results destination | [Dropdown](HOSTS.md#compact-dropdown-search) |
| Resource browsing with checkbox filters and pages | [Directory](HOSTS.md#directory-controls-and-styling) |
| Authored descriptions, metadata and optional images | [Rich directory results](HOSTS.md#rich-directory-results) |

All five borrow an engine you configure. The [capability matrix](HOSTS.md#consumer-capability-matrix) explains their different result content, paging and keyboard models. For a complete project, the [solution chooser](../../examples/README.md) links browser/Astro starters. If your application supplies its own UI, start with the core example below.

## Install the package

The packages are currently unpublished and supplied as local `.tgz` files. In a new application directory, run these commands to create a package, enable ESM imports and install core. Replace the absolute path with the file you received or built:

```sh
npm init -y
npm pkg set type=module
npm install --offline --ignore-scripts --no-audit --no-fund /absolute/artifacts/core/vmitsaras-raveldex-0.1.0-rc.0.tgz
```

You can now import `@vmitsaras/raveldex` in that application. Core and the English analyzer require Node 22 or later; the Astro integration requires Node 22.12 or later. In a browser application, let your existing bundler resolve the imports. See [compatibility](COMPATIBILITY.md) for optional feature requirements.

## Prepare your records

Choose the public records people should find and give each a stable ID. Declare searchable strings in `schema.text`, then add records with those same field names. Keep title/URL display entries in your application, joined to hits by ID. Titles and destinations are required for the consumer presets; your application must provide the actual destination pages.

Declare filter metadata separately when needed; card display fields are not automatically indexed or filterable. Keep original text when selecting snippets/sections and derive any section ranges from those exact strings. Render each section's target ID on its destination page. No UI preset discovers pages, headings or content changes automatically.

For static sites, pass an explicit public allowlist to the [Astro/static builder](STATIC_ASTRO.md); deploy a complete matching artifact generation and base path. For live application data, await engine updates and explicitly search/refresh afterward. Replacing captured display data requires destroy/remount. Detailed CMS lifecycle guidance is separate from choosing a surface.

## Smallest core example

Save the following as `search.mjs` beside your application's `package.json`, then run `node search.mjs`. It indexes a single document and searches for `atomic`.

```js
import { createRaveldex } from '@vmitsaras/raveldex';

const engine = createRaveldex({
  schema: { text: { title: { boost: 2 }, body: {} } },
});
try {
  await engine.add({
    id: 'guide:updates',
    text: { title: 'Atomic updates', body: 'Replace one complete record.' },
  });
  const result = await engine.search('atomic');
  console.log(result.total); // 1
  console.log(result.hits[0].id); // guide:updates
} finally {
  await engine.dispose();
}
```

The example prints `1` and `guide:updates`: one document matched, and that is its ID. It then disposes the engine.

A few details matter when you add more records:

- `boost: 2` gives matches in the title more weight than matches in the body.
- `total` counts every matching record; `hits` contains the requested page of IDs and scores.
- Keep your display data in your application and look it up by ID.
- Plain string searches require every complete term. `atomic updates` matches the title above; `atom` does not. Use a [prefix query](CORE.md#query-shapes) to match the beginning of a word.

## Update your collection

Use the method that matches the change you want to make:

- `addMany` adds a batch of new records.
- `replace` replaces one complete record.
- `remove` deletes records by ID.
- `clear` empties the collection.

Await an update before searching when the results need to include it. Each successful change creates a new collection revision, and each search result tells you which revision it used. See [records, mutations and query shapes](CORE.md).

## Add a search interface

For a complete project to adapt, choose a [browser or Astro inline starter](../../site/Inline.astro). Each includes explicit sample content, source snippets, a topic filter, paging, CSS, loading/retry and cleanup. The browser starter builds an engine from its records; Astro builds static search artifacts and loads them on demand. Both use the current local tarballs.

For search behind a button, choose a [documentation modal starter](../../site/Modal.astro). The browser and Astro projects include cancelable first-open loading, real page/heading links, retry, query preservation and owned-engine cleanup. Replace their explicit authored content and adjust the theme CSS.

Both galleries provide complete project downloads and a short edit/build/preview CSS walkthrough. Keep the starter's source/snippet/facet or section registrations aligned with its UI options; these are explicit optional capabilities. The [adoption checklist](HOSTS.md#starter-adoption-and-local-checks) lists browser requirements, ownership and the remaining checks to run after replacing data or styles.

For a minimal consumer integration without a starter, follow [mount a consumer search form](HOSTS.md#mount-a-consumer-search-form). Copy the complete [inline module](examples/inline.mjs), import `/addons/ui/inline.css` separately and use its explicit `mode: 'prefix'`. The UI starts idle; typing or Enter searches. Call the returned `dispose()` when removing the integration: it destroys the UI before disposing its owned engine. A UI mounted with an application-owned engine only borrows it.

Choose [dropdown](HOSTS.md#compact-dropdown-search), [directory](HOSTS.md#directory-controls-and-styling) or [rich results](HOSTS.md#rich-directory-results) for the other consumer journeys. The [developer Workbench](HOSTS.md#native-dom-ui-and-css) remains a separate option for exploring scores and Inspector.

If you want [phrases, snippets or highlights](ADDONS.md), choose the required source or position providers when creating the engine. These keep the original text or word locations that core alone does not store. For static Astro pages, follow [the Astro guide](STATIC_ASTRO.md).

## Build tarballs from a source checkout

You only need this step if you are building the packages yourself. With repository access, Node 24 and npm, run the following from the repository root. It compiles the code once and creates matching core, English and Astro tarballs:

```sh
export RAVELDEX_REPOSITORY="$(pwd -P)"
export RAVELDEX_ARTIFACTS="$(mktemp -d "${TMPDIR:-/tmp}/raveldex-artifacts.XXXXXX")"
npm ci
npm run build
mkdir "$RAVELDEX_ARTIFACTS/core"
npm pack --ignore-scripts --pack-destination "$RAVELDEX_ARTIFACTS/core"
node scripts/pack-english.mjs --output "$RAVELDEX_ARTIFACTS/english"
node scripts/pack-astro.mjs --output "$RAVELDEX_ARTIFACTS/astro"
```

The files are written beneath `$RAVELDEX_ARTIFACTS`, in `core/`, `english/` and `astro/`. Each pack output directory must be new. You can now install those files in a separate application.

Keep both shell variables set when following the [Astro example](https://github.com/vmitsaras/raveldex/blob/main/examples/astro/README.md). Install the matching core tarball alongside either optional package. The Astro build hook also needs `astro@7.3.2`.

## Next steps

- [Choose optional capabilities](ADDONS.md): phrases, facets, typo tolerance, suggestions and more.
- [Use the public API](README.md): options, defaults, methods and result types.
- [Run the example modules](examples/README.md) in your own installed application.
- [Handle practical limits](LIMITATIONS.md): analysis, operation bounds and recovery.
- [Optional Pagefind migration appendix](PAGEFIND_MIGRATION.md): map an existing site's content decisions to explicit Raveldex records; no prior Pagefind knowledge is needed for the guides above.
