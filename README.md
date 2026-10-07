# Raveldex

**Native local search with explainable results and optional feature costs.**

Raveldex is a TypeScript search library for mutable local collections. The native core owns analysis, dictionary/postings, field-local BM25, exact totals, typed lexical/Boolean/equality queries, incremental atomic updates and cooperative execution. Optional search capabilities and host integrations follow the adopted roadmap.

## Current status

**N1 core alpha is verified locally through a packed public ESM package and real-document CLI.**

RX-1001–1006 implement and verify the core. The public factory returns an empty revision-0 engine with `search`, `add`, `addMany`, `replace`, `remove`, `clear` and `dispose`. Configuration errors throw; operational errors reject promises. [RX-1006 evidence](docs/evidence/RX-1006.md) records public type checks, independent source/numerical comparisons, import/startup checks and relevance outcomes for 34 current documentation sections.

RX-2001 also verifies explicit transactional source retention and strict source phrases through public subpaths; see [phrase evidence](docs/evidence/RX-2001.md).

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

The provider retains only declared fields' complete immutable original values and follows atomic writes, rollback, clear and disposal. Source-only consumers import `createSourceProvider` from `@vmitsaras/raveldex/addons/phrases/source` without the verifier. Factory options include optional `id`, `maxWorkUnits`, and source `maxRetainedEntries`; see [protocol and costs](docs/architecture/ADDONS_AND_ADAPTERS.md#strict-phrase-capability). No source getter, offsets, snippets or positions are added to the ordinary engine.

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
npm run handoff:status
npm run handoff:next
```

`npm run build` emits ignored `dist/`. `npm pack` builds before packing compiled runtime/declarations; the root exports map excludes internal paths. `npm run check` includes the isolated consumer's public declaration and runtime checks. The pilot's local pack/install uses an isolated cache and offline installation without lifecycle scripts; it makes no remote tracking or publication requests.

`handoff:next` reports dependency eligibility. Task completion requires acceptance evidence. Normal development needs no secrets; only the explicit GitHub tracking workflow uses a temporary repository token.

## Product boundary

| Layer | Responsibility |
| --- | --- |
| Native core | Validation, basic analysis, dictionary/postings/statistics, lexical/Boolean/equality queries, BM25, exact totals, atomic writes, bounded FIFO execution and typed failures. |
| Optional source phrases | Explicit selected-field originals and strict phrase leaves. |
| Planned optional search modules | Positions/offsets, structured filters, facets, source evidence/snippets, Inspector and native DOM UI. |
| Planned host adapters | Worker ownership/transport, snapshots, IndexedDB/recovery and later integrations. |
| Development references | Independent source oracles, judged relevance fixtures and separately identified comparators. |

The full public core measured **15,131 bytes gzip** (49,102 minified ESM bytes), within the 15 KiB target under the fixed esbuild/gzip method. Mandatory registration/refinement coordination increases core from historical RX-1006's 12,400 gzip bytes. Complete core plus source phrases measured 17,371 gzip bytes; standalone source utility 3,544. These complete bundles overlap and are not additive module costs. The 10,000-record defensive ceiling is not a universal capacity or latency promise. No DOM, worker, storage, network, foreign engine or optional source representation enters the measured graph or runs on import.

MiniSearch and other engines may be isolated comparators; they cannot implement or silently replace the native core. N5 remains deferred. Next planner priority is RX-2002; RX-2003 and RX-2004 are also dependency-ready.
