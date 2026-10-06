# Verification layers

`tooling/` checks roadmap validation/status and tracking synchronization. `core/` checks schema/record/query/option ownership, errors, limits, analysis and import isolation. Hand-authored `fixtures/analysis/` contains independently stated terms and original UTF-16 spans; `types/` checks readonly declarations and forbidden/coerced inputs. `npm test` builds ESM then runs all behavior tests; `npm run typecheck` also checks the type fixtures. These passes establish input/analyzer primitives, not a working search engine.

Future task slices add independent analyzer/query fixtures, native retrieval oracle comparisons, hand-derived ranking arithmetic, mutation/revision sequences, owned cancellation workloads, source/positional parity, public package consumers, host integration, and qualified UI/browser/AT/resource observations. Consult [the verification plan](../docs/planning/VERIFICATION_PLAN.md).

Record unsupported or unavailable observations as Blocked/Not Applicable with reasons, never as passed. Never make the oracle share the implementation under test for the behavior being checked.
