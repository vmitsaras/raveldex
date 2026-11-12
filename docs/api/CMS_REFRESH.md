# Refresh CMS content without losing ownership

Treat searchable records, the submitted query and the captured display map as separate inputs. An engine write changes the index. It does not rerun a UI query or replace titles, URLs, excerpts, section maps, messages or labels captured when mounting a view. A repeated same-kind mount returns the current handle rather than applying options. Directory/cards may still validate supplied options before returning it; do not use a duplicate mount as an update or validation bypass.

The application owns CMS delivery, mutation order and current display records. Raveldex adds no CMS subscription, polling, automatic fetch or automatic query. Await the authoritative write and use a deliberate search/refresh. Keep stable IDs and matching display records. If several mutations are needed, each admitted write is atomic; the sequence and display-map swap are not one transaction. For a whole replacement dataset, prepare a separate owner before switching rather than publishing half a rebuild. Do not blindly retry uncertain worker mutation outcomes; use the owner's existing receipt/reconciliation contract.

## Choose the operation that actually preserves your state

| Change / surface | Supported path | State and focus boundary |
| --- | --- | --- |
| Indexed text/metadata only, unchanged display IDs/options | Await the owner write, then explicit `search()` on the live inline/modal/dropdown, or directory `refresh()` | Live inline facets are retained; result windows restart. Directory retains committed text/filters and deliberately resets page one. Mount/import alone starts no query. |
| Display titles/URLs/card fields, messages or section maps | Destroy the old view, then remount with the fresh map/options | Caller object mutation and card `setPresentation()` do not replace captured content. New inputs/links are new Nodes; there is no automatic caret/composition/focus restoration. |
| Directory/card metadata or language only, same index/controller configuration | Remount over the same live controller/snapshot | No query, page change or URL write is needed just for the view. Keep the URL binding alive. Opt-in images may request on ready mount even without a query. Preserve card `getPresentation()` explicitly if wanted. |
| Directory content revision changed | Explicit `refresh()`, inspect the snapshot, then mount matching display records | Same text/filters, current revision, page one. Equivalent `restore(saved)` or `update()` may be inert; they are not refresh substitutes. Page/restore across a revision may report stale. |
| New directory controller configuration | Explicitly rebuild controller and any URL binding, admit application-owned state with `restore()` | Group fields/allowed values, page size and query mode are controller configuration, not view labels. Unknown/removed selections need an application decision. Out-of-range page restoration may recover to page one. |
| Inline/dropdown after destroy/remount | Restore application-owned text through explicit `search(text)` if wanted | Starts idle. There is no public query snapshot/getter, facet setter or paging-restoration API. `search(text)` is still deferred during active composition; it is not an IME-cancellation method. |
| Modal | Close before replacement; remount the shell and explicitly reopen when appropriate | Same-handle close/open normally retains text/facets; `resetOnClose` clears them. Closed `search(text)` stores text without a query; open follows the existing explicit-query contract. A new handle has no old private state. Normal opener restoration remains conditional. |

For a dropdown with a pending request, quiesce it with the existing `close()` before the owner write, or ensure that request has settled. Close retains the raw query while invalidating/aborting the flight; explicitly search after the write. Otherwise `search()` for the same raw query can reuse a pre-write in-flight request instead of starting a latest-revision query. Finish or deliberately discard composition separately; close is not a promise to finish editing.

The application must record any state it needs through its own supported input flow. Do not read private hooks, synthesize hidden select IDs or invent `getState()`/`setFilters()` on inline/modal/dropdown. Exact inline/modal facet/window preservation across a captured-map replacement is **not available** through current public handles. Choose an explicit reset with restored text, or use the directory controller where first-class state restoration is required. The public handles expose no snapshot/filter setter.

A UI/controller query Promise resolving means the operation/presentation settled, including native failure. Directory success requires `getSnapshot().status === 'ready'` and its actual result; inspect `error`/`stale` otherwise. Inline/modal/dropdown show their failures through the existing status/recovery interface. Do not treat `Promise<void>` as a successful-query receipt. Owner mutation receipts have their separate existing contract.

## Complete installed walkthrough

Copy [cms-refresh.mjs](examples/cms-refresh.mjs) into an ESM application with the installed package. This finite example creates and owns its engine/controller, queries `shared` with Guide selected on page two, then changes indexed text and metadata. It unmounts the old display map, explicitly refreshes to the current revision/page one, and remounts fresh card titles/excerpts over the same controller. A repeated valid mount retains the existing handle and the fresh map. It finally restores authored Nodes and disposes its owner. It is an opt-in focus/update demonstration, not a production synchronization service.

Use a dedicated connected root that no other view owns, and a stable enabled button outside it. This small walkthrough validates that both are in the document tree, outside ShadowRoots; a shadow-host integration needs its own known-scope focus reads/handoff. Keep the host in its original document and do not run competing writes, commands or teardown during this finite walkthrough. Import CSS explicitly. It deliberately focuses its first input to demonstrate handoff; it returns focus only if the stable anchor still has it, and leaves focus on the external button when final teardown removes a focused input. It does not claim to retain focus on a removed Node.

```html
<button id="cms-update" type="button">Run content update example</button>
<section id="cms-search" aria-label="Resource search">
  <p>Browse resources while search is unavailable.</p>
</section>
```

```js
import '@vmitsaras/raveldex/addons/ui/directory-cards.css';
import { runCMSRefreshExample } from './cms-refresh.mjs';

const button = document.querySelector('#cms-update');
const root = document.querySelector('#cms-search');
let running = false;
button.addEventListener('click', async () => {
  if (running) return;
  running = true;
  try {
    // Keep this stable anchor enabled; the guard prevents concurrent runs.
    const result = await runCMSRefreshExample(root, button);
    console.log(result.after.total, result.renderedTitles); // 1, ["Current b"]
  } catch (error) {
    console.error(error); // Present application-owned recovery in your interface.
  } finally {
    running = false;
  }
});
```

The guard keeps the trigger available as a focus anchor without launching overlapping runs. The important sequence in the copied module is view teardown → awaited owner mutation → explicit refresh/status check → fresh-map mount. A rejected update/query cannot leave a newly mounted success view in this example: `finally` tears down its resources and restores the authored fallback. Handle failures and visible recovery in your own application; never silently retry or remount a failed candidate as success.

## Apply the sequence in an existing owner

1. Finish composition, or deliberately discard the draft as part of the user's update action. Capture **committed** directory state from `getSnapshot().state`, not a pending view draft; save presentation if needed. Inline/dropdown `search(text)` does not cancel composition. Avoid changing content underneath an active editing session without an application decision.
2. Before destroying a focused view, move only owned focus to an enabled app-owned anchor outside the root. Keep an operation identity/liveness guard around asynchronous CMS work. Restore to a new control only if the operation is still current, the host is still owned/connected and focus remains on that anchor; do not steal focus after the user moves elsewhere.
3. Destroy the old view before removing/replacing its host or mutating a dataset whose IDs may no longer fit the old map. For an unchanged-map dropdown, close its pending flight before the owner write, then explicitly search afterward. Await successful owner writes. Refresh while no incompatible old display map is mounted, then inspect the resulting controller snapshot before mounting the matching new map. Library stale-reply guards do not establish ordering for two competing application CMS requests.
4. Keep a compatible directory controller and explicit URL binding for a view-only replacement. View teardown does not cancel shared controller work; its current pending operation can validly publish into a new view. If changing intent, issue the existing explicit controller command instead. A final controller destroy cancels its owned work and releases its subscriptions. Destroyed inline/modal/dropdown views suppress their own late replies.
5. Keep the application's configured URL ownership. Binding construction is inert; `read()` explicitly restores URL state and can query/canonicalize. Refresh resetting page one can replace the owned page parameter; unrelated parameters/hash remain outside that ownership. Do not re-read an old URL just to remount a view. If rebuilding a controller, release the old binding before connecting the replacement and explicitly choose whether URL state or saved application state wins.
6. At final owner disposal: destroy view → destroy the optional URL binding → destroy controller → dispose the engine/static-loader owner **you created**, after other borrowers are finished. A view never owns a borrowed controller/engine. Destroy a view before replacing its root; arbitrary external DOM replacement is not a universal ownership-transfer guarantee.

Keep [localization capture/remount](LOCALIZATION.md), [rich-content maps and image privacy](RESULT_CONTENT.md) and the [host contracts](HOSTS.md) aligned with the same owner. No new background subscription, live-map setter, state API, renderer, engine behavior or query policy is introduced here.
