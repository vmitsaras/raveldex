import type { Configuration, Query, RecordInput, Raveldex, SearchResult, CancellationSignal } from '../../src/core/contracts/types.js';
import type { ErrorCode } from '../../src/core/errors/error.js';

const configuration: Configuration = { schema: { text: { title: { boost: 2 } }, metadata: { tags: { type: 'string', multi: true } } } };
const record: RecordInput = { id: '__proto__', text: { title: ['Hello'] }, metadata: { tags: ['a', 'b'] } };
const query: Query = { kind: 'and', children: [{ kind: 'text', text: 'Hello' }, { kind: 'eq', field: 'tags', value: 'a' }] };
// @ts-expect-error Readonly input arrays cannot be edited through the contract.
query.children.push({ kind: 'all' });
// @ts-expect-error Numeric IDs are not silently converted.
const badRecord: RecordInput = { id: 7, text: {} };
// @ts-expect-error No arbitrary scoring callback.
const badQuery: Query = { kind: 'text', text: 'a', scorer: () => 1 };
// @ts-expect-error Unknown error codes are rejected by declarations.
const badCode: ErrorCode = 'OOPS';
declare const engine: Raveldex;
declare const signal: CancellationSignal;
const result: Promise<SearchResult> = engine.search(query, { signal, limit: 0 });
result.then((value) => {
  // @ts-expect-error Completed results are readonly.
  value.total = 0;
  // @ts-expect-error Hit arrays are readonly.
  value.hits.push({ id: 'x', score: 0 });
});
void [configuration, record, badRecord, badQuery, badCode];
