# Independent first-slice verification coverage

All checks here use pure fake owners or saved files. They do not instantiate the engine, run a probe/canary/collector or establish a performance improvement. RX-9006's original collection remains failed and incomplete at 146/204 contexts.

- `summary.json` binds the final 68-test fake-owner suite and both saved-capture replay reports.
- `independent-capture-replay.json` records independent Python literal-source checks for all 1,280 saved snapshots and 970 private captures: 1,210,916 source-record assertions, 998,692 private-record assertions and 5,323,456 original UTF-16 offsets. Six membership-model/completeness/revision/total/id/score corruptions are rejected by the existing independent Python result oracle.
- `capture-differential.json` binds the exact preserved v1 case/helper and revised sources. Every saved snapshot's fresh strict parsing/checksum/normalization facts agree; every complete private-state check agrees. It also checks 118 actual source comparisons with differing donor/receiver header revisions.
- The three retained fake-owner test logs passed at 46, 53 and then 68 tests as branch coverage was expanded. No failed execution was discarded.

The final fake suite is `test/comparison/n10-host-recovery-verification-coverage.test.mjs`. It compares exact old/new native call and options transcripts, including omitted/explicit deadlines, batch boundaries, every 100-hit page, fresh source/root captures, acknowledged persistence and disposal. Branches cover ordinary/forced/aborted success, native refusals, Unknown before or after a fake commit with/without reconciliation, dependent Not-run rows, later writes, forged receipts, late-page/source/private-state corruption, input-reference mutation and throwing persistence/cleanup. The old online exercise does not check the membership model field; the independent replay already does. The suite preserves that distinction rather than claiming a nonexistent old online check.

The heavy replay stays outside the normal test suite. The exact commands used were:

```sh
node --test test/comparison/n10-host-recovery-verification-coverage.test.mjs
python3 -B docs/evidence/RX-9006/overhead-slice1/validation/prepare-capture-replay.py
node --max-old-space-size=6144 docs/evidence/RX-9006/overhead-slice1/validation/replay-captures.mjs
```

The Python preparation accepts an optional reconstructed raw-directory path. It reconstructs expected literal records through the existing independent Python oracle and checks each saved file against the original report's SHA/byte metadata. `capture-input.json.gz` preserves that complete input ledger and authored populations. If the recorded temporary data expires, reconstruct the full original tree from its retained indexed `recovery-full-01` shards; never execute an engine to regenerate substitute observations. The Node heap option is an analysis-process allowance, not a product-memory measurement.

Parsed historical data cannot reobserve live immutable directory/bucket checks, AVL validity, authoritative staging flags or terminal ownership. Their capture source paths are unchanged; historical observations retain their original scope. Missing contexts are not supplied by this replay, and no measurement savings or future run authorization follows.
