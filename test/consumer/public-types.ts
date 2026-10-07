import {
  createRaveldex, RaveldexError, ERROR_CODES,
  type Configuration, type Raveldex, type Query, type SearchResult,
  type MutationResult, type RecordInput, type CancellationSignal,
  type ErrorCode, type ErrorDetails, type Limits, type LimitOverrides,
} from '@vmitsaras/raveldex';
import { createSourceProvider, createSourcePhrases, type SourceProviderOptions, type SourcePhraseOptions } from '@vmitsaras/raveldex/addons/phrases';
import { createSourceProvider as sourceOnly } from '@vmitsaras/raveldex/addons/phrases/source';
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
