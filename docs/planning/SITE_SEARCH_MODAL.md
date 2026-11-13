# Header documentation search

The owner requested that the demo site demonstrate Raveldex in a header modal,
using the supplied Tailwind header image as the reference for a compact search
trigger. The existing header routes visitors to the developer Workbench; the
previous modal work did not connect that component to the site's shared header.

## Selected scope

- Replace the shared header's Demo navigation link with a labelled search button,
  magnifier and platform shortcut hint. Keep Guides, API and Examples.
- Use the actual installed `mountRaveldexModal` export. Apply an application-owned
  neutral theme through existing CSS hooks: white surface, restrained borders,
  readable type, compact controls, generous result spacing and clear focus.
- Search the existing five-guide usage corpus with native final-word prefix
  queries. Keep original indexed bodies and IDs, exact totals/order and native
  section destinations. App-owned category/overview text is display data only.
- Load and index the explicit public corpus on first open. Offer cancellable
  loading and explicit retry; cancellation or navigation invalidates late work.
  Reopen reuses the owned index and retains the query. Destroy the borrowed UI
  before disposing the application-owned engine, including bfcache transitions.
- Preserve ordinary result links and Tab navigation. Support Ctrl/Command+K
  outside editable fields, Escape/close, focus restoration and 320px/short screens.
- Keep a normal guide link without JavaScript or native dialog support. Keep the
  existing `/demo/` Workbench and five galleries available. No dependency,
  public API, core semantics or general site redesign is selected.

## Implementation and verification

1. Add a real generated-site regression for the header entry point and observe
   its failure before implementation.
2. Add shared header markup, a scoped stylesheet, and a site-owned controller
   using the installed modal and existing ownership/loading patterns.
3. Bundle against the same isolated package installation used by the site,
   publish explicit corpus/entry assets and hash every new source input.
4. Verify native results with the independent oracle, real heading links,
   shortcut/editable-field rules, focus/reopen, cancellation/retry and no-JS
   browsing. Check responsive/forced-colors/reduced-motion layouts and inspect
   the rendered desktop/mobile modal.
5. Run related site regressions and one complete candidate verification, reuse
   the build, regenerate/check Pages, review and record actual evidence.

Owner review of the resulting visual remains distinct from automated verification.
No publication, deployment or source commit/push is included.
