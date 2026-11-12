# Source ownership

The public core entry is `src/index.ts`. The package exports map and compiler
output determine supported import paths; internal modules are not public API.

| Area | Responsibility |
| --- | --- |
| `core/contracts`, `analyzer`, `errors`, `limits` | Capture bounded immutable input, shared analysis and typed failures |
| `core/index`, `mutations`, `revision` | Frequency/statistics roots, incremental staging and atomic revision publication |
| `core/query`, `retrieval`, `ranking`, `trace` | Native query evaluation, exact totals/order, BM25 and explicit diagnostic facts |
| `core/execution`, `capabilities` | FIFO cooperative work, cancellation/deadlines/disposal and selected participant contracts |
| `addons/` | Explicit source/positions, phrases, filters/facets, evidence/snippets/sections and optional query/analyzer tools |
| `addons/ui/` | Separate DOM/CSS entry points for consumer surfaces and developer Workbench; engines remain borrowed |
| `adapters/` | Explicit worker transport, source/native snapshots and namespaced IndexedDB persistence |
| `integrations/` | English analysis and isolated source-format migration |
| `../integrations/astro/src/` | Separate static builder, Astro hook and browser artifact loader |

Core must work without optional registrations or platform initialization. Preserve
exact counts, deterministic ranking/order at a revision, source coordinates,
atomicity, finite work/retention bounds and cleanup. Source providers retain exact
originals; positions/offsets and evidence are explicitly selected costs.

Read the relevant [specification](../docs/specs/) and neighboring source/tests
before editing. The [API reference](../docs/api/README.md) describes public contracts;
[tests](../test/README.md) identify independent semantic and installed-host checks.
