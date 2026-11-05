# Independent RX-9001 method and pilot review

**Pass within the reduced pilot and method scope. No remaining blocking finding.**

The review examined the resulting N10 orchestration, frozen method, negative fixtures, actual artifact/source inventories and preserved timed/semantic raw observations. It did not run another performance collector, build, engine test suite, remote request or Git mutation. Report scripts only replayed existing data and applied in-memory corruptions to validation inputs.

## Directly checked evidence

- All nine pre-collection source/method pins still match. The immutable Git source inventory matches the recorded HEAD and actual worktree bytes; the actual Node executable hash matches the frozen environment.
- Original pre-N9, accepted-N9, reviewed-current and fresh-current archive hashes and every archived member match their manifests: 372 / 380 / 380 / 380 files respectively. The raw evidence archive hash matches, and all 2,367 preserved files (15,235,037 uncompressed bytes) equal their original timed/semantic files.
- The timed pilot contains exactly 18 distinct processes across three roles, two deadline cohorts and two normal plus one diagnostic owner. Actual options omit `deadlineMs` for default calls and explicitly pass 60,000ms for the historical cohort. There are 192 ordinary and 48 diagnostic query calls. All operation outcomes reconstruct as 264 Pass and 30 expected broad-prefix refusals; every refusal is `LIMIT_EXCEEDED` at `expansions.group`.
- All 114 ordinary summary groups independently reconstruct their counts, owner counts and nearest-rank wall/user/system CPU medians. There are no pilot p95 claims or pooled deadline cohorts.
- Three semantic artifacts contain 21 fully paged successful query captures and three expected broad-prefix refusals. Separate Python replay reconstructs raw ASCII source tokens, all reverse entries, 307 dictionary terms and 768 posting relations per role, complete counts, membership/order and 897 full-result hand-derived BM25 score comparisons. This replay uses no production tokenizer or scorer.
- Existing independent formula verification reproduces 486 selected Inspector assertions. Cross-role replay checks all main query captures, twelve fixture-pair comparisons and 36 later-write comparisons, including source/positions/offset/mixed states and complete memberships. All 240 timed query captures are bound by the semantic lane to full corresponding results or exact refusals. Core-file hashes and artifact/source/harness identities match.
- Thirteen in-memory negative replays reject missing/duplicate rows, changed corpus/archive/source/harness identities, a wrong default deadline property, hidden/missing diagnostics, invented recovery, absent finalized-freeze flags, successful score drift and a changed expansion-error path. These are validation replays, not new engine measurements.

## Findings resolved before collection

Review required source-role binding and strict final freeze flags; explicit validation of the additional reviewed archive; acceptance metadata that stays false pending external gates; a semantic lane bound to successful timed-run guards and complete row validation; and fixed mutation API/record/population mappings. The future update contract now separates genuine same-vocabulary changes from novel-term creation and explicit unique-term removal. The pilot began only after these corrections and method re-freezing.

## Scope and limits

The frozen future query/update/browser/recovery cohorts have declared process/sample/time bounds, separate 30s-default and explicit-60s options, ordinary-versus-diagnostic separation, sparse-tail limits and per-workload decision rules. Completed N9 work is preserved. The accepted/current equal-runtime role is a method control, not another optimization. No new runtime defect, full N10 measurement result, uniform speedup, population/device tail, retained/peak heap or physical responsiveness claim is established by this reduced pilot. Full collections and their independent verdict remain later tasks.

[Machine replay result](method.json) records the reconstructed values, identities, source counts, resolved findings and empty remaining-blocker list.
