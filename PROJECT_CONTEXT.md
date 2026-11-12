# Project context

## Product and packages

Raveldex is a native TypeScript/ESM local-search library. Core owns indexing,
BM25 ranking, exact counts, atomic mutations, revisions, cooperative execution,
limits and disposal. It has no runtime dependencies and does not initialize DOM,
network, workers or storage on import.

| Package | Version | Runtime / peer contract |
| --- | --- | --- |
| `@vmitsaras/raveldex` | `1.0.0` | Node `>=22`; framework-agnostic core and explicit optional subpaths |
| `@vmitsaras/raveldex-english` | `1.0.0` | Node `>=22`; exact core peer; self-contained language JavaScript |
| `@vmitsaras/raveldex-astro` | `1.0.0` | Node `>=22.12.0`; exact core peer; optional Astro `7.3.2` hook |

The manifests select public npm access. Example applications remain private.
The [API reference](docs/api/README.md), [compatibility policy](docs/api/COMPATIBILITY.md)
and [limits/recovery guide](docs/api/LIMITATIONS.md) describe supported behavior.
The [release runbook](docs/release/PREPARATION.md) verifies local artifacts.

## Source and test map

| Area | Source | Verification |
| --- | --- | --- |
| Core contracts, analyzer, index, queries, ranking, mutations/execution | `src/core/`, `src/index.ts` | `test/core/`, independent `test/oracle/`, `test/types/` |
| Explicit phrases/positions, filters/facets, evidence/snippets/sections and query tools | `src/addons/` | `test/addons/`, installed `test/consumer/` |
| Inline, modal, dropdown, directory/cards and developer Workbench | `src/addons/ui/` | `test/ui/`, installed starters and family checks |
| Worker, snapshots and IndexedDB | `src/adapters/` | `test/adapters/` and real-host browser/worker fixtures |
| Astro, English and optional source migration | `src/integrations/`, `integrations/` | `test/integrations/`, `test/migration/`, isolated companion installs |
| Documentation site and exact starter archives | `site/`, `examples/` | `test/pages/`, Pages inventory/source/link checks |
| Planner, package and GitHub tooling | `scripts/`, canonical roadmap | `test/tooling/`, installed package checks |

See [source ownership](src/README.md), [test commands](test/README.md) and
[contribution guidance](CONTRIBUTING.md) for focused entry points.

## Current work

The [1.0.0 preparation](docs/planning/RELEASE_1_0_0.md) is complete: all five
N12 tasks are accepted, verified and closed in GitHub. [Package/site acceptance](docs/evidence/RX-9204.md)
and [tracking preservation](docs/evidence/RX-9205.md) retain the actual evidence.
There is no remaining selected release-preparation task.

[N13 demo clarity](https://github.com/vmitsaras/raveldex/issues/102) was explicitly
selected for implementation after release preparation. RX-9301–RX-9304 are
implemented and verified; all four issues and the N13 overview are complete.
See the [demo plan](docs/planning/DEMO_CLARITY.md) and [final verification](docs/evidence/RX-9304.md).
The latest core artifact includes these UI changes and supersedes the pre-N13
artifact identity; it remains local and unpublished.
[N14 consumer UI/recovery](https://github.com/vmitsaras/raveldex/issues/103) was
explicitly selected and implemented one task at a time. RX-9401–RX-9404 are
accepted and verified; the [UI polish plan](docs/planning/UI_POLISH.md) and
[final evidence](docs/evidence/RX-9404.md) retain the scoped results. The latest
local core artifact includes N14 and supersedes N13's artifact identity. All
selected preparation/demo/UI work is complete. The owner authorized source
commit/push and CI verification; package publication and tags/releases remain
separate. Run `npm run handoff:next` before selecting new work.

All 80 pre-N12 tasks remain accepted. Their source-specific results and actual
N10/N11 closeout are retained in [evidence](docs/evidence/N10_N11_CI_REPAIR_20261108.md).
Those historical artifacts do not qualify changed 1.0.0 package inputs by themselves.

## Working constraints and evidence

Preserve exact totals/order/revisions, atomic publication, original source offsets,
explicit capability failures, finite work/resource bounds and ownership cleanup.
Core does not keep original text or optional side indexes unless selected.
UI and controllers borrow their engine; application wrappers release only owners
transferred to them. Native snapshots require exact application-qualified Node
identity; source snapshots are the browser/worker rebuild route.

The 15 KiB full-core gzip planning target is missed. Recorded capacities, recovery
successes/refusals, latency and human AT/zoom observations retain their exact
workload/environment scope. Package bytes, logical work, retained/peak memory,
physical paint and automated/manual accessibility are distinct evidence.

About 8.5 GB of tracked evidence affects checkout size. Current preparation
preserves those artifacts and does not select retention migration/history rewriting.
The source repository is private; required package instructions are self-contained.
Hosted Pages activation, source commit/push and registry/release publication are
separate delivery actions. No hosted deployment is inferred from local generation.
