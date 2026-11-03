# RX-8002 matched workload and diagnostic method

This harness establishes reproducible N9 inputs and observes the existing runtime. It does not implement the query or restore optimizations selected for later tasks.

## Reproduce

Use Node 22 or newer and an isolated consumer installed from the selected private tarball. Installation is an explicit setup step; the runner does not build, install, fetch or publish anything. Keep the normal consumer outside the repository. Use a fresh output directory:

```sh
node bench/n9/run.mjs /absolute/path/to/installed-consumer /absolute/path/to/new-output
```

The consumer must contain a real `node_modules/@vmitsaras/raveldex` installation without symlinks. The runner copies it into a disposable diagnostic consumer and stages the child entrypoint in each consumer. It records every normal installed member's byte hash before and after; only the disposable copy receives diagnostic patches. Patch anchors fail closed on source drift. Passing a package with different compiler output may require deliberately updating and reviewing those anchors.

`RAVELDEX_N9_SIZES=100` and `RAVELDEX_N9_FAMILIES=adversarial` select a reduced pilot. A pilot is not the nine-cell acceptance matrix.

## Inputs and expected behavior

The [fixture record](../../test/fixtures/n9/README.md) defines three families at 100, 1,000 and 10,000 records. Thirty-four previously frozen technical-document sections seed labeled, repeated excerpts; these are not 10,000 independent real documents. High-cardinality catalog controls and adversarial multi-value phrases are explicit synthetic additions. Membership judgments are independent lexical predicates, not output copied from Raveldex. Corpus, source, labels, schema, query and complete judgment hashes must match [the frozen inventory](../../test/fixtures/n9/freeze.json) before execution.

Each workload has common/rare, overlapping OR, negative-only, metadata filter, narrow/broad prefix and source-phrase cases. Broad high-cardinality prefixes deliberately exceed the existing expansion cap; exact typed failures and their paths are expected. Default limits remain unchanged. Source recovery exports the actual admitted owner, restores into a fresh receiver containing one prior record, and checks complete count/revision on success or complete prior-page identity on refusal.

At 100 records, focused tests page through complete membership for every successful query in every family. The measured matrix checks full expected totals and eligible, unique, finite-score top twenty hits; it does not page through all 10,000 ranked IDs. Normal/diagnostic observations additionally compare exact page objects, including scores, order, revisions and model, or full recorded typed-error facts. Relevance quality and independent BM25 arithmetic remain separate existing correctness evidence.

## Timing and rotation

Each cell uses three fresh child processes and owners: two ordinary owners and one diagnostic owner. Diagnostic placement rotates across cells; cell order reverses in later rounds. Workload generation, module loading and owner construction precede timing; the build window measures the admitted `addMany` calls. Each query has a first call and a repeated call on each normal owner; the diagnostic owner has one call. Build uses sequential batches of 256. Source export and restore have separate observations; result checking, JSON parsing, serialization and hashing occur after each operation's timing window. Receivers have a literal prior record so failed restore cannot masquerade as an empty successful result.

Monotonic wall milliseconds, process CPU user milliseconds and CPU system milliseconds are separate raw values. CPU includes the measured process's harness and promise scheduling; it is not isolated engine CPU. A first call means the first invocation of that query within the owner's fixed query sequence; only the first query is the first search on its fresh index. These are not filesystem-cache or machine cold starts. Successful samples have medians and observed maxima; two owner observations per operation and four query observations do not support p95 claims. Refused, rejected and unknown outcomes remain explicit and never become successful zero durations. A one-millisecond deadline probe records its actual outcome; a sufficiently small operation may finish. Pre-aborted admission checks cancellation. Local direct execution has no worker transport, so no unknown transport outcome is manufactured.

The normal runtime contains no inserted observer branches. Diagnostic wall/CPU are retained under `observations` and excluded from normal summaries. They describe intrusive runs only; do not subtract them from normal timings to estimate overhead. No other benchmark/build/test process is intentionally run concurrently, but ordinary desktop activity and operating-system noise remain uncontrolled.

## Diagnostic definitions

- `candidates`: actual entries into the native query's candidate loop. The baseline scans the document universe, so this equals the admitted corpus count on completed queries.
- `documentsEvaluated`: started root predicate evaluations, excluding recursive child calls and separate absent-ID trace handling.
- `documentsScored`: started native BM25 calls for matched documents, including zero-positive-group cases.
- `exactDictionaryProbes`, `prefixDictionaryVisits`, `postingsVisited`: actual lookup or enumerated term/posting sites, not estimated vocabulary or serialized bytes.
- `emittedSteps`, `emittedWorkUnits`, `maxStepWorkUnits`: generator steps actually received by the scheduler. A failed charge before emission is excluded.
- `continuationsScheduled`: actual resume schedules; `hostYields`: those resume callbacks actually fired. Cancelled resumes and deadline callbacks are separate.
- `restorePhases`: actual `snapshot.decode`, `snapshot.integrity`, `snapshot.compatibility`, `snapshot.staging`/`snapshot.validation` and `snapshot.precommit` checkpoints, with emitted work assigned to the most recent specific phase. Zero-work checkpoint phases remain visible. These are emitted-work counts, not phase CPU/wall timings.

The public runtime, limits, BM25 identity, phrase eligibility, source offsets and atomic publication are unchanged. Bench-only instrumentation uses a serial global diagnostic scope in the copied package and always removes it on settlement.

## Scope and failure rules

A refused corpus build fails the matrix; missing/duplicate query coverage cannot yield a passing result. Unexpected query or recovery errors fail rather than being reported as an ordinary resource refusal. Declared work, deadline and resource refusals remain inspectable with preexisting state preserved. Earlier failed or interrupted attempts must remain separate from the accepted run.

This track measures **Node direct with optional source retention and source phrases**. Root-only, positions, browser direct, worker and installed UI costs are separate configurations and remain unrun here. Existing regression suites cover their semantics without transferring timing claims. No package-size-to-memory conversion, retained/peak heap measurement, capacity increase, optimization, competitor result, hosted behavior or human accessibility observation is implied. Historical RX-4001 short-ASCII/core-only costs use different inputs and configuration and are not matched comparisons. Later RX-8009 and RX-8010 own paired optimization/comparator results.
