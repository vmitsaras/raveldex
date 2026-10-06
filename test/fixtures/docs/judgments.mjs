// Authored from source sections before any pilot production search/ranking was
// observed. These labels are relevance judgments, not a ranking oracle. Neither
// this file nor the corpus generator imports the production search/tokenizer.
export const JUDGMENT_VERSION = 'raveldex-doc-judgments-v1';
export const JUDGMENT_CONTEXT = Object.freeze({
  author: 'Codex documentation-fixture author',
  date: '2026-10-06',
  corpusAlgorithmVersion: 'raveldex-doc-sections-v1',
  configuration: 'basic-v1/unqualified; title boost 2; body boost 1; sourcePath/category scalar strings',
  labelPolicy: 'Intended and acceptable sections were selected from source, before production results. Acceptable IDs include intended IDs. Labels are incomplete unless explicitly marked complete.',
  rankingCutoff: 100,
  recallCutoff: 10,
});

const core = (anchor) => `doc:docs/specs/CORE_CONTRACT.md#${anchor}`;
const ranking = (anchor) => `doc:docs/specs/RANKING.md#${anchor}`;
const mutations = (anchor) => `doc:docs/specs/MUTATIONS_AND_EXECUTION.md#${anchor}`;
const native = (anchor) => `doc:docs/architecture/NATIVE_ARCHITECTURE.md#${anchor}`;
const addons = (anchor) => `doc:docs/architecture/ADDONS_AND_ADAPTERS.md#${anchor}`;
const matches = 'matches';
const text = (value, fields) => ({ kind: 'text', text: value, ...(fields ? { fields } : {}) });
const eq = (field, value) => ({ kind: 'eq', field, value });

function freeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

export const DOCS_JUDGMENTS = freeze([
  {
    id: 'docs-schema', query: 'schema', intent: 'Find the declared text/metadata schema shape and validation rules.',
    semantics: 'One exact normalized term across title and body; no synonym or query-language parsing.',
    intendedIds: [core('schema')], acceptableIds: [core('schema')], expectation: matches,
  },
  {
    id: 'docs-atomic-batch', query: 'atomic batch', intent: 'Understand whether a multi-record addition commits as one operation.',
    semantics: 'Both exact terms must occur in the section, possibly across the two declared text fields.',
    intendedIds: [mutations('mutation-behavior')], acceptableIds: [mutations('mutation-behavior'), mutations('incremental-staging')], expectation: matches,
    lexicalNotes: 'An independent source scan finds atomic only in the public API section; the intended mutation section uses atomically. Preserve this source vocabulary mismatch as a relevance failure rather than changing the labels to the retrieved section.',
  },
  {
    id: 'docs-term-contribution', query: 'term contribution', intent: 'Find the actual native BM25 term arithmetic.',
    semantics: 'Two exact AND groups; the title is relevant but there is no phrase constraint.',
    intendedIds: [ranking('term-contribution')], acceptableIds: [ranking('term-contribution'), ranking('statistics-from-one-revision'), ranking('explanation-facts')], expectation: matches,
  },
  {
    id: 'docs-source-retention', query: 'original source', intent: 'Find what original source core retains and what requires an optional source participant.',
    semantics: 'Exact AND membership; ordinary text does not test adjacency or require both terms in one field.',
    intendedIds: [core('ownership-and-retention')], acceptableIds: [core('ownership-and-retention'), native('state-model'), addons('strict-phrase-capability')], expectation: matches,
  },
  {
    id: 'docs-prefix-contract', query: 'exact prefix terms', intent: 'Find how to request prefix matching and its expansion limits.',
    semantics: 'Three exact AND groups; the word prefix in this string does not enable prefix matching.',
    intendedIds: [core('exact-and-prefix-terms')], acceptableIds: [core('exact-and-prefix-terms'), core('core-nodes'), ranking('original-groups-and-alternatives')], expectation: matches,
  },
  {
    id: 'docs-explicit-prefix',
    query: { kind: 'group', fields: ['title'], variants: [{ text: 'cancel', match: 'prefix' }] },
    intent: 'Navigate to the cancellation section from an unfinished word.',
    semantics: 'Explicit title-only prefix group; cancel matches cancellation as a complete dictionary-term prefix.',
    intendedIds: [mutations('state-transitions-and-cancellation')], acceptableIds: [mutations('state-transitions-and-cancellation')], expectation: matches, labelsComplete: true,
  },
  {
    id: 'docs-no-implicit-prefix', query: 'cancell', intent: 'Check that an unfinished cancellation word is not silently expanded.',
    semantics: 'Plain strings use exact terms. No selected source contains the complete normalized term cancell.',
    intendedIds: [], acceptableIds: [], expectation: 'zero', zeroReason: 'exact-term-absent', labelsComplete: true,
  },
  {
    id: 'docs-natural-task-lexical-mismatch', query: 'How do I stop an operation that is waiting in the queue?',
    intent: 'Learn how to cancel an operation before it starts.',
    semantics: 'Every analyzed question word is required. basic-v1 keeps stop words and has no semantic paraphrase matching; the relevant sections cannot satisfy this complete lexical conjunction.',
    intendedIds: [mutations('admission-and-concurrent-calls'), mutations('state-transitions-and-cancellation')],
    acceptableIds: [mutations('admission-and-concurrent-calls'), mutations('state-transitions-and-cancellation'), mutations('disposal')],
    expectation: 'lexical-mismatch', expectedLexicalZero: true,
  },
  {
    id: 'docs-factory-identifier', query: 'createRaveldex', intent: 'Find the factory call and its ordinary public method contract.',
    semantics: 'basic-v1 lowercases the contiguous identifier; camelCase is not split into separate words.',
    intendedIds: [core('public-api-contract')], acceptableIds: [core('public-api-contract'), mutations('admission-and-concurrent-calls'), addons('registration-and-effect-contracts')], expectation: matches,
  },
  {
    id: 'docs-error-identifier', query: 'MISSING_CAPABILITY', intent: 'Find what happens when a query requests an absent capability.',
    semantics: 'Underscore separates the identifier into missing AND capability. This is not a verbatim identifier or special error-code search mode.',
    intendedIds: [core('results-and-errors')], acceptableIds: [core('results-and-errors'), core('core-nodes'), addons('registration-and-effect-contracts'), addons('strict-phrase-capability')], expectation: matches,
  },
  {
    id: 'docs-analyzer-identifier-splitting', query: 'basic_v1', intent: 'Locate the documented basic-v1 analyzer and host compatibility boundary.',
    semantics: 'Underscore and hyphen both delimit original tokens: basic_v1 queries basic AND v1. This does not add an identifier-preserving analyzer.',
    intendedIds: [native('analyzerenvironment-boundary')], acceptableIds: [native('analyzerenvironment-boundary'), addons('strict-phrase-capability')], expectation: matches,
  },
  {
    id: 'docs-ranking-source-navigation', query: eq('sourcePath', 'docs/specs/RANKING.md'),
    intent: 'List all indexed sections in the ranking contract.',
    semantics: 'Exact case-sensitive scalar equality; no text analysis and all matching sections have score zero.',
    intendedIds: [ranking('statistics-from-one-revision'), ranking('term-contribution'), ranking('original-groups-and-alternatives'), ranking('boolean-qualification-and-score-participation'), ranking('deterministic-accumulation-and-ordering'), ranking('explanation-facts')],
    acceptableIds: [ranking('statistics-from-one-revision'), ranking('term-contribution'), ranking('original-groups-and-alternatives'), ranking('boolean-qualification-and-score-participation'), ranking('deterministic-accumulation-and-ordering'), ranking('explanation-facts')],
    expectation: matches, labelsComplete: true, zeroScores: true,
  },
  {
    id: 'docs-filtered-equality', query: { kind: 'and', children: [text('equality'), eq('category', 'spec')] },
    intent: 'Find normative equality semantics while restricting the collection to specifications.',
    semantics: 'Lexical membership intersects exact scalar category equality. The metadata restriction contributes no score.',
    intendedIds: [core('scalar-equality')], acceptableIds: [core('scalar-equality'), core('core-nodes')], expectation: matches,
  },
  {
    id: 'docs-boolean-revision-navigation',
    query: { kind: 'and', children: [text('revision'), eq('category', 'spec'), { kind: 'not', child: eq('sourcePath', 'docs/specs/RANKING.md') }] },
    intent: 'Find revision lifecycle behavior outside the ranking contract.',
    semantics: 'Complete lexical AND/equality/NOT membership; NOT complements within all live records and does not contribute a score.',
    intendedIds: [mutations('revisions-and-the-commit-boundary')],
    acceptableIds: [mutations('revisions-and-the-commit-boundary'), mutations('admission-and-concurrent-calls'), mutations('mutation-behavior'), core('results-and-errors')],
    knownIrrelevantIds: [ranking('statistics-from-one-revision')], expectation: matches,
  },
  {
    id: 'docs-absent-topic', query: 'PostgreSQL replication', intent: 'Look for database replication setup, a topic outside this collection.',
    semantics: 'Both exact terms are required; neither is supplied by the indexed current source sections.',
    intendedIds: [], acceptableIds: [], expectation: 'zero', zeroReason: 'out-of-corpus-topic', labelsComplete: true,
  },
  {
    id: 'docs-tokenless', query: ' 😀 !!! ', intent: 'Confirm an input containing no analyzable letters/numbers does not list the collection.',
    semantics: 'Zero analyzed tokens canonicalize to none, rather than all.',
    intendedIds: [], acceptableIds: [], expectation: 'zero', zeroReason: 'tokenless-input', labelsComplete: true,
  },
  {
    id: 'docs-quotes-are-lexical', query: '"original source"', intent: 'Search for source retention using quoted ordinary text.',
    semantics: 'Quotes are delimiters. Ordinary text retains original AND source semantics and does not invoke the unavailable phrase capability.',
    intendedIds: [core('ownership-and-retention')], acceptableIds: [core('ownership-and-retention'), native('state-model'), addons('strict-phrase-capability')], expectation: matches,
  },
  {
    id: 'docs-ambiguous-revision', query: 'revision', intent: 'Explore revision identity, mutation commits, and the statistics read by one operation.',
    semantics: 'One exact term across text fields; several different sections answer this broad topic, so labels are deliberately incomplete.',
    intendedIds: [mutations('revisions-and-the-commit-boundary')],
    acceptableIds: [mutations('revisions-and-the-commit-boundary'), ranking('statistics-from-one-revision'), native('state-model'), native('query-execution-pipeline'), core('results-and-errors'), mutations('admission-and-concurrent-calls')], expectation: matches,
  },
  {
    id: 'docs-title-disposal', query: text('Disposal', ['title']), intent: 'Navigate directly to the disposal contract.',
    semantics: 'One exact term selected only from title; body occurrences cannot qualify other sections.',
    intendedIds: [mutations('disposal')], acceptableIds: [mutations('disposal')], expectation: matches, labelsComplete: true,
  },
]);

// Unsupported capabilities have a typed failure contract, so they are kept out
// of valid-query relevance denominators and successful-empty-result checks.
export const DOCS_ERROR_JUDGMENTS = freeze([
  {
    id: 'docs-unsupported-phrase',
    query: { kind: 'extension', capability: 'phrases', version: 1, payload: { text: 'original source', fields: ['body'] } },
    intent: 'Request strict adjacency, which requires a separately installed phrase capability.',
    semantics: 'A typed extension request on this core-only configuration must reject with MISSING_CAPABILITY. It is not a successful empty result or an adjacency claim.',
    intendedIds: [addons('strict-phrase-capability')], acceptableIds: [addons('strict-phrase-capability')],
    expectation: 'error', code: 'MISSING_CAPABILITY',
  },
]);
