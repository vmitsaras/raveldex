# Practical limits and recovery

## Matching text

A default string search requires every complete normalized word to match. It does not guess meaning, remove accents, correct spelling or treat the last word as an unfinished prefix.

Choose [prefix queries](CORE.md#query-shapes), [typo tolerance](TYPO.md), [synonyms](SYNONYMS.md) or [query syntax](QUERY_SYNTAX.md) explicitly when your interface needs them.

[English stemming](ENGLISH.md) can join differently spelled words, but can also join words you intended to keep separate. Review results against your own vocabulary. Literal/infix and ordered-proximity matching are separate optional operations; they are not enabled by ordinary strings.

## Retain the data you need

Core keeps index statistics, not your original text or word locations. If you need phrases, source export, highlights or snippets, select their source or position providers when creating the engine. To change providers or the analyzer, create a new engine and rebuild.

A snippet is a short excerpt and may leave out matches or surrounding context. Link to the full document so readers can see the rest. Render snippet text as text nodes with explicit highlight marks; never treat it as trusted HTML.

## Handle operation limits

Limits apply separately to records, dictionaries, postings, queues, work, output and deadlines. Successfully adding a collection in small batches does not guarantee that a one-operation source restore will fit its budget.

Handle `WORK_LIMIT_EXCEEDED` and `DEADLINE_EXCEEDED` as failed operations. They do not provide a successful search with an incomplete total.

Pass an `AbortSignal` when work becomes obsolete, handle the typed error, and keep authoritative application data for recovery. See [execution, errors and bounds](CORE.md#execution-errors-and-bounds).

## Recover worker and storage operations

A worker may complete an update even if its reply never arrives. Use the operation ID to reconcile while that worker session survives. If the worker is lost or the receipt has expired, rebuild from your authoritative source rather than blindly retrying the update.

Keep the generation token returned by IndexedDB save or load, and supply it when saving or erasing. If another writer changed the generation, load the current one and decide how to resolve the conflict. Treat quota and storage-availability errors as failures, not successful saves.

The DOM UI shows a generic search error for worker failures. Use the adapter's typed error when you need application diagnostics.

## Choose snapshot format deliberately

Source snapshots rebuild under the receiver and may exceed its operation budget. Native snapshots require the exact application-qualified Node runtime; they are not portable browser caches. See [snapshot requirements](COMPATIBILITY.md#snapshot-compatibility).

## Test your interface

The native UI supplies labeled controls, status messages and a modal Inspector. Keep visible focus and readable contrast when styling it. Status speech can be interrupted by typing feedback; confirm the important flows in your application's target browser and assistive technology. See [UI integration](HOSTS.md#native-dom-ui-and-css).
