# N9 review correction — operation deadline

RX-8011 source inspection identified a consequential wording error in earlier N9 narratives: **60 seconds is the permitted maximum operation deadline, not the ordinary default**.

[Option capture](../../../src/core/contracts/options.ts) selects `Math.min(30_000, limits.maxDeadlineMs)` when an operation omits `deadlineMs`. The unchanged [native ceiling](../../../src/core/limits/limits.ts) is `maxDeadlineMs: 60_000`; configured maxima can be reduced. The deadline includes elapsed queue time, rather than restarting when queued work begins.

The timed [paired native collector](../../../bench/n9/paired-child.mjs) and [alternative native control](../../../bench/n9/alternatives-child.mjs) explicitly pass `deadlineMs: 60000`. The [restore collector](../../../bench/n9/restore-case.mjs) similarly selects its main operation deadline. Ordinary setup/relevance calls without this override retain their own ordinary default; forced 1ms and pre-aborted probes remain separate.

Consequences:

- The compared timed stages use the same explicit 60-second setting and unchanged work/admission ceilings. This correction does not change the observed timings, work counters, native model, limits, conditional comparisons or refusal outcomes.
- Successful selected 10k restores are observations under that explicit setting. They are not a new test of the ordinary 30-second default or a guarantee for other inputs/providers/hosts.
- The preserved RX-8010 build refusal reached an explicit 60-second operation deadline. Its successful retry does not turn it into a default-30-second success or establish the underlying delay cause.
- Earlier phrases such as “default 60s deadline” or “default-budget failure” must be read with this distinction. They describe the measured setting or unchanged work/admission caps, not the no-option deadline. Current workload guidance uses the source-defined default and ceiling separately.

No runtime, raw capture, recorded command, package archive, fixture, query, relevance label or measured summary is changed by this correction. The independent reviews record their direct source/raw checks; this dated note supersedes the ambiguous deadline wording for current support decisions.
