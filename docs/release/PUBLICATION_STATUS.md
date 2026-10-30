# Publication status — 2026-10-30

Implementation is complete; publication preparation remains. The canonical roadmap has **21/21 release tasks and 10/10 selected optional tasks done**, with no in-progress, ready or deferred task. Do not reopen completed work to represent release administration. All three packages remain private `0.1.0-rc.0`; nothing in this status update publishes, tags, deploys, changes visibility or selects a final release version.

## Verified merged candidate

`codex/rx-a100-astro` was fast-forwarded into main at `3407c2a801a27bfd32569619854ff3be510e6116`. [Main repository checks](https://github.com/vmitsaras/raveldex/actions/runs/41008634728) pass on Node 22.23.4 and 24.22.1 / Ubuntu 26.04 x64: **860 tests per runner**, zero failures/skips/cancellations, private candidate preparation and separately packed English/Astro artifacts. Actual Astro 7.3.2 root and `/docs/` builds ran with Chromium 149.0.7827.55. The [main tracking workflow](https://github.com/vmitsaras/raveldex/actions/runs/41008634712) also passed and synchronized the completed roadmap.

The prior [feature-branch CI record](https://github.com/vmitsaras/raveldex/blob/main/docs/evidence/RX-N5-remote-ci-20261030.md) binds source `18e610e`; it remains historical and distinct from main verification at `3407c2a`. Original qualification and accepted artifacts keep their recorded boundaries. This later status/documentation update is not covered by either run, changes packaged documentation, and needs a new package report before release. No fresh human AT, physical input, memory/copy or all-browser qualification is claimed.

## Documentation and examples inventory

| Surface | Exists now | Remaining preparation |
| --- | --- | --- |
| Root README | Local-tarball installation, executable core quick start, API/support links and all ten optional features. | Finalize registry installation/version wording only when a public release is selected; preserve private evaluation instructions until then. |
| API documentation | Core, full root export map, optional modules, hosts and separate Astro guide under `docs/api/`; included in the core tarball. | Check the final installed documentation, anchors and external destinations. The existing Markdown check validates local file targets, not anchors or external/private GitHub access. |
| Release/support docs | Compatibility, candidate scope, preparation, bounded browser/AT/memory limitations and changelog. | Consolidate historical selection narratives into a clear final-release account; assemble the ten Unreleased N5 entries under the chosen version and retain known limitations. |
| Runnable API modules | Core, add-ons, snapshots, browser UI/storage, worker and migration examples executed by candidate verification. | Re-execute from final artifacts; feature-specific N5 examples are in API pages rather than a separate interactive gallery. |
| Documentation browser pilot | `examples/docs-search/`, served locally by `npm run pilot:ui`; public installed imports, phrases, facets, Inspector, evidence, direct/worker selection and teardown. | Public hosting is optional for npm publication. For a shared demo, prepare a static output and verify deployed base paths, assets, worker/CSP and links before announcing it. No deployment is configured. |
| Astro example | Real static page fixture, explicit allowlist, lazy loading and paired-package root/subdirectory build verification. | Add reproducible copy/install/build/preview instructions or a standalone starter if this is to be the public getting-started demo. Currently its README assumes isolated tarball installation; it is not a one-command starter. |
| Documentation website | Markdown files; no public site URL or Pages deployment workflow is provided by the repository. | Choose whether to offer one; it is a presentation improvement, not an unfinished engine acceptance criterion. |
| Community/public repository | MIT license, contribution guide, issue and PR templates. | Repository remains private. Before making it public, review evidence/media/personal paths and the approximately 6.7 GiB evidence directory. A security reporting policy would improve public support; no whole-history privacy audit was performed in this status review. |

## Required before uploading a public package

1. **Select the release scope.** Choose prerelease versus stable version, registry/dist-tag/access, and whether to publish core alone or also `@vmitsaras/raveldex-english` and `@vmitsaras/raveldex-astro`. Both separate packages currently require exact core peer `0.1.0-rc.0`; Astro has optional exact framework peer `7.3.2` and Node floor `>=22.12.0`. Root/English declare Node `>=22`. Keep versions, lockfile, peer contracts and release notes consistent.
2. **Finish documentation for that scope.** Remove contradictory current-status claims while preserving dated evidence. Verify final installation examples and all linked documentation destinations. A private GitHub repository will leave repository/evidence links inaccessible to ordinary npm users; either provide suitable public documentation or explicitly retain a private evaluation target. A hosted demo is useful but not mandatory for an npm package.
3. **Prepare a release verification path.** Current `candidate:prepare`, manifest checks and separate pack scripts intentionally require private candidate metadata; several checks pin `0.1.0-rc.0` and exact peers. Simply flipping `private` or bumping the version will fail these guards. Add an explicitly selected release-verification mode for final metadata while preserving the existing private candidate safeguards and behavioral checks. Do not bypass the checks or remove guards as part of a status update.
4. **Verify the exact final artifacts.** After approved metadata/documentation changes, run clean installation, full checks and Node 22/24 CI on the final source; pack and review every selected package, imports/types/CSS/licenses/payload and offline installed consumers. Re-run the genuine paired-package Astro fixture if Astro ships. Record new digests and review results; old passing private tarballs do not qualify changed bytes. Check registry name/version availability and maintainer publishing rights/security/provenance at that time. These registry/credential checks were not performed here.
5. **Obtain explicit publication authorization.** Review the concrete version, package set, artifact identities and chosen access/dist-tag before upload. Public GitHub visibility, site deployment, tags and releases remain separate actions. No publication credentials are needed for the current audit.

## Retained limitations

The missed 15 KiB core planning target, finite operation/work/deadline refusals, lexical relevance gaps, exact-Node native snapshot boundary and bounded Safari/VoiceOver observations remain disclosed. Later optional semantics do not rewrite the original relevance results or establish all-browser/all-AT support. See [support](../support/RX-4003.md) and [compatibility](COMPATIBILITY.md).

The next useful engineering slice is final documentation/example preparation and a release-verification path, after selecting the intended release scope. It is not another missing roadmap feature. Publication remains an owner decision.

## Status-review verification

This documentation-only review refreshed the GitHub repository metadata and both main workflow job results, inspected package guards/export maps, README/API/release/support documentation, example sources/instructions and workflow configuration. It corrected current-status prose, example discovery, a stale pilot version and a removed README-section link without changing runtime code, package metadata or roadmap states.

- `npm run handoff:status` / `npm run handoff:next`: all 31 tasks complete; no eligible implementation task.
- `npm run docs:check`: generated roadmap remains synchronized; local Markdown file targets pass. External URLs/anchors are outside this checker.
- `npm run build`: Pass.
- `node --test --test-timeout=180000 test/consumer/candidate.test.mjs`: **5/5 Pass**, including actual offline installed imports/types/isolation and executable README/API examples in Node and a real browser. The first sandboxed attempt hit `listen EPERM` on localhost; an authorized rerun outside the sandbox passed. This is an environment failure followed by a passing check, not a production defect or new AT observation.
- `git diff --check`: Pass.

The full 860-test suite and `npm ci` were not rerun for this documentation-only update; the linked main CI supplies those earlier exact-source results. No final release artifact, registry availability/credentials, deployed site, exhaustive external-link or whole-history privacy verification is claimed. No commit or remote write is part of this status update.
