# Optional search capabilities

Add only the search features your application needs. Most factories below return an `AddonRegistration` that you pass to `createRaveldex({ schema, addons })`. They check their options immediately, and their state is updated, cleared and disposed together with the engine. The phrase, filter and evidence providers described here leave ordinary term statistics and BM25 scores unchanged.

The query-syntax parser and record-patch helper work separately, as explained in their sections. To try phrases, filters, facets and result explanations together, copy [addons.mjs](examples/addons.mjs) and call `runAddonsExample()`.

## Source, positions and phrases

A source provider keeps the original text for selected fields. A position provider keeps where tokens occur, with optional character offsets. For phrase search, choose a phrase evaluator that uses one of those providers, or a mixed strategy for different fields.

| Import and factory | Options / returned registration |
| --- | --- |
| `/addons/phrases/source`: `createSourceProvider(options)` | `SourceProviderOptions`: `{ fields: string[], id?, maxRetainedEntries?, maxWorkUnits? }`. Retains selected exact original text values. Also re-exported from `/addons/phrases`. |
| `/addons/phrases`: `createSourcePhrases(options)` | `SourcePhraseOptions`: `{ fields: string[], id?, maxWorkUnits? }`. Reanalyzes retained originals to verify strict token adjacency. |
| `/addons/positions`: `createPositionProvider(options)` | `PositionProviderOptions`: `{ fields: string[], offsets?: string[], id?, maxRetainedEntries?, maxWorkUnits? }`. Retains occurrences for selected fields; offsets must be a subset of those fields. |
| `/addons/phrases/positions`: `createPositionPhrases(options)` | `PositionPhraseOptions`: `{ fields: string[], id?, maxWorkUnits? }`. Verifies adjacency with stored positions; requires no originals or offsets. |
| `/addons/phrases/mixed`: `createPhrases(options)` | `MixedPhraseOptions`: `{ fields: Record<string, 'source' \| 'positions'>, id?, maxWorkUnits? }`. Selects a declared strategy per field. |

Choose one phrase registration per engine; duplicate providers conflict. All phrase registrations provide capability `phrases`, version `1`. Each field you search must have its required provider, even when the phrase is empty or no terms match.

This query fragment looks for adjacent `red` and `car` terms in `title` or `body`. First create an engine with those fields and a matching phrase registration, then pass `phraseQuery` to `engine.search`:

```js
const phraseQuery = {
  kind: 'extension', capability: 'phrases', version: 1,
  payload: { text: 'red car', fields: ['title', 'body'] },
};
```

A value containing `red car` can match; `red fast car` cannot. The two words must appear next to each other within one field value. This block creates a query only; it does not run a search or print a count.

Keep these phrase rules in mind:

- Omitted `fields` means all schema text fields. Select fields explicitly if only some have providers.
- Punctuation separates tokens. A token phrase is not a punctuation-sensitive literal string.
- Repeated terms must occur as required; a phrase never joins separate fields or array values.
- Phrases add no ranking bonus. They allow at most 32 analyzed tokens, or a lower configured core limit.

Use [proximity](PROXIMITY.md) to allow ordered gaps. Strict phrases do not accept gaps or synonym graphs.

Positions record token locations; offsets also record the original UTF-16 start and exclusive end. Offsets alone do not keep text for display. You can lower the providers' entry and work limits through their options. Exceeding a limit rejects the operation. Entry counts describe stored items, not heap bytes.

Use the source-only or position-only import when you do not need its phrase evaluator.

## Typed filters and exact facets

Use typed filters to narrow results by declared metadata without changing their lexical scores. Register `createFilters({ fields, id?, maxWorkUnits? })` from `/addons/filters`, then use either of these version-1 extension queries:

| Capability / exported payload type | Payload |
| --- | --- |
| `numeric-range` / `NumericRangePayload` | `{ field, gt?, gte?, lt?, lte? }`. Numeric field; at least one finite endpoint. Do not supply both lower operators or both upper operators. |
| `set-membership` / `SetMembershipPayload` | `{ field, values: Scalar[] }`. Nonempty, correctly typed scalar set; maximum 128 values, bounded by core metadata limits. |

For a multi-valued numeric field, at least one value must satisfy the whole range. Set membership matches if any supplied value equals a stored value. Missing fields do not match; nullable fields can explicitly match `null`.

Wrap the payload in `{ kind: 'extension', capability, version: 1, payload }` and combine it with text queries using `and`, `or` or `not`. Filters read core metadata and keep no extra side index.

Facets give you counts for categories such as `kind`. Register `createFacets({ fields, id?, maxWorkUnits?, maxDistinctValuesPerField?, maxBucketsPerField? })` from `/addons/facets` for string metadata fields.

The following options fragment requests up to ten `kind` buckets plus a missing-value bucket. It assumes your engine declares `kind` as string metadata and has the facet registration. Pass `options` as the second argument to `engine.search(query, options)`:

```js
const options = {
  extensions: { facets: { fields: [{ field: 'kind', limit: 10, missing: true }] } },
};
```

Read the counts from `result.extensions.facets.fields`. They cover all matches before pagination and include every active filter, including a filter on `kind` itself. Changing the hit page does not change these counts.

`FacetRequest.fields` takes `{ field, limit?, missing? }` selections. Each returned field contains `{ field, buckets, distinctValueTotal, omittedBucketCount }`. A bucket is either `{ kind: 'value', value: string | null, count }` or `{ kind: 'missing', count }`.

A document counts once per distinct value. `null` and missing are separate buckets, and an empty multi-value array adds no value. Buckets sort by descending count with deterministic value ties. If you want a category's counts to exclude its own active filter, compute that through a separate query.

The default and maximum limits are 10,000 distinct values per field and 100 returned buckets. The bucket limit can be zero. When you request fewer buckets, `omittedBucketCount` tells you how many are not shown; displayed counts remain exact. Exceeding a distinct-value, work or output limit rejects the search.

## Native Inspector

Use Inspector to explain why a record matched and how its score was calculated. Register `createInspector({ id?, sourceFields?, maxFacts?, maxWorkUnits?, maxOutputEntries? })` from `/addons/inspector`. To include source text, install a source provider, allow the field in `sourceFields`, and request it on the search.

This options fragment asks about `guide:updates` at revision `1`. It needs an engine with Inspector and a source provider for `title`. Pass it as the second argument to `engine.search(query, options)`:

```js
const options = {
  extensions: {
    inspector: { ids: ['guide:updates'], expectedRevision: 1, sourceFields: ['title'] },
  },
};
```

The result appears in `result.extensions.inspector`. Look there for the selected record's matching terms, score calculation and requested title text. If the collection is no longer at revision `1`, the request rejects with `REVISION_MISMATCH` instead of explaining a different revision. In your application, use a revision returned by a completed search or update.

`InspectorRequest` takes `{ ids, maxFacts?, expectedRevision?, sourceFields? }`. You can select up to 128 unique IDs and 4,096 facts, subject to lower configured limits. `InspectorData` includes `kind: 'raveldex-inspector-v1'`, revision/model, configuration, selected `ScoreTrace`, documents, result counts, resources and numerical tolerance. Inspector does not retain historical index state.

The facts describe the search that actually ran. They include participating Boolean branches, the winning alternative for each group and field, term/document frequencies (`tf` and `df`), field lengths and populations, boosts, weights and the BM25 arithmetic. Use these to understand a score; they are not relevance percentages.

Selected `InspectorDocument` entries distinguish `matched`, `excluded` and `absent`, and `returned` versus `outside-page` placement. Score is null where unavailable. Absolute rank and all losing alternatives are explicitly `unavailable: not-collected`. `InspectorSource` distinguishes not-requested, absent record and available/absent fields. `InspectorResources` exposes work-v1/count scope before evidence projection; heap bytes are explicitly `unavailable: not-measured`. The tolerance is absolute/relative `1e-12`, not a cross-engine bit-identity promise.

`exportDiagnostics(data: InspectorData, options?: DiagnosticOptions): DiagnosticExport` returns `{ json, complete, omitted }`. Options are `{ maxCodeUnits?, includeFacts?, includeSource? }`. Defaults include metadata and exclude facts/IDs/canonical query and source. Source inclusion can only include source already selected in the request. The default/maximum output budget is 262,144 UTF-16 units. If selected facts/source do not fit, entire sections may be omitted with `complete: false` and their names in `omitted`; if even metadata does not fit, the export rejects. Unrequested sections are not reported as omissions. Output is valid JSON, never a truncated string. Review diagnostic content before sharing it.

The entry exports `InspectorOptions`, `InspectorRequest`, `InspectorSource`, `InspectorDocument`, `InspectorConfiguration`, `InspectorResources`, `InspectorData`, `DiagnosticOptions`, `DiagnosticExport`, `ScoreTrace`, `Fact` and `FieldFact` types. Ordinary searches do not request full trace trees.

## Original ranges and snippets

Use match evidence when you need the original text ranges that matched. Register `createMatchEvidence` from `/addons/evidence` with `{ fields: Record<string, 'source' | 'offsets'>, id?, maxFacts?, maxRanges?, maxWorkUnits?, maxOutputEntries? }`. Choose whether each field uses original-source reanalysis or stored offsets.

Request `{ ids, fields?, expectedRevision?, maxFacts?, maxRanges? }` at `extensions['match-evidence']`. You receive original ranges for the selected documents, not ready-made HTML.

`MatchEvidenceData` is `{ kind: 'raveldex-match-evidence-v1', revision, fields, scope: 'successful-positive-token-occurrences', complete: true, documents }`. Each `MatchDocument` has `{ id, eligibility, ranges }`. A `MatchRange` is `{ field, valueIndex, position, start, end, term }`; the range is half-open, local to the original value and uses UTF-16 coordinates. `term` is normalized search data; use the original value for display. Prefix evidence highlights the complete matching original token. Successful positive Boolean branches contribute occurrences; failed/negative branches do not.

`createSnippetEvidence(SnippetOptions)` from `/addons/snippets` extends those options with `{ maxSnippets?, maxCodeUnits?, maxHighlights? }`. It provides `snippets`, using `SnippetEvidenceRequest` (the same request shape). Originals are required even when occurrences use offsets; snippets do not silently retain them. Missing usable `Intl.Segmenter` rejects `UNSUPPORTED_ENVIRONMENT` when snippets are requested.

`SnippetEvidenceData` extends match data. Each `SnippetDocument` adds `snippets` and `snippetOmissions`. A `Snippet` has `{ field, valueIndex, start, end, text, highlights, omittedBefore, omittedAfter }`; its exact original text is ordinary text, never trusted HTML. `SnippetHighlight` coordinates are relative to that slice and expanded to grapheme boundaries. Render text nodes plus explicit marks. `SnippetOmissions` records `{ unshownMatches, windowLimit, highlightLimit, matchTooLong, graphemeTooLong }`.

Range requests either return complete ranges or reject. Snippets can leave matches out of their displayed excerpts, and report those omissions. The default and maximum display limits are three windows per document, 240 UTF-16 units per window and 32 merged highlights per window. Facts and ranges each allow at most 4,096, and selected IDs at most 128. Output size and shared work limits also apply; request options can lower them.

Request only one evidence extension per search: Inspector, ranges or snippets. Asking for two rejects with `INVALID_OPTIONS`. You can install all of their providers, then make separate searches. Use `expectedRevision` if those explanations must refer to the same collection revision.

## Anchored page context

Use `createSectionEvidence` from `@vmitsaras/raveldex/addons/sections` when a result represents a whole page and you want links to matching headings. Index one record per page. The optional projection preserves native page scores, order, totals and pagination; it does not compute a global matching-section count or extract headings from HTML.

```js
import { createRaveldex } from '@vmitsaras/raveldex';
import { createSourceProvider } from '@vmitsaras/raveldex/addons/phrases/source';
import { createSectionEvidence } from '@vmitsaras/raveldex/addons/sections';

const original = 'Replace a bicycle chain.';
const engine = createRaveldex({
  schema: { text: { body: {} } },
  addons: [
    createSourceProvider({ fields: ['body'] }),
    createSectionEvidence({ fields: { body: 'source' } }),
  ],
});
const written = await engine.add({ id: 'repair', text: { body: original } });
const result = await engine.search('chain', {
  extensions: {
    'section-evidence': {
      ids: ['repair'], expectedRevision: written.revision,
      sections: [{ sectionIndex: 0, field: 'body', valueIndex: 0, start: 0, end: original.length }],
      maxPreviews: 3,
    },
  },
});
console.log(result.extensions['section-evidence']);
await engine.dispose();
```

Each request selects exactly one ID and carries the complete canonical descriptor list for that page, up to 64 entries. Indexes must be consecutive from zero in field/value/start/end source order. `expectedRevision` is required. Original UTF-16 half-open spans must be nonempty, disjoint, in a configured field/value and end at actual grapheme boundaries. Scalar text uses value index zero; arrays preserve their original indexes. An absent or excluded selected ID returns its native eligibility with empty ranges/previews and zero local omissions. Empty descriptors declare no mapped scope and produce no previews or scoped omission counts.

`fields` selects explicit source or offsets strategies. Both need source for display; offsets additionally need the original-offset positions provider. Factory options reuse match-evidence ID/fact/range/work/output limits and add `maxCodeUnits` (1–240, default 240) and `maxHighlights` (1–32, default 32). `maxPreviews` belongs to each request (1–3, default 3). Register the same factory/options explicitly in a worker; no new worker command is needed. Import and factory creation perform no source segmentation or host initialization.

The response keeps the match-evidence header and original positive ranges. Its selected document adds `sectionPreviews: [{ sectionIndex, snippet, snippetOmissions }]` and `sectionOmissions: { omittedSections, unmappedRanges, boundaryRanges }`. A section qualifies only when it contains a complete positive occurrence. The first qualifying sections in source order win, even when an oversized match makes a selected excerpt null. Cross-boundary occurrences are counted separately and never clipped into a fabricated token. The page may match different query clauses in different sections.

Excerpts stay within their section and original value. They use at most 240 UTF-16 units and 32 merged grapheme-safe marks, with explicit existing snippet omissions; omitted-before/after flags refer to the section's text. The complete response refuses rather than silently truncating evidence. Fixed ceilings include 4,096 facts/ranges, 262,144 section/range pair visits, 10,000,000 shared work units, 16,384 output entries and an additional 262,144 serialized UTF-8 bytes; lower native/configured bounds still apply. These are admission/output bounds, not memory or latency guarantees.

For heading metadata and links, use the [inline section options](HOSTS.md#inline-anchored-sections). For build-time delivery, use the [optional Astro companion](STATIC_ASTRO.md#optional-heading-maps). The [page/section contract](https://github.com/vmitsaras/raveldex/blob/main/docs/specs/PAGE_SECTIONS.md) specifies exact validation, clipping, limits and failure behavior.

## Bounded typo tolerance

Choose `/addons/typo` when you want a query to accept a single character edit or adjacent swap. Exact terms take priority, and ordinary exact, prefix and phrase searches keep their existing rules. See [the example, policy and limits](TYPO.md).

## Dictionary-backed token suggestions

Use `/addons/suggestions` to offer word completions from your indexed vocabulary. Request them through `options.extensions.suggestions = { text, fields?, limit? }`. Suggestions are separate from hits and use word frequency across the selected fields, regardless of the current filters or page. Your application decides whether and how to show or apply them. See [the example and complete rules](SUGGESTIONS.md).

## Directional one-step synonyms

Use `/addons/synonyms` to define your own one-way word mappings, such as `backup` to `snapshot`. A requested synonym query keeps each original word as a requirement, with mapped alternatives at weight `0.5`. Expansion stops after one step. The result lists the mappings used and the vocabulary version. See [the example, public types and limits](SYNONYMS.md).

## Selected English analysis

Select the [English analyzer](ENGLISH.md) through `Configuration.analyzer` when creating the engine. It joins some related word forms, so differently spelled words can also match in phrases. Highlights still refer to complete original tokens. The current typo, synonym and suggestion requests support only `basic-v1` and reject under English analysis. The language rules do not create another per-corpus index.

## Identifier analysis

Choose `/addons/identifiers` for names such as `maxQueuedOperations`. Ordinary searches can find the whole name or its components; strict phrases still use original identifiers. Match ranges distinguish the whole name from a component. See [setup, examples and compatibility](IDENTIFIERS.md). Choose basic, English or identifier analysis for an engine rather than mixing them automatically.

## Literal and infix matching

Use `/addons/literal` to match original text exactly, including case, punctuation and substrings inside a word. It needs source providers for the selected fields. A literal-only query returns zero-scored matches; combining it with a text query keeps that text query's BM25 scoring. Its own range output can show overlapping matches. See [the example and Unicode rules](LITERAL.md).

## Ordered proximity

Use `/addons/proximity` when words must appear in order but may have a limited gap between them. Install position providers first. Matches stay within one field value, repeated words need distinct positions, and distance adds no score bonus. With a zero gap, singleton groups behave like a strict phrase. See [the example and evidence restrictions](PROXIMITY.md).

## Explicit query syntax

Use `/addons/query-syntax` when your search box should accept operators, field names, phrases and prefixes. Parse the input in your application, then pass the resulting typed query to the engine. The parser does not change ordinary strings or the built-in UI. Invalid syntax returns an error with a source span rather than falling back to plain search. See [the grammar and example](QUERY_SYNTAX.md).

## Explicit record patches

Use [`createPatch`](RECORD_PATCH.md) to change selected whole fields without assembling the rest of a record yourself. It needs a direct engine, source providers for every text field and the revision you observed. It uses the ordinary atomic replacement operation and keeps no extra source copy. It is a helper, not an `AddonRegistration`.


## Optional-feature refusal and recovery

Choose features explicitly and expose only the controls that their registered
providers can serve. Missing phrases/positions/snippets/facets produce typed
capability failures even when a query has no hits; that is different from an empty
successful search. Preserve the original code and explain the unavailable setup,
then explicitly change the registrations or remove the corresponding control.
Do not install a provider, retain originals, change analyzer, query a network
service or write storage as an implicit recovery step.

Suggestions are separate vocabulary completions, not filtered result counts.
Invalid syntax, unsupported analyzer combinations, bounded prefix expansions,
work/queue limits and cancellation keep their declared refusals. Preserve entered
text and selections; offer a valid smaller request or the existing browse path.
The [host recovery guide](HOSTS.md#recovery-choices-in-your-application) distinguishes
read retries, storage refusals and unconfirmed writes. Each feature guide above defines the capability and bounds its requests need.
