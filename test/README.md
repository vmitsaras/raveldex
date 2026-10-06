# Verification layers

Currently only `tooling/` exists: behavioral checks for roadmap validation/status and tracking synchronization. Passing these tests is bootstrap evidence only.

Future task slices add independent analyzer/query fixtures, native retrieval oracle comparisons, hand-derived ranking arithmetic, mutation/revision sequences, owned cancellation workloads, source/positional parity, public package consumers, host integration, and qualified UI/browser/AT/resource observations. Consult [the verification plan](../docs/planning/VERIFICATION_PLAN.md).

Record unsupported or unavailable observations as Blocked/Not Applicable with reasons, never as passed. Never make the oracle share the implementation under test for the behavior being checked.
