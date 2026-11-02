# Independent page/section contract fixtures

These are handwritten **contract-test descriptors**, not exported API input, a static artifact, a production projector, or evidence that section rendering already exists. The [page/section contract](../../../docs/specs/PAGE_SECTIONS.md) owns the selected behavior; RX-6005 implements and executes the projection cases. A later test may call real public APIs to obtain **actual** results, but must not generate these expected values with the production analyzer, scorer, range builder or section projector.

## Files and references

- `corpus.json` supplies four complete records, separate display documents, literal original slices/tokens, seven typed queries, hand-derived native scores, page order and the direct/worker × source/offsets-with-source matrix.
- `projection.json` supplies the optional mapped descriptors and nine literal context cases. `queryId` refers to `corpus.json.queries[].id`. `sourceSliceIndex` refers to its `sourceSlices`; highlight pairs are half-open UTF-16 positions relative to that exact slice. `expectedTokenIndices` and `outsideMapTokenIndices` refer to `allOriginalTokens`, not a newly generated token list.
- `failures.json` supplies observable structural/provider/lifecycle/static refusals and exact finite boundary/+1 descriptors; `compatibility.json` supplies old/new producer/reader cases.
- `urls.json` includes direct query preservation, mapped-parent fragment refusal, unchanged unmapped legacy fragments and literal 2,048/2,049 URL boundaries. `windows.json` includes source-clipped 40-unit context, 240/241-unit clusters, 32/33 marks and a selected oversized first section that cannot be replaced by the fourth.
- Context state labels and mutation descriptions in these files describe observable expectations; they do not freeze a second competing public wire schema. The owning contract defines final names, validation and compatibility.

## Native page arithmetic

All four indexed records are identical. Display titles and URLs differ, but are not substituted for indexed text. Each title has two tokens; each body has nine tokens across two distinct values. Body frequency is alpha 3, beta 2, gamma 2, delta 1 and café 1. Every queried term occurs on all four pages, so `N = df = 4`, `idf = ln(10/9)` and each field's length equals its average length. With boost 1 and the native fixed constants `k1 = 1.2`, `b = .75`, the normalizer is 1.2. Alpha contributes `idf × 11/7`, gamma contributes `idf × 11/8`, and a single occurrence contributes `idf`.

The numerical expectations are handwritten from that arithmetic. Use a relative/absolute tolerance of `1e-12` when comparing floating-point results. Every case has exact total **4 pages** and native ID order `page:a`, `page:b`, `page:c`, `page:d` because scores tie. Limit 2 returns a/b then c/d; offset 4 and limit 0 return no hits while preserving total 4. The map, section count, headings and chosen previews cannot alter those scores, ties, pages or totals.

The `cross-section` query is alpha AND delta in body. No individual section on page:a contains both words, although the native page qualifies. A section preview means qualifying positive original evidence is present there; it does not claim every page-level clause matched inside that section. `mixed-fields` similarly qualifies across title and body. `title-only` must not borrow an otherwise identical alpha occurrence from an unselected body path. `all` creates no fabricated positive-token evidence.

## Original coordinate ruler

The first body value is 33 UTF-16 code units:

```text
😀 café alpha beta. gamma delta.
0  3     9     15    21    27   33
```

The emoji occupies `[0,2)`. The following space is `[2,3)`. Original `café` is **decomposed** (e plus combining acute), occupies `[3,8)` and normalizes to the term café. Alpha is `[9,14)`, beta `[15,19)`, gamma `[21,26)` and delta `[27,32)`. The first mapped slice is `[0,20)` and the second `[21,33)`; the gap is the ordinary separating space. Coordinates are never UTF-8 bytes or normalized-string offsets.

The second body value is independent and 24 code units long:

```text
alpha beta. alpha gamma.
0     6     12    18    24
```

Its alpha ranges are `[0,5)` and `[12,17)`, beta `[6,10)`, gamma `[18,23)`. Token positions restart at zero in this value. Title has its own `[0,5)` alpha and `[6,11)` gamma. Identical numeric coordinates in different fields or values are different source locations.

## Section selection and links

Page:a has four disjoint source sections. Repeated heading text **Details** is legitimate because its explicit anchors are different. Three qualifying sections are the hard/default display cap: the first three in lexical field-name, value-index, start, end, raw-anchor order are selected, not the three with most matches. The fourth qualifying descriptor is recorded as locally omitted; that is not an exact global matching-section total. Missing/empty maps and no-positive/no-contained-range cases keep their valid page link. Missing/empty map cases make no section request, so their native omission counters are **unknown**, represented by null descriptor fields, not invented zeros or complete unscanned counts.

Page:c deliberately covers only one source slice. Page:d deliberately supplies its descriptors in a different array order: body value 0 comes before body value 1, which comes before title, irrespective of insertion order or heading level. Levels are explicit heading metadata and do not create nested overlapping content ranges.

The raw page:a anchor `%#café` names the exact application-authored DOM ID. Its expected URL is `https://docs.example/help/guide/a/#%25%23caf%C3%A9`. It is encoded once, never treated as a pre-encoded fragment or another URL. The companion static format does not make fragments legal in the existing parent directory path contract. A mapped direct parent also rejects a preexisting fragment while preserving an allowed query string; unmapped legacy URLs keep their existing behavior. Actual rendered target IDs remain an application obligation, not a reason for the library to crawl destination pages.

The `whole-token-containment` case maps body `[10,14)`, which is a valid sequence of graphemes but starts inside the alpha token `[9,14)`. That range crosses a section boundary and cannot make a clipped `lpha` highlight or a qualifying section. It is tracked separately from wholly unmapped positive evidence.

All positive mapped slices here fit inside a short excerpt. Their exact text and marks are literal. Larger-window/oversized-grapheme cases belong to the failure/limit descriptors and must not cause a later qualifying section to replace one of the selected first three.

## Verification ownership

RX-6004 reviews these independent expectations, literal UTF-16 slices, hand arithmetic, validation branches and finite limits. Its native baseline check can instantiate current native APIs without implementing section projection. RX-6005 owns real capture/provider/projection/renderer and installed direct/worker parity checks against these same expectations, including stale-owner/revision behavior and refusal versus malformed-reply behavior. The static adapter owner in RX-6005 owns old/new companion compatibility and fragment URL checks. RX-6007 owns final real heading-target navigation in the complete modal starters; RX-6008 owns first-wave human/platform qualification. No test in this directory is a substitute for those later executions.

## Boundary descriptors are individual axes

`failures.json.limitCases[].withinThisLimit` records an inclusive numeric ceiling on one axis; `oneBeyond` records the next value and expected refusal/scheduling stage. It deliberately does **not** say the whole operation is accepted: for example, 4,096 ranges can still exceed output entries/UTF-8 bytes or work, and existing lower owner limits win. Product ceilings (64×4,096 visits, 3×240 text, 1,000×3 child previews) are derived from their enforced dimensions; a one-beyond state may be unreachable without exceeding an earlier input bound. No large allocation or absent runtime is executed just to manufacture a boundary here. Source lengths are UTF-16 units, serialized bounds are UTF-8 bytes, and neither is retained/peak memory. Every boundary has a named RX-6005 implementation/verification owner; one-in-flight scheduling waits rather than inventing a new error.

Standalone direct section requests for absent or query-excluded IDs have empty ranges/previews and zero local omissions, skipping source-value reads after global request/field/provider/Segmenter validation. Those are valid API outcomes. An externally supplied absent/excluded reply for an ID already known to be a main hit is inconsistent and fails the whole presentation attempt. Missing/empty-map UI states differ: they do not request context and their native counts remain unknown.
