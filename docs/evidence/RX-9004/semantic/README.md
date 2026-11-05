# RX-9004 full semantic lane

The [runner](run.mjs) reuses the unchanged historical `bench/n9/paired-semantics.mjs --child` implementation for all nine frozen family/size combinations and all three actual artifact roles, in a separate **27-process untimed phase after ordinary/diagnostic timing completes**. Its literal guards are 600 seconds per child and 10,800 seconds overall; watchdog expiration invalidates the collection and is never a native deadline observation.

The [source oracle](oracle.mjs) imports only independent test-oracle and frozen-workload modules. It reconstructs full lexical/phrase source membership, scores and order, complete reverse/posting/source state, and selected Inspector source TF/DF/population/length. Formula replay uses the existing independent paired verifier. Full semantic pages and explicit refusals are retained. Every successful timed top-20 capture must match independently scored source expectations; typed timed refusals and admitted-prefix/full-pagination differences remain separate observations. All 13,968 ordinary plus diagnostic timed query captures must be accounted for.

Run only after the timed collector ends, with its completed `full` report and the same actual installed artifact manifest:

```sh
node docs/evidence/RX-9004/semantic/run.mjs ARTIFACTS TIMED_FULL FRESH_OUTPUT
```

The [raw-fixture probes](negative.mjs) accept the retained RX-9001 adversarial-100 semantic row and canonical core as inputs. They validate the successful fixture, then reject twelve independently poisoned in-memory copies. They invoke no runtime. Actual results are recorded only when those commands run; preparing the scripts does not constitute a passing semantic collection.

No production or frozen historical harness is modified. The controlled host keeps its clock at zero and drains queued tasks; this does not establish real-host deadline behavior, task fairness, default-deadline capacity, CPU/wall timing, physical response, heap or platform claims. Ordinary and diagnostic timing remain separate from this acceptance phase.
