# Explicit record patches

Use `createPatch` when you want to change a few whole fields while preserving the rest of a record. It needs a direct engine and source providers for every text field, so it can assemble the complete replacement safely.

Run this example in an installed ESM application. It changes the body of **Atomic updates** without replacing the title yourself:

```js
import { createRaveldex } from '@vmitsaras/raveldex';
import { createSourceProvider } from '@vmitsaras/raveldex/addons/phrases/source';
import { createPatch } from '@vmitsaras/raveldex/addons/patch';

const engine = createRaveldex({
  schema: { text: { title: {}, body: {} } },
  addons: [createSourceProvider({ fields: ['title', 'body'] })],
});
try {
  const added = await engine.add({ id: 'guide', text: { title: 'Atomic updates', body: 'Old content' } });
  const patches = createPatch(engine);
  const changed = await patches.patch({
    id: 'guide', expectedRevision: added.revision,
    set: { text: { body: 'Revised content' } },
  });
  const result = await engine.search('revised');
  console.log(changed.revision, result.total, result.hits[0].id);
} finally {
  await engine.dispose();
}
```

This prints `2 1 guide`: the patch creates revision `2`, and searching `revised` finds the updated record. The title stays **Atomic updates**. The engine is disposed afterward.

`createPatch(engine)` returns a frozen `Patches` helper with `patch(request, options?)`. It borrows your engine without retaining extra data or adding engine methods. Worker clients and foreign facades reject with `MISSING_CAPABILITY`. The helper does no work until called and cannot be used after engine disposal.

Include the record `id` and an `expectedRevision` from a completed search or update. When the patch starts, that revision must still be current. Any intervening committed write, even to another record, causes `REVISION_MISMATCH`.

Read the latest application state before preparing another patch. The helper does not retry or rebase automatically: the revision guard prevents an earlier read from overwriting newer data.

Use `set: { text?: { [field]: string | readonly string[] }, metadata?: { [field]: Scalar | readonly Scalar[] } }` to assign whole fields. Use `unset: { text?: readonly string[], metadata?: readonly string[] }` to remove a field. Fields you leave out keep their current values.

- An array replaces the complete array. Nested paths, append/splice, increments, ID changes and schema migration are not supported.
- `null` assigns a nullable metadata value; it does not delete the field. Empty strings and arrays stay present.
- Unsetting an already absent declared field is valid.
- Unknown fields or keys, duplicate unset names, and setting and unsetting the same field in one namespace are rejected. Include at least one field action.

A successful patch still follows complete replacement, even when assigning an identical value or unsetting an absent field: it creates one next revision with `changed: true` and `replaced: 1`.

Every schema text field needs a `raveldex-source-v1` provider, even for a metadata-only patch or when replacing every text value. Sources must match the current revision and analyzer. Unchanged metadata comes from the same core record with its normal canonicalization.

Validation checks the expected revision, then source coverage, then the ID. Missing coverage gives `MISSING_CAPABILITY`, incompatible provider state gives `INCOMPATIBLE_CAPABILITY`, stale state gives `REVISION_MISMATCH`, and an absent ID gives `ID_NOT_FOUND`. If you do not retain source, use ordinary `replace` with a complete record instead.

The exported readonly types are `RecordPatch`, `RecordPatchSet`, `RecordPatchUnset` and `Patches`. Pass ordinary `MutationOptions` and read an ordinary `MutationResult`. Errors use existing `RaveldexError` codes: malformed patch data, including an invalid or missing expected revision, gives `INVALID_RECORD`; invalid options give `INVALID_OPTIONS`.

The complete replacement must fit the normal input, Unicode, record, schema, analysis, work and provider limits. Accepted inputs are copied before queueing without invoking getters. Assembling and applying the patch share one mutation budget, queue, deadline and cancellation lifecycle. Core and provider changes commit together or leave the previous state untouched.

The helper adds no hidden source cache, provider initialization, snapshot-format change or worker protocol. Capability implementations still run as trusted code.
