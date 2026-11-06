# Slice 1 independent review checklist

Status: source review in progress; this is not task or measurement acceptance.

The reviewer may write only this review directory. No canary, benchmark,
collector, production-engine exercise, source mutation or nested delegation is
part of this review. Original executed source is preserved under `../v1/`.

Review obligations:

- Implement only source-mode unused-position allocation removal, authenticated
  validated-source facts, and lazy literal-ID/source expectations.
- Validate each freshly captured encoded snapshot once. A retained donor or
  before-state fact may support comparison but never replace a new observation.
- Bind snapshot facts to exact immutable encoded text and private context-local
  authority; reject forged, mutated, cross-context and disposed-context handles.
- Own immutable copies of literal expected data. Keep donor, prior receiver and
  both corresponding post-write populations distinct. Never cache native
  observed roots, pages or current source by revision, label, ID set or hash.
- Preserve first-use order; no extra expectation construction before native
  measured operations. Release context-local state on success, refusal,
  cancellation, Unknown and exceptional cleanup paths.
- Preserve strict source/canonical semantics: exact fields, original values,
  metadata named `revision`, negative zero, array/value order, descriptors,
  supported prototypes, cycles and legitimate own reserved-looking keys.
- Preserve all branch-required native operations, query options, every page,
  source/private capture where observable, receipts, later writes, abort
  scheduling, live immutability/AVL/staging witnesses and disposal calls.
- Preserve full source/core/TF/DF/posting checks in source mode and exact
  participant rejection; positions mode retains every position/UTF-16 offset.
- Keep historical N9 helpers, runtime/packages/dependencies, native 30/60s,
  worker 65s, maxHits100 and original 180m/300s method bytes unchanged.
- Record a distinct dated verifier identity and all required helper/build pins.
  Do not implement future orchestration policies, profiling or the conditional
  structural comparator, or imply qualified savings/canary readiness.

The independent review will use actual source changes and adversarial data-only
checks. Parent-owned full project checks and the separate coverage/replay
workstream remain separate evidence.
