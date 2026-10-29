# Native 0.1 candidate

The local candidate is `@vmitsaras/raveldex@0.1.0-rc.0`, **private and unpublished**. RX-4003 prepares a reviewable package and recommendation. Publication is a separate owner action. Use [preparation](PREPARATION.md), [compatibility](COMPATIBILITY.md), the [API reference](../api/README.md) and [support scope](../support/RX-4003.md).

## Included scope

Core supplies native frequency indexing, exact/prefix/Boolean/scalar-equality queries, `raveldex-bm25-v1`, exact totals, deterministic ordering, incremental atomic mutations, bounded FIFO execution and cooperative cancellation. Optional imports provide source/position/mixed phrases, selected original positions/offsets, filters/facets, factual Inspector, ranges/snippets, native DOM UI/CSS, one-owner module workers, versioned snapshots, explicit IndexedDB persistence and source migration. No foreign search engine implements core.

The export map and declarations are the public API; importing core has no host startup side effects or optional side-state retention. Package contents deliberately include compiled runtime/declarations, licenses and curated public documentation/examples. Tests, benchmarks, source implementation, workflow files and the large raw qualification archives are not npm payload. Some compiled internal modules are physically shipped as implementation dependencies; their private seams are blocked by the export map, not advertised as absent files. Detailed historical evidence remains in the repository, separate from this package.

## Evidence and limitations

RX-4001 independently verifies membership and ranking arithmetic and retains relevance failures. The frozen 76-query English self-documentation evaluation is not a representative user study: enabled phrase strategies have 51/70 Top-1, 58/70 Top-3 and ten unintended empties. All eight natural questions lack full lexical eligibility. This candidate is lexical search, not semantic question answering or a universal ranking winner.

The fixed full-core measurement was 16,829 gzip bytes against the unchanged 15,360-byte target, a 1,469-byte miss. Candidate verification remeasures the same complete-root method and records its actual value and tool version. Optional bundle sizes overlap and are not additive; encoded snapshots are not heap measurements. The target miss remains disclosed rather than repaired by removing validation or importing another engine.

Both 1,000 and 10,000 admitted records have finite resource observations. Whole-source rebuilds can reach work/deadline limits; a failed operation's prior state and a worker's unknown commit outcome remain distinct. A 10,000-record admission ceiling is not a latency, phone-memory or worst-case completion promise. Native snapshots remain exact application-qualified Node-only; source format is the browser/worker recovery route.

RX-4002 completes the declared browser, exact-tool AT, physical and memory methods. Those observations retain their recorded versions, workload, settings and instrumentation. Managed occupied extents include host/harness work and pre-GC garbage; repeated native wire requested-capacity peaks are separate from worker heap. Unknown receiver routes, stronger physical/global peaks and default-runtime latency remain unclaimed. Earlier interrupted announcements, invalid recordings, deadline refusals and the stopped native allocator probe remain preserved; no failed prefix is promoted to a measurement. Candidate smoke checks do not repeat or broaden those human observations.

## Recommendation and owner handoff

The final RX-4003 acceptance record and independent review in the repository state the actual preparation result, artifact digests, review verdict and remaining blockers. The public tarball's own documentation deliberately contains no self-referential tarball hash. Any later content change requires a new preparation report; local preparation and remote CI have separate outcomes.

The recommendation concerns this bounded private candidate. It is not authorization to publish, a guarantee for every browser/device/runtime, or permission to activate N5. Once the active release-track tasks are verified, the planner must report that backlog complete and leave deferred ideas deferred. Owner publication decisions and any newly discovered concrete defect remain visible instead of manufacturing another implementation task.

## Later explicitly selected work

RX-A010 extends the development tree with [optional bounded typo tolerance](../api/TYPO.md). The original candidate recommendation, hashes and remote observations retain their dated scope. This later slice does not silently replace those qualified artifacts, activate other N5 work or authorize publication.

RX-A020 is a later explicitly selected optional change on top of RX-A010. Its dictionary-output protocol, `/addons/suggestions` entry and revised import costs require their own changed-tree evidence. Historical candidate tarball identities and remote CI do not verify these additions. The package stays private and unpublished.
