# Post-N19 home/gallery owner review

The owner explicitly selected the gallery as the home page and requested moving
the former home search-form example into the open gallery grid position.
`Home.astro` now reuses `Examples.astro`; the brand/home link opens the gallery,
and `/examples/` remains available. Five static choice cards are followed by one
isolated installed Inline search iframe. Existing core example/task links and
home anchor targets remain, while guide/reference and starter routes are unchanged.

The taller live preview initially stretched adjacent static cards. A focused
browser regression reproduced 452.75 CSS px of unnecessary blank space before a
platform list. Natural card alignment and a two-column wide layout fix this;
narrow layouts retain one column. Source and downloads, consumer CSS, core,
package manifests/dependencies and the original indexed Markdown remain unchanged.
The existing successful package build was reused for site generation.

This owner-selected amendment supersedes the former inert-gallery requirement
for this new candidate only. Historical N19 approval, source/hash and verification
records retain their original scope. No commit/push, GitHub state changes, workflow
restoration, deployment or publication was selected by these browser comments.
The refreshed local preview remains at http://127.0.0.1:51667/raveldex/.

## Verification

Final stable generated-site suite: **81/81 Pass**, zero failures/skips:
`node --test --test-concurrency=1 test/pages/*.test.mjs`.
[Full final log](N19_HOME_REVIEW/logs/site-final.log). The focused home suite also
passes **9/9** after updating old chooser selectors without removing no-JavaScript,
RTL, long-label or forced-color assertions. The compact-card regression passed
after the recorded RED observation. Intermediate runs exposed obsolete expected
five-item counts, an old chooser selector and an ambiguous Workbench-link selector;
those test assumptions were aligned to the requested layout and are retained in
raw logs. One intermediate run also overlapped source generation and therefore
could not validate the stable manifest; only the final stable run qualifies it.

`pages:check` Pass: 92 HTML / 2,409 links / 234 exposed files; source/output hashes
and strict public inventory verified. `docs:check`, `handoff:check` and diff checks
Pass. [Candidate identity](N19_HOME_REVIEW/candidate.json) preserves the new
manifest identity; no old evidence or pilot approval is relabeled. Installed
Chrome 157.0.8103.51 on Darwin arm64, Node24.21.0; scripted input/viewport/media
checks only. Actual human AT/zoom/physical-input and owner visual acceptance of
this changed candidate remain unverified. The final live example was visually
inspected at1280px; the home page also measured scrollWidth=clientWidth=320.
Changes remain uncommitted/unpushed for owner review.

## Subsequent screenshot-card revision

The owner requested matching the other items: screenshot, heading, text, links.
The sixth item now uses the existing Inline screenshot and shared card classes;
its live iframe is removed. Open the search example navigates to the genuine
standalone starter, and Use this inline search leads to its setup. Both gallery
routes remain static, with five interface choices and this linked example.

Fresh affected browser checks **17/17 Pass**; the updated no-JavaScript fallback
check **1/1 Pass**. These supersede the previous embedded-frame assumptions.
The prior 81-test result belongs to the earlier candidate and is not relabeled.
[Current card capture](N19_HOME_REVIEW/static-card.png) inspected at772×709;
zero gallery iframes, one decoded screenshot, real linked search verified.
No runtime/starter/package/dependency changes, commit/push or publication.

## Equal-height row revision

The owner subsequently requested matching grid-item heights. With all six items
now static cards, CSS grid stretching gives each row equal natural height without
fixed/clipped text dimensions; the shared flex body aligns the final links.
A browser regression first failed on row2 at772px, then passed after changing
`align-items` from start to stretch. All **8 gallery checks Pass**, including
equal heights/link bottoms for every pair at772/1280px and overflow-free320px.
No package/runtime or unrelated styling change. Preview refreshed at the same URL.

## Short Open labels and card-wide native links

The owner requests visible Open only, with the remaining destination text
screen-reader-only, and a pseudo-element covering each card. All six primary
links now keep their full accessible names using clipped one-pixel text spans.
Their native anchor ::after covers the positioned card; independent setup links
sit above that hit area. No container click handler, nested anchors or extra tab
stops. Keyboard focus outlines the whole card, including a system-color outline
under forced colors.

The new actual pointer-navigation regression failed before the change and passes
for all six screenshots on both home and /examples/. Keyboard Enter navigation,
hidden suffix geometry and independent Astro setup clicks are verified. The
complete gallery suite is **9/9 Pass**, including no-JavaScript keyboard order,
forced colors/reduced motion, axe and equal-height rows. Intermediate assertions
were updated to observe the visible pseudo-element focus ring and to click actual
screen coordinates rather than requiring the covered image to receive events.
Raw RED/intermediate/final logs are retained. Preview refreshed at the same URL;
no package/runtime changes, commit/push or publication.

## Secondary gallery action and inline code surface

The owner requested a smaller secondary-button treatment for each Open link and
a clearer treatment for inline code directly inside paragraphs. Gallery actions
now use the existing light-gray wash and line colors, a small radius and compact
type, while the pseudo-element continues to make the whole card a native link.
Every `.site p > code` token now has the same light-gray background, subtle
border, rounded corners and small inline padding.

`pages:generate`, `pages:check`, `docs:check` and `git diff --check` all Pass.
The regenerated output contains 92 HTML pages, 2,409 checked links and 234
public files. The preview initially retained its startup file inventory and
returned 404 for the new fingerprinted stylesheet; the verified local preview
process was restarted. Browser inspection then confirmed the refreshed
typography, inline-code surface and compact gallery action at the existing
preview URL. Changes remain uncommitted and unpushed.

## Example-tab bottom separation

The owner requested more breathing room below the related-interface tabs. The
first override did not win over the more specific component-scoped reset, so the
bottom padding now lives on the chooser list itself. The border remains, with
12.8 CSS px between the active tab and its lower rule in the refreshed browser
view.

`pages:generate`, `pages:check`, `docs:check` and `git diff --check` Pass. The
preview listener was restarted to load the new generated asset inventory.
Changes remain local, uncommitted and unpushed.

## Dropdown preview placement

The owner reported that the header dropdown appeared below the whole search
panel, covering guide content and looking detached from its input. The popup is
still a fixed native top-layer popover, but now uses the search form's bounds
for its vertical placement and the input's bounds for its horizontal alignment.
It sits four pixels below the controls, including when controls wrap on narrow
screens; the live result count is ordered before the form so it stays visible.

For `walking guide`, the preview reports **7 results. Showing 3.** and displays
Plan your first walking trip, Trail symbols and signs, and Find an accessible
route. The focused browser regression checks the fixed position, alignment,
four-pixel gap, unchanged search-form geometry, truthful count and three
rendered links. The focused suite is **34/34 Pass** in the installed Chrome
consumer. Its first sandboxed attempt could not open the loopback test server
(`EPERM`); rerunning with local loopback access passed.

`npm run build`, `npm run pages:generate`, `npm run pages:check`,
`npm run docs:check` and `git diff --check` Pass. The regenerated inventory
contains 92 pages and 2,409 checked links. The refreshed local preview was
inspected in Chrome at `/raveldex/examples/dropdown/` with the real query and
suggestions visible. Browser inspection is local preview evidence; it does not
claim human screen-reader or physical-device testing. Changes remain local,
uncommitted and unpushed.
