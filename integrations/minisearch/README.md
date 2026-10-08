# Explicit foreign comparator

`companion-comparator.mjs` is a development harness outside the native package allowlist. It accepts an explicitly supplied companion public `createLocalSearch` function and the pinned identity for clean LocalSearch commit `5f334a8ca4f7d9d95b6b731ac539f4b1dda302cb`. Missing or mismatched injection fails; there is no fallback engine.

Run the actual local foreign implementation without installing another runtime dependency:

```sh
node test/comparison/run-companion.mjs /absolute/path/to/LocalSearch /tmp/raveldex-comparison.json
```

The runner reads that repository's existing public build and installed MiniSearch `7.2.0`, checks the clean pinned Git revision, and compares independently literal shared memberships. It records both actual ranked score lists. Ranking changes among equal member sets are separate from the explicit fullwidth/ligature normalization membership difference. Companion scoring, source phrase semantics, finite admission ceilings, partial cancellation, and unavailable numerical explanations remain labeled as foreign behavior.

Forwarding tests use a labeled injected fake only to check injection/identity/forwarding; the comparison command supplies the real companion. Historical companion verification files are hashed against fixture-generation baselines and remain in their original repository. These observations are current foreign runs, not reassignment of old companion passes to native Raveldex.
