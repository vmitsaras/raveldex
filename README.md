# Raveldex

**Native local search with explainable results and optional feature costs.**

Raveldex is a TypeScript search library for mutable local collections. The native core owns analysis, dictionary/postings, field-local BM25, exact totals, typed lexical/Boolean/equality queries, incremental atomic updates and cooperative execution. Optional search capabilities and host integrations follow the adopted roadmap.

## Current status

**N1 core alpha is verified locally through a packed public ESM package and real-document CLI.**

RX-1001–1006 implement and verify the core. The public factory returns an empty revision-0 engine with `search`, `add`, `addMany`, `replace`, `remove`, `clear` and `dispose`. Configuration errors throw; operational errors reject promises. [RX-1006 evidence](docs/evidence/RX-1006.md) records public type checks, independent source/numerical comparisons, import/startup checks and relevance outcomes for 34 current documentation sections.

RX-2001 also verifies explicit transactional source retention and strict source phrases through public subpaths; see [phrase evidence](docs/evidence/RX-2001.md). RX-2002 adds selected positions, independent original spans and mixed phrase strategies; see [position evidence](docs/evidence/RX-2002.md). RX-2003 adds typed metadata filters and exact conjunctive facets; see [filter/facet evidence](docs/evidence/RX-2003.md).

RX-2004 adds optional factual Inspector data and bounded JSON diagnostics; see [Inspector evidence](docs/evidence/RX-2004.md). It uses executed native decisions and score arithmetic, with no DOM or persistence.

RX-2005 adds optional original match ranges and bounded grapheme-safe snippet data. Source reanalysis and stored original offsets produce the same selected occurrences; snippets require explicit source. See [range/snippet evidence](docs/evidence/RX-2005.md).

The package remains `private: true`, version `0.0.0`, with zero runtime dependencies and the existing MIT license. It is usable from a local tarball. Publication and release qualification remain owner decisions; browser support, other optional capabilities, worker/storage hosting and Unicode snapshot portability require later evidence.

## Try the core

From this repository, install tooling and run the isolated packed consumer:

```sh
npm ci
npm run check
npm run pilot:core -- 'atomic mutation'
```

The pilot builds, packs and installs the tarball into a temporary directory, typechecks public imports, searches actual source sections, returns titles/source links and exercises replacements, deletion, clearing and repopulation. It prints the consumer/evidence directory, correctness/relevance results and core bundle measurement. See [the runnable example](examples/core-docs/README.md) for artifacts and replay commands.

A consumer that installed the local tarball uses only the root entry:

```ts
import { createRaveldex, RaveldexError } from '@vmitsaras/raveldex';

const engine = createRaveldex({ schema: { text: { title: { boost: 2 }, body: {} } } });
try {
  await engine.add({ id: 'guide:updates', text: { title: 'Atomic updates', body: 'Replace one complete record.' } });
  const page = await engine.search('atomic');
  console.log(page.revision, page.total, page.hits);
} catch (error) {
  if (error instanceof RaveldexError) console.error(error.code, error.details);
  else throw error;
} finally {
  await engine.dispose();
}
```

Ordinary strings require every analyzed word, use complete terms, and do not interpret quotes/operators as a query language. Explicit typed groups enable prefix matching. Core retains frequencies and declared equality metadata; the application keeps display/source records. Missing optional capabilities fail explicitly.

## Optional source phrases

```ts
import { createRaveldex } from '@vmitsaras/raveldex';
import { createSourceProvider, createSourcePhrases } from '@vmitsaras/raveldex/addons/phrases';

const fields = ['title', 'body'];
const engine = createRaveldex({
  schema: { text: { title: { boost: 2 }, body: {} } },
  addons: [createSourceProvider({ fields }), createSourcePhrases({ fields })],
});
try {
  await engine.add({ id: 'guide', text: { title: 'Atomic updates', body: ['red—blue', 'echo echo'] } });
  const page = await engine.search({
    kind: 'extension', capability: 'phrases', version: 1,
    payload: { text: 'red blue', fields: ['body'] },
  });
  console.log(page.revision, page.total, page.hits);
} finally {
  await engine.dispose();
}
```

Phrases require adjacent native tokens in one original value; repeats matter, punctuation separates tokens, and fields/array values cannot be joined. Eligibility refines its own Boolean leaf before pagination and adds no score bonus. Payload is exactly `{ text, fields? }`; omitted fields select all schema text fields, each requiring an enabled provider. Empty analyzed phrases match nothing; the cap is 32 analyzed tokens. Unknown keys, missing/incompatible providers and incomplete-budget verification fail explicitly.

The provider retains only declared fields' complete immutable original values and follows atomic writes, rollback, clear and disposal. Source-only consumers import `createSourceProvider` from `@vmitsaras/raveldex/addons/phrases/source` without the verifier. Factory options include optional `id`, `maxWorkUnits`, and source `maxRetainedEntries`; see [protocol and costs](docs/architecture/ADDONS_AND_ADAPTERS.md#strict-phrase-capability). The ordinary engine has no source/position getter or snippet API.

## Optional positions and original offsets

```ts
import { createPositionProvider } from '@vmitsaras/raveldex/addons/positions';
import { createPositionPhrases } from '@vmitsaras/raveldex/addons/phrases/positions';

const positions = createPositionProvider({ fields: ['title', 'body'], offsets: ['body'] });
const phrases = createPositionPhrases({ fields: ['title', 'body'] });
// Pass both registrations to createRaveldex's addons before adding records.
```

Positions store token order separately for each original array value, without retaining display text. `offsets` defaults to `[]`; its selected fields must be a subset of `fields`. Only those fields retain original half-open UTF-16 token spans. Normalization never supplies span coordinates. Offsets affect storage cost, while phrase membership and native scores remain identical to the source strategy. Containers/occurrences and optional span coordinates have explicit logical caps; heap and physical latency are unmeasured.

To use source for one field and positions for another, install each provider and one mixed phrase registration:

```ts
import { createSourceProvider } from '@vmitsaras/raveldex/addons/phrases/source';
import { createPositionProvider } from '@vmitsaras/raveldex/addons/positions';
import { createPhrases } from '@vmitsaras/raveldex/addons/phrases/mixed';

const addons = [
  createSourceProvider({ fields: ['title'] }),
  createPositionProvider({ fields: ['body'], offsets: ['body'] }),
  createPhrases({ fields: { title: 'source', body: 'positions' } }),
];
```

All strategies use the same `phrases` extension payload shown above. Select one phrase registration per engine; multiple registrations providing `phrases` conflict. Every query-selected field must have its declared provider, even for empty or unmatched queries. All side roots publish, roll back, clear and dispose with core. Position utility imports exclude phrase evaluation; positional-only phrases exclude source storage/reanalysis. Strict positions have `positionLength: 1`; slop, proximity and synonym graphs remain unsupported. See [RX-2002 evidence](docs/evidence/RX-2002.md).

## Optional structured filters and facets

```ts
import { createRaveldex } from '@vmitsaras/raveldex';
import { createFilters } from '@vmitsaras/raveldex/addons/filters';
import { createFacets } from '@vmitsaras/raveldex/addons/facets';

const engine = createRaveldex({
  schema: { text: { title: {} }, metadata: {
    price: { type: 'number' }, tags: { type: 'string', multi: true, nullable: true },
  } },
  addons: [createFilters({ fields: ['price', 'tags'] }), createFacets({ fields: ['tags'] })],
});
try {
  await engine.add({ id: 'guide', text: { title: 'Search guide' }, metadata: { price: 15, tags: ['guide', 'guide', null] } });
  const page = await engine.search({ kind: 'and', children: [
    { kind: 'extension', capability: 'numeric-range', version: 1, payload: { field: 'price', gte: 10, lt: 20 } },
    { kind: 'extension', capability: 'set-membership', version: 1, payload: { field: 'tags', values: ['guide'] } },
  ] }, { limit: 0, extensions: { facets: { fields: [{ field: 'tags', limit: 20, missing: true }] } } });
  console.log(page.revision, page.total, page.extensions?.facets);
} finally {
  await engine.dispose();
}
```

Numeric bounds are finite and apply to one numeric array element; both endpoints cannot be satisfied by different values. Set membership accepts 1–128 declared typed/null values, with no coercion. Missing positive data is false and NOT follows normal Boolean complement. Filters add no lexical score; source/position phrases and core equality remain composable in the same tree.

Facet counts include every qualifying document and its current own-field selection before hits are limited. Repeated values count once per document. Returned buckets tag actual string/null values and optional missing separately; empty arrays have no bucket. Output is count-descending, then null, UTF-16 strings and missing for ties. Each field reports `distinctValueTotal` and `omittedBucketCount`; those are bucket totals. Requests select up to eight string metadata fields, count at most 10,000 distinct buckets per field, and return up to 100 (default 20). Output limit zero still counts the complete membership. Factory ceilings can narrow counting/output/work; exhaustion rejects the entire search. Neither module retains a side index. See [the precise protocol](docs/architecture/ADDONS_AND_ADAPTERS.md#structured-filters-and-facets).

## Start here

| Need | Read |
| --- | --- |
| Current implementation reality | [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) |
| Milestones and progress | [ROADMAP.md](ROADMAP.md) |
| Detailed task cards | [IMPLEMENTATION_TASKS.md](IMPLEMENTATION_TASKS.md) |
| Next Codex session | [CODEX_HANDOFF.md](CODEX_HANDOFF.md) |
| Repository rules | [AGENTS.md](AGENTS.md) |
| Architecture and optional boundaries | [Native architecture](docs/architecture/NATIVE_ARCHITECTURE.md), [add-ons](docs/architecture/ADDONS_AND_ADAPTERS.md) |
| Data, queries and limits | [Core contract](docs/specs/CORE_CONTRACT.md) |
| Evaluation and GitHub tracking | [Verification plan](docs/planning/VERIFICATION_PLAN.md), [tracking guide](docs/planning/GITHUB_TRACKING.md) |

Browse the [milestones](https://github.com/vmitsaras/raveldex/milestones) and [task issues](https://github.com/vmitsaras/raveldex/issues?q=is%3Aissue+label%3Atype%3Atask).

## Development

Use Node.js 22 or newer and npm. TypeScript 7.0.2 emits strict DOM-free ESM/declarations; esbuild 0.28.2 is development tooling for reproducible packed-consumer bundling and import-graph inspection. Platform binaries remain tooling. Tests use Node's built-in runner.

```sh
npm ci
npm run check
npm run test:core
npm run test:consumer
npm run test:phrases
npm run test:positions
npm run test:filters
npm run test:facets
npm run test:inspector
npm run handoff:status
npm run handoff:next
```

`npm run build` clears and emits ignored `dist/` so deleted modules cannot remain in the tarball. `npm pack` builds before packing compiled runtime/declarations; the root exports map excludes internal paths. `npm run check` includes the isolated consumer's public declaration and runtime checks. The pilot's local pack/install uses an isolated cache and offline installation without lifecycle scripts; it makes no remote tracking or publication requests.

`handoff:next` reports dependency eligibility. Task completion requires acceptance evidence. Normal development needs no secrets; only the explicit GitHub tracking workflow uses a temporary repository token.

## Product boundary

| Layer | Responsibility |
| --- | --- |
| Native core | Validation, basic analysis, dictionary/postings/statistics, lexical/Boolean/equality queries, BM25, exact totals, atomic writes, bounded FIFO execution and typed failures. |
| Optional source phrases | Explicit selected-field originals and strict phrase leaves. |
| Optional positions, filters and facets | Selected original occurrence data, typed metadata qualification and complete conjunctive counts. |
| Optional Inspector | Selected eligibility paths, actual native contributions, revision/configuration/resource identity and explicit diagnostic exports. |
| Planned optional search modules | Native DOM UI. |
| Planned host adapters | Worker ownership/transport, snapshots, IndexedDB/recovery and later integrations. |
| Development references | Independent source oracles, judged relevance fixtures and separately identified comparators. |

The RX-2005 packed public core measures **16,491 bytes gzip** (54,156 minified ESM bytes), exceeding the unchanged 15 KiB target by **1,131 bytes** (+32 gzip versus RX-2004). Boundary review keeps optional range collection, source traversal, segmentation, clipping, projection and serialization outside core; mandatory validation/shared metering remain intact. Complete bundles overlap and are not additive module costs. The 10,000-record observations are logical work/retention counters, not a universal capacity/latency promise. Heap, peak memory and broad host qualification remain pending. No DOM, worker, storage, network, foreign engine or optional representation enters the core graph or runs on import.

MiniSearch and other engines may be isolated comparators; they cannot implement or silently replace the native core. N5 remains deferred. Next planner priority after RX-2005 is RX-2006 — Native DOM UI, Inspector, and documentation pilot.

## Factual inspection

```ts
import { createRaveldex } from '@vmitsaras/raveldex';
import { createInspector, exportDiagnostics, type InspectorData } from '@vmitsaras/raveldex/addons/inspector';

const engine = createRaveldex({ schema: { text: { title: {} } }, addons: [createInspector()] });
await engine.addMany([
  { id: 'a', text: { title: 'red red car' } },
  { id: 'b', text: { title: 'red car' } },
  { id: 'c', text: { title: 'blue' } },
]);
const result = await engine.search('red car', {
  limit: 1,
  extensions: { inspector: { ids: ['a', 'b', 'c', 'missing'], expectedRevision: 1 } },
});
// This application explicitly installed and requested this first-party extension.
const data = result.extensions!.inspector as InspectorData;
const diagnostic = exportDiagnostics(data); // Metadata-only JSON, no IDs/query/facts/source.
console.log(diagnostic.json);
await engine.dispose();
```

`createInspector({id?,sourceFields?,maxFacts?,maxWorkUnits?,maxOutputEntries?})` provides `inspector` v1. Requests select up to 128 unique IDs, including excluded, off-page and absent records. `trace.facts` contains actual evaluator paths and selected native field/group/document arithmetic. `documents` distinguishes eligibility from page placement; absent records have score `null`. Full alternatives, absolute ranks and heap bytes are explicitly unavailable. Ordinary searches allocate no full collector even with Inspector installed.

Complete explanations fail on revision mismatch, fact/work/output overflow, cancellation or disposal. Defaults narrow only: 4,096 header-inclusive facts, 10,000,000 module work units, 16,384 structural output entries, and 262,144 aggregate key/string UTF-16 units. Core limits can be stricter. Resource work is labeled `before-evidence-projection`, excluding output projection/final delivery; it is not elapsed time or heap usage.

Source requires an installed selected source provider, `sourceFields` enabled at Inspector creation and explicitly selected in each request. `exportDiagnostics(data, {includeFacts?,includeSource?,maxCodeUnits?})` exports metadata by default. Facts intentionally include selected IDs and canonical query content; source inclusion exports only already-selected originals. Serialized JSON is separately capped at 262,144 UTF-16 units, including escapes and the envelope. When selected sections cannot fit, whole sections are omitted with `complete:false` and `omitted`; a metadata envelope that cannot fit fails. Returned JSON contains the same omission marker. These objects are deeply owned/readonly plain data; source remains text for later safe presentation.

## Original ranges and snippets

```ts
import { createRaveldex } from '@vmitsaras/raveldex';
import { createSourceProvider } from '@vmitsaras/raveldex/addons/phrases/source';
import { createSnippetEvidence, type SnippetEvidenceData } from '@vmitsaras/raveldex/addons/snippets';

const engine = createRaveldex({
  schema: { text: { title: {} } },
  addons: [
    createSourceProvider({ fields: ['title'] }),
    createSnippetEvidence({ fields: { title: 'source' } }),
  ],
});
await engine.add({ id: 'guide', text: { title: 'Original ＦＯＯ and foo text' } });
const result = await engine.search('foo', {
  extensions: { snippets: { ids: ['guide'], expectedRevision: 1 } },
});
const data = result.extensions!.snippets as SnippetEvidenceData;
// Render snippet.text through text nodes; use relative highlights for marks.
console.log(data.documents[0]?.snippets);
await engine.dispose();
```

For ranges without display text, import `createMatchEvidence` from `/addons/evidence` and request `extensions['match-evidence']={ids,fields?,expectedRevision?,maxFacts?,maxRanges?}`. Configure each field as `'source'` for original reanalysis or `'offsets'` for a separately installed position provider with that original-offset field. Offsets need no original text; snippets additionally require source for every configured field. Range-only imports never load snippet/segmentation code.

Both factories return deeply owned original `{field,valueIndex,position,start,end,term}` ranges at one revision, in deterministic occurrence order. Coordinates are half-open UTF-16 in the identified original value. Prefixes mark whole original tokens. Only successful positive query paths contribute; failed branches, NOT, predicates and excluded/absent IDs do not supply highlights. Phrase ranges belong to complete adjacent sequences in one value. Every matching alternative in a successful lexical group is represented, independently of its winning BM25 variant. Selected fields are a projection and never change query eligibility.

Defaults/hard caps narrow only: 128 selected IDs, 4,096 header-inclusive facts, 4,096 complete ranges per request, 16,384 structural output entries, 262,144 aggregate key/string code units and shared bounded work. Overflow rejects the complete requested operation. Requesting two evidence extensions together, including Inspector, fails `INVALID_OPTIONS`.

Snippets show at most 3 windows per document, 240 UTF-16 units per window and 32 merged highlights per window; `maxSnippets`, `maxCodeUnits`, `maxHighlights` can reduce these. Each window has original field/value/start/end, exact source `text`, relative `highlights`, and `omittedBefore`/`omittedAfter`. Grapheme-safe marks can expand exact token ranges; source remains unchanged. `snippetOmissions` counts unshown occurrences and oversized tokens/clusters and flags exhausted window/highlight bounds. Base `complete:true` describes ranges, while display omissions remain explicit. Missing originals fail `MISSING_CAPABILITY`; missing usable `Intl.Segmenter` fails `UNSUPPORTED_ENVIRONMENT` for requested snippets. Data contains no pretrusted HTML; render source as text plus explicit marks. DOM UI/browser qualification belongs to RX-2006/N4.
