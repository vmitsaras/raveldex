# Load more appends every matching batch

RX-9801 tracks this owner-selected behavior change, requested on 2026-11-12.
Implementation and verification status belong to the canonical roadmap and
task evidence; this contract does not claim those checks have passed.

## Decision and scope

The owner reported that searching `addon` in the site's header modal appended
five-result batches, then unexpectedly switched from Load more to Next results
at 20 of 31 matches. The cause was the shared inline presenter's capped-window
contract, exposed by the site's `maxRenderedResults: 20` configuration.

The owner explicitly selected a shared inline/modal correction: Load more must
continue appending until all matches are displayed, without switching to Next
or replacing earlier results. Raising the site's cap alone does not meet this
request. This decision supersedes the RX-6002 window contract and its inherited
modal behavior. Historical evidence retains its original inputs and scope.

The change covers inline search, modal search and their installed starters,
including the inline full-results destination used by the dropdown starter.
Directory, cards and developer Workbench page replacement are unchanged. Core
retrieval, ranking, totals, query semantics, artifact formats, providers and
borrowed-engine ownership are unchanged. No new dependency, package entry,
persistence, event API or publication is selected.

## Required behavior

- The initial search requests one `pageSize` batch. Each explicit Load more
  requests the next batch with offset equal to the currently displayed count.
  It appends in native order, retaining earlier result DOM nodes and links.
- Load more remains usable while displayed count is below the exact total.
  The last batch can be partial. Inline/modal render no Next/Previous results
  controls and no window-limit message. Counts describe the complete loaded
  prefix: `Showing 1–{count} of {total}.`
- Keep `pageSize` validation and its 1–100 batch bound. Retain the existing
  10,000-display-document and 4,000,000 aggregate ID/title/URL UTF-16-unit
  admission bounds, plus existing source, section, work and transport limits.
  Accumulation is user initiated; do not fetch all remaining results eagerly.
  Loaded DOM can grow to all matching admitted documents. These bounds do not
  establish memory usage, latency or device capacity.
- `maxRenderedResults` remains accepted with its existing validation (integer
  from `pageSize` through 1,000) as a deprecated, unused compatibility option.
  It controls neither retention nor continuation. Existing `previous`, `next`
  and `windowLimit` message inputs remain accepted and validated but unused.
- Preserve Load more focus after append. At exhaustion, a focused Load more
  stays visible and guarded with `aria-disabled`; activating it is a no-op.
  It hides after focus leaves. Go to new results continues to target the first
  newly appended title without a search or fragment change.
- Preserve coherent revision/total checks, duplicate-hit rejection and
  batch-scoped source/section evidence validation. Failure must not publish a
  partial or mixed successful append. Retry restarts from the first batch with
  the submitted query and selected filters retained.
- Query/filter changes, Clear, modal suspension and teardown invalidate pending
  work and prior append targets under the existing lifecycle contract. Late
  replies cannot repopulate cleared, closed, replaced or destroyed results.

## Observable acceptance

1. A 31-match search with batch size five and legacy cap 20 displays
   5, 10, 15, 20, 25, 30 and 31 results across successive user actions.
   Earlier nodes remain identical; all IDs appear once in native order, totals
   stay 31, and no Next/Previous results controls appear.
2. Accumulation passes the former maximum cap of 1,000 and reaches every result
   in an admitted corpus larger than 1,000, still using finite native batches.
   Changing only a legacy cap does not change the final displayed membership.
3. At exact exhaustion, no additional search is issued. The active Load more
   keeps focus until the user moves it; Go to new results and native link
   traversal remain usable. A partial final batch reports its actual count.
4. Query/filter/reset/retry start from the first batch with no stale duplicates.
   Revision or total inconsistency, duplicate/malformed hits and provider or
   transport failures produce the existing explicit failure/retry state.
5. Clear, replacement search, close and destroy suppress pending append replies.
   Composition, opener restoration and borrowed-engine disposal stay consistent
   with their existing contracts.
6. The actual header query `addon` traverses every match through Load more;
   independently derived IDs/order/totals and the complete browser starter's
   three/seven-result path agree. Current docs and distributed examples describe
   appending, while directory/Workbench retain their existing paging checks.

Verification should combine focused shared inline/modal behavior checks, an
independent-oracle header regression, installed starter coverage and one
complete candidate verification. Record actual commands, build/dependency
identity and environments in RX-9801 evidence. Automated results do not extend
human assistive-technology, physical-input, real-zoom or performance claims.
