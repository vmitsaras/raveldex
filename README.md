# Raveldex

**Native local search with explainable results and optional feature costs.**

Raveldex is a TypeScript search library for mutable local collections. The native core owns analysis, dictionary/postings, field-local BM25, exact totals, typed lexical/Boolean/equality queries, incremental atomic updates and cooperative execution. Optional search capabilities and host integrations follow the adopted roadmap.

## Current status

**N1 core alpha is verified locally through a packed public ESM package and real-document CLI.**

RX-1001–1006 implement and verify the core. The public factory returns an empty revision-0 engine with `search`, `add`, `addMany`, `replace`, `remove`, `clear` and `dispose`. Configuration errors throw; operational errors reject promises. [RX-1006 evidence](docs/evidence/RX-1006.md) records public type checks, independent source/numerical comparisons, import/startup checks and relevance outcomes for 34 current documentation sections.

RX-2001 also verifies explicit transactional source retention and strict source phrases through public subpaths; see [phrase evidence](docs/evidence/RX-2001.md). RX-2002 adds selected positions, independent original spans and mixed phrase strategies; see [position evidence](docs/evidence/RX-2002.md). RX-2003 adds typed metadata filters and exact conjunctive facets; see [filter/facet evidence](docs/evidence/RX-2003.md).

RX-2004 adds optional factual Inspector data and bounded JSON diagnostics; see [Inspector evidence](docs/evidence/RX-2004.md). It uses executed native decisions and score arithmetic, with no DOM or persistence.

RX-2005 adds optional original match ranges and bounded grapheme-safe snippet data. Source reanalysis and stored original offsets produce the same selected occurrences; snippets require explicit source. See [range/snippet evidence](docs/evidence/RX-2005.md).

RX-2006 adds an optional native DOM interface and real documentation browser pilot, with exact facets, safe original snippets and requested factual Inspector. Browser interaction and automated accessibility observations qualify one local Chrome host; OS IME, screen-reader and cross-browser qualification remain separate.

RX-3001 adds an explicit one-owner module-worker adapter with bounded transport, compatible local capabilities, cancellation and mutation receipt reconciliation. The documentation pilot offers direct or worker execution.

RX-3002 adds explicit versioned source/native snapshots, complete atomic restore and exact declared Node-profile compatibility through an optional entry. See [snapshot evidence](docs/evidence/RX-3002.md).

RX-3003 adds explicit namespaced IndexedDB save/load/erase and an optional source-snapshot worker bridge. Storage and engine commit outcomes stay separate; recovery never retries an unknown restore automatically.

RX-3004 adds explicit validated LocalSearch source conversion through `/integrations/localsearch`. Rebuild a new native owner from the owned configuration/records; legacy indexes, scores, live handles and storage namespaces remain separate. See the [migration guide](docs/migration/LOCALSEARCH.md).

RX-4001 evaluates the unchanged native contracts with independent correctness, 76 frozen real-document judgments, an explicitly pinned companion comparison and separate bounded cost configurations. See [the evaluation](docs/evaluation/RX-4001.md) for raw outcomes, incomplete-label limits and reproduction. Natural-question lexical gaps, the core gzip target miss and refused large source rebuilds remain visible; these observations do not qualify browser/AT/device/heap or a public release.

RX-4002 adds a reproducible installed-package browser matrix, fresh-process Node memory observations and separate offline graph-cut analysis of the original dumps. See [qualification scope](docs/support/RX-4002.md), the [memory method](docs/evaluation/RX-4002-memory-method.md), and the [exact-tool/device checklist](docs/accessibility/RX-4002-manual-observations.md). Missing screen-reader, physical-device and isolated browser/worker memory observations keep qualification incomplete. No public contract, dependency, capacity limit or release requirement changes.

The package remains `private: true`, version `0.0.0`, with zero runtime dependencies and the existing MIT license. It is usable from a local tarball. Publication and release qualification remain owner decisions; broader browser support, physical durability and cross-host Unicode snapshot portability require later evidence.

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

## Optional source and native snapshots

```ts
import { createSnapshots } from '@vmitsaras/raveldex/adapters/snapshots';

// engine has a source provider covering every indexed text field.
const snapshots = createSnapshots(engine);
const encoded = await snapshots.exportSource();
const restored = await snapshots.restore(encoded);
console.log(restored.originRevision, restored.revision, restored.reindexed);
```

Source snapshots contain canonical IDs, metadata and complete original values. Restore rebuilds using the receiving engine's analyzer, prepares every installed participant, and commits one next local revision. It explicitly returns the receiving analyzer and `reindexed: true`. Original origin revisions are metadata, never reused as the receiving revision. Missing or partial source fails `SOURCE_UNAVAILABLE`, including an empty engine with no complete source provider. No omitted original text is manufactured.

Native snapshots contain actual native frequency/dictionary/posting/reverse/statistical state and selected source/position/offset roots. They validate those structures and their cross-references before publication. The ordinary `createRaveldex` profile remains unqualified and rejects native export/restore. For an application that has its own recorded qualification evidence for an exact Node runtime:

```ts
import {
  createSnapshotRaveldex, createSnapshots, currentNodeSnapshotEnvironment,
} from '@vmitsaras/raveldex/adapters/snapshots';

const qualified = createSnapshotRaveldex({ schema: { text: { body: {} } } }, {
  nativeQualification: {
    profileId: 'my-tested-node-profile-v1',
    scope: 'exact-node-runtime',
    environment: currentNodeSnapshotEnvironment(),
    evidence: ['my-project/qualification-record.md'],
  },
});
try {
  await qualified.add({ id: 'a', text: { body: 'Original text' } });
  const codec = createSnapshots(qualified);
  const encoded = await codec.exportNative();
  await codec.restore(encoded);
} finally { await qualified.dispose(); }
```

`nativeQualification` is a trusted application declaration of its tests. The helper reports the current Node/V8/ICU/Unicode/platform/architecture; copying that record or naming an evidence file does not run qualification. The owner has its qualified descriptor from revision 0. Restore requires the same complete declaration and actual runtime. Browser/worker owners and cross-host native portability are not qualified by this API. Source-only attachment remains available to a direct ordinary owner.

The two versioned JSON formats identify schema, analyzer, native ranking/implementation, limits, capabilities and index detail. The checksum detects accidental damage; structural validation remains mandatory. Unknown side codecs or incompatible configuration fail explicitly. Snapshot errors add a fixed `SnapshotAdapterError.reason` alongside ordinary core error codes. Both export and restore share the owner's FIFO, cancellation, deadlines and work limits. Failure preserves the previous searchable revision. `maxEncodedBytes` narrows the 64 MiB UTF-8 JSON ceiling; large admitted live collections can exceed that serialization cap. No storage is performed; explicit IndexedDB save/load/erase belongs to RX-3003.

## Optional IndexedDB persistence

```ts
import { createSnapshots } from '@vmitsaras/raveldex/adapters/snapshots';
import { createIndexedDBPersistence } from '@vmitsaras/raveldex/adapters/indexeddb';

// engine retains complete source for every indexed text field.
const storage = createIndexedDBPersistence(createSnapshots(engine), {
  databaseName: 'my-raveldex-database', // dedicated to this adapter
  namespace: 'documentation-v1',
});
try {
  const loaded = await storage.load();
  const saved = await storage.save({ expectedGeneration: loaded.generation });
  // Explicit erasure removes both namespace records; the engine remains usable.
  await storage.erase({ expectedGeneration: saved.generation });
} finally {
  await storage.dispose();
}
```

Importing or constructing this adapter opens no database and starts no background saving. Actions lazily open dedicated database version 1 with `snapshots` and `metadata` stores keyed by namespace. The source format is the default. Native selection still requires an actually qualified matching snapshot owner; browser native snapshots remain unsupported. An optional explicit `indexedDB` handle supports application-selected host access.

Storage-v1 retains the exact canonical snapshot format/version prefix and checks it against metadata before full codec validation. Arbitrarily reformatting stored JSON is refused; portable snapshots alone keep their general JSON decoder. The supplied snapshot handle is a trusted application dependency.

Save and erase require `expectedGeneration`, a previous opaque token or `null` for an absent namespace. Both records and the generation comparison belong to one transaction, so simultaneous stale writers reject `GENERATION_CONFLICT`. Each save creates a fresh token; erase/recreate cannot reuse the old token. Erase also accepts `null` as an explicit recovery action when corrupt/orphaned metadata has no valid generation. Other namespaces remain intact, and no tombstone remains. Later explicit saves by another client can recreate the namespace.

Save returns `{ generation, format, encodedBytes, durable: true }` only at IndexedDB transaction completion, with the `strict` durability hint requested. Serialization and the engine's earlier writes are separate from that storage commit. Completion is not physical power-loss, eviction or browser-retention qualification. Load returns `missing` without changing the engine, or `restored` with the selected generation and actual atomic snapshot restore result. The selected token is not a lease on the current storage head; another client may save during restoration.

`IndexedDBAdapterError` provides fixed codes and bounded phase/conflict/snapshot details. Unavailable storage, quota, corrupt records, incompatible snapshots/database versions, blocked tabs, transaction failure, cancellation and deadlines have explicit outcomes. Recovery never silently erases or overwrites bad data. A dedicated incompatible schema is refused rather than migrated. Connections close on version change; a late open closes after its stopped caller settles. Adapter disposal releases its resources while retaining durable data and the borrowed engine.

Browser worker recovery is an explicit additional selection:

```ts
import { createWorkerSnapshots } from '@vmitsaras/raveldex/adapters/worker/snapshots';
const storage = createIndexedDBPersistence(createWorkerSnapshots(workerEngine), {
  databaseName: 'my-raveldex-database', namespace: 'documentation-v1',
});
```

The application's module worker must use `serveSnapshotRaveldexWorker` from `@vmitsaras/raveldex/adapters/worker/snapshots/host` with the same trusted local add-ons. The bridge reuses its one complete owner and FIFO, preserves the 8 MiB transport ceiling, and supports source export/restore plus separate restore receipts. Ordinary worker/core imports exclude the codecs and IndexedDB implementation. A dispatched restore with an unobserved result reports `OUTCOME_UNKNOWN`; its operation ID can be reconciled through the snapshot bridge. No restore is retried automatically. Database operations remain on the selected storage adapter host.

Defaults are 5,000 ms for open and 30,000 ms for the complete queued action; configurable ceilings are 30,000 and 60,000 ms. At most 64 storage actions are pending. UTF-8 envelope checks yield in bounded batches outside active database transactions; browser structured-clone work is a separate platform primitive. The snapshot ceiling remains 64 MiB, with the narrower worker envelope cap where applicable. See the [storage contract](docs/architecture/ADDONS_AND_ADAPTERS.md#indexeddb-adapter-contract-rx-3003).

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

## Optional native UI

```ts
import { mountRaveldexUI } from '@vmitsaras/raveldex/addons/ui';
import '@vmitsaras/raveldex/addons/ui/styles.css'; // explicit bundler CSS import

// Populate the engine first; register facets/snippets/Inspector if requested.
const ui = mountRaveldexUI({
  root: document.querySelector<HTMLElement>('#search')!, engine,
  documents: [{ id: 'guide', title: 'Search guide', url: '/docs/search' }],
  facets: [{ field: 'category', label: 'Category' }], snippetFields: ['body'],
});
// ui.search() flushes debounce; ui.destroy() restores authored child nodes.
// The application separately owns await engine.dispose().
```

Use native forms, selects, buttons and result links. Inspector opens a native dialog with requested same-revision facts. UI-owned signals request cancellation; generation checks also discard obsolete presentation. Typed failures provide retry. Optional snippets render original text and explicit marks, with visible omissions. Duplicate mounts return the existing handle; destroy clears UI timers/listeners/requests and preserves the borrowed engine. The navigation document allowlist is captured at mount and permits HTTP(S) links without credentials. See [the bounded public contract](docs/architecture/ADDONS_AND_ADAPTERS.md#native-ui-public-contract--rx-2006).

Run `npm run pilot:ui` and open the printed local URL for the real 34-section documentation application. Switch source/offset representations, submit exact terms or strict phrases, select categories, page, inspect and destroy/reinitialize. `npm run test:ui` runs installed/minified browser scenarios with pinned Playwright Core and axe-core development tools; local Chrome is the default. Use `RAVELDEX_UI_BROWSER=chromium` after explicit `node node_modules/playwright-core/cli.js install chromium` to use its pinned Chromium. [The example](examples/docs-search/README.md) describes its corpus and evidence boundaries. Core imports neither UI nor CSS.

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

## Use one module worker

The application supplies a same-host module-worker entry. Construction and ownership are explicit:

```js
// engine-worker.mjs: import each trusted add-on here with the same options as
// the page configuration; core-only uses no add-ons.
import { serveRaveldexWorker } from '@vmitsaras/raveldex/adapters/worker/host';
serveRaveldexWorker(self);
```

```js
import { createWorkerRaveldex } from '@vmitsaras/raveldex/adapters/worker';
const engine = await createWorkerRaveldex({
  worker: new Worker(new URL('./engine-worker.mjs', import.meta.url), { type: 'module' }),
  configuration: { schema: { text: { body: {} } } },
  ownership: 'owned', sameHost: true,
});
const operation = engine.add({ id: 'one', text: { body: 'red car' } });
const operationId = operation.operationId;
await operation;
console.log(await engine.search('red'));
console.log(await engine.reconcile(operationId));
await engine.dispose();
```

Bundle the page and worker as two explicit ESM entries; serve both from the same origin. The [documentation pilot](examples/docs-search/README.md) exercises this path. Duplicate host setup or a second live or initializing client on the same endpoint rejects with `INCOMPATIBLE_WORKER`; explicit disposal releases the guard. The host creates one empty engine during the validated handshake; all selected state and statistics live in that owner. A client configuration can include add-on registrations, but only their captured manifests cross transport; the worker entry imports matching implementations locally. First-party registrations declare versioned worker identities including their complete normalized options.

`sameHost: true` explicitly selects a page and its own worker using the implemented `basic-v1` unqualified profile. It does not establish cross-browser or native-snapshot portability. Message caps include encoded envelope metadata; the default ceiling is 8 MiB and can be narrowed. The adapter adds typed transport failures without changing root core error codes. Its reply watchdog defaults to 65,000 ms (configurable from 1 to 120,000); this is separate from native queue-time deadlines. A silently terminated worker may be detected by the watchdog. Disposal releases listeners and owned resources even if its acknowledgement times out.

A dispatched mutation with a lost reply can reject with `WorkerAdapterError` code `OUTCOME_UNKNOWN` and its operation ID. This never proves rollback or permits automatic retry. `reconcile(id)` asks the living owner for its bounded receipt (`pending`, `committed`, `rejected`, or `expired`); the last 256 mutation outcomes remain available. When the worker has died or the receipt expired, recover explicitly from authoritative source. Caller aborts request native cooperative cancellation; known committed results remain successful. `dispose()`/`destroy()` releases adapter listeners and terminates only an `owned` worker. An `external` worker remains caller-owned.

## Product boundary

| Layer | Responsibility |
| --- | --- |
| Native core | Validation, basic analysis, dictionary/postings/statistics, lexical/Boolean/equality queries, BM25, exact totals, atomic writes, bounded FIFO execution and typed failures. |
| Optional source phrases | Explicit selected-field originals and strict phrase leaves. |
| Optional positions, filters and facets | Selected original occurrence data, typed metadata qualification and complete conjunctive counts. |
| Optional Inspector | Selected eligibility paths, actual native contributions, revision/configuration/resource identity and explicit diagnostic exports. |
| Optional native UI | Labeled forms, facets, result navigation, original snippets and factual Inspector; separate scoped CSS. |
| Optional worker adapter | One complete engine owner, validated transport, explicit lifecycle and mutation receipts. |
| Optional snapshots | Versioned complete-source rebuild and validated native state under an exact declared Node profile. |
| Optional persistence | Explicit namespaced IndexedDB actions, generation conflicts, atomic source recovery and complete erasure. |
| Planned integrations | Later migration and selected enhancements. |
| Development references | Independent source oracles, judged relevance fixtures and separately identified comparators. |

The historical RX-2005 packed public core measured **16,491 bytes gzip** (54,156 minified ESM bytes), exceeding the unchanged 15 KiB target by **1,131 bytes** (+32 gzip versus RX-2004). Boundary review keeps optional range collection, source traversal, segmentation, clipping, projection and serialization outside core; mandatory validation/shared metering remain intact. Complete bundles overlap and are not additive module costs. The 10,000-record observations are logical work/retention counters, not a universal capacity/latency promise. Heap, peak memory and broad host qualification remain pending. No DOM, worker, storage, network, foreign engine or optional representation enters the core graph or runs on import.

RX-3001 measures the current core at **16,631 gzip bytes** (54,672 minified bytes), missing the same 15 KiB target by **1,271 bytes**. Its core graph remains 31 inputs without optional adapter modules; the increase covers supported capability metadata and the narrow internal execution-control seam. The selected worker client is 35,574/11,237 minified/gzip bytes. Complete product and worker graphs are measured separately; these figures are not additive costs or heap measurements.

MiniSearch and other engines may be isolated comparators; they cannot implement or silently replace the native core. N5 remains deferred. Next planner priority after RX-3003 is RX-3004 — Companion migration and comparator separation.

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
