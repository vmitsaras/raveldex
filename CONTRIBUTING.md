# Contributing

Use Node 24 and npm for development; core and English support Node `>=22`, and
the Astro integration supports Node `>=22.12.0` with Astro `7.3.2` for its hook.

```sh
npm ci
npm run handoff:next
npm run check
```

`check` validates the roadmap and Markdown links, runs strict type checks, builds,
and executes the complete test selection. Browser checks require installed Chrome,
or the documented `RAVELDEX_*_BROWSER=chromium` selectors and an available Chromium.
They do not download browsers during a normal test run.

## Find the right area

- [Project map](PROJECT_CONTEXT.md): architecture, package boundaries and current work.
- [Source ownership](src/README.md): core, optional capabilities, adapters and UI.
- [Test map](test/README.md): independent oracles, focused checks and browser fixtures.
- [API reference](docs/api/README.md): supported imports, options and behavior.
- [Site workflow](site/README.md): generating and previewing documentation/starters.
- [Release runbook](docs/release/PREPARATION.md): verifying the actual three artifacts.

Read [AGENTS.md](AGENTS.md) and the selected task/specification before changing code.
Keep changes bounded and use a task branch. Preserve native ESM architecture,
explicit optional capabilities and zero core runtime dependencies. Proposals that
change public behavior need a specification/compatibility decision before code.

## Verify the change

Start with the affected tests, then broaden as needed. `npm run test:core`,
`npm run test:ui`, `npm run test:worker` and other `test:*` scripts build first.
After one successful build, direct `node --test ...` commands can reuse that output.
Do not run unrelated benchmarks or repeat unchanged runtime qualification for
planning-only edits. Never treat planner or static checks as interaction evidence.

When tasks change, edit `docs/planning/roadmap.json`, save actual evidence, then
run `npm run docs:generate`. Review generated changes with `npm run docs:check`
and `npm run handoff:check`. Keep notes outside managed GitHub issue markers.

Contributions and examples use MIT. Preserve third-party licenses and record
provenance for imported code/data/assets. Never include secrets or private content
in public examples or generated search files. Publication, deployment and Git
source delivery remain separate maintainer actions.
