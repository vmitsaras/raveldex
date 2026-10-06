# Source ownership

RX-1001 implements internal input contracts, the shared analyzer, error codes and limit guards. There is no usable search engine/factory yet. The compiler emits ESM and declarations to `dist/`; there is no public package export until later slices implement the real core.

`contracts/` captures frozen bounded structures before any resumable content scan. `analyzer/basic.ts` emits work steps and original-value token spans; consumers must completely validate an operation before publishing state. `analyzeRecord` and `analyzeQuery` share that raw analyzer. `limits/` defines all hard caps and pure guards for later state, expansion and execution integration. These guards do not establish live index or scheduler behavior.

| Planned path | Ownership |
| --- | --- |
| `core/` | Data/analysis, native dictionary/postings, typed queries/ranking, mutation and execution contracts. |
| `addons/phrases/`, `addons/positions/` | Strict phrase strategies and optional side-index detail. |
| `addons/filters/`, `addons/facets/` | Optional structured matching and complete aggregation. |
| `addons/evidence/`, `addons/inspector/`, `addons/ui/` | Original-text evidence, factual diagnostics, optional native DOM presentation. |
| `adapters/worker/`, `adapters/snapshots/`, `adapters/indexeddb/` | Explicit host, serialization, and persistence capabilities. |

Expose `src/index.ts` only when a real core contract is implemented. Do not create a success-returning placeholder factory or re-export optional modules from the core barrel. DOM types are deliberately absent from the root core TypeScript configuration.
