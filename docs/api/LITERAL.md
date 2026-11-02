# Literal and infix search

Use literal search when the exact spelling matters, including punctuation, case, spaces or a substring inside a word. It scans original text kept by a source provider. Ordinary word searches keep their usual rules.

Run this example in an installed ESM application. It looks for `<Search` inside `Promise<SearchResult>`:

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

The example prints `1 0`: one record matched, with a score of zero because this is a literal-only query. It then disposes the engine.

Register `createLiteral({ fields, id?, maxWorkUnits?, maxRanges?, maxOutputEntries? })` and a source provider for every enabled field. The literal add-on does not retain source automatically, and missing providers produce an error. It adds no n-gram index, source cache or host activity.

`LITERAL_POLICY` is `raw-substring-v1`. The registration ID defaults to `literal`; changing it does not rename the fixed `literal` query and evidence capability.

## Matching and ranking

The payload is `{ text, fields? }`. Leave out `fields` to scan all fields enabled in the factory, or select a nonempty subset without duplicates. Empty text is invalid.

Matching is raw and case-sensitive, without normalization, stemming, accent folding or locale rules:

- `red—blue` differs from `red blue`.
- `café` differs from the decomposed spelling `café`.
- `ﬃ` differs from `ffi`.

You can search inside an identifier or for punctuation alone. This differs from token-prefix search and works against the same originals under basic, English or identifier analysis.

A literal query matches a document once if any selected field value contains the text. It never joins separate values or fields. You can combine separate literal queries with AND, OR or NOT as usual.

Literal matches add zero to the score, so literal-only ties sort by record ID. When combined with word queries, BM25 scores the successful word groups normally. The number or length of substring matches adds no bonus. Totals and pagination remain exact.

## Original ranges

Request `extensions.literal = { ids, maxRanges?, expectedRevision?, maxFacts? }` in search options. The output has `kind: 'raveldex-literal-evidence-v1'`, `policy`, `revision`, `scope: 'successful-positive-literal-occurrences'`, `complete: true`, `leaves` and `documents`. Leaf descriptors `{ path, text, fields }` include all compiled literal leaves for context. Each requested document has `{ id, eligibility: 'matched' | 'excluded' | 'absent', ranges }`. Each range `{ leaf, field, valueIndex, start, end }` identifies its successful positive leaf and actual half-open original UTF-16 span. NOT and failed Boolean branches contribute no ranges. Overlaps are retained: `aba` in `ababa` gives `[0,3)` and `[2,5)`.

Malformed UTF-16 rejects. Ranges respect code-point boundaries but can divide a grapheme: raw `cafe` matches before the combining acute in `café`; the combining mark can be a needle itself. There is no synthetic token position, normalized offset or token-snippet projection. The existing single evidence-request limit applies; request Inspector or token evidence in a separate operation when needed.

## Bounds and compatibility

Factory work defaults to 10,000,000 work-v1 units and can only be narrowed. One module budget covers all leaves and evidence in the complete search; the shared core work/deadline/cancellation ceilings remain stricter when applicable. Membership scans can stop on a document's first occurrence, while totals still qualify every document. Requested ranges enumerate all selected positive occurrences and reject the operation on overflow, with no silent truncation.

Default range cap is 256; factory configuration permits 1–1024, and request caps only narrow it. Output defaults to 16,384 structural entries and may be narrowed; factual output also has a 262,144 aggregate UTF-16 text cap. Evidence IDs are limited to 128 and facts to 4,096, further reduced by core limits. Literal text plus selected field strings is capped at 2,048 UTF-16 units and reduced lexical limits; captured source-predicate strings count conservatively toward the shared lexical ceiling. Original source values keep existing core limits.

Payloads/options are owned before queued execution. Source and core mutations remain atomic; queries/evidence use the execution revision. Worker configuration binds policy, fields and limits. Existing source/native codecs are reused, with exact qualified-Node restrictions for native state; version strings alone do not qualify changed artifacts. See [runtime and snapshot requirements](COMPATIBILITY.md).
