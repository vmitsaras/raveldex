# Packed browser documentation pilot

This optional native interface searches 34 complete sections from the same five current specification/architecture files allowlisted by [the core corpus builder](../core-docs/corpus.mjs). Section bodies stay unchanged, including Markdown and code. The application owns titles, IDs, category metadata, original source and GitHub source links. Archived plans, evidence and historical proposals are excluded.

From the repository root:

```sh
npm ci
npm run pilot:ui
```

Open the local URL printed by the command. Stop its local server with Ctrl+C. The runner builds the private ESM package, packs it, installs the actual tarball into an isolated consumer, generates `corpus.json` from the explicit allowlist, bundles [main.mjs](main.mjs) through public installed package imports, and copies the separately exported UI CSS. No package is published, no remote service is called, and loading the pilot fetches only its local corpus. Following a source link navigates to the corresponding GitHub section.

## Interactions

- Submit a query such as `term contribution`, `atomic mutation`, or `original source`. Exact-term mode uses AND over analyzed exact terms; strict phrase mode also requires adjacent tokens in one original field value.
- Select a document category, inspect its exact conjunctive count, clear the selection, and move through pages without changing the complete total.
- Open a result's Inspector to request actual native facts, inspect score contributions and configuration, then close it. Source is not selected for Inspector output by default.
- Switch between source reanalysis and stored positions/original offsets. Both use the same original corpus. The application destroys the previous interface, awaits owner disposal and then indexes a new owner. It preserves search text; category selection and page reset.
- Use **Destroy interface** and **Reinitialize search** to exercise cleanup. Rapid setup changes suppress stale mounts and abort in-flight indexing. Leaving the page tears down the application listeners and active UI/owner.

Snippets come from the packaged optional evidence module and are inserted as text plus explicit marks. Bounded snippets can omit context or matches; complete original range evidence remains separate. Neither normalization nor HTML rendering rewrites displayed source. UI and CSS are independent optional exports, outside the core import graph. The example uses no framework, worker or persistence adapter.

## Evidence boundaries

The local packed-consumer browser checks cover concrete UI behavior and are recorded separately from source inspection, build/type checks and direct engine relevance judgments. The appearance of results is not proof of assistive-technology behavior. Exact-tool screen-reader observations, broad browser support, retained/peak heap and physical interaction latency require separate qualification. Inspector work units and corpus hashes identify logical work and evaluated bytes; they do not measure those costs.

Existing real-document judgments remain useful for lexical/ranking observations. “Atomic batch” may miss its intended section, natural-language questions need not find an exact-term document, and a matching intended source can rank below another relevant section. The pilot retains such findings without changing the adopted analyzer or scorer.
