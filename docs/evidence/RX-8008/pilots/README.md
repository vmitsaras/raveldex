# Exploratory attempts retained separately

These attempts precede the official paired collection and are not ordinary performance samples for it.

- `generic-core.tar.gz` is the actual installed intermediate package with one reusable core delta but unchanged generic per-record source/positions callbacks. The later private first-party sessions are absent.
- `pilot-capacity.json` records the actual admitted 10k positions/offsets export and attempted restore. Restore still refuses with `WORK_LIMIT_EXCEEDED`; forced 1ms deadline and cancellation remain typed and preserve old state.
- `pilot-diagnostic.json` records the corresponding separate intrusive attempt. All10k private records complete, but the outer `snapshot.total` attempts50,000,001 against50M during core finalization, after exactly50,000,000emitted units. Participant work is30,506,189; directory pointer/bucket entry copies5,004,056/400,384. This identifies remaining actual directory-copy work rather than authorizing a cap increase.
- `pilot.txt` retains an earlier harness-staging error: `bulk-verify.mjs` had not yet been copied beside the staged child/case. No restore ran in that setup attempt. Copying the existing helper fixed the environment error.

The diagnostic-instrumentation setup also exposed two parent reporting/setup mistakes before collection: treating the returned instrumentation report object as an array, and invoking instrumentation on a copied dist tree without package.json. Both occurred in disposable temp paths; neither changed runtime code or produced a claimed measurement. Final instrumentation preflights and all official package/harness guards run separately.
