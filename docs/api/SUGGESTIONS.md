# Token suggestions

Import `@vmitsaras/raveldex/addons/suggestions` and install the registration explicitly. Suggestions describe the current selected text dictionaries. They are separate from hits and never replace input.

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

`createSuggestions({ fields, id?, maxSuggestions?, maxCandidates?, maxWorkUnits? })` returns an `AddonRegistration`. The capability name remains `suggestions` when the registration ID changes. Options are immutable owned values. Default/max result capacity is 10/20; default/max matching candidate capacity is 10,000. Work defaults to the unchanged 10,000,000 cap; candidate and work overrides can only narrow their maxima.

Request `{ text, fields?, limit? }` through `SearchOptions.extensions.suggestions`. Text must produce at most one `basic-v1` token. Surrounding punctuation is allowed; empty/punctuation-only and fewer than two normalized Unicode code points return no suggestions. More than one token rejects `INVALID_OPTIONS`. Fields default to all schema text fields and every selected field must be enabled; explicit duplicates/empty/unknown fields reject. `limit` may be zero, still producing an exact total, and must fit the installed cap.

`SuggestionsResult` contains `{ policy, prefix, fields, total, omitted, items, dictionaryEntriesVisited }`. Items are readonly `{ term, fieldDocumentFrequency }`. Terms/prefix are normalized once by existing NFKC/lowercase rules. Candidate prefix matching includes exact terms; it adds no accent folding or typo correction. Rank is descending summed field-local document frequency, then ordinal UTF-16 term order. A document can contribute in multiple selected fields. Counts are not BM25 scores or unique-document counts across fields.

The full selected corpus supplies suggestions regardless of search query, metadata filters or hit page. The enclosing result revision identifies the live dictionary state. Add/replace/remove/clear cannot leave stale candidates. `omitted` counts known matches outside the returned list. Exceeding candidate/output/work/deadline bounds rejects the whole operation; it never returns a partial total. Existing signals, disposal and typed error channels apply. No optional retained index or cross-operation cache is added.

Exports: `createSuggestions`, `SUGGESTIONS_POLICY`; types `SuggestionsOptions`, `SuggestionRequest`, `Suggestion`, `SuggestionsResult`. No new engine method is added. Optional worker use requires matching explicit host/client registration options.

No UI is installed. Applications control stale results, IME/composition, announcements and explicit suggestion application. Existing UI behavior and input remain unchanged. See the [add-on protocol](ADDONS.md).
