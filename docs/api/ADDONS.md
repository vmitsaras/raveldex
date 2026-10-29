# Optional search capabilities

Factories return `AddonRegistration` objects for `createRaveldex({ schema, addons })`. Their options are validated synchronously. Install providers at owner creation; they participate in the same atomic mutation revision, rollback, clear and disposal as core. They do not change ordinary term statistics or BM25 scores. [addons.mjs](examples/addons.mjs) runs source, position and mixed phrase strategies, typed filters/facets and separate Inspector/range/snippet requests.

## Source, positions and phrases

| Import and factory | Options / returned registration |
| --- | --- |
| `/addons/phrases/source`: `createSourceProvider(options)` | `SourceProviderOptions`: `{ fields: string[], id?, maxRetainedEntries?, maxWorkUnits? }`. Retains selected exact original text values. Also re-exported from `/addons/phrases`. |
| `/addons/phrases`: `createSourcePhrases(options)` | `SourcePhraseOptions`: `{ fields: string[], id?, maxWorkUnits? }`. Reanalyzes retained originals to verify strict token adjacency. |
| `/addons/positions`: `createPositionProvider(options)` | `PositionProviderOptions`: `{ fields: string[], offsets?: string[], id?, maxRetainedEntries?, maxWorkUnits? }`. Retains occurrences for selected fields; offsets must be a subset of those fields. |
| `/addons/phrases/positions`: `createPositionPhrases(options)` | `PositionPhraseOptions`: `{ fields: string[], id?, maxWorkUnits? }`. Verifies adjacency with stored positions; requires no originals or offsets. |
| `/addons/phrases/mixed`: `createPhrases(options)` | `MixedPhraseOptions`: `{ fields: Record<string, 'source' \| 'positions'>, id?, maxWorkUnits? }`. Selects a declared strategy per field. |

All phrase registrations provide `phrases` contract version 1. Choose one phrase registration per owner; duplicate providers conflict. Every query-selected field must have the declared provider, even for an empty phrase or no lexical candidates. Query using:

```js
const phraseQuery = {
  kind: 'extension', capability: 'phrases', version: 1,
  payload: { text: 'red car', fields: ['title', 'body'] },
};
```

Omitted query `fields` selects all schema text fields, so selecting a subset explicitly matters when only some fields have providers. A phrase is analyzed adjacency inside one original field value; it never crosses values/fields. Punctuation separates tokens and is not a literal phrase constraint. Repeated tokens affect eligibility, and no phrase bonus is added. At most 32 analyzed phrase tokens are allowed (also subject to the lower core query-token bound). Slop, proximity and synonym graphs are unavailable.

Positions preserve one position per emitted token. Offsets add half-open original UTF-16 coordinates; they do not imply retained display text. Source and position logical-entry/work ceilings can be reduced through options, and overflow rejects the whole operation. Entry counts are not heap bytes. Source-only and position-only utility imports exclude the unused phrase evaluator.

## Typed filters and exact facets

`createFilters(FilterOptions)` from `/addons/filters` accepts `{ fields: string[], id?, maxWorkUnits? }` and provides two version-1 query leaves over declared enabled metadata:

| Capability / exported payload type | Payload |
| --- | --- |
| `numeric-range` / `NumericRangePayload` | `{ field, gt?, gte?, lt?, lte? }`. Numeric field; at least one finite endpoint. Do not supply both lower operators or both upper operators. |
| `set-membership` / `SetMembershipPayload` | `{ field, values: Scalar[] }`. Nonempty, correctly typed scalar set; maximum 128 values, bounded by core metadata limits. |

A range on multi numeric metadata requires at least one individual value satisfying all endpoints. Set membership requires any strict equality intersection. Missing values fail the predicate; nullable fields can explicitly match null. These leaves use the ordinary `{ kind: 'extension', capability, version: 1, payload }` envelope and combine with lexical queries using `and`/`or`/`not`. They contribute no lexical score and retain no side index.

`createFacets(FacetOptions)` from `/addons/facets` accepts `{ fields: string[], id?, maxWorkUnits?, maxDistinctValuesPerField?, maxBucketsPerField? }`. Enabled fields must be string metadata. Request facets separately from query membership:

```js
const options = {
  extensions: { facets: { fields: [{ field: 'kind', limit: 10, missing: true }] } },
};
```

`FacetRequest.fields` contains `{ field, limit?, missing? }` selections. Facets count complete query membership before pagination, including all active filters: this is conjunctive counting, not an automatic disjunctive/self-excluding facet calculation. A document counts once per distinct value. Null and missing are separate tagged buckets; empty multi arrays contain no value. Results at `result.extensions.facets` have `FacetResult` shape `{ fields: FacetFieldResult[] }`. Each field has `{ field, buckets, distinctValueTotal, omittedBucketCount }`; each `FacetBucket` is `{ kind: 'value', value: string | null, count }` or `{ kind: 'missing', count }`. Order is count descending with deterministic value ties; the missing bucket remains distinctly tagged.

The default/maximum distinct-value ceiling is 10,000 per field and bucket ceiling is 100; the latter can be zero. A requested smaller bucket limit reports omitted buckets rather than an approximate count. Exceeding the distinct-value/work/output bound rejects the requested operation. Exact facets do not imply every bucket is displayed.

## Native Inspector

`createInspector(InspectorOptions = {})` from `/addons/inspector` installs factual evidence, with `{ id?, sourceFields?, maxFacts?, maxWorkUnits?, maxOutputEntries? }`. Source fields require matching source providers and only permit source selection; a search still must request them explicitly.

```js
const options = {
  extensions: {
    inspector: { ids: ['guide:updates'], expectedRevision: 1, sourceFields: ['title'] },
  },
};
```

`InspectorRequest` is `{ ids, maxFacts?, expectedRevision?, sourceFields? }`. At most 128 unique selected IDs and 4,096 facts are permitted, subject to configured lower limits. A mismatching expected revision rejects `REVISION_MISMATCH`; no historical root is retained for later explanations. Results at `extensions.inspector` are `InspectorData` with `kind: 'raveldex-inspector-v1'`, revision/model, configuration, selected `ScoreTrace`, documents, result counts, resources and numerical tolerance.

Facts come from executed native membership/scoring decisions. They show successful Boolean participation, winning alternative per group/field, `tf`, `df`, field population/lengths, boosts/weights, IDF, normalizer, TF part, selected contribution and summed score. This explains the actual `raveldex-bm25-v1` result, without guessed relevance percentages or a foreign scorer.

Selected `InspectorDocument` entries distinguish `matched`, `excluded` and `absent`, and `returned` versus `outside-page` placement. Score is null where unavailable. Absolute rank and all losing alternatives are explicitly `unavailable: not-collected`. `InspectorSource` distinguishes not-requested, absent record and available/absent fields. `InspectorResources` exposes work-v1/count scope before evidence projection; heap bytes are explicitly `unavailable: not-measured`. The tolerance is absolute/relative `1e-12`, not a cross-engine bit-identity promise.

`exportDiagnostics(data: InspectorData, options?: DiagnosticOptions): DiagnosticExport` returns `{ json, complete, omitted }`. Options are `{ maxCodeUnits?, includeFacts?, includeSource? }`. Defaults include metadata and exclude facts/IDs/canonical query and source. Source inclusion can only include source already selected in the request. The default/maximum output budget is 262,144 UTF-16 units. If selected facts/source do not fit, entire sections may be omitted with `complete: false` and their names in `omitted`; if even metadata does not fit, the export rejects. Unrequested sections are not reported as omissions. Output is valid JSON, never a truncated string. Review diagnostic content before sharing it.

The entry exports `InspectorOptions`, `InspectorRequest`, `InspectorSource`, `InspectorDocument`, `InspectorConfiguration`, `InspectorResources`, `InspectorData`, `DiagnosticOptions`, `DiagnosticExport`, `ScoreTrace`, `Fact` and `FieldFact` types. Ordinary searches do not request full trace trees.

## Original ranges and snippets

`createMatchEvidence(MatchEvidenceOptions)` from `/addons/evidence` accepts `{ fields: Record<string, 'source' | 'offsets'>, id?, maxFacts?, maxRanges?, maxWorkUnits?, maxOutputEntries? }`. Each field explicitly uses source reanalysis or stored original offsets. `MatchEvidenceRequest` is `{ ids, fields?, expectedRevision?, maxFacts?, maxRanges? }`, requested at `extensions['match-evidence']`.

`MatchEvidenceData` is `{ kind: 'raveldex-match-evidence-v1', revision, fields, scope: 'successful-positive-token-occurrences', complete: true, documents }`. Each `MatchDocument` has `{ id, eligibility, ranges }`. A `MatchRange` is `{ field, valueIndex, position, start, end, term }`; the range is half-open, local to the original value and uses UTF-16 coordinates. `term` is normalized search data; use the original value for display. Prefix evidence highlights the complete matching original token. Successful positive Boolean branches contribute occurrences; failed/negative branches do not.

`createSnippetEvidence(SnippetOptions)` from `/addons/snippets` extends those options with `{ maxSnippets?, maxCodeUnits?, maxHighlights? }`. It provides `snippets`, using `SnippetEvidenceRequest` (the same request shape). Originals are required even when occurrences use offsets; snippets do not silently retain them. Missing usable `Intl.Segmenter` rejects `UNSUPPORTED_ENVIRONMENT` when snippets are requested.

`SnippetEvidenceData` extends match data. Each `SnippetDocument` adds `snippets` and `snippetOmissions`. A `Snippet` has `{ field, valueIndex, start, end, text, highlights, omittedBefore, omittedAfter }`; its exact original text is ordinary text, never trusted HTML. `SnippetHighlight` coordinates are relative to that slice and expanded to grapheme boundaries. Render text nodes plus explicit marks. `SnippetOmissions` records `{ unshownMatches, windowLimit, highlightLimit, matchTooLong, graphemeTooLong }`.

Ranges are complete or reject; snippet presentation can omit matches explicitly. Maximum/default display bounds are three windows/document, 240 UTF-16 units/window and 32 merged highlights/window. Default/maximum facts and ranges are 4,096 each; selected IDs are at most 128. Output entries, aggregate key/string units and shared work also remain bounded. Requested limits may reduce these bounds. Only one evidence extension (Inspector, ranges or snippets) can be requested in a search; requesting two rejects `INVALID_OPTIONS`. Install multiple providers if useful, then request evidence in separate searches and bind `expectedRevision` when consistency across them matters.

## Bounded typo tolerance

The explicit `/addons/typo` factory and query leaf implement one-edit Unicode alternatives under the exact-first policy. Ordinary exact/prefix/phrase searches stay unchanged. See [policy, public types, example and bounds](TYPO.md).

## Dictionary-backed token suggestions

The explicit `/addons/suggestions` factory adds independent `options.extensions.suggestions = { text, fields?, limit? }` output. It completes one normalized token from the selected live dictionaries; it never rewrites the search query/input or adds UI behavior. Ranking uses summed field-local document frequency and stable ordinal ties, independent of qualifying hits/filters/pages. See [public types, complete policy, example and bounds](SUGGESTIONS.md).
