# Token suggestions

Use token suggestions to offer completions from words that are already indexed. Register the add-on from `@vmitsaras/raveldex/addons/suggestions`, then request suggestions separately from the search query. Your application decides whether to display or apply them.

Run this example in an installed ESM application. It searches for `source` while asking for completions of `so`:

```js
import { createRaveldex } from '@vmitsaras/raveldex';
import { createSuggestions } from '@vmitsaras/raveldex/addons/suggestions';

const engine = createRaveldex({
  schema: { text: { title: {} } },
  addons: [createSuggestions({ fields: ['title'] })],
});
try {
  await engine.addMany([
    { id: 'a', text: { title: 'Source snapshots' } },
    { id: 'b', text: { title: 'Source recovery' } },
  ]);
  const result = await engine.search('source', {
    extensions: { suggestions: { text: 'so', limit: 5 } },
  });
  console.log(result.extensions.suggestions);
  // policy: dictionary-prefix-df-v1; source has fieldDocumentFrequency 2.
  // result.total/hits still describe the ordinary submitted query "source".
} finally {
  await engine.dispose();
}
```

The printed suggestions include `source` with `fieldDocumentFrequency: 2`, because it appears in both indexed titles. The search still returns the two records matching the submitted query `source`; requesting completions does not replace that query.

Register `createSuggestions({ fields, id?, maxSuggestions?, maxCandidates?, maxWorkUnits? })`. The factory copies and freezes its options, and the capability stays named `suggestions` even if you change the registration ID. The default result limit is 10 and the maximum is 20. Matching candidates are limited to 10,000 by default and at most 10,000; the work budget defaults to 10,000,000 units. Candidate and work options can only lower those maxima.

Request `{ text, fields?, limit? }` through `SearchOptions.extensions.suggestions`. The text must produce no more than one `basic-v1` token. Surrounding punctuation is fine. Empty text, punctuation alone or a prefix shorter than two normalized Unicode code points gives no suggestions. Multiple tokens reject with `INVALID_OPTIONS`.

Fields default to all schema text fields, and every requested field must be enabled. An explicit list cannot be empty, duplicated or contain unknown names. Set `limit: 0` if you only need the exact suggestion total; any limit must fit the installed cap.

`SuggestionsResult` contains `{ policy, prefix, fields, total, omitted, items, dictionaryEntriesVisited }`. Items are readonly `{ term, fieldDocumentFrequency }`. Terms/prefix are normalized once by existing NFKC/lowercase rules. Candidate prefix matching includes exact terms; it adds no accent folding or typo correction. Rank is descending summed field-local document frequency, then ordinal UTF-16 term order. A document can contribute in multiple selected fields. Counts are not BM25 scores or unique-document counts across fields.

Suggestions use all selected indexed fields, not just records matching the current query, filters or page. The enclosing search revision identifies the dictionary used. Updates, replacements, removals and clear operations update that dictionary too.

`omitted` counts matching terms outside the returned list. Exceeding candidate, output, work or deadline limits rejects the operation rather than returning a partial total. Cancellation and disposal work as usual. The add-on keeps no extra retained index or cross-operation cache.

Exports: `createSuggestions`, `SUGGESTIONS_POLICY`; types `SuggestionsOptions`, `SuggestionRequest`, `Suggestion`, `SuggestionsResult`. No new engine method is added. Optional worker use requires matching explicit host/client registration options.

This add-on supplies data, not a suggestion widget. In your interface, handle stale results, input-method composition, announcements and the user's choice to apply a suggestion. The built-in UI is unchanged. See [optional search capabilities](ADDONS.md).
