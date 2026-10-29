# Literal and infix search

Use an explicit literal query when punctuation, case, spaces or a substring inside a token matters. Literal search scans retained original text; ordinary token queries remain unchanged.

```js
import { createRaveldex } from '@vmitsaras/raveldex';
import { createSourceProvider } from '@vmitsaras/raveldex/addons/phrases/source';
import { createLiteral } from '@vmitsaras/raveldex/addons/literal';

const engine = createRaveldex({
  schema: { text: { body: {} } },
  addons: [createSourceProvider({ fields: ['body'] }), createLiteral({ fields: ['body'] })],
});
try {
  await engine.add({ id: 'api', text: { body: 'Promise<SearchResult>' } });
  const page = await engine.search({
    kind: 'extension', capability: 'literal', version: 1,
    payload: { text: '<Search', fields: ['body'] },
  });
  console.log(page.total, page.hits[0].score); // 1 0
} finally {
  await engine.dispose();
}
```

`createLiteral({ fields, id?, maxWorkUnits?, maxRanges?, maxOutputEntries? })` exports the versioned `LITERAL_POLICY = 'raw-substring-v1'`. The default registration ID and fixed query/evidence capability are `literal`; changing registration ID does not rename the capability. Source providers for every enabled field are required explicitly. Missing providers reject instead of pretending to support source-free literal search. No source retention, n-gram index, source cache, host or worker is created by this add-on automatically.

## Matching and ranking

Query payload is `{ text, fields? }`. Omit fields to scan the factory's enabled fields; an explicit subset must be nonempty, unique and enabled. Text is an exact raw case-sensitive substring, including punctuation and whitespace, with no normalization, token analysis, stemming, accent folding or locale rules. Reject empty text. `red—blue` differs from `red blue`, `café` differs from decomposed `café`, and `ﬃ` differs from `ffi`. Infixes inside identifiers and punctuation-only needles are valid. This is separate from token prefix search and matches identically against originals under basic, English and identifier analyzers.

A leaf cannot cross values or fields. It matches a document once if any selected original value contains the needle. AND/OR/NOT keep their native meaning; separate leaves can match independent values. Exact totals and deterministic pages are preserved. Literal leaves contribute **zero score**; pure literal ties sort by record ID. Mixed lexical/literal queries retain the successful lexical groups' native BM25 with no occurrence-count or substring-length bonus.

## Original ranges

Request `extensions.literal = { ids, maxRanges?, expectedRevision?, maxFacts? }` in search options. The output has `kind: 'raveldex-literal-evidence-v1'`, `policy`, `revision`, `scope: 'successful-positive-literal-occurrences'`, `complete: true`, `leaves` and `documents`. Leaf descriptors `{ path, text, fields }` include all compiled literal leaves for context. Each requested document has `{ id, eligibility: 'matched' | 'excluded' | 'absent', ranges }`. Each range `{ leaf, field, valueIndex, start, end }` identifies its successful positive leaf and actual half-open original UTF-16 span. NOT and failed Boolean branches contribute no ranges. Overlaps are retained: `aba` in `ababa` gives `[0,3)` and `[2,5)`.

Malformed UTF-16 rejects. Ranges respect code-point boundaries but can divide a grapheme: raw `cafe` matches before the combining acute in `café`; the combining mark can be a needle itself. There is no synthetic token position, normalized offset or token-snippet projection. The existing single evidence-request limit applies; request Inspector or token evidence in a separate operation when needed.

## Bounds and compatibility

Factory work defaults to 10,000,000 work-v1 units and can only be narrowed. One module budget covers all leaves and evidence in the complete search; the shared core work/deadline/cancellation ceilings remain stricter when applicable. Membership scans can stop on a document's first occurrence, while totals still qualify every document. Requested ranges enumerate all selected positive occurrences and reject the operation on overflow, with no silent truncation.

Default range cap is 256; factory configuration permits 1–1024, and request caps only narrow it. Output defaults to 16,384 structural entries and may be narrowed; factual output also has a 262,144 aggregate UTF-16 text cap. Evidence IDs are limited to 128 and facts to 4,096, further reduced by core limits. Literal text plus selected field strings is capped at 2,048 UTF-16 units and reduced lexical limits; captured source-predicate strings count conservatively toward the shared lexical ceiling. Original source values keep existing core limits.

Payloads/options are owned before queued execution. Source and core mutations remain atomic; queries/evidence use the execution revision. Worker configuration binds policy, fields and limits. Existing source/native codecs are reused, with exact qualified-Node restrictions for native state; prior remote CI does not qualify this changed feature. Logical work and code-size measurements do not establish heap/allocation peaks or physical latency. There is no UI/announcement change, normalization mapping, automatic acceleration or additional runtime dependency. See the [adopted specification](../specs/LITERAL_MATCHING.md).
