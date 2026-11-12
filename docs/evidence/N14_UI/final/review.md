# N14 independent review and disposition

A fresh read-only reviewer (`gpt-6-astra`, high) reviewed the N14 delta against
the saved pre-N14 dirty source, specifications and neighboring contracts. Verdict:
**With fixes**. Critical: none. No second reviewer was used.

| Accepted Important finding | Repair and evidence |
| --- | --- |
| One refused read was called a stopped worker | Separate per-read refusal from an unusable adapter. Preserve the stable code in Technical details; explicit Search can reuse the same owner. Real read timeout (one shortened adapter timer), controlled valid wire errors and a real postMessage refusal all reuse one worker successfully. |
| An aborted same-owner read or closed Inspector could publish a late failure | Check that individual request's abort signal before reporting. Separate query/Inspector regressions failed then passed after newer success/dismissal. |
| Supported loading replaced a live authored form and lost its draft/focus; no-JS form could not search | Keep native form hidden until the unsupported-popover check reveals it. Supported loading and no-JS routes expose browse links; unsupported JS still uses the actual form and working full-results interface. |
| Retry loading guides hid its own keyboard focus | Keep it focused, visible and guarded while loading and after successful restart; retire after native blur. The real-crash test now activates it from the keyboard and checks pending/settled focus. |
| Storage guidance conflated different identities/failure families | Distinguish database version changes, namespace generations, direct snapshot code/reason, worker mutation versus snapshot receipts, uncertain cache writes and uncertain restore. `load()` restores its receiver, so inspection preserving live state uses a separate receiver. |

The review called the first native-Popover runtime requirement sentence Minor.
It was regraded Important: it directly contradicted the selected fallback/full-page
support claim and could prevent adoption of this task's recovery path. Corrected
that requirement with the same supporting guide update. No deferred minor.

During the fix pass, inspecting actual worker `transportFailure` showed that a
single postMessage failure returns `TERMINATED` without necessarily disposing
the client. Its regression failed first; `DISPOSED` now establishes an unusable
client, while `TERMINATED` reads preserve the option of an explicit retry.
The adapters and their error codes were not changed.

[Initial failures](review-red.log), [independent read cases](read-boundaries-red.log),
[send-refusal failure](send-red.log), [final installed recovery checks](recovery.log).
The first combined fix verification also exposed two fixture errors (DOMException
maps to TERMINATED; the standalone demo has no example-query buttons). The fixture
now tests actual Search and correct transport categories. It was not used as
false product-defect proof. Failed outputs remain in task scratch.

Declined-to-judge disposition: final candidate/Pages were still required and run
by the executor after this fix set; a Pages-only unmapped README link was fixed
and generation rerun. Human AT, physical IME/touch, actual zoom and other devices
remain Not run. Prior N12/N13 delivery, historical evidence retention and
publication/deployment remain outside the N14 code delta. No extra work was
silently deferred.
