# Raveldex

Use Raveldex to search the records in your application. You choose which fields to index, add your documents and get back matching IDs, relevance scores and an exact result count. It works with any framework, and you can use the core library without a browser, worker or database.

Raveldex is written in TypeScript, uses ESM imports and has no core runtime dependencies. It ranks matches with BM25 and applies each update completely or leaves the previous data in place.

[Get started](docs/api/GETTING_STARTED.md) · [API reference](docs/api/README.md) · [Runnable examples](https://github.com/vmitsaras/raveldex/blob/main/examples/README.md)

Choose the interface that fits your application:

| Need | Consumer interface |
| --- | --- |
| Search within a page | [Inline search](docs/api/HOSTS.md#inline-search-foundation) |
| Open documentation search from a button | [Documentation modal](docs/api/HOSTS.md#documentation-search-modal) |
| Show compact header results with a full-results route | [Dropdown](docs/api/HOSTS.md#compact-dropdown-search) |
| Browse resources with filters and pages | [Directory](docs/api/HOSTS.md#directory-controls-and-styling) |
| Show authored excerpts, metadata or optional images | [Rich directory results](docs/api/HOSTS.md#rich-directory-results) |

Start with the [minimal consumer recipe and capability map](docs/api/HOSTS.md#consumer-search-interfaces), or copy one of the [eight complete browser/Astro projects](examples/README.md). Supply explicit public records and matching display data; Raveldex does not crawl your pages. Core also works alone when your application supplies its own interface.

## Install

The packages are currently unpublished, so you install them from local `.tgz` files. In a new application directory, run the following commands to create a package, enable ESM imports and install core. Replace the absolute path with the tarball you received or built:

```sh
npm init -y
npm pkg set type=module
npm install --offline --ignore-scripts /absolute/artifacts/core/vmitsaras-raveldex-0.1.0-rc.0.tgz
```

After installation, you can import `@vmitsaras/raveldex` from your JavaScript or TypeScript files. Core and the English analyzer require Node 22 or later; the Astro integration requires Node 22.12 or later. For a browser application, use your existing bundler.

If you need to create the tarballs yourself, follow [build from source](docs/api/GETTING_STARTED.md#build-tarballs-from-a-source-checkout).

## Smallest core example

Save this example as `search.mjs` in the application where you installed core, then run `node search.mjs`. It adds one document and searches its title and body.

<!-- candidate-example: quick-start -->
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
  const page = await engine.search('atomic');
  console.log(page.revision, page.total, page.hits);
} finally {
  await engine.dispose();
}
```

You should see revision `1`, a total of `1` and one hit with ID `guide:updates`. The score is a relevance value, not a percentage. The `finally` block releases the engine when the example finishes.

`total` counts all matches, while `hits` contains only the requested page. Keep titles, URLs and other display data in your application, and look them up by the returned IDs.

By default, every complete search term must match. For example, `atomic updates` finds this document, but `atom` does not. Choose a prefix query or an optional search capability when you need different matching rules.

## Build the search you need

| Task | Guide |
| --- | --- |
| Define fields, index documents and update records | [Core usage](docs/api/CORE.md) |
| Add phrases, filters, facets, snippets or highlights | [Search add-ons](docs/api/ADDONS.md) |
| Mount consumer controls and customize their CSS | [Consumer setup and capabilities](docs/api/HOSTS.md#consumer-search-interfaces) |
| Run search in a worker or save source snapshots | [Host integrations](docs/api/HOSTS.md) |
| Add search to static Astro pages | [Astro](docs/api/STATIC_ASTRO.md) |
| Open documentation search from a button | [Documentation modal](docs/api/HOSTS.md#documentation-search-modal) |
| Offer compact header results and a full-results route | [Dropdown search](docs/api/HOSTS.md#compact-dropdown-search) |
| Copy a complete header and full-results page | [Installed dropdown starter](site/Dropdown.astro) |
| Compose directory filters, pages and optional URL state | [Directory state](docs/api/HOSTS.md#directory-queries-and-url-state) |
| Copy a filterable resource directory with checkbox groups | [Browser and Astro directory starters](site/Directory.astro) |
| Show directory metadata with optional images and list/card/grid layouts | [Rich results and complete browser starter](site/Cards.astro) |
| Copy a complete documentation search modal project | [Browser and Astro modal starters](site/Modal.astro) |
| Choose English morphology or identifier components | [English](docs/api/ENGLISH.md) · [Identifiers](docs/api/IDENTIFIERS.md) |
| Offer explicit spelling and query tools | [Typos](docs/api/TYPO.md) · [Suggestions](docs/api/SUGGESTIONS.md) · [Synonyms](docs/api/SYNONYMS.md) · [Query syntax](docs/api/QUERY_SYNTAX.md) |
| Match raw text, ordered terms or apply record patches | [Literal/infix](docs/api/LITERAL.md) · [Proximity](docs/api/PROXIMITY.md) · [Patches](docs/api/RECORD_PATCH.md) |

Choose the optional capabilities you need when creating the engine. Core keeps the index, but does not keep the original text or word locations. Add a source or position provider if you need phrases, snippets or highlights.

If you mount the UI, import its CSS separately. The UI uses your engine without owning it, so destroy the UI before disposing the engine.

## Examples

The [solution chooser](examples/README.md) links complete consumer projects with explicit data, CSS, loading/retry and cleanup. For a small integration in an installed application, copy the [inline recipe](docs/api/examples/inline.mjs). Its search mode is explicitly `prefix`; CSS is a separate import, and the returned disposer destroys the UI before releasing its engine.

### Developer Workbench

Run `npm run pilot:ui` from a source checkout to explore the developer demo. Search for `source provider`, filter results or open Inspector to see why a result matched. The Workbench is a separate developer presentation; consumer presets omit its numerical scores and Inspector controls.

Under **Advanced demo settings**, you can compare phrase and word searches, run the same search in a worker, or change how word locations are stored.

The [example index](https://github.com/vmitsaras/raveldex/blob/main/examples/README.md) also links the core terminal example, [complete Astro setup/build/preview walkthrough](https://github.com/vmitsaras/raveldex/blob/main/examples/astro/README.md), migration example and small installed API recipes. Source checkout links require repository access.

Already using Pagefind? The optional [migration appendix](docs/api/PAGEFIND_MIGRATION.md) explains how to rebuild from your content using Raveldex's records and chosen interface. It is not the starting point for a new integration.

## Requirements and limits

Matching follows the indexed words: `cafe` and `café` are different, and spelling mistakes are not corrected automatically. Handle operation-limit errors in your application. If a worker stops replying during an update, check the update receipt before retrying.

A small result page still needs an exact count of every match. A quick single-record update does not predict the cost of a broad search or whole-source restore. Check those operations separately with your own records and configured providers; the 10,000-record admission ceiling is not a latency or completion guarantee.

Use source snapshots to rebuild data in a browser or worker. Native snapshots need an explicitly qualified, matching Node environment. See [compatibility](docs/api/COMPATIBILITY.md) and [practical limits](docs/api/LIMITATIONS.md) for the details.

MIT licensed. [Source and issues](https://github.com/vmitsaras/raveldex) require repository access.
