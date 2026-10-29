# Raveldex

**Native local search with exact totals, atomic updates and optional feature costs.**

Raveldex is a framework-agnostic TypeScript library for mutable local collections. Its pure ESM core owns indexing, retrieval and field-local BM25 ranking. It needs no DOM, worker, database or runtime dependency. Source text, phrases, positions, filters, facets, bounded typo tolerance, token suggestions, directional synonyms, an English analyzer, numerical explanations, snippets, DOM UI and host adapters are explicit optional imports.

The **0.1.0-rc.0 candidate is private and unpublished**. Use a local tarball for evaluation. Candidate preparation does not publish a package or establish universal browser, accessibility, performance or Unicode portability guarantees. See [candidate scope and recommendation](docs/release/CANDIDATE.md), [compatibility policy](docs/release/COMPATIBILITY.md) and [qualified support and limits](docs/support/RX-4003.md).

From this repository:

```sh
npm ci
npm run check
npm pack
```

Install the resulting tarball in an ESM application with `npm install /absolute/path/to/vmitsaras-raveldex-0.1.0-rc.0.tgz`. Node `>=22` is the declared package floor; actual local and browser verification is scoped in the [support record](docs/support/RX-4003.md).

<!-- candidate-example: quick-start -->
```js
import { createRaveldex } from '@vmitsaras/raveldex';

const engine = createRaveldex({
  schema: { text: { title: { boost: 2 }, body: {} } },
});
try {
  await engine.add({
    id: 'guide:updates',
    text: { title: 'Atomic updates', body: 'Replace one complete record.' },
  });
  const page = await engine.search('atomic');
  console.log(page.revision, page.total, page.hits);
} finally {
  await engine.dispose();
}
```

The factory returns an empty revision-0 engine. It exposes `search`, `add`, `addMany`, `replace`, `remove`, `clear` and `dispose`. Configuration errors throw; operational errors reject promises. Core returns IDs and scores, so the application keeps its display records. Plain strings require every analyzed word and complete terms; quotes and operators are ordinary punctuation. Use typed queries for prefix, Boolean or equality behavior.

Start with the [API reference and complete export map](docs/api/README.md). The reference includes [core data/query/lifecycle contracts](docs/api/CORE.md), [optional search capabilities and factual Inspector](docs/api/ADDONS.md), and [worker, snapshots, IndexedDB and migration examples](docs/api/HOSTS.md). [Runnable example modules](docs/api/examples/README.md) are checked against the installed candidate. The repository [documentation CLI](https://github.com/vmitsaras/raveldex/blob/main/examples/core-docs/README.md) and [browser pilot](https://github.com/vmitsaras/raveldex/blob/main/examples/docs-search/README.md) exercise real source documents.

The candidate retains the repository [RX-4001 evaluation findings](https://github.com/vmitsaras/raveldex/blob/main/docs/evaluation/RX-4001.md): natural-language lexical gaps, finite whole-source rebuild refusals and the core's 15 KiB gzip planning-target miss. [RX-4002 qualification](docs/support/RX-4003.md) completes the finite recorded browser, exact-tool accessibility, physical and memory-method requirements. Its observed scope does not turn encoded sizes into heap measurements, requested buffer capacity into physical copies, or selected Safari/VoiceOver flows into all-AT support.

The library is MIT licensed. [Release preparation](docs/release/PREPARATION.md), [release notes](CHANGELOG.md), the repository [LocalSearch migration guide](https://github.com/vmitsaras/raveldex/blob/main/docs/migration/LOCALSEARCH.md) and [implementation roadmap](https://github.com/vmitsaras/raveldex/blob/main/IMPLEMENTATION_TASKS.md) describe the remaining owner decision and deferred enhancements. RX-A010 [bounded typo tolerance](docs/api/TYPO.md), RX-A020 [dictionary-backed token suggestions](docs/api/SUGGESTIONS.md), RX-A030 [directional one-step synonyms](docs/api/SYNONYMS.md) and RX-A040 [English morphology](docs/api/ENGLISH.md) are explicitly selected optional features; other N5 ideas remain deferred. Publication, tags and public releases remain separate actions.
