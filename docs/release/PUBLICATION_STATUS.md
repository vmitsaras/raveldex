# Publication status

The earlier implementation backlog is complete: **50 accepted tasks**, including the documentation-site and five search presentations. The selected [N9 performance/recovery milestone](https://github.com/vmitsaras/raveldex/blob/main/docs/specs/N9_PERFORMANCE_RECOVERY.md) adds eleven tasks; RX-8001 is in progress and its baseline verification is separate from historical acceptance. Core, English and Astro packages stay private `0.1.0-rc.0`; the [Unreleased notes](../../CHANGELOG.md) choose no public version or release date.

## Documentation and evaluation

Current guides cover the [public API](../api/README.md), [exact private-artifact preparation and installation](PREPARATION.md), runnable modules, scoped [support](../support/RX-4003.md) and [compatibility](COMPATIBILITY.md). Repository examples include a local browser documentation pilot and a genuine Astro fixture with copy/install/build/preview instructions. The [site workflow](https://github.com/vmitsaras/raveldex/blob/main/site/README.md) prepares browsable guides and the working demo for main-branch `/docs` publication, using Jekyll exclusions for repository-only records. Site activation remains separate; no deployment workflow is added, and a hosted demo is optional for npm publication.

The core tarball includes curated public guides and executable modules. Maintainer history, raw evidence and source/example directories remain repository-only. Repository/evidence URLs require access to the private repository. Package-local guidance must remain usable without those links.

## Verification boundary

[Main CI 41008634728](https://github.com/vmitsaras/raveldex/actions/runs/41008634728) tested exact source `3407c2a801a27bfd32569619854ff3be510e6116`: 860 tests on each Node 22.23.4/24.22.1 runner on Ubuntu 26.04 x64, private candidate preparation, English/Astro packages and actual Astro 7.3.2 root/subdirectory builds with Chromium 149.0.7827.55. [Roadmap tracking](https://github.com/vmitsaras/raveldex/actions/runs/41008634712) also passed.

That evidence does not qualify subsequent documentation bytes. Every preparation creates a new closed check log, package inventory/environment report and artifact digest. Maintainers record new documentation/link/consumer verification separately; the report must identify actual outcomes instead of inheriting a prior Pass. Nothing here expands browser, human AT, physical input, native snapshot or allocation/copy qualification.

## Remaining before publication

1. **Select the release scope:** final version, prerelease/stable policy, selected packages, registry/dist-tag/access and publishing authority/provenance. Both separate packages currently require exact core `0.1.0-rc.0`; keep any later version/peer/lockfile changes consistent.
2. **Provide a final release-verification path:** candidate preparation, manifest tests and separate pack scripts intentionally require private candidate metadata; some also pin exact version/peer values. Changing version or removing `private` without a supported verification path fails those guards. Preserve the private candidate checks rather than bypassing them.
3. **Reverify final artifacts:** after approved metadata changes, run clean installation, full checks and Node 22/24 CI on the final source; review each selected package's payload, licenses, declarations/imports/CSS and actual installed consumers. Record final identities. Registry name/version availability and publishing rights remain unchecked by local preparation.
4. **Choose public access and authorize publication:** repository/evidence links currently need private access. A public package must have usable packaged guidance or intentionally provided public destinations. Repository visibility, site deployment, tags and releases are separate owner actions. No upload or release credentials are part of documentation preparation.

If making the repository public, separately review its large historical evidence/media archive and privacy boundaries; this documentation work is not a whole-history privacy audit. A security reporting policy is a useful public-support follow-up.

## Limits that remain disclosed

The 15 KiB full-core gzip target miss, finite operation/work/deadline refusals, lexical relevance gaps/English overstemming, exact-Node native snapshot boundary, generic UI transport-error presentation and bounded VoiceOver observations remain. These are documented limitations, not invented unfinished roadmap tasks. Publication remains an owner decision.
