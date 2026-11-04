# Implemented candidate scope

`@vmitsaras/raveldex@0.1.0-rc.0` is a private, unpublished ESM candidate. All release-track and selected optional features are complete. This guide describes what an evaluator receives; [publication status](PUBLICATION_STATUS.md) owns remaining release decisions, and [preparation](PREPARATION.md) owns the exact local-artifact workflow. The [Unreleased notes](../../CHANGELOG.md) announce no issued release.

## Included scope

Core supplies source-free indexing, exact/prefix/Boolean/scalar-equality queries, native field-local BM25, exact totals, deterministic order, incremental atomic mutations, bounded FIFO execution, cooperative cancellation and explicit disposal. It has zero runtime dependencies and no foreign engine below it.

Optional imports provide selected source/positions/offsets, strict source/position/mixed phrases, typed filters/exact facets, factual Inspector, ranges/snippets, native DOM UI/CSS, one-owner workers, snapshots, IndexedDB and source migration. Ten further explicit capabilities cover typo tolerance, token suggestions, synonyms, English analysis, identifiers, literal/infix matching, ordered proximity, query compilation, record patches and a separate static/Astro integration. See the [complete import map](../api/README.md).

The independently packaged English analyzer and Astro adapter require exact core `0.1.0-rc.0` peers. Astro has an optional exact `astro@7.3.2` peer; it supports static directory builds, explicit content allowlists and on-demand loading rather than a crawler, SSR or a development watcher.

## Package and ownership boundaries

Core imports initialize no hosts and retain no source, positions, DOM or storage side state. Select providers at owner creation. UI/display data and worker/storage ownership stay explicit. The package export maps and declarations define public APIs; physically shipped implementation dependencies are not supported deep imports.

Core tarballs include compiled runtime/declarations, licenses, the README/changelog and curated API/release/support guides with runnable modules. They exclude source implementation, tests, benchmarks, workflows, maintainer history and large qualification archives. Separate packages contain their own README/license/declarations and compiled entry points. Repository/evidence links require repository access; no hosted documentation or demo is promised.

## Evidence and limitations

Each acceptance record binds its source, selected graph/configuration, environment and workload. Original relevance judgments remain a small English technical corpus rather than a representative user study. Exact lexical queries can miss vocabulary/paraphrase intents; English stemming can merge distinct forms. Optional features do not rewrite those recorded outcomes.

The full-core gzip planning target remains 15 KiB and is missed. Current preparation reports the actual graph, compression runtime and measured bytes; historical values are not current package-size claims. Optional graphs overlap and cannot be summed; serialized bytes are not retained/peak memory.

The N9 independent review distinguishes incremental updates from broad exact-total retrieval and whole-source recovery. Ordinary operations default to 30-second deadlines (or a lower configured maximum); timed N9 operations explicitly request the 60-second ceiling. Successful selected 10k restores do not establish universal capacity, and observed work/deadline refusals remain limitations. The [practical guide](../api/LIMITATIONS.md) gives the recovery boundary.

Admitted 1,000/10,000-record workloads have finite observations, not universal latency/completion promises. Whole-source rebuilds can exceed work/deadline limits. Unknown transport/storage outcomes remain distinct from rollback; applications retain authoritative source and choose recovery explicitly. Native snapshots require exact application-qualified Node environments and remain unavailable in browser/worker hosts.

Browser automation, bounded Safari/VoiceOver and physical-input sessions, managed occupied-operation observations and native requested wire-capacity measurements retain different scopes. Earlier interrupted announcements and refused/invalid measurements remain evidence, not hidden fixes. See [support and known limitations](../support/RX-4003.md).

## Evaluation versus publication

Fresh preparation runs full checks and exercises the exact packed documentation/imports. Every changed artifact needs a new report; a matching private version string or historical CI result is not enough. Passing these finite checks does not select a public version or authorize publication, tags, releases, visibility changes or deployment.
