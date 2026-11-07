# RX-9101 independent specification review

7 November 2026 · base `038385b7e04d4333ed529ba76af60e8bc86f2f11` plus local RX-9101 documentation changes. Reviewers were read-only subagents in this chat, not human sign-off or browser/AT observers. The parent owned every mutable file. Neither reviewer ran builds, application tests, collectors or remote mutations.

## Source reconciliation

- `inline_state_contract` inspected inline/modal/dropdown implementations, public handles, messages, renderers and named UI tests. It supplied idle/composition/loading/results/paging/empty/error/retry/reset/close/refresh/destroy facts and native keyboard/focus/ownership boundaries.
- `directory_identity_audit` independently inspected directory/controller/URL/cards implementations, their tests and the five consumer stylesheets. It supplied page/reset/refresh/URL/count/focus differences and actual token/theme/capability boundaries.
- Parent inspected the foundation/API contracts, CSS and site styles, result renderers, directory/dropdown declarations, authored content and retained inline/cards screenshots. Existing tests/screenshots were treated as coverage/history, not new execution.

## Draft contract review and disposition

Both reviewers read [the actual draft](../../specs/N11_CONSUMER_CONTRACT.md) against RX-9101 AC01–AC05 and checked direct source where needed. They separately assessed source accuracy, public-contract/scope drift, verification claims and implementability.

| Finding | Source evidence | Correction and final disposition |
| --- | --- | --- |
| Shared busy-only-for-request wording contradicted directory draft/composition behavior. | `src/addons/ui/directory-view-mount.ts:126–128` | Loading row explicitly preserves busy draft/composition/loading for directory and request-only busy for inline/dropdown. Reviewer bounded reread: resolved. |
| Calling dropdown full-results destination optional confused conditional visibility with required configuration. | `src/addons/ui/dropdown.ts:36–41` | Append/page row states required configured destination and conditional valid-nonempty-query link. Reviewer bounded reread: resolved. |
| Mount row incorrectly required every directory view to start idle and prohibited opted-in card image work. | `src/addons/ui/directory-view-mount.ts:65,238`; `directory-cards.ts:27,44,66` | Mount row distinguishes a new idle controller from a view's borrowed current snapshot; explicit image opt-in may render/load current-page images, including mount. Reviewer bounded reread: resolved. |

No blocking findings remain in the reviewers' assigned scopes. Inline/modal/dropdown review found the state/capture/paging/focus/reset/close/teardown contract accurate after corrections. Directory/identity review found concrete role values and authored specimens implementable, with current API/theme/image boundaries preserved. That reviewer judged Reading index coherent and sufficiently distinct as a selected design direction; this is design judgment, not proof of rendered originality or accessibility.

The review accepts this specification only. RX-9107 still owns styling implementation; later tasks own copy/behavior/compatibility decisions and RX-9112 owns the finite installed/human qualification. No engine, provider, API, dependency, benchmark or new mandatory component is selected.
