# RX-4002 qualification launcher continuation

Date: 2026-10-15. Scope: restore the installed-package manual fixture after a local npm CLI output change. RX-4002 remains **Blocked**; this is supporting tooling work within that task, with no acceptance criterion or public runtime contract change.

## Observed failure and repair

The previous `http://127.0.0.1:63024/ui` server was unavailable. Restarting `npm run qualify:serve` built successfully but failed in `prepareConsumer` when reading `packed.filename`. The local Node version is 24.21.0 and npm is 12.2.0. A separate actual `npm pack --json --ignore-scripts` invocation succeeded and returned an object keyed by `@vmitsaras/raveldex`; the helper assumed an array and selected `[0]`.

This is a tooling compatibility defect, separate from package behavior and from the open VoiceOver finding. `scripts/lib/packed-consumer.mjs` now reads either the legacy array or the observed package-keyed object. It requires exactly one Raveldex entry with a filename and preserves the remaining metadata used for installation, integrity and file auditing. No dependency, engine, UI, announcement policy, capability or resource limit changes.

The first server bind after this repair received sandbox `listen EPERM`. Running the same launcher with the approved local-server permission succeeded. That permission boundary is an environment observation, not a package failure.

## Verification

| Check | Actual result |
| --- | --- |
| `node --test test/tooling/packed-consumer.test.mjs` | Pass, 3/3: legacy metadata, package-keyed metadata, and rejection of missing/ambiguous/unexpected metadata. |
| `node --test test/tooling/*.test.mjs` | Pass, 63/63. |
| `node --test test/consumer/packaged.test.mjs` | Pass, 8/8, including real tarball installation, public typecheck, source-oracle retrieval/updates, bundle/startup checks, hand arithmetic and cancellation recovery. |
| Fresh isolated manual fixture | Pass: pack/install/bundle/server preparation succeeds; HTTP GET `/ui` returns 200 with local-server permission. |
| `npm run check` | Pass, exit 0: planner/docs/typechecks/build and 587/587 tests (514 package/core/tooling, 22 UI, 24 worker, 26 IndexedDB, one migration browser). No failed, cancelled or skipped tests. |

The task-owned fixture is served at `http://127.0.0.1:52996`: `/ui` is the ordinary nine-record UI, `/worker` is the three-record worker recovery fixture. The package SHA-256 is `6ff6e90128f60af39bb8f47800c61ed83d85d4ded7a8e3c96d2bd34467f9c437`, matching the preceding human session. Its temporary preparation report is `/tmp/raveldex-manual-20261015-package.json`; the port is session-specific and must be checked before reuse.

Parent review checks the two supported metadata shapes, rejects silent selection of an ambiguous package, and verifies the existing packed-consumer behavior against actual npm 12 output. The separate announcement-investigation edits in the shared checkout are preserved and excluded from this change.

Final documentation checks: `npm run docs:check`, `npm run handoff:check` and `git diff --check` pass. The full regression log is temporarily retained at `/tmp/raveldex-npm12-check-20261015.log`, SHA-256 `727cabca82efdddc9b310b27ae09a367db9e69baf16bbe28aa0e79d4a2e6d137`. The full regression check is automated evidence; it does not supply heard speech, physical input or real OS composition observations.

## Remaining observation

The next guided human check is ordinary-UI result heading/list/title-link/snippet traversal with Safari and VoiceOver, including actual speech, focus and current verbosity. No new human result has been received in this continuation. Complete Inspector observations, exact AT settings, real composing-IME behavior and scoped memory evidence remain required. Previously accepted browser/resource and bounded human observations retain their own outcomes. RX-4003 still waits; N5 remains deferred and publication is not authorized.
