# Source ownership

RX-1001 implements internal input contracts, the shared analyzer, error codes and limit guards. RX-1002 adds frequency-only index construction, exact normalized-term lookup and invariant diagnostics. RX-1003 adds complete typed query evaluation, native BM25 and actual numerical trace facts. There is no usable public engine/factory yet. The compiler emits ESM and declarations to `dist/`; there is no public package export until later slices implement the real core.

`contracts/` captures frozen bounded structures before any resumable content scan. `analyzer/basic.ts` emits work steps and original-value token spans; consumers must completely validate an operation before publishing state. `analyzeRecord` and `analyzeQuery` share that raw analyzer. `limits/` defines all hard caps and pure guards for later state, expansion and execution integration. These guards do not establish live index or scheduler behavior.

`index/` owns sparse 256-slot, prototype-safe bucket directories, field-local frequencies/statistics and reverse document terms. Internal `IndexConstruction.append` captures one bounded batch synchronously and returns charged analysis/staging work; `finish` returns a deeply frozen root only after complete consumption. An abandoned/failed cursor invalidates the entire construction. `retrieval/exact.ts` accepts a normalized term and selected declared fields, returning complete owned membership without a ranking/order contract. Source, position, offset and occurrence records are absent. The future engine owns promise/queue semantics and incremental revision publication; these internal primitives do not implement them.

`query/search.ts` synchronously captures raw queries/options and an optional private trace request, then returns one generator using a shared work budget. `query/compile.ts` consumes the shared analyzer once, preserves normalized term identity and deduplicates equivalent scoring groups. `retrieval/expand.ts` enumerates complete exact/prefix expansions, counting distinct field/term pairs per group and across the whole query. `query/evaluate.ts` retains positive groups only from successful Boolean branches. `ranking/bm25.ts` computes the versioned field-local formula; `ranking/page.ts` uses a resumable worst-first heap of at most offset + limit entries. `trace/facts.ts` allocates a collector only for an explicit selected-ID request, rejects mismatched revisions, and caps complete header/facts at 4,096. This is a private Inspector integration seam, not a new public search option or installed add-on. Signals and deadlines captured by search await RX-1005 enforcement.

| Planned path | Ownership |
| --- | --- |
| `core/` | Data/analysis, native dictionary/postings, typed queries/ranking, mutation and execution contracts. |
| `addons/phrases/`, `addons/positions/` | Strict phrase strategies and optional side-index detail. |
| `addons/filters/`, `addons/facets/` | Optional structured matching and complete aggregation. |
| `addons/evidence/`, `addons/inspector/`, `addons/ui/` | Original-text evidence, factual diagnostics, optional native DOM presentation. |
| `adapters/worker/`, `adapters/snapshots/`, `adapters/indexeddb/` | Explicit host, serialization, and persistence capabilities. |

Expose `src/index.ts` only when a real core contract is implemented. Do not create a success-returning placeholder factory or re-export optional modules from the core barrel. DOM types are deliberately absent from the root core TypeScript configuration.
