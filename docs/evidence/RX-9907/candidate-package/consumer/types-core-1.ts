import {
  createRaveldex, RaveldexError, ERROR_CODES,
  type Configuration, type Raveldex, type Query, type SearchResult,
  type MutationResult, type RecordInput, type CancellationSignal,
  type ErrorCode, type ErrorDetails, type Limits, type LimitOverrides,
} from '@vmitsaras/raveldex';
import { createSourceProvider, createSourcePhrases, type SourceProviderOptions, type SourcePhraseOptions } from '@vmitsaras/raveldex/addons/phrases';
import { createSourceProvider as sourceOnly } from '@vmitsaras/raveldex/addons/phrases/source';
import { createPositionProvider, type PositionProviderOptions } from '@vmitsaras/raveldex/addons/positions';
import { createPositionPhrases } from '@vmitsaras/raveldex/addons/phrases/positions';
import { createPhrases, type MixedPhraseOptions } from '@vmitsaras/raveldex/addons/phrases/mixed';
import { createFilters, type FilterOptions, type NumericRangePayload, type SetMembershipPayload } from '@vmitsaras/raveldex/addons/filters';
import { createFacets, type FacetOptions, type FacetRequest, type FacetResult } from '@vmitsaras/raveldex/addons/facets';
import { createMatchEvidence, type MatchEvidenceOptions, type MatchEvidenceRequest, type MatchEvidenceData, type MatchRange } from '@vmitsaras/raveldex/addons/evidence';
import { createSnippetEvidence, type SnippetOptions, type SnippetEvidenceData } from '@vmitsaras/raveldex/addons/snippets';
const matchOptions: MatchEvidenceOptions = { fields: { title: 'source', body: 'offsets' }, maxRanges: 100 };
const matchRequest: MatchEvidenceRequest = { ids: ['a'], fields: ['title'], expectedRevision: 1 };
const snippetOptions: SnippetOptions = { ...matchOptions, maxCodeUnits: 120, maxHighlights: 10, maxSnippets: 2 };
void createMatchEvidence(matchOptions); void createSnippetEvidence(snippetOptions);
declare const matchData: MatchEvidenceData; declare const snippetData: SnippetEvidenceData; declare const matchRange: MatchRange;
void [matchData, snippetData];
const unsupported: ErrorCode = 'UNSUPPORTED_ENVIRONMENT'; void unsupported;
// @ts-expect-error Original ranges are readonly.
matchRange.start = 0;
// @ts-expect-error Requested selected IDs are readonly.
matchRequest.ids.push('b');
// @ts-expect-error Evidence provider strategies are readonly.
matchOptions.fields.title = 'offsets';
// @ts-expect-error Snippet marks are readonly presentation data.
snippetData.documents[0]!.snippets[0]!.highlights.push({ start: 0, end: 1 });
// @ts-expect-error No private presentation hook is public.
import { buildMatchEvidence } from '@vmitsaras/raveldex/addons/evidence';
// @ts-expect-error Optional implementation subpaths are private.
import { createSnippetEvidence as hiddenSnippets } from '@vmitsaras/raveldex/dist/addons/snippets/index.js';
import { createInspector, exportDiagnostics, type InspectorOptions, type InspectorRequest, type InspectorData, type DiagnosticExport } from '@vmitsaras/raveldex/addons/inspector';
const inspectorOptions: InspectorOptions = { sourceFields: ['title'], maxFacts: 100 };
const inspectorRequest: InspectorRequest = { ids: ['a'], expectedRevision: 1, sourceFields: ['title'] };
void createInspector(inspectorOptions);
declare const inspection: InspectorData;
const diagnostic: DiagnosticExport = exportDiagnostics(inspection, { includeFacts: true });
void diagnostic;
// @ts-expect-error selected IDs remain readonly
inspectorRequest.ids.push('b');
// @ts-expect-error original source selection remains readonly
inspectorOptions.sourceFields?.push('body');
// @ts-expect-error actual score facts remain readonly
inspection.trace.facts.push({ kind: 'group', id: 'a', group: 'x', score: 1 });
// @ts-expect-error inspector private payload capture is not exported
import { captureRequest } from '@vmitsaras/raveldex/addons/inspector';
// @ts-expect-error inspector private source readers are not public subpaths
import { createInspector as hiddenInspector } from '@vmitsaras/raveldex/dist/addons/inspector/index.js';
const filters: FilterOptions = { fields: ['price', 'tags'] };
const facets: FacetOptions = { fields: ['tags'], maxDistinctValuesPerField: 100, maxBucketsPerField: 10 };
const range: NumericRangePayload = { field: 'price', gte: 10, lt: 20 };
const selection: SetMembershipPayload = { field: 'tags', values: ['guide', null] };
const facetRequest: FacetRequest = { fields: [{ field: 'tags', limit: 0, missing: true }] };
const metadataEngine = createRaveldex({ schema: { text: { title: {} }, metadata: { price: { type: 'number' }, tags: { type: 'string', multi: true, nullable: true } } }, addons: [createFilters(filters), createFacets(facets)] });
void metadataEngine.search({ kind: 'and', children: [{ kind: 'extension', capability: 'numeric-range', version: 1, payload: range }, { kind: 'extension', capability: 'set-membership', version: 1, payload: selection }] }, { limit: 0, extensions: { facets: facetRequest } });
declare const facetResult: FacetResult;
// @ts-expect-error bounded output buckets are readonly
facetResult.fields[0]!.buckets.push({ kind: 'missing', count: 1 });
// @ts-expect-error requested facet fields are readonly
facetRequest.fields[0]!.field = 'other';
// @ts-expect-error filter selection is readonly
selection.values.push('other');
// @ts-expect-error filter helper internals are private
import { captureFilterOptions } from '@vmitsaras/raveldex/addons/filters';
// @ts-expect-error optional payload parser is not a public subpath
import { captureMetadataPayload } from '@vmitsaras/raveldex/addons/metadata/payload';
// @ts-expect-error private position roots are not a utility export
import { requirePositionRoot } from '@vmitsaras/raveldex/addons/positions';
const positionOptions: PositionProviderOptions = { fields: ['title', 'body'], offsets: ['title'] };
const mixedOptions: MixedPhraseOptions = { fields: { title: 'source', body: 'positions' } };
void createPositionProvider(positionOptions); void createPositionPhrases({ fields: ['title', 'body'] }); void createPhrases(mixedOptions);
// @ts-expect-error selected offset fields are readonly
positionOptions.offsets?.push('body');
// @ts-expect-error field strategies are readonly
mixedOptions.fields.title = 'positions';
// @ts-expect-error source roots and consistency helpers remain private
import { requireSourceRoot } from '@vmitsaras/raveldex/addons/phrases/source';
const sourceOptions: SourceProviderOptions = { fields: ['title', 'body'] };
const phraseOptions: SourcePhraseOptions = { fields: ['title', 'body'], maxWorkUnits: 100_000 };
const phraseEngine = createRaveldex({ schema: { text: { title: {}, body: {} } }, addons: [sourceOnly(sourceOptions), createSourcePhrases(phraseOptions)] });
void createSourceProvider(sourceOptions); void phraseEngine.search({ kind: 'extension', capability: 'phrases', version: 1, payload: { text: 'atomic writes', fields: ['body'] } });
// @ts-expect-error factory fields are readonly
sourceOptions.fields.push('another');
// @ts-expect-error private scheduling/roots are not public exports
import { ExecutionOwner } from '@vmitsaras/raveldex';
// @ts-expect-error private subpath resolution is forbidden by exports
import { executeSearch } from '@vmitsaras/raveldex/dist/core/query/search.js';
const config = { schema: { text: { title: { boost: 2 }, body: {} }, metadata: { kind: { type: 'string' } } } } as const satisfies Configuration;
const engine: Raveldex = createRaveldex(config);
const record: RecordInput = { id: '__proto__', text: { title: 'Atomic writes', body: ['Current docs'] }, metadata: { kind: 'guide' } };
const query: Query = { kind: 'and', children: [{ kind: 'text', text: 'atomic' }, { kind: 'eq', field: 'kind', value: 'guide' }] };
const signal: CancellationSignal = { aborted: false, addEventListener() {}, removeEventListener() {} };
const mutation: Promise<MutationResult> = engine.add(record, { signal });
const result: Promise<SearchResult> = engine.search(query, { limit: 0, deadlineMs: 10, signal });
void engine.addMany([record]); void engine.replace(record); void engine.remove(['__proto__']); void engine.clear(); void engine.dispose();
const overrides: LimitOverrides = { maxDocuments: 20 }; void overrides;
declare const limits: Limits; void limits.maxSearchWorkUnits;
const code: ErrorCode = ERROR_CODES[0]; const details: ErrorDetails = { path: 'query', actual: 1, limit: 2 };
void new RaveldexError(code, details); void mutation;
result.then((response) => {
  // @ts-expect-error results are readonly
  response.hits.push({ id: 'x', score: 1 });
  // @ts-expect-error scores are readonly
  response.hits[0]!.score = 0;
});
// @ts-expect-error IDs are opaque strings
void engine.remove(42);
// @ts-expect-error no arbitrary scheduler injection
createRaveldex({ ...config, scheduler: () => {} });
// @ts-expect-error no arbitrary ranking callback
engine.search('atomic', { score: () => 1 });
