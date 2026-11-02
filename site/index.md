<!-- Pre-Workbench content baseline, preserved for comparison. The active homepage is Home.astro; see site/README.md. -->

# Add local search to your application

Add search to the documents or records in your application. Raveldex finds matching records, ranks them and tells you exactly how many matched. Start with the core library, then add a search interface or other features as you need them.

[Try the live demo](../examples/docs-search/index.html) · [Get started](../docs/api/GETTING_STARTED.md)

## A small working example

After [installing core](../docs/api/GETTING_STARTED.md#install-the-package), save this as `search.mjs` in your application and run `node search.mjs`. It adds one document and searches for `atomic`.

<!-- usage-core-example -->

You should see revision `1`, a total of `1` and one hit with ID `guide:updates`. Use that ID to look up the document's title and URL in your application. The example disposes the engine when it finishes.

## What would you like to build?

- [Add records, search and update a collection](../docs/api/CORE.md).
- [Mount a browser search form and style it](../docs/api/HOSTS.md#native-dom-ui-and-css).
- [Add phrases, filters, facets and snippets](../docs/api/ADDONS.md).
- [Run a module worker](../docs/api/HOSTS.md#one-owner-module-worker) or [save source snapshots](../docs/api/HOSTS.md#source-and-native-snapshots).
- [Add search to Astro pages](../docs/api/STATIC_ASTRO.md) with the [setup/build/preview example](../examples/astro/README.md).

Choose a task from the [guides](guides.md), look up details in the [API reference](../docs/api/README.md), or work through a [runnable example](../examples/README.md). The [runtime requirements](../docs/api/COMPATIBILITY.md) and [practical limits](../docs/api/LIMITATIONS.md) explain what to consider before adding optional features.
