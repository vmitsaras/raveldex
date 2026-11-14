# RX-9903 fresh review and disposition

One read-only reviewer, `rx9903_final_review`, GPT-6 Astra/high, reviewed the
uncommitted task against base `c7d59a0c43d28e04f88a6f981c1eaaf1a48bb5b6`.
No Critical findings; four Important findings entered one fix pass.

1. Existing Astro starter fragments landed in a hidden installation panel.
   Initial fragment navigation and hash changes now select/reveal the correct
   project and scroll to its retained heading. A regression failed before repair.
2. Clipboard failure instructions offered no reliable keyboard selection of just
   the file. A new Select source action focuses/selects a readonly field whose
   value comes from the exact rendered code. The regression failed before repair.
   A DOM Range attempt exposed Chrome's omitted terminal newline; the readonly
   field preserves the complete selection, including that newline. Cleanup
   removes the transient field. No failed write reports success.
3. Generic setup wording confused Browser/Astro tarballs, Astro fields and build
   identity. The selected project now explains its actual local tarballs; Astro
   names `entries`, `slug`, `title`, `category`, `body` and page/manifest `buildId`,
   distinct from matching package versions. The new regression failed first.
4. Keyboard coverage did not assert frame entry/exit or activate the full-page
   destination. The strengthened check asserts parent Code button → frame input,
   reverse traversal, last frame browse link → installation select and reverse,
   then keyboard-activates Open full preview and checks the standalone URL/UI.
   Existing production navigation already passed these stronger checks; no
   navigation implementation change was required.

Final command results are recorded in the primary task evidence. No second review.

One Minor finding is deferred: source appears twice in HTML, as highlighted text
and the escaped exact-text data attribute. Removing that duplication could reduce
the payload; it is not required to repair the confirmed operability issues. Both
representations currently have byte-equality checks; manual selection derives
from the rendered code. No runtime dependency was added.

The reviewer declined human AT/physical input/zoom/cross-browser qualification,
full candidate/captures/durable tracking then pending executor checks, hosted or
registry claims, and the RX-9904 owner visual decision/other-family rollout.
Disposition: executor checks the candidate and tracking directly; unavailable
human/hosted/registry claims remain unqualified. RX-9904 and the gated rollout
remain unstarted. If these boundaries are wrong, those broader claims remain
unestablished; automated output cannot substitute for them.
