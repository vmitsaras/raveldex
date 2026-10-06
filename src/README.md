# Source ownership (planned)

No search runtime is implemented yet. RX-1001 creates the first actual TypeScript sources and justified development tooling.

| Planned path | Ownership |
| --- | --- |
| `core/` | Data/analysis, native dictionary/postings, typed queries/ranking, mutation and execution contracts. |
| `addons/phrases/`, `addons/positions/` | Strict phrase strategies and optional side-index detail. |
| `addons/filters/`, `addons/facets/` | Optional structured matching and complete aggregation. |
| `addons/evidence/`, `addons/inspector/`, `addons/ui/` | Original-text evidence, factual diagnostics, optional native DOM presentation. |
| `adapters/worker/`, `adapters/snapshots/`, `adapters/indexeddb/` | Explicit host, serialization, and persistence capabilities. |

Expose `src/index.ts` only when a real core contract is implemented. Do not create a success-returning placeholder factory or re-export optional modules from the core barrel. DOM types are deliberately absent from the root core TypeScript configuration.
