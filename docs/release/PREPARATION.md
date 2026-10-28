# Candidate preparation

Use a checkout and Node.js 22 or newer with npm. Preparation retains `private: true`; it does not need release credentials. The package publication guard follows the [npm package metadata contract](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#private).

```sh
npm ci
npm run candidate:prepare -- --output /tmp/raveldex-candidate-review
```

The output must be a **new directory with an existing parent**. Existing directories, files and symlinks are refused before verification, so a prior report is not overwritten. Omit `--output` for a fresh temporary path. A failed attempt retains its available reports; use a different output path after correcting the failure.

`candidate:prepare` requires the declared private `0.1.0-rc.0` metadata, runs the full `npm run check`, then verifies the resulting built files without rebuilding between the check and pack. It uses `npm pack --offline --ignore-scripts`, installs the tarball into an isolated offline consumer without lifecycle scripts, and exercises the public contract and documentation. [npm's pack documentation](https://docs.npmjs.com/cli/v11/commands/npm-pack/#ignore-scripts) explains that script suppression; the preceding explicit build is required.

The output contains:

- The candidate `.tgz`, its file inventory/digests and environment in `candidate-report.json`.
- `verification.log` from the completed project check.
- `preparation.json` binding the closed check and candidate report.
- The isolated consumer used to execute the checks. It is a verification workspace, not an additional package dependency.

`npm run candidate:check -- --output NEW_DIRECTORY` builds and checks the package without the preceding full suite. It is useful for focused package work, but does not replace `candidate:prepare` acceptance. Neither command runs `npm publish`, even with `--dry-run`, creates a tag/release, changes visibility, reads an npm token, or synchronizes remote tracking.

## Manual workflow

`.github/workflows/candidate.yml` is a manual `workflow_dispatch` preparation job, with Node 22/24, pinned actions, read-only repository permission and checkout credential persistence disabled. It installs the development/browser tooling, runs preparation and preserves only the reports/log/tarball as short-lived workflow artifacts. It has no publishing or tag step, npm credentials, OIDC publishing permission or release-write token. A workflow artifact is not a public package release. A failure report is not a verified candidate.

This repository also has a separate main-branch roadmap synchronization workflow with narrowly scoped issue-writing permission. It mirrors the committed manifest; candidate preparation does not invoke it. `npm run tracking:preview` remains a local dry run.

Remote CI execution is reported separately from local execution. Running the manual workflow later does not retroactively change the recorded local environment or the exact-tool accessibility evidence.

## Owner publication decision

After reviewing [candidate scope](CANDIDATE.md), the tarball/report identities and the independent recommendation, the owner may separately authorize publication. That action must choose the final version and registry/tag/access, review credentials/provenance and CI outcomes, deliberately remove the private guard, rebuild/repack/reverify the changed artifact, and review its digest before any upload or tag. No existing artifact is represented as the final public release merely because candidate checks pass.
