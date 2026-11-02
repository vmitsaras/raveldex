# Search the usage guides

Use this demo to find instructions for adding search to your application. It searches sections from five guides: getting started, core usage, search add-ons, host integration and Astro. Each result links to the full guide.

## Run locally

From a source checkout, use Node 24 and npm:

```sh
npm ci
npm run pilot:ui
```

Open the HTTP URL printed in the terminal. You should see a search field and the guide collection, ready to search. The command builds and installs a local package, bundles the browser and worker code, then serves the demo. Stop it with Ctrl+C. Use `--port 4175` if the default port is occupied.

## Try a search

1. Search `source provide` or `source prov`. Final-word prefix search completes the last word; earlier words must match exactly. Look for **Source, positions and phrases**, which explains how to keep original text.
2. Search `typed filters` to find **Typed filters and exact facets**.
3. Search `module worker` to find **One-owner module worker**.
4. Search `unmatchedword` to see **No results.**, then enter a sample query again to recover.
5. Choose a **Category** to narrow the matches, or **All** to clear the filter. Changing page shows more hits without changing the total.
6. Follow a result to read its guide. Open **Inspect results** to see matching terms and score calculations; Close or Escape returns focus to that button.

Tab moves through native controls and links. Return in the search field submits. Search/filter/page updates retain focus on the control used. The Inspector uses a native modal dialog.

## Advanced demo settings

Expand **Advanced demo settings** to compare:

- **Query meaning:** complete the final word (default), require all exact words, or require an adjacent phrase.
- **Representation:** reanalyze original text, or use stored positions and offsets.
- **Execution:** run directly, or in one module worker.

Changing a setting rebuilds the engine, keeps your query and resets the category and page. **Destroy interface** removes the controls. **Reinitialize search** rebuilds the collection and mounts them again.

The demo enables phrases, facets, snippets and Inspector explicitly. It keeps data in memory and opens no database. A worker failure does not retry mutations automatically; Reinitialize search creates a fresh engine from the guide collection.

## Add the interface to your own application

Start with [the minimal UI recipe](../../docs/api/examples/ui.mjs) and the [complete markup and initialization](../../docs/api/HOSTS.md#mount-a-minimal-search-form). Provide an element for the controls and import `@vmitsaras/raveldex/addons/ui/styles.css`.

That recipe indexes one document. Searching `atomic` shows **Atomic updates**. Call its returned `dispose()` when removing the component.

For snippets/highlights, select original-text or offset providers and the snippet add-on before creating the engine. For filters, select the filter/facet add-ons and declare your metadata fields. Keep display text as text; snippets are bounded excerpts, and result links open the full guide.
