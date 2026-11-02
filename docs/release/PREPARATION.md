# Prepare and install private evaluation artifacts

These commands verify private `0.1.0-rc.0` packages. They do not publish, tag, create a release, read npm release credentials, change repository visibility or synchronize GitHub. [Publication status](PUBLICATION_STATUS.md) separates this evaluation workflow from final release preparation.

## Prerequisites

Use a repository checkout, npm and Node 24 for the full development toolchain. Core/English declare Node `>=22`; the Astro integration declares `>=22.12.0`. Runtime floors are not universal host qualification. See [compatibility](COMPATIBILITY.md).

The full check uses a locally installed Chrome by default. If using Playwright Chromium instead, install it after `npm ci` and set all four existing selectors in the same shell:

```sh
node node_modules/playwright-core/cli.js install chromium
export RAVELDEX_UI_BROWSER=chromium
export RAVELDEX_WORKER_BROWSER=chromium
export RAVELDEX_INDEXEDDB_BROWSER=chromium
export RAVELDEX_CANDIDATE_BROWSER=chromium
```

The download needs network access; Linux also needs the browser's system libraries. Installing a browser is separate from installing the JavaScript tooling. Missing browser/process/localhost permissions are environment failures, not a passing UI check. Keep Chrome defaults when that is the host being evaluated.

## Prepare all three packages

Run from the repository root. Keep these exported paths if following later examples in the same shell:

```sh
npm ci
export RAVELDEX_REPOSITORY="$PWD"
export RAVELDEX_ARTIFACTS="$(mktemp -d "${TMPDIR:-/tmp}/raveldex-artifacts.XXXXXX")"
npm run candidate:prepare -- --output "$RAVELDEX_ARTIFACTS/core"
node scripts/pack-english.mjs --output "$RAVELDEX_ARTIFACTS/english"
node scripts/pack-astro.mjs --output "$RAVELDEX_ARTIFACTS/astro"
```

If using Chromium, perform the prerequisite download/exports **between `npm ci` and candidate preparation**. Every output child must be a new directory with an existing parent. Existing files/directories/symlinks are refused; failed attempts retain available reports. Reuse neither an old output directory nor an old report for changed bytes.

`candidate:prepare` requires private `0.1.0-rc.0` metadata, runs `npm run check`, then packs and verifies the same compiler output without rebuilding. The direct separate-pack commands consume that stable output. `npm run language:pack` and `npm run astro:pack` are convenient independent preparations that rebuild first; do not use them between a closed full check and packs intended to describe that exact build.

Artifacts are:

| Directory | Tarball / reports |
| --- | --- |
| `core` | `vmitsaras-raveldex-0.1.0-rc.0.tgz`, `candidate-report.json`, closed `verification.log`, `preparation.json` and isolated installed consumer. |
| `english` | `vmitsaras-raveldex-english-0.1.0-rc.0.tgz`, `english-package.json`, `verification.log` and package staging. |
| `astro` | `vmitsaras-raveldex-astro-0.1.0-rc.0.tgz`, `astro-package.json`, `verification.log` and package staging. |

Packing/installing uses local artifacts with scripts suppressed. Existing explicit compilation is required. Reports bind package members, hashes, imports/declarations and actual environment. They are not public-release attestations. See [npm pack](https://docs.npmjs.com/cli/v11/commands/npm-pack/#ignore-scripts) and [the private package guard](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#private).

## Install core in a fresh ESM application

Assuming the exported artifact path above, create an isolated directory rather than overwriting an application manifest:

```sh
export RAVELDEX_CONSUMER="$(mktemp -d "${TMPDIR:-/tmp}/raveldex-consumer.XXXXXX")"
printf '%s\n' '{"name":"raveldex-evaluation","private":true,"type":"module"}' > "$RAVELDEX_CONSUMER/package.json"
cd "$RAVELDEX_CONSUMER"
npm install --offline --ignore-scripts --no-audit --no-fund "$RAVELDEX_ARTIFACTS/core/vmitsaras-raveldex-0.1.0-rc.0.tgz"
```

Copy the [README example](../../README.md#smallest-core-example) into a `.mjs` file and run it with `node`. Expected result: revision 1, one hit for `guide:updates`. Dispose the engine after use. The [API modules](../api/examples/README.md) supply further complete scenarios.

## Separate private English package

In the same fresh consumer, install the matching independent artifact alongside core:

```sh
npm install --offline --ignore-scripts --no-audit --no-fund "$RAVELDEX_ARTIFACTS/english/vmitsaras-raveldex-english-0.1.0-rc.0.tgz"
```

Import `createEnglishAnalyzer` and `ENGLISH_ANALYZER` from `@vmitsaras/raveldex-english` and explicitly select/register them at new-owner creation, as in the [English guide](../api/ENGLISH.md#separate-private-package). Its exact core peer must already be installed. Choose one analyzer factory import; duplicate registrations conflict. A reused private version string alone does not establish compatibility.

## Separate private Astro package

Install the integration beside core, adding the pinned framework only when using its Astro build hook:

```sh
npm install --ignore-scripts --no-audit --no-fund "$RAVELDEX_ARTIFACTS/astro/vmitsaras-raveldex-astro-0.1.0-rc.0.tgz" astro@7.3.2
```

Unlike local tarball installation alone, resolving Astro/transitive dependencies needs a registry or an adequate npm cache. Static builder/client users can omit the optional Astro peer. [The static guide](../api/STATIC_ASTRO.md) describes public imports. Repository users can follow the [complete Astro fixture procedure](https://github.com/vmitsaras/raveldex/blob/main/examples/astro/README.md), which requires repository access and preserves its explicit fixture-only native qualification.

## Focused and remote verification

`npm run candidate:check -- --output NEW_DIRECTORY` builds and verifies the package without the preceding full suite; it does not replace full preparation. The full check includes genuine paired-package Astro root and `/docs/` static builds, installed public examples and independently expected results. Passing fixtures does not add human AT, all-browser or native-portability qualification.

The read-only manual candidate workflow and main CI run Node 22/24 with pinned actions and short-lived private artifacts. Neither has publishing/tag steps or release credentials. The separate main-branch tracking workflow can write issues/milestones; candidate preparation does not invoke it. `npm run tracking:preview` is local.

## Owner publication decision

Final publication must separately choose version, package set, registry/dist-tag/access and credentials/provenance. Current verification intentionally requires private candidate metadata and exact peers; simply changing `private` or version will fail its guards. A separate release-verification path must review final metadata and newly packed bytes without bypassing those checks. No prepared private artifact is represented as the final public release.
