# Contributing

Start with [AGENTS.md](AGENTS.md), the [roadmap](ROADMAP.md), and [task cards](IMPLEMENTATION_TASKS.md). Implement a bounded task on a branch and include the task ID in the commit/PR title. Native design is established; proposals that change observable semantics should update the specification before code.

Use Node >=22 and npm. Run `npm ci` and `npm run check` (planner/docs, strict type checks, build and all tests). `npm run test:core` focuses on runtime primitives; later slices add index/oracle/execution checks. Never treat a planner or analyzer test pass as engine readiness.

Change the canonical roadmap JSON and run `npm run docs:generate`. Keep actual evidence paths in the manifest, save meaningful limitations, and update `PROJECT_CONTEXT.md` when reality changes. The task issue mirrors the canonical task section; keep discussion and manual notes outside its managed markers.

Code and contributed examples use the repository's MIT license. Record licenses/provenance for reused code, data, corpora, fonts, or other assets before importing them. Do not copy competitor internals to disguise a wrapper as native work.
