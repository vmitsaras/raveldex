# Explicit record patches

Import the optional direct-owner convenience and explicitly retain every text field:

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

This prints `2 1 guide`. `createPatch(engine)` returns a frozen borrowed `Patches` handle with `patch(request, options?)`. It does not add methods to the engine or register/retain data. It requires a direct native engine; worker clients/foreign facades fail `MISSING_CAPABILITY`. Import and construction start no work; engine disposal ends handle usability.

`RecordPatch` requires `id` and `expectedRevision`, the collection revision observed through a completed mutation/search. At execution start it must equal the actual FIFO root revision. Any intervening committed write, including an unrelated record, causes `REVISION_MISMATCH`. No retry/rebase occurs; read fresh application state before constructing another patch. A read and patch are separate operations; the explicit guard prevents a stale read from overwriting newer data.

`set: { text?: { [field]: string | readonly string[] }, metadata?: { [field]: Scalar | readonly Scalar[] } }` assigns whole declared fields. `unset: { text?: readonly string[], metadata?: readonly string[] }` removes field presence. Omitted fields preserve the selected record's authoritative values. Arrays replace complete arrays; there are no nested/dotted paths, append/splice, increments, ID changes or schema migration. `null` assigns nullable metadata and does not delete it. Empty strings/arrays stay present. Unsetting an already absent declared field is valid. Unknown fields/keys, duplicate unset names and set/unset overlap in one namespace reject. A request needs at least one field action. Successful identical-value/absent-unset actions still follow ordinary replacement: one next revision, `changed: true`, `replaced: 1`.

Every schema text field needs an explicitly selected `raveldex-source-v1` provider, even for metadata-only patches or completely overwritten text. Sources must match the actual revision/analyzer; untouched metadata comes from the same core record and preserves native canonicalization. Missing coverage fails `MISSING_CAPABILITY`, incompatible roots `INCOMPATIBLE_CAPABILITY`, stale roots `REVISION_MISMATCH`, absent IDs `ID_NOT_FOUND`. After synchronous admission, validation checks expected revision, source coverage, then ID. Source-free engines retain ordinary complete `replace`.

Readonly types: `RecordPatch`, `RecordPatchSet`, `RecordPatchUnset`, `Patches`. Options are ordinary `MutationOptions`; results are ordinary `MutationResult`. Errors are existing `RaveldexError` codes. Malformed patch data, including missing/invalid expected revision, uses `INVALID_RECORD`; options use `INVALID_OPTIONS`. Native input, Unicode, record, schema, analysis, work and participant bounds apply to the complete replacement. Inputs are owned before queueing without invoking accessors. Composition and replacement share one mutation work cap, FIFO, admission-time deadline and cancellation/disposal lifecycle. All core/participant changes commit together or leave the exact old root unchanged. There is no hidden source cache, extra participant initialization, source/snapshot format change or worker patch protocol. Trusted capability implementations retain their existing trust boundary.

The slice measures logical charged work and overlapping import bundle graphs; these are not allocation/retention/transport peaks. It does not qualify new browser/AT behavior, remote CI or publication.
