import type { Configuration, Query, RecordInput, Raveldex, SearchResult, CancellationSignal } from '../../src/core/contracts/types.js';
import type { ErrorCode } from '../../src/core/errors/error.js';
import type { IndexRoot } from '../../src/core/index/state.js';
import type { ScoreTrace, FieldFact } from '../../src/core/trace/facts.js';
import { createRaveldex } from '../../src/core/execution/engine.js';

const configuration: Configuration = { schema: { text: { title: { boost: 2 } }, metadata: { tags: { type: 'string', multi: true } } } };
const implementedEngine: Raveldex = createRaveldex(configuration);
// @ts-expect-error The ordinary factory exposes no private host or root accessor.
implementedEngine.root;
// @ts-expect-error Public factory callers cannot supply a semantic scheduler.
createRaveldex(configuration, { now: () => 0 });
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
declare const root: IndexRoot;
// @ts-expect-error Internal published state is readonly as well.
root.counts.tokens = 0;
// @ts-expect-error Bucket directories do not expose writable posting state.
root.documents.buckets['0']!['changed'] = root.documents.buckets['0']!['existing']!;
// @ts-expect-error Positive field statistics belong to the published root.
root.fields['title']!.length = 0;
// @ts-expect-error Revisions and participant selection belong to the publication.
root.revision = 1;
// @ts-expect-error Private participant root selection is readonly.
root.participants['source'] = {};
declare const trace: ScoreTrace;
declare const fieldFact: FieldFact;
// @ts-expect-error Actual numerical facts cannot be edited by the consumer.
fieldFact.selected = 0;
// @ts-expect-error Fact arrays are readonly.
trace.facts.push(fieldFact);
// @ts-expect-error The trace is tied to the actual model version.
const wrongModel: ScoreTrace['model'] = 'foreign-model';
void wrongModel;
