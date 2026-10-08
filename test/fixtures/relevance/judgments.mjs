/**
 * RX-4001 source judgments. Authored from frozen source before running rankings.
 * These are one evaluator's incomplete labels, not a representative user study.
 */
export const JUDGMENT_VERSION = 'rx4001-docs-judgments-v1';
export const CORPUS_HASH = '8ba88f8c4610a83ee3dcf453ce2434c16e6d2f3af070590f2e220c7bec28244b';
export const JUDGMENT_CONTEXT = Object.freeze({
  author: 'Codex /root/relevance_evaluation, source-reading evaluator',
  date: '2026-10-08',
  version: JUDGMENT_VERSION,
  corpusHash: CORPUS_HASH,
  configurationVersion: 'rx4001-docs-native-three-strategies-v1',
  labelMethod: 'Read frozen current source sections; assign answer sources before production ranking. No post-ranking relabeling.',
  limitations: 'Single evaluator; English technical self-documentation; 34 sections from five allowlisted files; incomplete labels except explicitly bounded navigation and empty cases; no representative user distribution.',
});

const core = anchor => `doc:docs/specs/CORE_CONTRACT.md#${anchor}`;
const ranking = anchor => `doc:docs/specs/RANKING.md#${anchor}`;
const mutation = anchor => `doc:docs/specs/MUTATIONS_AND_EXECUTION.md#${anchor}`;
const native = anchor => `doc:docs/architecture/NATIVE_ARCHITECTURE.md#${anchor}`;
const addon = anchor => `doc:docs/architecture/ADDONS_AND_ADAPTERS.md#${anchor}`;
const text = (value, fields) => ({ kind: 'text', text: value, ...(fields ? { fields } : {}) });
const eq = (field, value) => ({ kind: 'eq', field, value });
const phrase = (value, fields) => ({ kind: 'phrase', text: value, ...(fields ? { fields } : {}) });
const and = (...children) => ({ kind: 'and', children });
const not = child => ({ kind: 'not', child });
const prefix = (value, fields) => ({ kind: 'group', variants: [{ text: value, match: 'prefix' }], ...(fields ? { fields } : {}) });

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function judged(id, query, intent, mustFindIds, acceptableIds = mustFindIds, options = {}) {
  return {
    id, query, intent, mustFindIds, acceptableIds,
    knownIrrelevantIds: [mustFindIds.includes(core('schema')) ? ranking('deterministic-accumulation-and-ordering') : core('schema')],
    expectation: 'known-relevant', labelsComplete: false, category: 'keyword',
    semantics: typeof query === 'string'
      ? 'basic-v1 exact AND across title/body; no stop-word removal, semantic paraphrase, implicit prefix, or query-language parsing.'
      : 'Typed query follows native query-v1; phrase fixtures lower explicitly to the installed phrases extension. Equality/negative leaves add no score.',
    sourceRationale: intent,
    ...options,
  };
}

function empty(id, query, intent, reason, options = {}) {
  return judged(id, query, intent, [], [], {
    knownIrrelevantIds: [], expectation: 'intended-empty', labelsComplete: true,
    category: 'empty', emptyReason: reason, ...options,
  });
}

// Each row asks for a distinct task or intentionally distinct typed behavior.
// Natural questions retain relevant-source labels even when their conjunction
// cannot qualify; changing labels to lexical output would conceal the mismatch.
export const RELEVANCE_JUDGMENTS = freeze([
  judged('api-factory', 'createRaveldex', 'Find the factory configuration and seven ordinary methods.', [core('public-api-contract')], [core('public-api-contract'), mutation('admission-and-concurrent-calls'), addon('registration-and-effect-contracts')], { category: 'identifier' }),
  judged('schema-boost-bound', 'boost 16', 'Find the allowed text-field boost and how to configure it.', [core('schema')], [core('schema'), ranking('statistics-from-one-revision')]),
  judged('record-empty-array', 'empty arrays', 'Check whether empty text or metadata arrays are admitted.', [core('record')], [core('record'), core('scalar-equality')]),
  judged('record-opaque-id', 'opaque IDs', 'Find case/whitespace-sensitive ID ownership and validation.', [core('record')], [core('record'), native('product-boundary'), core('finite-initial-limits')]),
  judged('record-getters', 'getters toJSON', 'Check whether caller getters and toJSON are executed during capture.', [core('record')]),
  judged('ownership-originals', 'original source', 'Find what core retains and how originals become optional.', [core('ownership-and-retention')], [core('ownership-and-retention'), native('product-boundary'), native('state-model'), addon('strict-phrase-capability')]),
  judged('analyzer-normalization', 'NFKC lowercase', 'Find the exact normalization order and host dependency.', [core('normative-algorithm')], [core('normative-algorithm'), native('analyzerenvironment-boundary')]),
  judged('analyzer-accent', 'café cafe', 'Determine whether accent stripping is implemented.', [core('examples-and-intentional-limits')]),
  judged('analyzer-identifier', 'Hello_world', 'Understand why underscores split ordinary identifiers.', [core('examples-and-intentional-limits')], [core('examples-and-intentional-limits'), core('normative-algorithm')], { category: 'identifier' }),
  judged('analyzer-half', '½', 'Locate the one-token compatibility fraction example without retokenizing it.', [core('examples-and-intentional-limits')], [core('examples-and-intentional-limits'), core('core-nodes')]),
  judged('mapping-prefix', 'prefix highlights', 'Find why prefix evidence covers the whole original token.', [core('source-mapping')]),
  judged('mapping-value', 'array indices', 'Find whether empty values keep their original indices and coordinates.', [core('source-mapping')]),
  judged('environment-native', 'unqualified snapshot', 'Find why an unqualified analyzer cannot import portable native state.', [core('environment-compatibility')], [core('environment-compatibility'), native('analyzerenvironment-boundary'), addon('snapshots-and-indexeddb')]),
  judged('query-empty', 'zero tokens', 'Check why tokenless ordinary text is none rather than all.', [core('core-nodes')], [core('core-nodes'), core('examples-and-intentional-limits')]),
  judged('query-repeated', 'repeated query words', 'Determine whether repeating a query term boosts its score.', [core('boolean-groups-and-repeated-terms')], [core('boolean-groups-and-repeated-terms'), ranking('original-groups-and-alternatives')]),
  judged('query-cross-field', 'different fields', 'Check whether ordinary AND groups can match separate fields.', [core('boolean-groups-and-repeated-terms')], [core('boolean-groups-and-repeated-terms'), addon('strict-phrase-capability')]),
  judged('query-prefix-cap', 'expansion cap', 'Find explicit failure behavior when prefix expansion exceeds its cap.', [core('exact-and-prefix-terms')], [core('exact-and-prefix-terms'), native('state-model'), core('finite-initial-limits')]),
  judged('query-null-missing', 'missing null', 'Find the distinction between missing metadata and explicit null.', [core('scalar-equality')], [core('scalar-equality'), core('record')]),
  judged('query-scalar-score', 'equality score zero', 'Check ranking of equality-only results.', [core('scalar-equality')], [core('scalar-equality'), ranking('boolean-qualification-and-score-participation')]),
  judged('result-pagination', 'total pagination', 'Find exact-total evaluation before requested page selection.', [core('results-and-errors')], [core('results-and-errors'), native('query-execution-pipeline')]),
  judged('result-capability-error', 'MISSING_CAPABILITY', 'Find the documented absent-capability failure.', [core('results-and-errors')], [core('results-and-errors'), core('core-nodes'), addon('strict-phrase-capability')], { category: 'identifier' }),
  judged('limits-corpus', 'corpus tokens', 'Find the defensive live-corpus token and document bounds.', [core('finite-initial-limits')], [core('finite-initial-limits'), native('state-model')]),
  judged('ranking-population', 'positive length', 'Understand which documents enter each field population.', [ranking('statistics-from-one-revision')], [ranking('statistics-from-one-revision'), ranking('term-contribution')]),
  judged('ranking-idf', 'idf normalizer', 'Find the native BM25 arithmetic and fixed parameters.', [ranking('term-contribution')], [ranking('term-contribution'), ranking('explanation-facts')]),
  judged('ranking-alternative', 'best alternative', 'Determine how variants in one original group contribute.', [ranking('original-groups-and-alternatives')]),
  judged('ranking-failed-branch', 'failed OR branch', 'Find whether failed Boolean branches can inflate a score.', [ranking('boolean-qualification-and-score-participation')], [ranking('boolean-qualification-and-score-participation'), native('query-execution-pipeline')]),
  judged('ranking-tie', 'UTF 16 ordering', 'Find the opaque-ID tie-breaker and deterministic accumulation.', [ranking('deterministic-accumulation-and-ordering')], [ranking('deterministic-accumulation-and-ordering'), core('results-and-errors')]),
  judged('ranking-trace', '4096 facts', 'Find the selected explanation bound and explicit overflow behavior.', [ranking('explanation-facts')], [ranking('explanation-facts'), native('query-execution-pipeline')]),
  judged('execution-queue', 'FIFO queue', 'Find call admission order and execution-start revision selection.', [mutation('admission-and-concurrent-calls')], [mutation('admission-and-concurrent-calls'), native('state-model')]),
  judged('execution-batch', 'atomic batch', 'Check whether a batch commits all members together.', [mutation('mutation-behavior')], [mutation('mutation-behavior'), mutation('incremental-staging')], { sourceRationale: 'The relevant mutation table says atomically, and staging says one revision; preserve the atomic/atomically vocabulary mismatch rather than relabeling the API section.' }),
  judged('execution-identical-replace', 'identical replace', 'Check whether replacement with identical content increments revision.', [mutation('mutation-behavior')], [mutation('mutation-behavior'), mutation('revisions-and-the-commit-boundary')]),
  judged('execution-incremental', 'unchanged reanalyzed', 'Find whether replacing one record reanalyzes other documents.', [mutation('incremental-staging')], [mutation('incremental-staging'), native('state-model')]),
  judged('execution-publication', 'root assignment', 'Identify the non-yielding atomic publication point.', [mutation('revisions-and-the-commit-boundary')], [mutation('revisions-and-the-commit-boundary'), native('state-model')]),
  judged('execution-stop-precedence', 'DISPOSED CANCELLED DEADLINE_EXCEEDED', 'Find the precedence when several stops are observed.', [mutation('state-transitions-and-cancellation')], [mutation('state-transitions-and-cancellation'), core('results-and-errors')], { category: 'identifier' }),
  judged('execution-work-counter', 'work v1', 'Find what deterministic work units charge and what they cannot prove.', [mutation('work-deadline-and-yield-accounting')], [mutation('work-deadline-and-yield-accounting'), native('query-execution-pipeline'), addon('strict-phrase-capability')]),
  judged('execution-dispose', 'dispose database', 'Find why disposing an owner does not erase durable data.', [mutation('disposal')], [mutation('disposal'), addon('snapshots-and-indexeddb')]),
  judged('product-import', 'DOM telemetry', 'Find import/startup and default retention boundaries.', [native('product-boundary')]),
  judged('product-copy', 'bucket copy', 'Find how touched buckets are copied without whole-state rebuilds.', [native('state-model')], [native('state-model'), mutation('incremental-staging')]),
  judged('product-complete', 'phrase top k', 'Find why phrase eligibility is established before top-k selection.', [native('query-execution-pipeline')], [native('query-execution-pipeline'), addon('strict-phrase-capability')]),
  judged('registration-conflict', 'conflicting providers', 'Find registration validation and dependency-order behavior.', [addon('registration-and-effect-contracts')], [addon('registration-and-effect-contracts'), addon('strict-phrase-capability')]),
  judged('phrase-boundaries', 'phrase array values', 'Find whether phrases cross original values or fields.', [addon('strict-phrase-capability')]),
  judged('storage-erase', 'erase namespace', 'Find namespace erasure and token conflict behavior.', [addon('snapshots-and-indexeddb')]),
  judged('storage-native-portability', 'source native snapshot', 'Choose source rebuild versus qualified native import.', [addon('snapshots-and-indexeddb')], [addon('snapshots-and-indexeddb'), core('environment-compatibility'), native('analyzerenvironment-boundary')]),

  judged('natural-cancel-queued', 'How do I stop an operation that is waiting in the queue?', 'Cancel a call before it begins without changing state.', [mutation('admission-and-concurrent-calls'), mutation('state-transitions-and-cancellation')], [mutation('admission-and-concurrent-calls'), mutation('state-transitions-and-cancellation'), mutation('disposal')], { category: 'natural-question' }),
  judged('natural-source-ownership', 'Does the engine keep my original document text?', 'Decide whether the app must retain display text or install source.', [core('ownership-and-retention')], [core('ownership-and-retention'), native('product-boundary'), addon('strict-phrase-capability')], { category: 'natural-question' }),
  judged('natural-filter-null', 'How can I distinguish an absent field from a null value?', 'Understand strict metadata missing/null filtering.', [core('scalar-equality')], [core('scalar-equality'), core('record')], { category: 'natural-question' }),
  judged('natural-prefix', 'Will the final word automatically match unfinished words?', 'Understand the explicit prefix request boundary.', [core('exact-and-prefix-terms')], [core('exact-and-prefix-terms'), core('core-nodes')], { category: 'natural-question' }),
  judged('natural-phrase-repeat', 'Can a phrase with repeated words match one occurrence?', 'Understand repetition in strict phrase membership.', [addon('strict-phrase-capability')], [addon('strict-phrase-capability'), core('boolean-groups-and-repeated-terms')], { category: 'natural-question' }),
  judged('natural-replace-rollback', 'What happens if one item in my batch is invalid?', 'Determine whether an invalid batch can partly commit.', [mutation('mutation-behavior')], [mutation('mutation-behavior'), mutation('incremental-staging'), mutation('revisions-and-the-commit-boundary')], { category: 'natural-question' }),
  judged('natural-database-delete', 'Does disposal remove saved records from IndexedDB?', 'Understand explicit persistence erasure rather than disposal.', [addon('snapshots-and-indexeddb')], [addon('snapshots-and-indexeddb'), mutation('disposal')], { category: 'natural-question' }),
  judged('natural-portability', 'Can I restore this native index on another browser?', 'Determine the analyzer qualification and portable source rebuild boundary.', [core('environment-compatibility')], [core('environment-compatibility'), native('analyzerenvironment-boundary'), addon('snapshots-and-indexeddb')], { category: 'natural-question' }),

  judged('typed-title-disposal', text('Disposal', ['title']), 'Navigate to the disposal contract by title.', [mutation('disposal')], undefined, { category: 'typed-exact', labelsComplete: true, semantics: 'One exact title-only term; body occurrences do not qualify.' }),
  judged('typed-title-prefix', prefix('cancel', ['title']), 'Navigate from a partially typed cancellation heading.', [mutation('state-transitions-and-cancellation')], undefined, { category: 'typed-prefix', labelsComplete: true, semantics: 'Explicit title-only prefix, at least two normalized code points; no implicit prefix parsing.' }),
  judged('typed-spec-only', and(text('equality'), eq('category', 'spec')), 'Find normative scalar equality while filtering out architecture descriptions.', [core('scalar-equality')], [core('scalar-equality'), core('core-nodes')], { category: 'typed-metadata', knownIrrelevantIds: [native('product-boundary')] }),
  judged('typed-architecture-only', and(text('source'), eq('category', 'architecture')), 'Find optional-source architecture responsibilities.', [native('product-boundary')], [native('product-boundary'), native('state-model'), addon('strict-phrase-capability')], { category: 'typed-metadata', knownIrrelevantIds: [core('record')] }),
  judged('typed-exclude-ranking', and(text('revision'), eq('category', 'spec'), not(eq('sourcePath', 'docs/specs/RANKING.md'))), 'Find revision lifecycle outside ranking statistics.', [mutation('revisions-and-the-commit-boundary')], [mutation('revisions-and-the-commit-boundary'), mutation('admission-and-concurrent-calls'), core('results-and-errors')], { category: 'typed-boolean', knownIrrelevantIds: [ranking('statistics-from-one-revision')] }),
  judged('typed-ranking-source', eq('sourcePath', 'docs/specs/RANKING.md'), 'List the six indexed ranking contract sections.', [ranking('statistics-from-one-revision'), ranking('term-contribution'), ranking('original-groups-and-alternatives'), ranking('boolean-qualification-and-score-participation'), ranking('deterministic-accumulation-and-ordering'), ranking('explanation-facts')], undefined, { category: 'typed-metadata', labelsComplete: true, semantics: 'Exact case-sensitive scalar path equality; all six sections score zero and sort by opaque ID.' }),
  judged('ambiguous-revision', 'revision', 'Explore mutations, committed state and revision-local ranking.', [mutation('revisions-and-the-commit-boundary')], [mutation('revisions-and-the-commit-boundary'), ranking('statistics-from-one-revision'), native('state-model'), native('query-execution-pipeline'), core('results-and-errors'), mutation('admission-and-concurrent-calls')], { category: 'ambiguous' }),
  judged('ambiguous-source', 'source', 'Explore original text, source mapping and optional source snapshots.', [core('ownership-and-retention')], [core('ownership-and-retention'), core('source-mapping'), addon('strict-phrase-capability'), addon('snapshots-and-indexeddb'), native('product-boundary')], { category: 'ambiguous', knownIrrelevantIds: [ranking('deterministic-accumulation-and-ordering')] }),
  judged('ambiguous-count', 'count', 'Locate exact totals, field populations or deterministic work counts.', [ranking('statistics-from-one-revision')], [ranking('statistics-from-one-revision'), core('results-and-errors'), core('finite-initial-limits'), mutation('work-deadline-and-yield-accounting')], { category: 'ambiguous' }),

  judged('phrase-atomic-total', phrase('exact total'), 'Find the complete total guarantee with strict adjacency.', [core('results-and-errors')], [core('results-and-errors'), native('query-execution-pipeline'), addon('strict-phrase-capability')], { category: 'phrase' }),
  judged('phrase-retained-source', phrase('original text'), 'Find default original-text ownership and explicit source requirements.', [core('ownership-and-retention')], [core('ownership-and-retention'), native('product-boundary'), native('state-model'), addon('strict-phrase-capability'), addon('snapshots-and-indexeddb')], { category: 'phrase' }),
  judged('phrase-stop-order', phrase('state transitions and cancellation', ['title']), 'Navigate exactly to the cancellation heading.', [mutation('state-transitions-and-cancellation')], undefined, { category: 'phrase', labelsComplete: true }),
  judged('phrase-mapping-heading', phrase('source mapping', ['title']), 'Navigate exactly to original-coordinate semantics.', [core('source-mapping')], undefined, { category: 'phrase', labelsComplete: true }),
  judged('phrase-term-formula', phrase('term contribution', ['title']), 'Navigate exactly to native term arithmetic.', [ranking('term-contribution')], undefined, { category: 'phrase', labelsComplete: true }),
  judged('phrase-value-boundary', phrase('one original value', ['body']), 'Find the within-one-value strict phrase contract.', [addon('strict-phrase-capability')], undefined, { category: 'phrase' }),
  judged('phrase-shared-budget', phrase('one work', ['body']), 'Find the query execution pipeline single work budget.', [native('query-execution-pipeline')], [native('query-execution-pipeline'), mutation('revisions-and-the-commit-boundary')], { category: 'phrase' }),
  judged('phrase-filter-navigation', and(phrase('source snapshot'), eq('category', 'architecture')), 'Find architecture guidance for portable original-source snapshots.', [addon('snapshots-and-indexeddb')], [addon('snapshots-and-indexeddb'), native('analyzerenvironment-boundary')], { category: 'phrase', knownIrrelevantIds: [core('environment-compatibility')] }),
  judged('phrase-negative-branch', and(text('phrase'), not(phrase('original text'))), 'Find phrase query semantics outside source-retention sections.', [core('exact-and-prefix-terms')], [core('exact-and-prefix-terms'), core('boolean-groups-and-repeated-terms'), ranking('boolean-qualification-and-score-participation')], { category: 'typed-boolean', knownIrrelevantIds: [addon('strict-phrase-capability')] }),
  judged('phrase-or-navigation', { kind: 'or', children: [phrase('term contribution', ['title']), phrase('scalar equality', ['title'])] }, 'Navigate to either term arithmetic or equality-only filtering.', [ranking('term-contribution'), core('scalar-equality')], undefined, { category: 'phrase', labelsComplete: true, knownIrrelevantIds: [mutation('disposal')] }),

  empty('empty-absent-topic', 'PostgreSQL replication', 'Look for database replication deployment guidance outside this collection.', 'out-of-corpus-topic'),
  empty('empty-tokenless', ' 😀 !!! ', 'Submit input with no letters/numbers rather than implicitly list all documents.', 'tokenless-input'),
  empty('empty-implicit-prefix', 'cancell', 'Check that ordinary unfinished words do not silently become prefixes.', 'exact-term-absent'),
  empty('empty-wrong-path-case', eq('sourcePath', 'docs/specs/ranking.md'), 'Check case-sensitive metadata path equality.', 'metadata-case-mismatch'),
  empty('empty-impossible-phrase', phrase('cancellation schema', ['title']), 'Check that title phrases cannot cross separate section records.', 'no-adjacent-title-sequence'),
  empty('empty-phrase-tokenless', phrase('😀 !!!'), 'Check that empty analysis remains a nonmatching phrase leaf.', 'tokenless-phrase'),
]);
