# Prepare release artifacts

The libraries are `@vmitsaras/raveldex`, `@vmitsaras/raveldex-english` and
`@vmitsaras/raveldex-astro`, all version `1.0.0` with public npm access. English
and Astro require the exact matching core peer. Consumer installation is in
[Getting started](../api/GETTING_STARTED.md); [compatibility](../api/COMPATIBILITY.md)
and [limits](../api/LIMITATIONS.md) describe the supported contracts.

## Verify and pack once

Use Node 24/npm with the pinned development dependencies installed. Installed
browser checks need Chrome or explicitly configured available Chromium. From
the checkout root:

```sh
npm ci
export RAVELDEX_ARTIFACTS="$(mktemp -d "${TMPDIR:-/tmp}/raveldex-release.XXXXXX")"
npm run candidate:prepare -- --output "$RAVELDEX_ARTIFACTS/core"
node scripts/pack-english.mjs --output "$RAVELDEX_ARTIFACTS/english"
node scripts/pack-astro.mjs --output "$RAVELDEX_ARTIFACTS/astro"
```

The existing `candidate:*` command names remain usable. Preparation runs
`npm run check`, then checks the exact packed/installed output without rebuilding.
Separate pack scripts reuse that compiler output. Output directories must be new;
no command overwrites a prior report or artifact. The convenient `language:pack`
and `astro:pack` npm scripts build first when used independently.

Reports retain actual versions, environments, package members/hashes, installed
imports/declarations, CSS, examples and companion identities. Review the reports
and tarballs together. A later change to packaged input requires new artifact
verification; a nonpackaged evidence note does not invalidate unchanged runtime
qualification. Maintainer status/history and raw evidence are excluded from npm.

## Site and source delivery

After a successful unchanged package build, run `npm run pages:generate`,
`npm run pages:check` and the site regressions documented in [the site guide](../../site/README.md).
The generator owns only its recorded public inventory; do not overwrite the
whole `docs/` tree or bypass Jekyll exclusions. Source views and complete starter
archives must match the final inputs.

## Distribution

Package preparation and CI contain no publishing command or release credentials.
After a separately authorized publication decision, distribute the reviewed core
artifact before English/Astro so their exact peer exists. Stable npm publication
uses public access and the `latest` tag. Never replace bytes under an issued version.
Repository visibility, hosted Pages activation, Git commits/pushes and GitHub
releases/tags are separate maintainer actions.
