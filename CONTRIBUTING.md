# Contributing

Start with [AGENTS.md](AGENTS.md), the [roadmap](ROADMAP.md), and [task cards](IMPLEMENTATION_TASKS.md). Implement a bounded task on a branch and include the task ID in the commit/PR title. Native design is established; proposals that change observable semantics should update the specification before code.

Use Node 24 and npm for the full development tooling; core itself declares Node >=22. Run `npm ci` and `npm run check` (planner/docs, strict type checks, build and all tests). `npm run test:core` focuses on the existing core suite; the full check also exercises optional modules, independent oracles and host consumers. Never treat a planner or analyzer test pass as engine readiness.

When task data changes, update the canonical roadmap JSON and run `npm run docs:generate`; do not reopen completed tasks for ordinary documentation work. Keep actual evidence paths in the manifest, save meaningful limitations, and update `PROJECT_CONTEXT.md` when reality changes. The task issue mirrors the canonical task section; keep discussion and manual notes outside its managed markers.

Code and contributed examples use the repository's MIT license. Record licenses/provenance for reused code, data, corpora, fonts, or other assets before importing them. Do not copy competitor internals to disguise a wrapper as native work.
